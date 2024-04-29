import { faker } from "@faker-js/faker";
import { getEsClient, indexCheck, createAgentDocument } from "./utils";
import { chunk } from "lodash-es";
import moment from "moment";
import auditbeatMappings from "../mappings/auditbeat.json" assert { type: "json" };
import { assignAssetCriticality, enableRiskScore, createRule } from "./api";
import { ENTITY_STORE_OPTIONS, generateNewSeed } from "../constants";
import { BulkOperationContainer, BulkUpdateAction, MappingTypeMapping } from "@elastic/elasticsearch/lib/api/types";
import { getConfig } from "../get_config";

const config = getConfig();
let client = getEsClient();
let EVENT_INDEX_NAME = "auditbeat-8.12.0-2024.01.18-000001";
const AGENT_INDEX_NAME = ".fleet-agents-7";

if (config.eventDateOffsetHours !== undefined) {
  console.log(`Using event date offset: ${config.eventDateOffsetHours} hours`);
}

const offset = () =>
  config.eventDateOffsetHours ?? faker.number.int({ max: 1000 });

type Agent = ReturnType<typeof createAgentDocument>;

type AssetCriticality = "low_impact" | "medium_impact" | "high_impact" | "extreme_impact" | "unknown";

const ASSET_CRITICALITY: AssetCriticality[] = [
  "low_impact",
  "medium_impact",
  "high_impact",
  "extreme_impact",
  "unknown",
];

enum EntityTypes {
  User = "user",
  Host = "host",
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

interface BaseEvent {
  "@timestamp": string;
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
interface UserEvent extends BaseEvent {
  user: EventUser;
  host?: EventHost;
}

interface HostEvent extends BaseEvent {
  host: EventHost;
  user?: EventUser;
}

type Event = UserEvent | HostEvent;

export const createRandomUser = (): User => {
  return {
    name: `User-${faker.internet.userName()}`,
    assetCriticality: faker.helpers.arrayElement(ASSET_CRITICALITY),
    type: EntityTypes.User,
  };
};

export const createRandomHost= (): Host  => {
  return {
    name: `Host-${faker.internet.domainName()}`,
    assetCriticality: faker.helpers.arrayElement(ASSET_CRITICALITY),
    type: EntityTypes.Host,
  };
};

export const createRandomEventForHost = (name: string): HostEvent => ({
    "@timestamp": moment().subtract(offset(), "h").format("yyyy-MM-DDTHH:mm:ss.SSSSSSZ"),
    message: `Host ${faker.hacker.phrase()}`,
    service: {
      type: "system",
    },
    host: {
      name,
      id: faker.number.int({ max: 10000 }),
      ip: faker.internet.ip(),
      mac: faker.internet.mac(),
      os: {
        name: faker.helpers.arrayElement(["Windows", "Linux", "MacOS"]),
      },
    },
  });

export const createRandomEventForUser = (name: string): UserEvent => ({
    "@timestamp": moment().subtract(offset(), "h").format("yyyy-MM-DDTHH:mm:ss.SSSSSSZ"),
    message: `User ${faker.hacker.phrase()}`,
    service: {
      type: "system",
    },
    user: {
      name,
      id: faker.number.int({ max: 10000 }),
      entity_id: faker.string.nanoid(),
    },
  });

const ingestEvents = async (events: Event[]) => ingest(EVENT_INDEX_NAME, events, auditbeatMappings as MappingTypeMapping);

