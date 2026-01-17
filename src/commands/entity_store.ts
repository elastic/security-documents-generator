import { faker } from '@faker-js/faker';
import { getEsClient, indexCheck, createAgentDocument } from './utils/indices';
import { chunk, once } from 'lodash-es';
import moment from 'moment';
import auditbeatMappings from '../mappings/auditbeat.json' assert { type: 'json' };
import {
  assignAssetCriticality,
  enableRiskScore,
  createRule,
  enrichEntityViaApi,
  EntityEnrichment,
} from '../utils/kibana_api';
import {
  ASSET_CRITICALITY,
  AssetCriticality,
  ENTITY_STORE_OPTIONS,
  generateNewSeed,
} from '../constants';
import {
  BulkOperationContainer,
  BulkUpdateAction,
  MappingTypeMapping,
} from '@elastic/elasticsearch/lib/api/types';
import { getConfig } from '../get_config';
import { initializeSpace } from '../utils';

const EVENT_INDEX_NAME = 'auditbeat-8.12.0-2024.01.18-000001';
const AGENT_INDEX_NAME = '.fleet-agents-7';

const getClient = () => {
  const client = getEsClient();

  if (!client) {
    throw new Error('failed to create ES client');
  }
  return client;
};

const getOffset = (offsetHours?: number) => {
  const config = getConfig();

  if (config.eventDateOffsetHours !== undefined) {
    once(() => console.log(`Using event date offset: ${config.eventDateOffsetHours} hours`));

    return config.eventDateOffsetHours;
  }

  if (offsetHours !== undefined) {
    return offsetHours;
  }

  return faker.number.int({ max: 10 });
};

type Agent = ReturnType<typeof createAgentDocument>;

enum EntityTypes {
  User = 'user',
  Host = 'host',
  Service = 'service',
  Generic = 'generic',
}

interface BaseEntity {
  name: string;
  assetCriticality: AssetCriticality;
  entity?: {
    EngineMetadata: {
      Type: string;
    };
    source: string;
    type: string;
    sub_type: string;
    name: string;
    id: string;
  };
}
interface User extends BaseEntity {
  type: EntityTypes.User;
}

interface Host extends BaseEntity {
  type: EntityTypes.Host;
}

interface Service extends BaseEntity {
  type: EntityTypes.Service;
}

interface GenericEntity extends BaseEntity {
  id: string;
  type: string;
}

interface BaseEvent {
  '@timestamp': string;
  message: string;
  service?: {
    type: string;
  };
}

interface EventUser {
  name: string;
  id: number;
}

interface EventHost {
  name: string;
  id: number;
  ip: string;
  mac: string;
  os: {
    name: string;
  };
}

interface ServiceEvent extends BaseEvent {
  service: {
    node: {
      roles: string;
      name: string;
    };
    environment: string;
    address: string;
    name: string;
    id: string;
    state: string;
    ephemeral_id: string;
    type: string;
    version: string;
  };
}

interface GenericEntityEvent extends BaseEvent {
  event: {
    ingested: string;
    dataset: string;
    module: string;
  };
  cloud: {
    provider: string;
    region: string;
    account: {
      name: string;
      id: string;
    };
  };
  entity?: {
    type: string;
    sub_type?: string;
    name: string;
    id: string;
  };
}

interface UserEvent extends BaseEvent {
  user: EventUser;
  host?: EventHost;
}

interface HostEvent extends BaseEvent {
  host: EventHost;
  user?: EventUser;
}

type Event = UserEvent | HostEvent | ServiceEvent | GenericEntityEvent;

export const createRandomUser = (): User => {
  return {
    name: `User-${faker.internet.username()}`,
    assetCriticality: faker.helpers.arrayElement(ASSET_CRITICALITY),
    type: EntityTypes.User,
  };
};

export const createRandomHost = (): Host => {
  return {
    name: `Host-${faker.internet.domainName()}`,
    assetCriticality: faker.helpers.arrayElement(ASSET_CRITICALITY),
    type: EntityTypes.Host,
  };
};

export const createRandomService = (): Service => {
  return {
    name: `Service-${faker.hacker.noun()}`,
    assetCriticality: faker.helpers.arrayElement(ASSET_CRITICALITY),
    type: EntityTypes.Service,
  };
};

