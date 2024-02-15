import { faker } from "@faker-js/faker";
import { getEsClient, indexCheck } from "./utils/index.mjs";
import { chunk } from "lodash-es";
import moment from "moment";
import auditbeatMappings from "../mappings/auditbeat.json" assert { type: "json" };
import { assignAssetCriticality, enableRiskScore, createRule } from "./api.mjs";
import { ENTITY_STORE_OPTIONS, generateNewSeed } from "../constants.mjs";

let client = getEsClient();
let EVENT_INDEX_NAME = "auditbeat-8.12.0-2024.01.18-000001";

const offset = () => faker.number.int({ max: 1000 })

const ASSET_CRITICALITY = [
  "low_impact", "medium_impact", "high_impact", "extreme_impact", "unknown",
];

export const createRandomUser = () => {
  return {
    name: `User-${faker.internet.userName()}`,
    assetCriticality: faker.helpers.arrayElement(ASSET_CRITICALITY),
  };
};

export const createRandomHost = () => {
  return {
    name: `Host-${faker.internet.domainName()}`,
    assetCriticality: faker.helpers.arrayElement(ASSET_CRITICALITY),
  };
};



export const createFactoryRandomEventForHost = (name) => () => {
  return {
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
  };
};

export const createFactoryRandomEventForUser = (name) => () => {
  return {
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
  };
};

const ingestEvents = async (events) => {

  await indexCheck(EVENT_INDEX_NAME, auditbeatMappings);

  let chunks = chunk(events, 10000);

  for (let chunk of chunks) {
    try {
      // Make bulk request
      let ingestRequest = chunk.reduce((acc, event) => {
        acc.push({ index: { _index: EVENT_INDEX_NAME } });
        acc.push(event);
        return acc;
      }, []);
      const result = await client.bulk({ body: ingestRequest, refresh: true });
    } catch (err) {
      console.log("Error: ", err);
    }
  }
};

export const generateEvents = (entities, createEventFactory) => {
  const eventsPerEntity = 10;
  return entities.reduce((acc, entity) => {
    const events = faker.helpers.multiple(createEventFactory(entity.name), {
      count: eventsPerEntity,
    });
    acc.push(...events);
    return acc;
  }, []);
};

const assignAssetCriticalityToEntities = async (entities, field) => {
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
 * @param {*} param0
 */
export const generateEntityStore = async ({ users = 10, hosts = 10, seed = generateNewSeed(), options }) => {
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
      createFactoryRandomEventForUser
    );
    let eventsForHosts = generateEvents(
      generatedHosts,
      createFactoryRandomEventForHost
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


    console.log("Finished generating entity store");
  } catch (error) {
    console.log("Error: ", error);
  }
};

export const cleanEntityStore = async () => {
  console.log("Deleting all entity-store data...");
  try {
    console.log("Deleted all events");
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


const matchUsersAndHosts = (users, hosts) => {
  const splitIndex = faker.number.int({ max: users.length - 1 });

  return {
    users: users
      .slice(0, splitIndex)
      .map(user => {
        const index = faker.number.int({ max: hosts.length - 1 });
        return { ...user, host: hosts[index].host }
      })
      .concat(users.slice(splitIndex)),

    hosts: hosts.
      slice(0, splitIndex)
      .map(host => {
        const index = faker.number.int({ max: users.length - 1 });
        return { ...host, user: users[index].user }
      })
      .concat(hosts.slice(splitIndex))
  };
}
