
import createAlerts from "../createAlerts";
import createEvents from "../createEvents";
import alertMappings from "../mappings/alertMappings.json" assert { type: "json" };
import eventMappings from "../mappings/eventMappings.json" assert { type: "json" };
import { getEsClient, indexCheck } from "./utils/index";

import { getConfig } from "../get_config";
import { BulkOperationContainer } from "@elastic/elasticsearch/lib/api/typesWithBodyKey";
import { MappingTypeMapping } from "@elastic/elasticsearch/lib/api/types";

const config = getConfig();
const client = getEsClient();

const ALERT_INDEX = ".alerts-security.alerts-default";
const EVENT_INDEX = config.eventIndex;

const generateDocs = async ({ createDocs, amount, index }: {createDocs: DocumentCreator; amount: number; index: string}) => {
  if (!client) {
    throw new Error('failed to create ES client');
  }
  const limit = 30000;
  let generated = 0;

  while (generated < amount) {
    const docs = createDocuments(
      Math.min(limit, amount),
      generated,
      createDocs,
      index
    );
    try {
      const result = await client.bulk({ body: docs, refresh: true });
      generated += result.items.length / 2;
      console.log(
        `${result.items.length} documents created, ${amount - generated} left`
      );
    } catch (err) {
      console.log("Error: ", err);
    }
  }
};

interface DocumentCreator {
	(descriptor: { id_field: string, id_value: string }): object;
}

const createDocuments = (n: number, generated: number, createDoc: DocumentCreator, index: string): unknown[] => {
  return Array(n)
    .fill(null)
    .reduce((acc, _, i) => {
      let alert = createDoc({
        id_field: "host.name",
        id_value: `Host ${generated + i}`,
      });
      acc.push({ index: { _index: index } });
      acc.push({ ...alert });
      alert = createDoc({
        id_field: "user.name",
        id_value: `User ${generated + i}`,
      });
      acc.push({ index: { _index: index } });
      acc.push({ ...alert });
      return acc;
    }, []);
};


export const generateAlerts = async (n: number) => {
  await indexCheck(ALERT_INDEX, alertMappings as MappingTypeMapping);

  console.log("Generating alerts...");

  await generateDocs({
    createDocs: createAlerts,
    amount: n,
    index: ALERT_INDEX,
  });

  console.log("Finished gerating alerts");
};

export const generateEvents = async (n: number) => {
  await indexCheck(EVENT_INDEX, eventMappings as MappingTypeMapping);

  console.log("Generating events...");

  await generateDocs({
    createDocs: createEvents,
    amount: n,
    index: EVENT_INDEX,
  });

  console.log("Finished generating events");
};

export const generateGraph = async ({ users = 100, maxHosts = 3 }) => {
  //await alertIndexCheck(); TODO
  console.log("Generating alerts graph...");

  type AlertOverride ={host: { name: string }; user: { name: string }}; 

  const clusters: (ReturnType<typeof createAlerts>&AlertOverride)[][] = [];

  /**
   * The type you can pass to the bulk API, if you're working with Fake Alerts.
   * This accepts partial docs, full docs, and other docs that indicate _index, _id, and such
   */
  type FakeAlertBulkOperations = BulkOperationContainer | Partial<AlertOverride>;

  const alerts: FakeAlertBulkOperations[] = [];
  for (let i = 0; i < users; i++) {
    const userCluster = [];
    for (let j = 0; j < maxHosts; j++) {
      const alert = createAlerts({
        host: {
          name: `Host ${i}${j}`,
        },
        user: {
          name: `User ${i}`,
        },
      });
      userCluster.push(alert);
    }
    clusters.push(userCluster);
  }

  let lastAlertFromCluster: (ReturnType<typeof createAlerts>&AlertOverride) | null  = null;
  clusters.forEach((cluster) => {
    if (lastAlertFromCluster) {
      const alert = createAlerts({
        host: {
          name: cluster[0].host.name,
        },
        user: {
          name: lastAlertFromCluster.user.name,
        },
      });
      alerts.push({
        index: { _index: ALERT_INDEX, _id: alert["kibana.alert.uuid"] },
      });
      alerts.push(alert);
    }
    cluster.forEach((alert) => {
      alerts.push({
        index: { _index: ALERT_INDEX, _id: alert["kibana.alert.uuid"] },
      });
      alerts.push(alert);
      lastAlertFromCluster = alert;
    });
  });

  try {
    if (!client) throw new Error;
    const result = await client.bulk({ body: alerts, refresh: true });
    console.log(`${result.items.length} alerts created`);
  } catch (err) {
    console.log("Error: ", err);
  }
};

export const deleteAllAlerts = async () => {
  console.log("Deleting all alerts...");
  try {
    console.log("Deleted all alerts");
    if (!client) throw new Error;
    await client.deleteByQuery({
      index: ALERT_INDEX,
      refresh: true,
      body: {
        query: {
          match_all: {},
        },
      },
    });
  } catch (error) {
    console.log("Failed to delete alerts");
    console.log(error);
  }
};

export const deleteAllEvents = async () => {
  console.log("Deleting all events...");
  try {
    console.log("Deleted all events");
    if (!client) throw new Error;
    await client.deleteByQuery({
      index: EVENT_INDEX,
      refresh: true,
      body: {
        query: {
          match_all: {},
        },
      },
    });
  } catch (error) {
    console.log("Failed to delete events");
    console.log(error);
  }
};
