import { log } from '../../utils/logger.ts';
import { faker } from '@faker-js/faker';
import { chunk } from 'lodash-es';
import { getEsClient } from '../utils/indices.ts';
import { bulkIngest, bulkUpsert } from '../shared/elasticsearch.ts';
import {
  getEntityStoreV2Index,
  ENTITY_MAINTAINERS_OPTIONS,
  DEFAULT_CHUNK_SIZE,
  type EntityMaintainerOption,
} from '../../constants.ts';
import { getAlertIndex } from '../../utils/index.ts';
import createAlerts from '../../generators/create_alerts.ts';

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
  entity?: {
    id?: string;
    name?: string;
    type?: string;
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
  user?: {
    name?: string;
  };
  host?: {
    name?: string;
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

const fetchEntities = async (
  count: number,
  space?: string,
  type = 'Identity',
): Promise<EntityHit[]> => {
  const client = getEsClient();

  const response = await client.search({
    index: getEntityStoreV2Index(space),
    size: count,
    sort: [{ '@timestamp': 'desc' }],
    query: {
      bool: {
        filter: [{ term: { 'entity.type': type } }],
      },
    },
  });

  return response.hits.hits as unknown as EntityHit[];
};

const getEntityName = (entity: EntityHit): string | undefined =>
  entity._source?.entity?.name ?? entity._source?.user?.name;

interface RiskInput {
  id: string;
  risk_score: number;
  contribution_score: number;
  index: string;
  description: string;
  category: string;
  timestamp: string;
}

const generateRiskInputs = (alertIndex: string): RiskInput[] => {
  const count = faker.number.int({ min: 2, max: 6 });
  const inputs: RiskInput[] = [];

  for (let i = 0; i < count; i++) {
    const riskScore = faker.number.int({ min: 50, max: 99 });
    // Logarithmic decay contribution formula matching the real risk engine
    const contributionScore = Math.ceil(riskScore * Math.pow(0.5, i * 0.35));
    const daysAgo = faker.number.int({ min: 0, max: 3 });
    const timestamp = new Date(
      Date.now() - daysAgo * 86400000 - faker.number.int({ min: 0, max: 3600000 }),
    );

    inputs.push({
      id: faker.string.uuid(),
      risk_score: riskScore,
      contribution_score: contributionScore,
      index: alertIndex,
      description: 'Alert from Rule: test',
      category: 'category_1',
      timestamp: timestamp.toISOString(),
    });
  }

  return inputs;
};

const generateRiskScoreFields = (inputs: RiskInput[]) => {
  const level = faker.helpers.arrayElement(RISK_LEVELS);
  const range = RISK_LEVEL_RANGES[level];
  const scoreNorm = faker.number.float({ min: range.min, max: range.max, fractionDigits: 13 });
  const category1Score = scoreNorm;
  const category1Count = inputs.length;
  const rawScore = inputs.reduce((sum, inp) => sum + inp.contribution_score, 0);

  return {
    entity: {
      risk: {
        calculated_level: level,
        calculated_score: Math.round(rawScore * 100) / 100,
        calculated_score_norm: scoreNorm,
      },
    },
    _riskMeta: {
      level,
      calculated_score: Math.round(rawScore * 100) / 100,
      calculated_score_norm: scoreNorm,
      category1Score,
      category1Count,
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
    faker.number.int({ min: 1, max: 3 }),
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
      faker.number.int({ min: 1, max: 4 }),
    );
  }

  if (faker.datatype.boolean({ probability: 0.5 })) {
    relationships.accesses_infrequently = faker.helpers.arrayElements(
      candidateInfrequent,
      faker.number.int({ min: 1, max: 3 }),
    );
  }

  if (faker.datatype.boolean({ probability: 0.4 })) {
    relationships.communicates_with = faker.helpers.arrayElements(
      [...SYNTHETIC_HOSTS, ...SYNTHETIC_SERVICES],
      faker.number.int({ min: 1, max: 3 }),
    );
  }

  if (faker.datatype.boolean({ probability: 0.3 })) {
    relationships.owns = faker.helpers.arrayElements(
      [
        `laptop-${faker.string.alphanumeric(4)}`,
        `desktop-${faker.string.alphanumeric(4)}`,
        `mobile-${faker.string.alphanumeric(4)}`,
      ],
      faker.number.int({ min: 1, max: 2 }),
    );
  }

  if (faker.datatype.boolean({ probability: 0.2 })) {
    relationships.supervises = faker.helpers.arrayElements(
      otherNames.length > 0 ? otherNames : ['junior-analyst', 'intern-01'],
      faker.number.int({ min: 1, max: 2 }),
    );
  }

  return { entity: { relationships } };
};

const generateWatchlistFields = (existingWatchlists?: string[]) => {
  const watchlists = new Set(existingWatchlists ?? []);
  watchlists.add('privileged-user-monitoring-watchlist-id');

  return {
    entity: {
      attributes: {
        watchlists: [...watchlists],
      },
    },
  };
};

interface RiskMeta {
  level: string;
  calculated_score: number;
  calculated_score_norm: number;
  category1Score: number;
  category1Count: number;
}

const buildRiskScoreDocument = (
  { entity, type }: { type: string; entity: EntityHit },
  riskMeta: RiskMeta,
  inputs: RiskInput[],
): object => {
  const entityName =
    type === 'user'
      ? (entity._source?.user?.name as string | undefined)
      : (entity._source?.host?.name as string | undefined);

  const entityId =
    entity._source?.entity?.id ?? entity._source?.entity?.name ?? entityName ?? entity._id;

  const now = new Date();

  const euidFields: Record<string, string> = {};
  if (type === 'user') {
    if (entityName) euidFields['user.name'] = entityName;
  } else {
    if (entityName) euidFields['host.name'] = entityName;
  }

  const riskPayload = {
    calculated_score: riskMeta.calculated_score,
    id_field: 'entity.id',
    notes: [],
    inputs,
    calculated_score_norm: riskMeta.calculated_score_norm,
    modifiers: [],
    calculated_level: riskMeta.level,
    category_1_score: riskMeta.category1Score,
    category_1_count: riskMeta.category1Count,
    category_2_count: 0,
    category_2_score: 0,
    euid_fields_raw: JSON.stringify(euidFields),
    id_value: entityId,
  };

  return {
    '@timestamp': now.toISOString(),
    event: {
      ingested: now.toISOString(),
    },
    [type]: {
      name: entityId ?? entityName,
      risk: riskPayload,
    },
  };
};

const buildAlertDocuments = (
  inputs: RiskInput[],
  { entity, type }: { type: string; entity: EntityHit },
  space: string,
): unknown[] => {
  const alertIndex = getAlertIndex(space);
  const entityName = (entity._source?.user?.name ??
    entity._source?.host?.name ??
    entity._source?.entity?.name ??
    'unknown') as string;

  const ops: unknown[] = [];

  for (const input of inputs) {
    const overrides = {
      'kibana.alert.uuid': input.id,
      'kibana.alert.risk_score': input.risk_score,
      'kibana.alert.rule.risk_score': input.risk_score,
      '@timestamp': new Date(input.timestamp).getTime(),
      'kibana.alert.rule.name': 'test',
      'kibana.alert.rule.parameters': {
        description: 'test',
        risk_score: input.risk_score,
      },
    };

    const alertDoc =
      type === 'user'
        ? createAlerts(overrides, { userName: entityName, space })
        : createAlerts(overrides, { hostName: entityName, space });

    ops.push({ create: { _index: alertIndex, _id: input.id } });
    ops.push(alertDoc);
  }

  return ops;
};

const getSnapshotIndex = (space: string, date: Date): string => {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `.entities.v2.history.security_${space}.${yyyy}-${mm}-${dd}-00`;
};

const scoreNormToLevel = (norm: number): string => {
  for (const [level, range] of Object.entries(RISK_LEVEL_RANGES)) {
    if (norm >= range.min && norm <= range.max) return level;
  }
  return 'Unknown';
};

const pickOnsetDay = (): number => faker.number.int({ min: 5, max: 28 });

type RiskTrajectory = 'stable' | 'increasing' | 'decreasing' | 'volatile';

const interpolateRiskNorm = (
  trajectory: RiskTrajectory,
  currentNorm: number,
  dayIndex: number,
  totalDays: number,
): number => {
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const progress = totalDays > 1 ? dayIndex / (totalDays - 1) : 1;

  switch (trajectory) {
    case 'stable':
      return clamp(currentNorm + faker.number.float({ min: -8, max: 8 }));
    case 'increasing': {
      const start = currentNorm * 0.25;
      return clamp(start + (currentNorm - start) * progress);
    }
    case 'decreasing': {
      const start = Math.min(currentNorm * 2.5, 100);
      return clamp(start - (start - currentNorm) * progress);
    }
    case 'volatile':
      return faker.number.float({ min: 0, max: 100 });
  }
};

const SNAPSHOT_DAYS = 30;

const generateSnapshotBulkOps = (
  entity: EntityHit,
  entityUpdates: Record<string, unknown>,
  space: string,
): unknown[] => {
  const src = deepMerge(entity._source, entityUpdates) as EntityHitSource;

  // Risk score setup
  const hasRisk = src?.entity?.risk?.calculated_score_norm != null;
  const currentNorm = src?.entity?.risk?.calculated_score_norm ?? 50;
  const trajectory: RiskTrajectory = faker.helpers.arrayElement([
    'stable',
    'increasing',
    'decreasing',
    'volatile',
  ] as const);
  // Onset days for array-based fields (null = entity doesn't have the field)
  const watchlistOnset = src?.entity?.attributes?.watchlists?.length ? pickOnsetDay() : null;
  const behaviorsOnset = src?.entity?.behaviors?.anomaly_job_ids?.length ? pickOnsetDay() : null;
  const relationsOnset =
    src?.entity?.relationships && Object.keys(src.entity.relationships).length
      ? pickOnsetDay()
      : null;
  const criticalityOnset = src?.asset?.criticality ? pickOnsetDay() : null;

  const ops: unknown[] = [];

  for (let daysAgo = SNAPSHOT_DAYS; daysAgo >= 1; daysAgo--) {
    const dayIndex = SNAPSHOT_DAYS - daysAgo; // 0 = oldest (30 days ago), 29 = yesterday

    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysAgo);
    date.setUTCHours(0, 0, 0, 0);

    // Start from a shallow copy of the entity source
    const doc: Record<string, unknown> = { ...src, '@timestamp': date.toISOString() };

    // --- Risk score ---
    if (hasRisk) {
      const scoreNorm =
        Math.round(interpolateRiskNorm(trajectory, currentNorm, dayIndex, SNAPSHOT_DAYS) * 100) /
        100;
      const rawScore = Math.round(scoreNorm * faker.number.float({ min: 1, max: 3 }) * 100) / 100;
      doc.entity = {
        ...(doc.entity as Record<string, unknown>),
        risk: {
          calculated_score_norm: scoreNorm,
          calculated_score: rawScore,
          calculated_level: scoreNormToLevel(scoreNorm),
        },
      };
    }

    // --- Watchlist ---
    if (watchlistOnset !== null) {
      if (daysAgo > watchlistOnset) {
        const entityCopy = { ...(doc.entity as Record<string, unknown>) };
        const attrsCopy = { ...(entityCopy.attributes as Record<string, unknown>) };
        delete attrsCopy.watchlists;
        entityCopy.attributes = attrsCopy;
        doc.entity = entityCopy;
      }
      // else: keep entity's current watchlist values as-is
    }

    // --- Anomaly behaviors ---
    if (behaviorsOnset !== null) {
      if (daysAgo > behaviorsOnset) {
        const entityCopy = { ...(doc.entity as Record<string, unknown>) };
        delete entityCopy.behaviors;
        doc.entity = entityCopy;
      }
    }

    // --- Relationships ---
    if (relationsOnset !== null) {
      if (daysAgo > relationsOnset) {
        const entityCopy = { ...(doc.entity as Record<string, unknown>) };
        delete entityCopy.relationships;
        doc.entity = entityCopy;
      }
    }

    // --- Asset criticality ---
    if (criticalityOnset !== null) {
      if (daysAgo > criticalityOnset) {
        const assetCopy = { ...(doc.asset as Record<string, unknown>) };
        delete assetCopy.criticality;
        doc.asset = assetCopy;
      }
    }

    const index = getSnapshotIndex(space, date);
    ops.push({ index: { _index: index } });
    ops.push(doc);
  }

  return ops;
};

const deepMerge = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
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
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
};