const genericTypes = [
  { type: 'Messaging Service', subType: 'AWS SNS Topic' },
  { type: 'Storage Service', subType: 'AWS S3 Bucket' },
  { type: 'Compute Service', subType: 'AWS EC2 Instance' },
  { type: 'Database Service', subType: 'AWS RDS Instance' },
  { type: 'Compute Service', subType: 'AWS Lambda Function' },
  { type: 'Network Service', subType: 'AWS VPC' },
  { type: 'Storage Service', subType: 'AWS EBS Volume' },
  { type: 'Database Service', subType: 'AWS DynamoDB Table' },
  { type: 'Compute Service', subType: 'AWS ECS Service' },
  { type: 'Network Service', subType: 'AWS Load Balancer' },
];

export const createRandomGenericEntity = (): GenericEntity => {
  const taxonomy = genericTypes[Math.floor(Math.random() * genericTypes.length)];

  const resourceName = `${taxonomy.subType.toLowerCase().replace(/\s+/g, '-')}-${faker.string.alphanumeric(8)}`;
  const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];
  const region = faker.helpers.arrayElement(regions);
  const accountId = faker.string.numeric(12); // Generate AWS ARN-style ID based on service type
  let resourceId: string;
  if (taxonomy.subType.includes('SNS')) {
    resourceId = `arn:aws:sns:${region}:${accountId}:${resourceName}`;
  } else if (taxonomy.subType.includes('S3')) {
    resourceId = `arn:aws:s3:::${resourceName}`;
  } else if (taxonomy.subType.includes('EC2')) {
    resourceId = `arn:aws:ec2:${region}:${accountId}:instance/${faker.string.alphanumeric(17)}`;
  } else if (taxonomy.subType.includes('RDS')) {
    resourceId = `arn:aws:rds:${region}:${accountId}:db:${resourceName}`;
  } else if (taxonomy.subType.includes('Lambda')) {
    resourceId = `arn:aws:lambda:${region}:${accountId}:function:${resourceName}`;
  } else if (taxonomy.subType.includes('VPC')) {
    resourceId = `arn:aws:ec2:${region}:${accountId}:vpc/${faker.string.alphanumeric(17)}`;
  } else if (taxonomy.subType.includes('EBS')) {
    resourceId = `arn:aws:ec2:${region}:${accountId}:volume/${faker.string.alphanumeric(17)}`;
  } else if (taxonomy.subType.includes('DynamoDB')) {
    resourceId = `arn:aws:dynamodb:${region}:${accountId}:table/${resourceName}`;
  } else if (taxonomy.subType.includes('ECS')) {
    resourceId = `arn:aws:ecs:${region}:${accountId}:service/${resourceName}`;
  } else if (taxonomy.subType.includes('Load Balancer')) {
    resourceId = `arn:aws:elasticloadbalancing:${region}:${accountId}:loadbalancer/${resourceName}`;
  } else {
    resourceId = `arn:aws:${taxonomy.subType.toLowerCase().replace(/\s+/g, '-')}:${region}:${accountId}:${resourceName}`;
  }

  return {
    name: resourceName,
    assetCriticality: faker.helpers.arrayElement(ASSET_CRITICALITY),
    id: resourceId,
    type: taxonomy.type,
    entity: {
      EngineMetadata: {
        Type: EntityTypes.Generic,
      },
      source: resourceId,
      type: taxonomy.type,
      sub_type: taxonomy.subType,
      name: resourceName,
      id: resourceId,
    },
  };
};

export const createRandomEventForHost = (host: Host, offsetHours?: number): HostEvent => ({
  '@timestamp': moment()
    .subtract(getOffset(offsetHours), 'h')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
  message: `Host ${faker.hacker.phrase()}`,
  service: {
    type: 'system',
  },
  host: {
    name: host.name,
    id: faker.number.int({ max: 10000 }),
    ip: faker.internet.ip(),
    mac: faker.internet.mac(),
    os: {
      name: faker.helpers.arrayElement(['Windows', 'Linux', 'MacOS']),
    },
  },
});

export const createRandomEventForUser = (user: User, offsetHours?: number): UserEvent => ({
  '@timestamp': moment()
    .subtract(getOffset(offsetHours), 'h')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
  message: `User ${faker.hacker.phrase()}`,
  service: {
    type: 'system',
  },
  user: {
    name: user.name,
    id: faker.number.int({ max: 10000 }),
  },
});

export const createRandomEventForService = (
  service: Service,
  offsetHours?: number
): ServiceEvent => ({
  '@timestamp': moment()
    .subtract(getOffset(offsetHours), 'h')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
  message: `Service ${faker.hacker.phrase()}`,
  service: {
    node: {
      roles: faker.helpers.arrayElement(['master', 'data', 'ingest']),
      name: faker.internet.domainWord(),
    },
    environment: faker.helpers.arrayElement(['production', 'staging', 'development']),
    address: faker.internet.ip(),
    name: service.name,
    id: faker.string.nanoid(),
    state: faker.helpers.arrayElement(['running', 'stopped', 'starting']),
    ephemeral_id: faker.string.nanoid(),
    type: 'system',
    version: faker.system.semver(),
  },
});

