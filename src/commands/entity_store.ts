import { faker } from '@faker-js/faker';
import { getEsClient, indexCheck, createAgentDocument } from './utils/indices';
import { chunk, once } from 'lodash-es';
import moment from 'moment';
import auditbeatMappings from '../mappings/auditbeat.json' assert { type: 'json' };
import {
  assignAssetCriticality,
  enableRiskScore,
  createRule,
} from '../utils/kibana_api';
import { ENTITY_STORE_OPTIONS, generateNewSeed } from '../constants';
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

const getOffset = () => {
  const config = getConfig();

  if (config.eventDateOffsetHours !== undefined) {
    once(() =>
      console.log(
        `Using event date offset: ${config.eventDateOffsetHours} hours`,
      ),
    );

    return config.eventDateOffsetHours;
  }
  return faker.number.int({ max: 1000 });
};

type Agent = ReturnType<typeof createAgentDocument>;

type AssetCriticality =
  | 'low_impact'
  | 'medium_impact'
  | 'high_impact'
  | 'extreme_impact'
  | 'unknown';

const ASSET_CRITICALITY: AssetCriticality[] = [
  'low_impact',
  'medium_impact',
  'high_impact',
  'extreme_impact',
  'unknown',
];

enum EntityTypes {
  User = 'user',
  Host = 'host',
  Service = 'service',
  Generic = 'generic',
}

interface BaseEntity {
  name: string;
  assetCriticality: AssetCriticality;
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
  sub_type: string;
}

interface BaseEvent {
  '@timestamp': string;
  message: string;
  service: {
    type: string;
  };
}

interface EventUser {
  name: string;
  id: number;
  entity_id: string;
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
  entity: {
    id: string;
    name: string;
    type: string;
    sub_type: string;
    address: string;
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
  { type: 'user', subType: 'aws_iam_user' },
  { type: 'host', subType: 'aws_ec2_instance' },
  { type: 'database', subType: 'aws_redshift_instance' },
  { type: 'network', subType: 'aws_ec2_vpc' },
];
export const createRandomGenericEntity = (): GenericEntity => {
  const taxonomy =
    genericTypes[Math.floor(Math.random() * genericTypes.length)];

  return {
    name: `GenericEntity-${faker.internet.domainName()}`,
    assetCriticality: faker.helpers.arrayElement(ASSET_CRITICALITY),
    id: faker.string.nanoid(),
    type: taxonomy.type,
    sub_type: taxonomy.subType,
  };
};

export const createRandomEventForHost = (host: Host): HostEvent => ({
  '@timestamp': moment()
    .subtract(getOffset(), 'h')
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

export const createRandomEventForUser = (user: User): UserEvent => ({
  '@timestamp': moment()
    .subtract(getOffset(), 'h')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
  message: `User ${faker.hacker.phrase()}`,
  service: {
    type: 'system',
  },
  user: {
    name: user.name,
    id: faker.number.int({ max: 10000 }),
    entity_id: faker.string.nanoid(),
  },
});

export const createRandomEventForService = (
  service: Service,
): ServiceEvent => ({
  '@timestamp': moment()
    .subtract(getOffset(), 'h')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
  message: `Service ${faker.hacker.phrase()}`,
  service: {
    node: {
      roles: faker.helpers.arrayElement(['master', 'data', 'ingest']),
      name: faker.internet.domainWord(),
    },
    environment: faker.helpers.arrayElement([
      'production',
      'staging',
      'development',
    ]),
    address: faker.internet.ip(),
    name: service.name,
    id: faker.string.nanoid(),
    state: faker.helpers.arrayElement(['running', 'stopped', 'starting']),
    ephemeral_id: faker.string.nanoid(),
    type: 'system',
    version: faker.system.semver(),
  },
});

export const createRandomEventFoGenericEntity = (
  entity: GenericEntity,
): GenericEntityEvent => ({
  '@timestamp': moment()
    .subtract(getOffset(), 'h')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
  message: `Service ${faker.hacker.phrase()}`,
  service: {
    type: 'system',
  },
  entity: {
    ...entity,
    address: faker.string.alpha({ length: { min: 10, max: 20 } }),
  },
});

const ingestEvents = async (events: Event[]) =>
  ingest(EVENT_INDEX_NAME, events, auditbeatMappings as MappingTypeMapping);

type TDocument = object;
type TPartialDocument = Partial<TDocument>;

const ingestAgents = async (agents: Agent[]) =>
  ingest(AGENT_INDEX_NAME, agents);

const ingest = async (
  index: string,
  documents: Array<object>,
  mapping?: MappingTypeMapping,
) => {
  await indexCheck(index, { mappings: mapping });

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
          event,
        ) => {
          acc.push({ index: { _index: index } });
          acc.push(event);
          return acc;
        },
        [],
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
  createEvent: (entity: E) => EV,
): EV[] => {
  const eventsPerEntity = 10;
  const acc: EV[] = [];
  return entities.reduce((acc, entity) => {
    const events = faker.helpers.multiple(() => createEvent(entity), {
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
}: {
  users: number;
  hosts: number;
  services: number;
  genericEntities: number;
  seed: number;
  space?: string;
  options: string[];
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

    const generatedGenericEntities = faker.helpers.multiple(
      createRandomGenericEntity,
      {
        count: genericEntities,
      },
    );

    const eventsForUsers: UserEvent[] = generateEvents(
      generatedUsers,
      createRandomEventForUser,
    );
    const eventsForHosts: HostEvent[] = generateEvents(
      generatedHosts,
      createRandomEventForHost,
    );

    const generatedServices: Service[] = faker.helpers.multiple(
      createRandomService,
      {
        count: services,
      },
    );

    const eventsForServices: ServiceEvent[] = generateEvents(
      generatedServices,
      createRandomEventForService,
    );

    const eventsForGenericEntities: GenericEntityEvent[] = generateEvents(
      generatedGenericEntities,
      createRandomEventFoGenericEntity,
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
      const agents = generatedHosts.map((host) =>
        createAgentDocument({ hostname: host.name }),
      );
      await ingestAgents(agents);
      console.log('Agents ingested');
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
  hosts: HostEvent[],
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
