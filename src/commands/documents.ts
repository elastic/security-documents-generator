import createAlerts, { BaseCreateAlertsReturnType } from '../createAlerts';
import createEvents from '../createEvents';
import eventMappings from '../mappings/eventMappings.json' assert { type: 'json' };
import { getEsClient, indexCheck } from './utils/index';
import { getConfig } from '../get_config';
import {
  MappingTypeMapping,
  BulkOperationContainer,
} from '@elastic/elasticsearch/lib/api/types';
import pMap from 'p-map';
import { chunk } from 'lodash-es';
import cliProgress from 'cli-progress';
import { faker } from '@faker-js/faker';
import { getAlertIndex } from '../utils';

const config = getConfig();
const client = getEsClient();

const generateDocs = async ({
  createDocs,
  amount,
  index,
}: {
  createDocs: DocumentCreator;
  amount: number;
  index: string;
}) => {
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
      index,
    );
    try {
      const result = await bulkUpsert(docs);
      generated += result.items.length / 2;
    } catch (err) {
      console.log('Error: ', err);
      process.exit(1);
    }
  }
};

const bulkUpsert = async (docs: unknown[]) => {
  if (!client) {
    throw new Error('failed to create ES client');
  }
  try {
    return client.bulk({ body: docs, refresh: true });
  } catch (err) {
    console.log('Error: ', err);
    process.exit(1);
  }
};

interface DocumentCreator {
  (descriptor: { id_field: string; id_value: string }): object;
}

const alertToBatchOps = (
  alert: BaseCreateAlertsReturnType,
  index: string,
): unknown[] => {
  return [
    { index: { _index: index, _id: alert['kibana.alert.uuid'] } },
    { ...alert },
  ];
};

const createDocuments = (
  n: number,
  generated: number,
  createDoc: DocumentCreator,
  index: string,
): unknown[] => {
  return Array(n)
    .fill(null)
    .reduce((acc, _, i) => {
      let alert = createDoc({
        id_field: 'host.name',
        id_value: `Host ${generated + i}`,
      });
      acc.push({ index: { _index: index } });
      acc.push({ ...alert });
      alert = createDoc({
        id_field: 'user.name',
        id_value: `User ${generated + i}`,
      });
      acc.push({ index: { _index: index } });
      acc.push({ ...alert });
      return acc;
    }, []);
};

export const generateAlerts = async (
  alertCount: number,
  hostCount: number,
  userCount: number,
  space: string,
) => {
  if (userCount > alertCount) {
    console.log('User count should be less than alert count');
    process.exit(1);
  }

  if (hostCount > alertCount) {
    console.log('Host count should be less than alert count');
    process.exit(1);
  }

  console.log(
    `Generating ${alertCount} alerts containing ${hostCount} hosts and ${userCount} users in space ${space}`,
  );
  const concurrency = 10; // how many batches to send in parallel
  const batchSize = 2500; // number of alerts in a batch
  const no_overrides = {};

  const batchOpForIndex = ({
    userName,
    hostName,
  }: {
    userName: string;
    hostName: string;
  }) =>
    alertToBatchOps(
      createAlerts(no_overrides, { userName, hostName, space }),
      getAlertIndex(space),
    );

  console.log('Generating entity names...');
  const userNames = Array.from({ length: userCount }, () =>
    faker.internet.username(),
  );
  const hostNames = Array.from({ length: hostCount }, () =>
    faker.internet.domainName(),
  );

  console.log('Assigning entity names...');
  const alertEntityNames = Array.from({ length: alertCount }, (_, i) => ({
    userName: userNames[i % userCount],
    hostName: hostNames[i % hostCount],
  }));

  console.log('Entity names assigned. Batching...');
  const operationBatches = chunk(alertEntityNames, batchSize).map((batch) =>
    batch.flatMap(batchOpForIndex),
  );

  console.log('Batching complete. Sending to ES...');

  console.log(
    `Sending in ${operationBatches.length} batches of ${batchSize} alerts, with up to ${concurrency} batches in parallel\n\n`,
  );
  const progress = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic,
  );

  progress.start(operationBatches.length, 0);

  await pMap(
    operationBatches,
    async (operations) => {
      await bulkUpsert(operations);
      progress.increment();
    },
    { concurrency },
  );

  progress.stop();
};

// this creates asset criticality not events?
export const generateEvents = async (n: number) => {
  if (!config.eventIndex) {
    throw new Error('eventIndex not defined in config');
  }
  await indexCheck(config.eventIndex, eventMappings as MappingTypeMapping);

  console.log('Generating events...');

  await generateDocs({
    createDocs: createEvents,
    amount: n,
    index: config.eventIndex,
  });

  console.log('Finished generating events');
};

export const generateGraph = async ({ users = 100, maxHosts = 3 }) => {
  console.log('Generating alerts graph...');

  type AlertOverride = { host: { name: string }; user: { name: string } };

  const clusters: (ReturnType<typeof createAlerts> & AlertOverride)[][] = [];

  /**
   * The type you can pass to the bulk API, if you're working with Fake Alerts.
   * This accepts partial docs, full docs, and other docs that indicate _index, _id, and such
   */
  type FakeAlertBulkOperations =
    | BulkOperationContainer
    | Partial<AlertOverride>;

  const alerts: FakeAlertBulkOperations[] = [];
  for (let i = 0; i < users; i++) {
    const userCluster = [];
    for (let j = 0; j < maxHosts; j++) {
      const alert = createAlerts({
        host: {
          name: 'Host mark',
        },
        user: {
          name: 'User pablo',
        },
      });
      userCluster.push(alert);
    }
    clusters.push(userCluster);
  }

  let lastAlertFromCluster:
    | (ReturnType<typeof createAlerts> & AlertOverride)
    | null = null;
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
        index: {
          _index: getAlertIndex('default'),
          _id: alert['kibana.alert.uuid'],
        },
      });
      alerts.push(alert);
    }
    cluster.forEach((alert) => {
      alerts.push({
        index: {
          _index: getAlertIndex('default'),
          _id: alert['kibana.alert.uuid'],
        },
      });
      alerts.push(alert);
      lastAlertFromCluster = alert;
    });
  });

  try {
    if (!client) throw new Error();
    const result = await client.bulk({ body: alerts, refresh: true });
    console.log(`${result.items.length} alerts created`);
  } catch (err) {
    console.log('Error: ', err);
  }
};

export const deleteAllAlerts = async () => {
  console.log('Deleting all alerts...');
  try {
    console.log('Deleted all alerts');
    if (!client) throw new Error();
    await client.deleteByQuery({
      index: '.alerts-security.alerts-*',
      refresh: true,
      body: {
        query: {
          match_all: {},
        },
      },
    });
  } catch (error) {
    console.log('Failed to delete alerts');
    console.log(error);
  }
};

export const deleteAllEvents = async () => {
  console.log('Deleting all events...');
  if (!config.eventIndex) {
    throw new Error('eventIndex not defined in config');
  }
  try {
    console.log('Deleted all events');
    if (!client) throw new Error();
    await client.deleteByQuery({
      index: config.eventIndex,
      refresh: true,
      body: {
        query: {
          match_all: {},
        },
      },
    });
  } catch (error) {
    console.log('Failed to delete events');
    console.log(error);
  }
};