const createRandomEventForGenericEntity = (
  entity: GenericEntity,
  offsetHours?: number
): GenericEntityEvent => {
  // Always use AWS since we're generating AWS resources
  const cloudProvider = 'aws';

  const service = {
    type: entity.type,
    subType: entity.entity?.sub_type,
  };

  const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];
  const region = faker.helpers.arrayElement(regions);

  return {
    '@timestamp': moment()
      .subtract(getOffset(offsetHours), 'h')
      .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
    message: `${service.subType} entity discovered`,
    event: {
      ingested: moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
      dataset: 'cloud_asset_inventory.asset_inventory',
      module: 'cloud_asset_inventory',
    },
    cloud: {
      provider: cloudProvider,
      region: region,
      account: {
        name: faker.company.name().toLowerCase().replace(/\s+/g, '-'),
        id: faker.string.numeric(12),
      },
    },
    entity: {
      type: service.type,
      sub_type: service.subType,
      name: entity.name,
      id: entity.id,
    },
  };
};

const ingestEvents = async (events: Event[]) =>
  ingest(EVENT_INDEX_NAME, events, auditbeatMappings as MappingTypeMapping);

type TDocument = object;
type TPartialDocument = Partial<TDocument>;

const ingestAgents = async (agents: Agent[]) => ingest(AGENT_INDEX_NAME, agents);

const ingest = async (
  index: string,
  documents: Array<object>,
  mapping?: MappingTypeMapping,
  skipIndexCheck = false
) => {
  if (!skipIndexCheck) {
    await indexCheck(index, { mappings: mapping });
  }

  const chunks = chunk(documents, 10000);

  for (const chunk of chunks) {
    try {
      // Make bulk request
      const ingestRequest = chunk.reduce(
        (
          acc: (
            | BulkOperationContainer
            | BulkUpdateAction<TDocument, TPartialDocument>
            | TDocument
          )[],
          event
        ) => {
          acc.push({ index: { _index: index } });
          acc.push(event);
          return acc;
        },
        []
      );

      const client = getClient();
      await client.bulk({ operations: ingestRequest, refresh: true });
    } catch (err) {
      console.log('Error: ', err);
    }
  }
};

// E = Entity, EV = Event
export const generateEvents = <E extends BaseEntity, EV = BaseEvent>(
  entities: E[],
  createEvent: (entity: E, offsetHours?: number) => EV,
  offsetHours?: number
): EV[] => {
  const eventsPerEntity = 10;
  const acc: EV[] = [];
  return entities.reduce((acc, entity) => {
    const events = faker.helpers.multiple(() => createEvent(entity, offsetHours), {
      count: eventsPerEntity,
    });
    acc.push(...events);
    return acc;
  }, acc);
};

export const assignAssetCriticalityToEntities = async (opts: {
  entities: BaseEntity[];
  field: string;
  space?: string;
}) => {
  const { entities, field, space } = opts;
  const chunks = chunk(entities, 10000);
  for (const chunk of chunks) {
    const records = chunk
      .filter(({ assetCriticality }) => assetCriticality !== 'unknown')
      .map(({ name, assetCriticality }) => ({
        id_field: field,
        id_value: name,
        criticality_level: assetCriticality,
      }));

    if (records.length > 0) {
      await assignAssetCriticality(records, space);
    }
  }
};

// Entity enrichment constants
const ANOMALY_JOB_IDS = [
  'high_auth_count',
  'number_of_failed_logons',
  'unique_shares_accessed',
  'bytes_sent',
  'rare_process',
  'unusual_login_times',
  'high_volume_data_transfer',
];

const RULE_NAMES = [
  'RDB Brute Force',
  'SMB Share Access',
  'Credential Stuffing',
  'Suspicious Login',
  'Lateral Movement Detected',
  'Privilege Escalation Attempt',
  'Data Exfiltration Alert',
];

// User-specific relationships
const USER_RELATIONSHIPS = {
  accesses_frequently: ['SharePoint', 'OneDrive', 'FileServer01', 'DatabaseServer', 'GitLab'],
  owns: ['laptop-001', 'desktop-002', 'mobile-device-003'],
  supervised_by: ['manager-1', 'admin-user', 'team-lead'],
  supervises: ['junior-1', 'intern-2', 'contractor-3'],
};

