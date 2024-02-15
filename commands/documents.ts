
import createAlerts from "../createAlerts.mjs";
import createEvents from "../createEvents.mjs";
import alertMappings from "../mappings/alertMappings.json" assert { type: "json" };
import eventMappings from "../mappings/eventMappings.json" assert { type: "json" };
import { getEsClient, indexCheck } from "./utils/index.mjs";

import config from "../config.json" assert { type: "json" };

let client = getEsClient();

const ALERT_INDEX = ".alerts-security.alerts-default";
const EVENT_INDEX = config.eventIndex;

const generateDocs = async ({ createDocs, amount, index }) => {
  let limit = 30000;
  let generated = 0;

  while (generated < amount) {
    let docs = createDocuments(
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

const createDocuments = (n, generated, createDoc, index) => {
  return Array(n)
    .fill(null)
    .reduce((acc, val, i) => {
      let count = Math.floor((generated + i) / 10);
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


export const generateAlerts = async (n) => {
  await indexCheck(ALERT_INDEX, alertMappings);

  console.log("Generating alerts...");

  await generateDocs({
    createDocs: createAlerts,
    amount: n,
    index: ALERT_INDEX,
  });

  console.log("Finished gerating alerts");
};

export const generateEvents = async (n) => {
  await indexCheck(EVENT_INDEX, eventMappings);

  console.log("Generating events...");

  await generateDocs({
    createDocs: createEvents,
    amount: n,
    index: EVENT_INDEX,
  });

  console.log("Finished generating events");
};

export const generateGraph = async ({ users = 100, maxHosts = 3 }) => {
  await alertIndexCheck();
  console.log("Generating alerts graph...");

  const clusters = [];
  let alerts = [];
  for (let i = 0; i < users; i++) {
    let userCluster = [];
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
      // alerts.push({ index: { _index: ALERT_INDEX, _id: alert['kibana.alert.uuid'] } })
      // alerts.push(alert)
    }
    clusters.push(userCluster);
  }

  let lastAlertFromCluster = null;
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