const chunkedBulkUpsert = async (ops: unknown[], refresh = true): Promise<void> => {
  for (const batch of chunk(ops, DEFAULT_CHUNK_SIZE * 2)) {
    await bulkUpsert({ documents: batch, refresh });
  }
};

export const generateEntityMaintainersData = async (opts: {
  count: number;
  maintainers: EntityMaintainerOption[];
  space?: string;
}) => {
  const { count, maintainers, space = 'default' } = opts;
  const alertIndex = getAlertIndex(space);
  const riskScoreIndex = `risk-score.risk-score-${space}`;

  log.info(`\nFetching Identity entities from Entity store V2 index...`);
  const userEntities = await fetchEntities(count, space, 'Identity');
  const hostEntities = await fetchEntities(count, space, 'Host');

  const entities = [
    ...userEntities.map((entity) => ({ type: 'user', entity })),
    ...hostEntities.map((entity) => ({ type: 'host', entity })),
  ];

  if (entities.length === 0) {
    log.info('No entities found in the entity store. Make sure the Entity Store V2 is populated.');
    return;
  }

  log.info(`Found ${entities.length} entities.\n`);

  const allUserEntityNames = entities
    .filter((e) => e.type === 'user')
    .map((e) => getEntityName(e.entity))
    .filter((name): name is string => !!name);

  const bulkOps: unknown[] = [];
  const riskScoreBulkOps: object[] = [];
  const alertBulkOps: unknown[] = [];

  for (const entity of entities) {
    let updateDoc: Record<string, unknown> = {};
    const entityName = getEntityName(entity.entity);

    if (maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.riskScore as EntityMaintainerOption)) {
      log.info(`  Risk Score       -> ${entityName}`);
      const inputs = generateRiskInputs(alertIndex);
      const { _riskMeta, ...riskFields } = generateRiskScoreFields(inputs);
      updateDoc = deepMerge(updateDoc, riskFields);
      riskScoreBulkOps.push(buildRiskScoreDocument(entity, _riskMeta, inputs));
      alertBulkOps.push(...buildAlertDocuments(inputs, entity, space));
    }

    if (
      maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.assetCriticality as EntityMaintainerOption)
    ) {
      log.info(`  Asset Criticality -> ${entityName}`);
      updateDoc = deepMerge(updateDoc, generateAssetCriticalityFields());
    }

    if (entity.type === 'user') {
      if (
        maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.anomalyBehaviors as EntityMaintainerOption)
      ) {
        log.info(`  Anomaly Behaviors -> ${entityName}`);
        updateDoc = deepMerge(updateDoc, generateAnomalyBehaviorsFields());
      }

      if (
        maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.relationships as EntityMaintainerOption)
      ) {
        log.info(`  Relationships     -> ${entityName}`);
        updateDoc = deepMerge(
          updateDoc,
          generateRelationshipsFields(allUserEntityNames, entityName ?? undefined),
        );
      }

      if (maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.watchlist as EntityMaintainerOption)) {
        log.info(`  Watchlist         -> ${entityName}`);
        const existingWatchlists = entity.entity._source?.entity?.attributes?.watchlists;
        updateDoc = deepMerge(updateDoc, generateWatchlistFields(existingWatchlists));
      }
    }

    if (maintainers.includes(ENTITY_MAINTAINERS_OPTIONS.snapshot as EntityMaintainerOption)) {
      log.info(`  Snapshot          -> ${entityName}`);
      const entitySnapshotOps = generateSnapshotBulkOps(entity.entity, updateDoc, space);
      await bulkUpsert({ documents: entitySnapshotOps, refresh: false });
    }

    if (Object.keys(updateDoc).length > 0) {
      bulkOps.push({ update: { _index: entity.entity._index, _id: entity.entity._id } });
      bulkOps.push({ doc: updateDoc });
    }
  }

  if (bulkOps.length === 0) {
    log.info('No updates to apply.');
    return;
  }

  log.info(`\nUpdating ${entities.length} entities...`);
  await chunkedBulkUpsert(bulkOps);
  log.info(`Successfully updated ${entities.length} entities with maintainer data.`);

  if (riskScoreBulkOps.length > 0) {
    log.info(
      `\nIndexing ${riskScoreBulkOps.length} risk score documents into ${riskScoreIndex}...`,
    );
    await bulkIngest({
      index: riskScoreIndex,
      documents: riskScoreBulkOps,
      action: 'create',
      refresh: true,
    });
    log.info(`Successfully indexed ${riskScoreBulkOps.length} risk score documents.`);

    const alertCount = alertBulkOps.length / 2;
    log.info(`\nIndexing ${alertCount} alerts into ${alertIndex}...`);
    await chunkedBulkUpsert(alertBulkOps);
    log.info(`Successfully indexed ${alertCount} alerts.`);
  }
};