// Host-specific relationships
const HOST_RELATIONSHIPS = {
  accessed_frequently_by: ['user-admin', 'service-account', 'backup-user'],
  communicates_with: ['server-db-01', 'api-gateway', 'load-balancer'],
  dependent_of: ['cluster-master', 'domain-controller'],
  depends_on: ['dns-server', 'ntp-server', 'ldap-server'],
  owned_by: ['it-department', 'security-team', 'devops'],
};

/**
 * Generate random enrichment data for an entity
 */
const generateRandomEnrichment = (
  entityName: string,
  entityType: 'user' | 'host'
): EntityEnrichment => {
  const now = new Date();
  const daysAgo = faker.number.int({ min: 30, max: 365 });
  const firstSeen = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const lastActivity = new Date(
    now.getTime() - faker.number.int({ min: 0, max: 24 }) * 60 * 60 * 1000
  );

  // Generate random behaviors
  const behaviors: EntityEnrichment['behaviors'] = {
    brute_force_victim: faker.datatype.boolean({ probability: 0.2 }),
    new_country_login: faker.datatype.boolean({ probability: 0.15 }),
    used_usb_device: faker.datatype.boolean({ probability: 0.3 }),
  };

  // Add anomaly job IDs and rule names with some probability
  if (faker.datatype.boolean({ probability: 0.4 })) {
    behaviors.anomaly_job_ids = faker.helpers.arrayElements(
      ANOMALY_JOB_IDS,
      faker.number.int({ min: 1, max: 4 })
    );
  }

  if (faker.datatype.boolean({ probability: 0.35 })) {
    behaviors.rule_names = faker.helpers.arrayElements(
      RULE_NAMES,
      faker.number.int({ min: 1, max: 3 })
    );
  }

  // Generate random attributes
  const attributes: EntityEnrichment['attributes'] = {
    asset: faker.datatype.boolean({ probability: 0.7 }),
    managed: faker.datatype.boolean({ probability: 0.6 }),
    mfa_enabled: faker.datatype.boolean({ probability: 0.5 }),
    privileged: faker.datatype.boolean({ probability: 0.2 }),
  };

  // Generate lifecycle data
  const lifecycle: EntityEnrichment['lifecycle'] = {
    first_seen: firstSeen.toISOString(),
    last_activity: lastActivity.toISOString(),
  };

  // Generate relationships based on entity type
  const relationships: Record<string, string[]> = {};
  const relationshipSource = entityType === 'user' ? USER_RELATIONSHIPS : HOST_RELATIONSHIPS;

  for (const [key, values] of Object.entries(relationshipSource)) {
    if (faker.datatype.boolean({ probability: 0.5 })) {
      relationships[key] = faker.helpers.arrayElements(
        values,
        faker.number.int({ min: 1, max: 3 })
      );
    }
  }

  return {
    id: entityName,
    behaviors,
    attributes,
    lifecycle,
    relationships: Object.keys(relationships).length > 0 ? relationships : undefined,
  };
};

/**
 * Enrich entities via the Entity Store API
 */
export const enrichEntitiesViaApi = async (opts: {
  users: User[];
  hosts: Host[];
  space?: string;
}) => {
  const { users, hosts, space } = opts;

  console.log('Starting entity enrichment via API...');
  console.log(`Enriching ${users.length} users and ${hosts.length} hosts`);

  let successCount = 0;
  let errorCount = 0;

  // Enrich users
  for (const user of users) {
    try {
      const enrichment = generateRandomEnrichment(user.name, 'user');
      await enrichEntityViaApi('user', enrichment, space);
      successCount++;
    } catch (error) {
      errorCount++;
      console.error(`Failed to enrich user ${user.name}:`, error);
    }
  }
  console.log(`Enriched ${successCount} users (${errorCount} errors)`);

  successCount = 0;
  errorCount = 0;

  // Enrich hosts
  for (const host of hosts) {
    try {
      const enrichment = generateRandomEnrichment(host.name, 'host');
      await enrichEntityViaApi('host', enrichment, space);
      successCount++;
    } catch (error) {
      errorCount++;
      console.error(`Failed to enrich host ${host.name}:`, error);
    }
  }
  console.log(`Enriched ${successCount} hosts (${errorCount} errors)`);

  console.log('Entity enrichment completed');
};

/**
 * Generate entities first
 * Then Generate events, assign asset criticality, create rule and enable risk engine
 */
