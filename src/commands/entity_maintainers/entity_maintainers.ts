import { faker } from '@faker-js/faker';
import { getEsClient } from '../utils/indices';
import { bulkUpsert } from '../shared/elasticsearch';
import {
  ENTITY_STORE_V2_INDEX,
  ENTITY_MAINTAINERS_OPTIONS,
  type EntityMaintainerOption,
} from '../../constants';

const RISK_LEVELS = ['Unknown', 'Low', 'Moderate', 'High', 'Critical'] as const;

const RISK_LEVEL_RANGES: Record<string, { min: number; max: number }> = {
  Unknown: { min: 0, max: 20 },
  Low: { min: 21, max: 40 },
  Moderate: { min: 41, max: 60 },
  High: { min: 61, max: 80 },
  Critical: { min: 81, max: 100 },
};

const ASSET_CRITICALITY_LEVELS = [
  'low_impact',
  'medium_impact',
  'high_impact',
  'extreme_impact',
] as const;

const ML_JOB_TO_RULES: Record<string, string[]> = {
  high_count_login: ['Brute Force Victim'],
  unusual_geo_country_login: ['New Country Login'],
  unusual_login_times: ['Unusual Login Times'],
  rare_process_execution: ['Rare Process Execution'],
  high_volume_data_transfer: ['Potential Data Exfiltration'],
};

const ML_JOB_IDS = Object.keys(ML_JOB_TO_RULES);

const SYNTHETIC_HOSTS = [
  'server-db-01',
  'api-gateway-02',
  'load-balancer-01',
  'fileserver-03',
  'vpn-gateway-01',
  'mail-server-01',
  'dns-server-02',
  'ldap-server-01',
  'sharepoint-01',
  'gitlab-runner-01',
];

const SYNTHETIC_SERVICES = [
  'SharePoint',
  'OneDrive',
  'GitLab',
  'Jira',
  'Confluence',
  'Slack',
  'Teams',
  'AWS Console',
  'Azure Portal',
  'VPN',
];

