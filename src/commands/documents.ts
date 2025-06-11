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
import {
  generateAIAlert,
  generateAIAlertBatch,
  generateMITREAlert,
  cleanupAIService,
} from '../utils/ai_service';
import { TimestampConfig } from '../utils/timestamp_utils';

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
    const result = await client.bulk({ body: docs, refresh: true });
    
    if (result.errors) {
      // Only show errors, not successful operations
      const errors = result.items.filter((item: any) => 
        item.create?.error || item.index?.error
      );
      if (errors.length > 0) {
        console.log(`Warning: ${errors.length} documents failed to index:`, 
          errors.slice(0, 2).map((item: any) => 
            item.create?.error?.reason || item.index?.error?.reason
          )
        );
      }
    }
    
    return result;
  } catch (err) {
    console.log('Error in bulkUpsert: ', err);
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
  useMitre = false,
  timestampConfig?: TimestampConfig,
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
    `Generating ${alertCount} alerts containing ${hostCount} hosts and ${userCount} users in space ${space}${
      useAI ? ' using AI' : ''
    }${useMitre ? ' with MITRE ATT&CK' : ''}`,
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

  if (useMitre && !useAI) {
    console.log(
      'MITRE integration requires AI generation. Use both --ai and --mitre flags.',
    );
    process.exit(1);
  }

  if (useMitre && !config.mitre?.enabled) {
    console.log(
      'MITRE integration requested but not enabled in config. Set "mitre.enabled": true in config.json',
    );
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
      createAlerts(no_overrides, {
        userName,
        hostName,
        space,
        timestampConfig,
      }),
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
    console.log(
      `Using AI for alert generation${useMitre ? ' with MITRE ATT&CK' : ''}...`,
    );
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

    // Phase 3: Adaptive batch sizing based on dataset size and performance config
    const performanceConfig = config.generation?.performance;
    const isLargeScale =
      performanceConfig?.enableLargeScale &&
      alertCount >= (performanceConfig?.largeScaleThreshold || 1000);

    let aiBatchSize = 5; // Default
    if (isLargeScale) {
      aiBatchSize = config.generation?.alerts?.largeBatchSize || 25;
      console.log(
        `Large-scale generation enabled. Using batch size: ${aiBatchSize}`,
      );
    } else {
      aiBatchSize = config.generation?.alerts?.batchSize || 5;
    }

    const operations: unknown[] = [];

    // Split entities into manageable chunks for batch processing
    const entityChunks = chunk(alertEntityNames, aiBatchSize);

    // Phase 3: Parallel batch processing for large datasets
    const maxConcurrentBatches = isLargeScale
      ? config.generation?.alerts?.parallelBatches || 3
      : 1;

    if (maxConcurrentBatches > 1) {
      console.log(
        `Using parallel processing with ${maxConcurrentBatches} concurrent batches`,
      );
    }

    // Process chunks in parallel batches
    const chunkBatches = chunk(entityChunks, maxConcurrentBatches);

    for (const chunkBatch of chunkBatches) {
      const batchPromises = chunkBatch.map(async (currentChunk) => {
        const chunkOperations: unknown[] = [];

        try {
          // Use batch generation for better efficiency, with MITRE if enabled
          let generatedAlerts: BaseCreateAlertsReturnType[];

          if (useMitre) {
            // Phase 3: Enhanced MITRE generation with sub-techniques and attack chains
            console.log(
              `Generating MITRE alerts for chunk of ${currentChunk.length} entities...`,
            );

            // Add request delay for large-scale operations to respect rate limits
            if (isLargeScale && performanceConfig?.requestDelayMs) {
              await new Promise((resolve) =>
                setTimeout(resolve, performanceConfig.requestDelayMs),
              );
            }

            generatedAlerts = await Promise.all(
              currentChunk.map((entity) =>
                generateMITREAlert({
                  userName: entity.userName,
                  hostName: entity.hostName,
                  space,
                  examples: exampleAlerts,
                  timestampConfig,
                }),
              ),
            );
          } else {
            // Use standard AI batch generation
            generatedAlerts = await generateAIAlertBatch({
              entities: currentChunk,
              space,
              examples: exampleAlerts,
              batchSize: aiBatchSize,
              timestampConfig,
            });
          }

          // Add the generated alerts to the chunk operations
          for (const alert of generatedAlerts) {
            chunkOperations.push({
              index: {
                _index: getAlertIndex(space),
                _id: alert['kibana.alert.uuid'],
              },
            });
            chunkOperations.push(alert);
          }

          return {
            success: true,
            operations: chunkOperations,
            count: currentChunk.length,
          };
        } catch (error) {
          console.error('Error in batch generation:', error);

          // Fallback to standard generation for this chunk
          for (const entity of currentChunk) {
            const alert = createAlerts(no_overrides, {
              userName: entity.userName,
              hostName: entity.hostName,
              space,
              timestampConfig,
            });

            chunkOperations.push({
              index: {
                _index: getAlertIndex(space),
                _id: alert['kibana.alert.uuid'],
              },
            });
            chunkOperations.push(alert);
          }

          return {
            success: false,
            operations: chunkOperations,
            count: currentChunk.length,
          };
        }
      });

      // Wait for all chunks in this batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Collect operations and update progress
      for (const result of batchResults) {
        operations.push(...result.operations);
        progress.increment(result.count);
      }

      // Send operations to Elasticsearch when we have a reasonable batch size
      if (operations.length >= batchSize * 2) {
        try {
          await bulkUpsert(operations);
          operations.length = 0; // Clear the array after successful upload
        } catch (error) {
          console.error('Error sending batch to Elasticsearch:', error);
          process.exit(1);
        }
      }
    }

    // Send any remaining operations
    if (operations.length > 0) {
      try {
        await bulkUpsert(operations);
      } catch (error) {
        console.error('Error sending final batch to Elasticsearch:', error);
        process.exit(1);
      }
    }

    progress.stop();
    console.log(
      `AI alert generation completed. Generated ${alertCount} alerts${useMitre ? ' with MITRE ATT&CK data' : ''}`,
    );

    if (isLargeScale) {
      console.log(
        'Large-scale generation performance optimizations were applied.',
      );
    }

    // Cleanup AI service to allow process to exit cleanly
    cleanupAIService();
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

  // Cleanup AI service to allow process to exit cleanly
  if (useAI) {
    cleanupAIService();
  }
};

// Updated to support AI and MITRE
export const generateEvents = async (
  n: number,
  useAI = false,
  useMitre = false, // TODO: Implement MITRE support for events
) => {
  // Note: useMitre parameter is reserved for future MITRE integration
  console.log(useMitre ? 'MITRE mode requested (not yet implemented)' : '');
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

  // Cleanup AI service to allow process to exit cleanly
  if (useAI) {
    cleanupAIService();
  }
};

export const deleteAllLogs = async (logTypes: string[] = ['system', 'auth', 'network', 'endpoint']) => {
  console.log(`Deleting all logs from types: ${logTypes.join(', ')}...`);

  const { getLogIndexForType } = await import('../log_generators');
  const { getEsClient } = await import('./utils/indices');
  
  try {
    const client = getEsClient();
    
    // Delete logs from each specified type
    for (const logType of logTypes) {
      const indexPattern = getLogIndexForType(logType, '*'); // Use wildcard for all namespaces
      
      try {
        console.log(`Deleting logs from ${indexPattern}...`);
        await client.deleteByQuery({
          index: indexPattern,
          refresh: true,
          query: {
            match_all: {},
          },
        });
        console.log(`Deleted logs from ${logType} indices`);
      } catch (error: any) {
        if (error.meta?.statusCode === 404) {
          console.log(`No ${logType} indices found (this is normal if none were created)`);
        } else {
          console.error(`Failed to delete ${logType} logs:`, error.message);
        }
      }
    }
    
    console.log('Log deletion completed');
  } catch (error) {
    console.error('Failed to delete logs:', error);
    throw error;
  }
};

// New function to generate realistic source logs
export const generateLogs = async (
  logCount: number,
  hostCount: number,
  userCount: number,
  useAI = false,
  logTypes: string[] = ['system', 'auth', 'network', 'endpoint'],
  timestampConfig?: TimestampConfig,
) => {
  console.log(
    `Generating ${logCount} realistic source logs across ${logTypes.join(', ')} with ${hostCount} hosts and ${userCount} users${
      useAI ? ' using AI' : ''
    }`,
  );

  const config = getConfig();
  if (useAI && !config.useAI) {
    console.log(
      'AI generation requested but not enabled in config. Set "useAI": true in config.json',
    );
    process.exit(1);
  }

  // Import log generators
  const {
    createRealisticLog,
    getLogIndexForType,
    detectLogType,
    getDatasetForLogType,
  } = await import('../log_generators');
  const logMappings = await import('../mappings/log_mappings.json', { assert: { type: 'json' } });

  // Generate entity names
  console.log('Generating entity names...');
  const userNames = Array.from({ length: userCount }, () =>
    faker.internet.username(),
  );
  const hostNames = Array.from({ length: hostCount }, () =>
    faker.internet.domainName(),
  );

  console.log('Generating logs...');
  const operations: unknown[] = [];
  const progress = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic,
  );

  progress.start(logCount, 0);

  // Define log type weights based on requested types
  const logTypeWeights = {
    system: logTypes.includes('system') ? 30 : 0,
    auth: logTypes.includes('auth') ? 20 : 0,
    network: logTypes.includes('network') ? 35 : 0,
    endpoint: logTypes.includes('endpoint') ? 15 : 0,
  };

  // Pre-create indices with mappings
  const usedIndices = new Set<string>();
  
  for (let i = 0; i < logCount; i++) {
    const userName = userNames[i % userCount];
    const hostName = hostNames[i % hostCount];

    try {
      // Generate realistic log
      const log = createRealisticLog({}, {
        hostName,
        userName,
        timestampConfig,
        logTypeWeights,
      });

      // Use the actual dataset from the log to determine the index
      const dataset = log['data_stream.dataset'] || 'generic.log';
      const namespace = log['data_stream.namespace'] || 'default';
      const indexName = `logs-${dataset}-${namespace}`;

      // Determine log type for any other operations
      const logType = detectLogType(log);

      // Ensure index exists with proper mappings (only once per index)
      if (!usedIndices.has(indexName)) {
        await indexCheck(indexName, {
          mappings: logMappings.default as MappingTypeMapping,
        });
        usedIndices.add(indexName);
      }

      // Add to operations (use 'create' for data streams, not 'index')
      operations.push({
        create: {
          _index: indexName,
          _id: faker.string.uuid(),
        },
      });
      operations.push(log);

      progress.increment(1);

      // Send batch when we have enough operations
      if (operations.length >= 1000) {
        try {
          await bulkUpsert(operations);
          operations.length = 0; // Clear array
        } catch (error) {
          console.error('Error sending log batch to Elasticsearch:', error);
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(`Error generating log at index ${i}:`, error);
      progress.increment(1);
    }
  }

  // Send remaining operations
  if (operations.length > 0) {
    try {
      await bulkUpsert(operations);
    } catch (error) {
      console.error('Error sending final log batch to Elasticsearch:', error);
      process.exit(1);
    }
  }

  progress.stop();
  console.log(`Generated ${logCount} realistic source logs across multiple indices`);
  console.log(`Used indices: ${Array.from(usedIndices).join(', ')}`);

  // Cleanup AI service if used
  if (useAI) {
    cleanupAIService();
  }
};

// New function to generate correlated alerts with supporting logs
export const generateCorrelatedCampaign = async (
  alertCount: number,
  hostCount: number,
  userCount: number,
  space: string = 'default',
  useAI = false,
  useMitre = false,
  logVolumeMultiplier = 6,
  timestampConfig?: TimestampConfig,
) => {
  console.log(
    `Generating ${alertCount} correlated alerts with supporting logs across ${hostCount} hosts and ${userCount} users${
      useAI ? ' using AI' : ''
    }${useMitre ? ' with MITRE ATT&CK' : ''}`
  );

  const config = getConfig();
  if (useAI && !config.useAI) {
    console.log(
      'AI generation requested but not enabled in config. Set "useAI": true in config.json'
    );
    process.exit(1);
  }

  if (useMitre && !useAI) {
    console.log(
      'MITRE integration requires AI generation. Use both --ai and --mitre flags.'
    );
    process.exit(1);
  }

  // Import the correlated alert generator
  const { CorrelatedAlertGenerator } = await import('../services/correlated_alert_generator');
  const logMappings = await import('../mappings/log_mappings.json', { assert: { type: 'json' } });

  // Generate entity names
  console.log('Generating target entities...');
  const userNames = Array.from({ length: userCount }, () =>
    faker.internet.username()
  );
  const hostNames = Array.from({ length: hostCount }, () =>
    faker.internet.domainName()
  );

  console.log('Initializing correlation engine...');
  const generator = new CorrelatedAlertGenerator();

  const progress = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic
  );

  progress.start(alertCount, 0);

  try {
    // Generate the attack campaign
    const campaign = await generator.generateAttackCampaign(
      alertCount,
      hostNames,
      userNames,
      {
        space,
        useAI,
        useMitre,
        timestampConfig,
        logVolumeMultiplier
      }
    );

    progress.stop();

    console.log('\n📊 Campaign Summary:');
    console.log(`  🚨 Total Alerts: ${campaign.campaignSummary.totalAlerts}`);
    console.log(`  📋 Total Supporting Logs: ${campaign.campaignSummary.totalLogs}`);
    console.log(`  🎯 Attack Types: ${campaign.campaignSummary.attackTypes.join(', ')}`);
    console.log(`  🏠 Affected Hosts: ${campaign.campaignSummary.affectedHosts.length}`);
    console.log(`  👥 Affected Users: ${campaign.campaignSummary.affectedUsers.length}`);
    console.log(`  ⏰ Time Span: ${campaign.campaignSummary.timeSpan.start} → ${campaign.campaignSummary.timeSpan.end}`);

    // Extract data for indexing
    console.log('\nPreparing data for Elasticsearch indexing...');
    const { indexOperations } = generator.extractLogsForIndexing(campaign.scenarios);

    // Ensure all indices exist with proper mappings
    console.log('Creating indices and mappings...');
    const usedIndices = new Set<string>();
    
    for (let i = 0; i < indexOperations.length; i += 2) {
      const operation = indexOperations[i] as any;
      const indexName = operation.create._index;
      
      if (!usedIndices.has(indexName)) {
        await indexCheck(indexName, {
          mappings: logMappings.default as MappingTypeMapping,
        });
        usedIndices.add(indexName);
      }
    }

    // Bulk index all data
    console.log(`Indexing ${indexOperations.length / 2} documents to Elasticsearch...`);
    
    // Process in batches to avoid overwhelming Elasticsearch
    const batchSize = 1000;
    for (let i = 0; i < indexOperations.length; i += batchSize) {
      const batch = indexOperations.slice(i, i + batchSize);
      await bulkUpsert(batch);
      
      if (i + batchSize < indexOperations.length) {
        process.stdout.write(`.`);
      }
    }
    
    console.log('\n\n✅ Correlated campaign generation completed!');
    console.log(`📍 View alerts in Kibana space: ${space}`);
    console.log(`🔍 View supporting logs with filter: logs-*`);
    console.log(`🎭 Each alert now has ${logVolumeMultiplier} supporting log events`);

    // Show example attack narratives
    if (campaign.scenarios.length > 0) {
      console.log('\n📖 Example Attack Narratives:');
      campaign.scenarios.slice(0, 3).forEach((scenario, i) => {
        console.log(`  ${i + 1}. ${scenario.attackNarrative}`);
      });
    }

  } catch (error) {
    progress.stop();
    console.error('Error generating correlated campaign:', error);
    throw error;
  }

  // Cleanup AI service if used
  if (useAI) {
    cleanupAIService();
  }
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

  // Cleanup AI service to allow process to exit cleanly
  if (useAI) {
    cleanupAIService();
  }
};

export const deleteAllAlerts = async (space?: string) => {
  const indexPattern = space
    ? `.alerts-security.alerts-${space}`
    : '.alerts-security.alerts-*';
  console.log(
    `Deleting all alerts${space ? ` from space '${space}'` : ' from all spaces'}...`,
  );

  try {
    const client = getEsClient();

    await client.deleteByQuery({
      index: indexPattern,
      refresh: true,
      query: {
        match_all: {},
      },
    });
    console.log(
      `Deleted all alerts${space ? ` from space '${space}'` : ' from all spaces'}`,
    );
  } catch (error) {
    console.log('Failed to delete alerts');
    console.log(error);
  }
};

export const deleteAllEvents = async (space?: string) => {
  const config = getConfig();

  console.log(`Deleting all events${space ? ` from space '${space}'` : ''}...`);
  if (!config.eventIndex) {
    throw new Error('eventIndex not defined in config');
  }
  try {
    const client = getEsClient();

    await client.deleteByQuery({
      index: config.eventIndex,
      refresh: true,
      query: {
        match_all: {},
      },
    });
    console.log(`Deleted all events${space ? ` from space '${space}'` : ''}`);
  } catch (error) {
    console.log('Failed to delete events');
    console.log(error);
  }
};