export const generateEntityStore = async ({
  users = 10,
  hosts = 10,
  services = 10,
  genericEntities = 10,
  seed = generateNewSeed(),
  space,
  options,
  offsetHours = 10,
}: {
  users: number;
  hosts: number;
  services: number;
  genericEntities: number;
  seed: number;
  space?: string;
  options: string[];
  offsetHours?: number;
}) => {
  if (options.includes(ENTITY_STORE_OPTIONS.seed)) {
    faker.seed(seed);
  }
  try {
    const generatedUsers = faker.helpers.multiple(createRandomUser, {
      count: users,
    });

    const generatedHosts = faker.helpers.multiple(createRandomHost, {
      count: hosts,
    });

    const generatedGenericEntities = faker.helpers.multiple(createRandomGenericEntity, {
      count: genericEntities,
    });

    const eventsForUsers: UserEvent[] = generateEvents(
      generatedUsers,
      createRandomEventForUser,
      offsetHours
    );
    const eventsForHosts: HostEvent[] = generateEvents(
      generatedHosts,
      createRandomEventForHost,
      offsetHours
    );

    const generatedServices: Service[] = faker.helpers.multiple(createRandomService, {
      count: services,
    });

    const eventsForServices: ServiceEvent[] = generateEvents(
      generatedServices,
      createRandomEventForService,
      offsetHours
    );

    const eventsForGenericEntities: GenericEntityEvent[] = generateEvents(
      generatedGenericEntities,
      createRandomEventForGenericEntity,
      offsetHours
    );

    const relational = matchUsersAndHosts(eventsForUsers, eventsForHosts);

    await ingestEvents(relational.users);
    console.log('Users events ingested');
    await ingestEvents(relational.hosts);
    console.log('Hosts events ingested');
    await ingestEvents(eventsForServices);
    console.log('Services events ingested');
    await ingestEvents(eventsForGenericEntities);
    console.log('Generic Entities events ingested');

    if (space && space !== 'default') {
      await initializeSpace(space);
    }

    if (options.includes(ENTITY_STORE_OPTIONS.criticality)) {
      await assignAssetCriticalityToEntities({
        entities: generatedUsers,
        field: 'user.name',
        space,
      });
      console.log('Assigned asset criticality to users');
      await assignAssetCriticalityToEntities({
        entities: generatedHosts,
        field: 'host.name',
        space,
      });
      console.log('Assigned asset criticality to hosts');
    }

    if (options.includes(ENTITY_STORE_OPTIONS.riskEngine)) {
      await enableRiskScore(space);
      console.log('Risk score enabled');
    }

    if (options.includes(ENTITY_STORE_OPTIONS.rule)) {
      await createRule({ space });
      console.log('Rule created');
    }

    if (options.includes(ENTITY_STORE_OPTIONS.agent)) {
      const agents = generatedHosts.map((host) => createAgentDocument({ hostname: host.name }));
      await ingestAgents(agents);
      console.log('Agents ingested');
    }

    if (options.includes(ENTITY_STORE_OPTIONS.apiEnrichment)) {
      console.log('Waiting for entity store to process entities before enrichment...');
      // Wait a bit for the entity store transforms to process the ingested events
      await new Promise((resolve) => setTimeout(resolve, 10000));

      await enrichEntitiesViaApi({
        users: generatedUsers,
        hosts: generatedHosts,
        space,
      });
    }

    console.log('Finished generating entity store');
  } catch (error) {
    console.log('Error: ', error);
  }
};

export const cleanEntityStore = async () => {
  console.log('Deleting all entity-store data...');
  try {
    console.log('Deleted all events');
    const client = getClient();
    await client.deleteByQuery({
      index: EVENT_INDEX_NAME,
      refresh: true,
      query: {
        match_all: {},
      },
    });

    console.log('Deleted asset criticality');
    await client.deleteByQuery({
      index: '.asset-criticality.asset-criticality-default',
      refresh: true,
      query: {
        match_all: {},
      },
    });
  } catch (error) {
    console.log('Failed to clean data');
    console.log(error);
  }
};

const matchUsersAndHosts = (
  users: UserEvent[],
  hosts: HostEvent[]
): {
  users: UserEvent[];
  hosts: HostEvent[];
} => {
  const splitIndex = faker.number.int({ max: users.length - 1 });

  return {
    users: users
      .slice(0, splitIndex)
      .map((user) => {
        const index = faker.number.int({ max: hosts.length - 1 });
        return { ...user, host: hosts[index].host } as UserEvent;
      })
      .concat(users.slice(splitIndex)) as UserEvent[],

    hosts: hosts
      .slice(0, splitIndex)
      .map((host) => {
        const index = faker.number.int({ max: users.length - 1 });
        return { ...host, user: users[index].user } as HostEvent;
      })
      .concat(hosts.slice(splitIndex)),
  };
};