	type TDocument = object;
	type TPartialDocument = Partial<TDocument>;

const ingestAgents = async (agents: Agent[]) => ingest(AGENT_INDEX_NAME, agents);

const ingest = async (index: string, documents: Array<object>, mapping?: MappingTypeMapping) => {
  await indexCheck(index, mapping);

  let chunks = chunk(documents, 10000);

  for (let chunk of chunks) {
    try {
      // Make bulk request
      let ingestRequest = chunk.reduce((acc: (BulkOperationContainer | BulkUpdateAction<TDocument, TPartialDocument> | TDocument)[], event) => {
        acc.push({ index: { _index: index } });
        acc.push(event);
        return acc;
      }, []);
      if (!client) throw new Error;
	      await client.bulk({ operations: ingestRequest, refresh: true });
    } catch (err) {
      console.log("Error: ", err);
    }
  }
};

// E = Entity, EV = Event
export const generateEvents = <E extends User | Host, EV = E extends User ? UserEvent : HostEvent>(entities: E[], createEvent: (entityName: string) => EV): EV[] => {
  const eventsPerEntity = 10;
  const acc: EV[] = [];
  return entities.reduce((acc, entity) => {
    const events = faker.helpers.multiple(() => createEvent(entity.name), {
      count: eventsPerEntity,
    });
    acc.push(...events);
    return acc;
  }, acc);
};

const assignAssetCriticalityToEntities = async (entities: BaseEntity[], field: string) => {
  for (const entity of entities) {
    const { name, assetCriticality } = entity;
    if (assetCriticality === "unknown") return;
    await assignAssetCriticality({
      id_field: field,
      id_value: name,
      criticality_level: assetCriticality,
    });
  }
};

/**
 * Generate entities first
 * Then Generate events, assign asset criticality, create rule and enable risk engine
 */
export const generateEntityStore = async ({ users = 10, hosts = 10, seed = generateNewSeed(), options }: { users: number; hosts: number; seed: number; options: string[]}) => {
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

    let eventsForUsers = generateEvents(
      generatedUsers,
      createRandomEventForUser
    );
    let eventsForHosts = generateEvents(
      generatedHosts,
      createRandomEventForHost
    );

    const relational = matchUsersAndHosts(eventsForUsers, eventsForHosts)

    await ingestEvents(relational.users);
    console.log("Users events ingested");
    await ingestEvents(relational.hosts);
    console.log("Hosts events ingested");

    if (options.includes(ENTITY_STORE_OPTIONS.criticality)) {
      await assignAssetCriticalityToEntities(generatedUsers, "user.name");
      console.log("Assigned asset criticality to users");
      await assignAssetCriticalityToEntities(generatedHosts, "host.name");
      console.log("Assigned asset criticality to hosts");
    }

    if (options.includes(ENTITY_STORE_OPTIONS.riskEngine)) {
      await enableRiskScore();
      console.log("Risk score enabled");
    }

    if (options.includes(ENTITY_STORE_OPTIONS.rule)) {
      await createRule();
      console.log("Rule created");
    }

    if (options.includes(ENTITY_STORE_OPTIONS.agent)) {
      const agents = generatedHosts.map((host) => createAgentDocument({ hostname: host.name }));
      const result = await ingestAgents(agents);
    }

    console.log("Finished generating entity store");
  } catch (error) {
    console.log("Error: ", error);
  }
};

export const cleanEntityStore = async () => {
  console.log("Deleting all entity-store data...");
  try {
    console.log("Deleted all events");
    if (!client) throw new Error;
    await client.deleteByQuery({
      index: EVENT_INDEX_NAME,
      refresh: true,
      body: {
        query: {
          match_all: {},
        },
      },
    });

    console.log("Deleted asset criticality");
    await client.deleteByQuery({
      index: '.asset-criticality.asset-criticality-default',
      refresh: true,
      body: {
        query: {
          match_all: {},
        },
      },
    });
  } catch (error) {
    console.log("Failed to clean data");
    console.log(error);
  }
};

const matchUsersAndHosts = (users: UserEvent[], hosts: HostEvent[]): {
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

    hosts: hosts.
      slice(0, splitIndex)
      .map((host) => {
        const index = faker.number.int({ max: users.length - 1 });
        return { ...host, user: users[index].user } as HostEvent;
      })
      .concat(hosts.slice(splitIndex))
  };
}
