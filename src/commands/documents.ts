import createAlerts, { BaseCreateAlertsReturnType } from '../create_alerts';
import createEvents from '../create_events';
import eventMappings from '../mappings/eventMappings.json' assert { type: 'json' };
import { getEsClient, indexCheck } from './utils/indices';
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
import { generateAIAlert, generateAIAlertBatch } from '../utils/ai_service';

const generateDocs = async ({
  createDocs,
  amount,
  index,
  useAI = false,
}: {
  createDocs: DocumentCreator;
  amount: number;
  index: string;
  useAI?: boolean;
}) => {
  const limit = 30000;
  let generated = 0;

  while (generated < amount) {
    const docs = await createDocuments(
      Math.min(limit, amount),
      generated,
      createDocs,
      index,
      useAI,
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
  const client = getEsClient();

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

// Updated to support AI generation
const createDocuments = async (
  n: number,
  generated: number,
  createDoc: DocumentCreator,
  index: string,
  useAI = false,
): Promise<unknown[]> => {
  const config = getConfig();

  // If AI is not enabled, use the standard generation
  if (!useAI || !config.useAI) {
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
  }

  // AI-based generation
  console.log('Using AI to generate documents...');
  const docs: unknown[] = [];

  // Generate examples for context using the standard method
  const examples = Array(2)
    .fill(null)
    .map((_, i) =>
      createDoc({
        id_field: 'host.name',
        id_value: `Host ${generated + i}`,
      }),
    ) as BaseCreateAlertsReturnType[];

  // Generate batches with AI
  const progress = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic,
  );
  progress.start(n, 0);

  // Process in smaller batches for AI generation
  const batchSize = 5;
  const batches = Math.ceil(n / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const currentBatchSize = Math.min(batchSize, n - batch * batchSize);

    // Generate AI documents for this batch
    for (let i = 0; i < currentBatchSize; i++) {
      const index = batch * batchSize + i;

      try {
        // Generate host-based document
        if (index < n) {
          const hostId = `Host ${generated + index}`;
          const hostAlert =
            index % 5 === 0
              ? await generateAIAlert({
                  hostName: hostId,
                  userName: faker.internet.username(),
                  examples: examples,
                })
              : createDoc({ id_field: 'host.name', id_value: hostId });

          docs.push({ index: { _index: index } });
          docs.push({ ...hostAlert });
          progress.increment(0.5);
        }

        // Generate user-based document
        if (index < n) {
          const userId = `User ${generated + index}`;
          const userAlert =
            index % 5 === 0
              ? await generateAIAlert({
                  hostName: faker.internet.domainName(),
                  userName: userId,
                  examples: examples,
                })
              : createDoc({ id_field: 'user.name', id_value: userId });

          docs.push({ index: { _index: index } });
          docs.push({ ...userAlert });
          progress.increment(0.5);
        }
      } catch (error) {
        console.error(`Error generating AI document at index ${index}:`, error);
        // Fallback to standard generation
        const alert = createDoc({
          id_field: 'host.name',
          id_value: `Host ${generated + index}`,
        });
        docs.push({ index: { _index: index } });
        docs.push({ ...alert });
        progress.increment(0.5);

        const userAlert = createDoc({
          id_field: 'user.name',
          id_value: `User ${generated + index}`,
        });
        docs.push({ index: { _index: index } });
        docs.push({ ...userAlert });
        progress.increment(0.5);
      }
    }
  }

  progress.stop();
  return docs;
};

export const generateAlerts = async (
  alertCount: number,
  hostCount: number,
  userCount: number,
  space: string,
  useAI = false,
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
    `Generating ${alertCount} alerts containing ${hostCount} hosts and ${userCount} users in space ${space}${useAI ? ' using AI' : ''}`,
  );

  const config = getConfig();
  if (useAI && !config.useAI) {
    console.log(
      'AI generation requested but not enabled in config. Set "useAI": true in config.json',
    );
    if (!config.openaiApiKey) {
      console.log(
        'OpenAI API key is missing. Add "openaiApiKey": "your-key" to config.json',
      );
    }
    process.exit(1);
  }

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

  // If AI is enabled, use a different approach for generation
  if (useAI && config.useAI) {
    console.log('Using AI for alert generation...');
    const progress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    );

    // Generate example alerts for context
    const exampleAlerts = alertEntityNames
      .slice(0, 2)
      .map(({ userName, hostName }) =>
        createAlerts(no_overrides, { userName, hostName, space }),
      );

    progress.start(alertCount, 0);

    // Process alerts in batches for more efficient AI generation
    const aiBatchSize = 5; // Generate 5 alerts at once to reduce API calls
    const operations: unknown[] = [];

    // Split entities into manageable chunks for batch processing
    const entityChunks = chunk(alertEntityNames, aiBatchSize);

    for (let chunkIndex = 0; chunkIndex < entityChunks.length; chunkIndex++) {
      const currentChunk = entityChunks[chunkIndex];

      try {
        // Use batch generation for better efficiency
        const generatedAlerts = await generateAIAlertBatch({
          entities: currentChunk,
          space,
          examples: exampleAlerts,
          batchSize: aiBatchSize,
        });

        // Add the generated alerts to the bulk operations
        for (const alert of generatedAlerts) {
          operations.push({
            index: {
              _index: getAlertIndex(space),
              _id: alert['kibana.alert.uuid'],
            },
          });
          operations.push(alert);
        }

        progress.increment(currentChunk.length);
      } catch (error) {
        console.error('Error in batch generation:', error);

        // Fallback to standard generation for this batch
        for (const entity of currentChunk) {
          const alert = createAlerts(no_overrides, {
            userName: entity.userName,
            hostName: entity.hostName,
            space,
          });

          operations.push({
            index: {
              _index: getAlertIndex(space),
              _id: alert['kibana.alert.uuid'],
            },
          });
          operations.push(alert);
        }

        progress.increment(currentChunk.length);
      }

      // Send operations to Elasticsearch when we have a reasonable batch size
      if (
        operations.length >= batchSize * 2 ||
        chunkIndex === entityChunks.length - 1
      ) {
        try {
          await bulkUpsert(operations);
          operations.length = 0; // Clear the array after successful upload
        } catch (error) {
          console.error('Error sending batch to Elasticsearch:', error);
          process.exit(1);
        }
      }
    }

    progress.stop();
    console.log('AI alert generation completed');
    return;
  }

  // Standard generation (non-AI) continues with the existing code
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

// Updated to support AI
export const generateEvents = async (n: number, useAI = false) => {
  const config = getConfig();

  if (!config.eventIndex) {
    throw new Error('eventIndex not defined in config');
  }

  if (useAI && !config.useAI) {
    console.log(
      'AI generation requested but not enabled in config. Set "useAI": true in config.json',
    );
    if (!config.openaiApiKey) {
      console.log(
        'OpenAI API key is missing. Add "openaiApiKey": "your-key" to config.json',
      );
    }
    process.exit(1);
  }

  await indexCheck(config.eventIndex, {
    mappings: eventMappings as MappingTypeMapping,
  });

  console.log(`Generating events${useAI ? ' using AI' : ''}...`);

  await generateDocs({
    createDocs: createEvents,
    amount: n,
    index: config.eventIndex,
    useAI,
  });

  console.log('Finished generating events');
};

export const generateGraph = async ({
  users = 100,
  maxHosts = 3,
  useAI = false,
}) => {
  console.log(`Generating alerts graph${useAI ? ' using AI' : ''}...`);

  const config = getConfig();
  if (useAI && !config.useAI) {
    console.log(
      'AI generation requested but not enabled in config. Set "useAI": true in config.json',
    );
    if (!config.openaiApiKey) {
      console.log(
        'OpenAI API key is missing. Add "openaiApiKey": "your-key" to config.json',
      );
    }
    process.exit(1);
  }

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

  // Generate example alerts for AI context
  const exampleAlerts: BaseCreateAlertsReturnType[] = [];
  if (useAI && config.useAI) {
    for (let i = 0; i < 2; i++) {
      const alert = createAlerts({
        host: {
          name: `Host-${i}`,
        },
        user: {
          name: `User-${i}`,
        },
      });
      exampleAlerts.push(alert);
    }
  }

  for (let i = 0; i < users; i++) {
    const userCluster = [];
    for (let j = 0; j < maxHosts; j++) {
      let alert;

      if (useAI && config.useAI && i % 3 === 0) {
        try {
          // Use AI for some alerts
          alert = await generateAIAlert({
            hostName: `Host-${i}-${j}`,
            userName: `User-${i}`,
            examples: exampleAlerts,
          });
        } catch (error) {
          console.error(
            'Error generating AI alert, falling back to standard generation:',
            error,
          );
          alert = createAlerts({
            host: {
              name: `Host-${i}-${j}`,
            },
            user: {
              name: `User-${i}`,
            },
          });
        }
      } else {
        alert = createAlerts({
          host: {
            name: `Host-${i}-${j}`,
          },
          user: {
            name: `User-${i}`,
          },
        });
      }

      userCluster.push(alert);
    }
    clusters.push(
      userCluster as (ReturnType<typeof createAlerts> & AlertOverride)[],
    );
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
    const client = getEsClient();

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
    const client = getEsClient();

    await client.deleteByQuery({
      index: '.alerts-security.alerts-*',
      refresh: true,
      query: {
        match_all: {},
      },
    });
  } catch (error) {
    console.log('Failed to delete alerts');
    console.log(error);
  }
};

export const deleteAllEvents = async () => {
  const config = getConfig();

  console.log('Deleting all events...');
  if (!config.eventIndex) {
    throw new Error('eventIndex not defined in config');
  }
  try {
    console.log('Deleted all events');
    const client = getEsClient();

    await client.deleteByQuery({
      index: config.eventIndex,
      refresh: true,
      query: {
        match_all: {},
      },
    });
  } catch (error) {
    console.log('Failed to delete events');
    console.log(error);
  }
};