interface EntityHitSource {
  '@timestamp'?: string;
  'entity.id'?: string;
  'entity.name'?: string;
  'entity.type'?: string;
  'user.name'?: string;
  entity?: {
    risk?: {
      calculated_level?: string;
      calculated_score?: number;
      calculated_score_norm?: number;
    };
    behaviors?: {
      rule_names?: string[];
      anomaly_job_ids?: string[];
    };
    relationships?: Record<string, string[]>;
    attributes?: {
      watchlists?: string[];
      [key: string]: unknown;
    };
  };
  asset?: {
    criticality?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface EntityHit {
  _id: string;
  _index: string;
  _source: EntityHitSource;
}

export const fetchIdentityEntities = async (count: number): Promise<EntityHit[]> => {
  const client = getEsClient();

  const response = await client.search({
    index: ENTITY_STORE_V2_INDEX,
    size: count,
    sort: [{ '@timestamp': 'desc' }],
    query: {
      term: { 'entity.type': 'Identity' },
    },
  });

  return response.hits.hits as unknown as EntityHit[];
};

const getEntityName = (entity: EntityHit): string | undefined =>
  entity._source?.['entity.name'] ?? entity._source?.['user.name'];

const generateRiskScoreFields = () => {
  const level = faker.helpers.arrayElement(RISK_LEVELS);
  const range = RISK_LEVEL_RANGES[level];
  const scoreNorm = faker.number.float({ min: range.min, max: range.max, fractionDigits: 2 });
  const rawScore = scoreNorm * faker.number.float({ min: 1.0, max: 3.0, fractionDigits: 2 });

  return {
    entity: {
      risk: {
        calculated_level: level,
        calculated_score: Math.round(rawScore * 100) / 100,
        calculated_score_norm: scoreNorm,
      },
    },
  };
};

const generateAssetCriticalityFields = () => {
  return {
    asset: {
      criticality: faker.helpers.arrayElement(ASSET_CRITICALITY_LEVELS),
    },
  };
};

const generateAnomalyBehaviorsFields = () => {
  const selectedJobs = faker.helpers.arrayElements(
    ML_JOB_IDS,
    faker.number.int({ min: 1, max: 3 })
  );

  const ruleNames = selectedJobs.flatMap((jobId) => ML_JOB_TO_RULES[jobId]);

  return {
    entity: {
      behaviors: {
        anomaly_job_ids: selectedJobs,
        rule_names: [...new Set(ruleNames)],
      },
    },
  };
};

const generateRelationshipsFields = (allEntityNames: string[], currentEntityName?: string) => {
  const otherNames = allEntityNames.filter((n) => n !== currentEntityName);

  const candidateFrequent = [...otherNames, ...SYNTHETIC_HOSTS];
  const candidateInfrequent = [...SYNTHETIC_HOSTS, ...SYNTHETIC_SERVICES];

  const relationships: Record<string, string[]> = {};

  if (faker.datatype.boolean({ probability: 0.7 })) {
    relationships.accesses_frequently = faker.helpers.arrayElements(
      candidateFrequent,
      faker.number.int({ min: 1, max: 4 })
    );
  }

  if (faker.datatype.boolean({ probability: 0.5 })) {
    relationships.accesses_infrequently = faker.helpers.arrayElements(
      candidateInfrequent,
      faker.number.int({ min: 1, max: 3 })
    );
  }

  if (faker.datatype.boolean({ probability: 0.4 })) {
    relationships.communicates_with = faker.helpers.arrayElements(
      [...SYNTHETIC_HOSTS, ...SYNTHETIC_SERVICES],
      faker.number.int({ min: 1, max: 3 })
    );
  }

  if (faker.datatype.boolean({ probability: 0.3 })) {
    relationships.owns = faker.helpers.arrayElements(
      [
        `laptop-${faker.string.alphanumeric(4)}`,
        `desktop-${faker.string.alphanumeric(4)}`,
        `mobile-${faker.string.alphanumeric(4)}`,
      ],
      faker.number.int({ min: 1, max: 2 })
    );
  }

  if (faker.datatype.boolean({ probability: 0.2 })) {
    relationships.supervises = faker.helpers.arrayElements(
      otherNames.length > 0 ? otherNames : ['junior-analyst', 'intern-01'],
      faker.number.int({ min: 1, max: 2 })
    );
  }

  return { entity: { relationships } };
};

const generateWatchlistFields = (existingWatchlists?: string[]) => {
  const watchlists = new Set(existingWatchlists ?? []);
  watchlists.add('Privileged User');

  return {
    entity: {
      attributes: {
        watchlists: [...watchlists],
      },
    },
  };
};

const deepMerge = (
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> => {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key]) &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
};

export const generateEntityMaintainersData = async (opts: {
  count: number;
  maintainers: EntityMaintainerOption[];
}) => {
  const { count, maintainers } = opts;

  console.log(`\nFetching Identity entities from ${ENTITY_STORE_V2_INDEX}...`);
  const entities = await fetchIdentityEntities(count);

  if (entities.length === 0) {
    console.log(
      'No Identity entities found in the entity store. Make sure the Entity Store V2 is populated.'
    );
    return;
  }

  console.log(`Found ${entities.length} Identity entities.\n`);

  const allEntityNames = entities
    .map((e) => getEntityName(e))
    .filter((name): name is string => !!name);

  const bulkOps: unknown[] = [];

  for (const entity of entities) {
    let updateDoc: Record<string, unknown> = {};
    const entityName = getEntityName(entity);

    if (maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.riskScore as EntityMaintainerOption)) {
      console.log(`  Risk Score       -> ${entityName}`);
      updateDoc = deepMerge(updateDoc, generateRiskScoreFields());
    }

    if (
      maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.assetCriticality as EntityMaintainerOption)
    ) {
      console.log(`  Asset Criticality -> ${entityName}`);
      updateDoc = deepMerge(updateDoc, generateAssetCriticalityFields());
    }

    if (
      maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.anomalyBehaviors as EntityMaintainerOption)
    ) {
      console.log(`  Anomaly Behaviors -> ${entityName}`);
      updateDoc = deepMerge(updateDoc, generateAnomalyBehaviorsFields());
    }

    if (maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.relationships as EntityMaintainerOption)) {
      console.log(`  Relationships     -> ${entityName}`);
      updateDoc = deepMerge(
        updateDoc,
        generateRelationshipsFields(allEntityNames, entityName ?? undefined)
      );
    }

    if (maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.watchlist as EntityMaintainerOption)) {
      console.log(`  Watchlist         -> ${entityName}`);
      const existingWatchlists = entity._source?.entity?.attributes?.watchlists;
      updateDoc = deepMerge(updateDoc, generateWatchlistFields(existingWatchlists));
    }

    if (Object.keys(updateDoc).length > 0) {
      bulkOps.push({ update: { _index: entity._index, _id: entity._id } });
      bulkOps.push({ doc: updateDoc });
    }
  }

  if (bulkOps.length === 0) {
    console.log('No updates to apply.');
    return;
  }

  console.log(`\nUpdating ${entities.length} entities...`);
  await bulkUpsert({ documents: bulkOps, refresh: true });
  console.log(`Successfully updated ${entities.length} entities with maintainer data.`);
};
