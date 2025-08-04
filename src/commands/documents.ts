/**
 * Document Generator Commands
 *
 * This module handles the generation of various security documents.
 * Uses 'any' types extensively due to dynamic Elasticsearch document structures
 * and AI-generated content that varies in schema.
 */
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

// Type definition for correlated process events
declare global {
  var correlatedProcessEvents: Array<{
    event: any;
    entityId: string;
    timestamp: string;
    hostName: string;
    userName: string;
  }> | undefined;
}
import { getAlertIndex } from '../utils';
import {
  generateAIAlert,
  generateAIAlertBatch,
  generateMITREAlert,
  cleanupAIService,
} from '../utils/ai_service';
import { TimestampConfig } from '../utils/timestamp_utils';
import {
  applyFalsePositiveLogic,
  generateFalsePositiveStats,
} from '../utils/false_positive_generator';
import { generateFields } from './generate_fields';
import { createCases, CaseCreationOptions } from '../create_cases';

import {
  setGlobalTheme,
  getThemedUsername,
  getThemedHostname,
} from '../utils/universal_theme_generator';
import {
  displayGeneratedEntities,
  GeneratedEntities,
} from '../utils/entity_display';

/**
 * Cache for generated field templates to avoid regenerating for each document
 */
let fieldTemplateCache: Record<string, any> | null = null;

/**
 * Clear the field template cache (call this between different generation sessions)
 */
function clearFieldTemplateCache() {
  fieldTemplateCache = null;
}

/**
 * Helper function to apply multi-field generation to alerts
 * Now uses cached field generation for performance
 */
async function applyMultiFieldGeneration<T extends Record<string, any>>(
  alert: T,
  multiFieldConfig?: {
    fieldCount: number;
    categories?: string[];
    performanceMode?: boolean;
    contextWeightEnabled?: boolean;
    correlationEnabled?: boolean;
  },
  _useMitre = false, // Prefixed with _ - reserved for future MITRE integration
): Promise<T> {
  if (!multiFieldConfig) {
    return alert;
  }

  // Generate field template once and cache it
  if (!fieldTemplateCache) {
    console.log(
      `🔬 Generating ${multiFieldConfig.fieldCount} field templates (cached for reuse)...`,
    );
    const result = await generateFields({
      fieldCount: multiFieldConfig.fieldCount,
      categories: multiFieldConfig.categories,
      outputFormat: 'json',
      sampleDocument: alert,
      includeMetadata: false,
      createMapping: false, // Don't create mapping here - handled at index level
      updateTemplate: false, // Don't create template here - handled at index level
    });
    fieldTemplateCache = result.fields;
    console.log(
      `✅ Field templates cached: ${Object.keys(fieldTemplateCache).length} fields`,
    );
  }

  // Apply cached fields with some variation
  const variedFields: Record<string, any> = {};
  for (const [key, value] of Object.entries(fieldTemplateCache)) {
    // Add slight variation to numeric fields to make data more realistic
    if (typeof value === 'number') {
      variedFields[key] = value + (Math.random() - 0.5) * value * 0.1; // ±5% variation
    } else if (typeof value === 'string' && !isNaN(Number(value))) {
      const num = Number(value);
      variedFields[key] = (num + (Math.random() - 0.5) * num * 0.1).toString();
    } else {
      variedFields[key] = value;
    }
  }

  return { ...alert, ...variedFields } as T;
}

const generateDocs = async ({
  createDocs,
  amount,
  index,
  useAI = false,
  multiFieldConfig,
}: {
  createDocs: DocumentCreator;
  amount: number;
  index: string;
  useAI?: boolean;
  multiFieldConfig?: { fieldCount: number };
}) => {
  // Adaptive batch sizing based on multi-field configuration
  let limit = 30000;

  if (multiFieldConfig?.fieldCount) {
    const fieldCount = multiFieldConfig.fieldCount;
    if (fieldCount > 10000) {
      limit = 1; // One document at a time for very large field counts
      console.log(
        `⚠️  Using single-document batching due to high field count (${fieldCount})`,
      );
    } else if (fieldCount > 5000) {
      limit = 2;
      console.log(
        `⚠️  Using micro-batching (2 docs) due to high field count (${fieldCount})`,
      );
    } else if (fieldCount > 1000) {
      limit = 10;
      console.log(
        `⚠️  Using small batching (10 docs) due to high field count (${fieldCount})`,
      );
    }
  }

  let generated = 0;

  while (generated < amount) {
    const batchSize = Math.min(limit, amount - generated);
    const docs = await createDocuments(
      batchSize,
      generated,
      createDocs,
      index,
      useAI,
    );
    try {
      const result = await bulkUpsert(docs);
      generated += result.items.length / 2;
    } catch (err) {
      console.log('Error in bulkUpsert: ', err);

      // If it's a payload too large error, try with smaller batches
      if (
        (err as any)?.meta?.statusCode === 413 ||
        (err as any)?.meta?.statusCode === 429
      ) {
        console.log(
          '⚠️  Payload too large, retrying with single document batching...',
        );
        limit = 1;
        continue; // Retry with smaller batch
      }

      process.exit(1);
    }
  }
};

const bulkUpsert = async (docs: unknown[]) => {
  const client = getEsClient();

  try {
    const result = await client.bulk({ operations: docs, refresh: true });

    if (result.errors) {
      // Only show errors, not successful operations
      const errors = result.items.filter(
        (item: any) => item.create?.error || item.index?.error,
      );
      if (errors.length > 0) {
        console.log(
          `Warning: ${errors.length} documents failed to index:`,
          errors
            .slice(0, 2)
            .map(
              (item: any) =>
                item.create?.error?.reason || item.index?.error?.reason,
            ),
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

export const alertToBatchOps = (
  alert: BaseCreateAlertsReturnType,
  index: string,
): unknown[] => {
  // Alert indices are data streams that require 'create' operations
  const isAlertIndex = index.startsWith('.alerts-security.alerts-');

  return [
    isAlertIndex
      ? { create: { _index: index, _id: alert['kibana.alert.uuid'] } }
      : { index: { _index: index, _id: alert['kibana.alert.uuid'] } },
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
    const isAlertIndex = index.startsWith('.alerts-security.alerts-');
    return Array(n)
      .fill(null)
      .reduce((acc, _, i) => {
        let alert = createDoc({
          id_field: 'host.name',
          id_value: `Host ${generated + i}`,
        });
        acc.push(
          isAlertIndex
            ? { create: { _index: index } }
            : { index: { _index: index } },
        );
        acc.push({ ...alert });
        alert = createDoc({
          id_field: 'user.name',
          id_value: `User ${generated + i}`,
        });
        acc.push(
          isAlertIndex
            ? { create: { _index: index } }
            : { index: { _index: index } },
        );
        acc.push({ ...alert });
        return acc;
      }, []);
  }

  // AI-based generation
  console.log('Using AI to generate documents...');
  const docs: unknown[] = [];
  const isAlertIndex = index.startsWith('.alerts-security.alerts-');

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

          docs.push(
            isAlertIndex
              ? { create: { _index: index } }
              : { index: { _index: index } },
          );
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

          docs.push(
            isAlertIndex
              ? { create: { _index: index } }
              : { index: { _index: index } },
          );
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
  falsePositiveRate = 0.0,
  multiFieldConfig?: {
    fieldCount: number;
    categories?: string[];
    performanceMode?: boolean;
    contextWeightEnabled?: boolean;
    correlationEnabled?: boolean;
  },
  _namespace = 'default',
  caseOptions?: {
    createCases?: boolean;
    alertsPerCase?: number;
    caseGroupingStrategy?: 'by-time' | 'by-host' | 'by-rule' | 'by-severity';
  },
  theme?: string,
  sessionView = false,
  visualAnalyzer = false,
) => {
  // Clear field template cache for fresh generation
  clearFieldTemplateCache();

  // Set global theme configuration
  if (theme) {
    setGlobalTheme(theme);
    console.log(`🎨 Theme applied: ${theme}`);
  }

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
    }${useMitre ? ' with MITRE ATT&CK' : ''}${
      multiFieldConfig
        ? ` with ${multiFieldConfig.fieldCount} additional fields`
        : ''
    }${
      falsePositiveRate > 0
        ? ` (${(falsePositiveRate * 100).toFixed(1)}% false positives)`
        : ''
    }`,
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

  if (useMitre && !config.mitre?.enabled) {
    console.log(
      'MITRE integration requested but not enabled in config. Set "mitre.enabled": true in config.json',
    );
    process.exit(1);
  }

  const concurrency = 10; // how many batches to send in parallel
  const batchSize = 2500; // number of alerts in a batch
  const no_overrides = {};

  const batchOpForIndex = async ({
    userName,
    hostName,
  }: {
    userName: string;
    hostName: string;
  }) => {
    let alert = createAlerts(no_overrides, {
      userName,
      hostName,
      space,
      timestampConfig,
      sessionView,
      visualAnalyzer,
    });

    // Apply multi-field generation if enabled
    alert = await applyMultiFieldGeneration(alert, multiFieldConfig, useMitre);

    // Apply false positive logic if enabled
    if (falsePositiveRate > 0) {
      const alertsArray = applyFalsePositiveLogic([alert], falsePositiveRate);
      alert = alertsArray[0];
    }

    return alertToBatchOps(alert, getAlertIndex(space));
  };

  console.log('Generating entity names...');

  // Generate themed entity names using universal theme generator
  if (theme) {
    console.log(`🎭 Generating themed entity names: ${theme}`);
  }

  // Generate unique user names
  const userNamesSet = new Set<string>();
  while (userNamesSet.size < userCount) {
    const username = await getThemedUsername(faker.internet.username());
    userNamesSet.add(username);
  }
  const userNames = Array.from(userNamesSet);

  // Generate unique host names
  const hostNamesSet = new Set<string>();
  while (hostNamesSet.size < hostCount) {
    const hostname = await getThemedHostname(faker.internet.domainName());
    hostNamesSet.add(hostname);
  }
  const hostNames = Array.from(hostNamesSet);

  console.log('Assigning entity names...');
  const alertEntityNames = Array.from({ length: alertCount }, (_, i) => ({
    userName: userNames[i % userCount],
    hostName: hostNames[i % hostCount],
  }));

  // If AI is enabled, use a different approach for generation
  // However, if multi-field is enabled with high field count, we can skip AI batch processing
  // since multi-field generation provides rich data without AI overhead and batch complexity
  const skipAIBatch = multiFieldConfig && multiFieldConfig.fieldCount > 100;

  if (useAI && config.useAI && !skipAIBatch) {
    console.log(
      `Using AI for alert generation${useMitre ? ' with MITRE ATT&CK' : ''}...`,
    );
  } else if (skipAIBatch) {
    console.log(
      `Using high-performance template generation with ${multiFieldConfig?.fieldCount} enriched fields (skipping AI batch for performance)...`,
    );

    // Calculate appropriate batch size based on field count to avoid 413 errors
    let adjustedBatchSize = batchSize;
    const fieldCount = multiFieldConfig?.fieldCount || 0;
    if (fieldCount > 10000) {
      adjustedBatchSize = 1; // Process one at a time for very large field counts
    } else if (fieldCount > 5000) {
      adjustedBatchSize = 5;
    } else if (fieldCount > 1000) {
      adjustedBatchSize = Math.min(25, batchSize);
    }

    console.log(
      `Using adjusted batch size of ${adjustedBatchSize} for ${fieldCount} fields per document`,
    );

    // Use the adjusted batch processing for template generation with multi-field enrichment
    const batchedAlertEntities = chunk(alertEntityNames, adjustedBatchSize);

    const progress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    );
    progress.start(alertCount, 0);

    const client = getEsClient();

    // Process in smaller batches to avoid request size limits
    for (const alertBatch of batchedAlertEntities) {
      const operations: unknown[] = [];

      for (const alertEntity of alertBatch) {
        const batchOps = await batchOpForIndex(alertEntity);
        operations.push(...batchOps);
        progress.increment();
      }

      // Bulk insert this batch
      try {
        await client.bulk({ operations, refresh: false });
      } catch (error) {
        console.error('❌ Error indexing batch:', error);
        throw error;
      }
    }

    // Final refresh
    await client.indices.refresh({ index: getAlertIndex(space) });

    progress.stop();
    console.log(
      `✅ Successfully indexed ${alertCount} alerts with multi-field enrichment`,
    );

    // Display generated entities for user reference
    const generatedEntities: GeneratedEntities = {
      userNames,
      hostNames,
    };
    displayGeneratedEntities(generatedEntities, {
      namespace: _namespace,
      space,
      showKQLQueries: true,
      showSampleQueries: true,
    });

    return;
  }

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
        createAlerts(no_overrides, {
          userName,
          hostName,
          space,
          timestampConfig,
          sessionView,
          visualAnalyzer,
        }),
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
                  theme,
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
              theme,
            });
          }

          // Apply multi-field generation if enabled
          if (multiFieldConfig) {
            generatedAlerts = await Promise.all(
              generatedAlerts.map((alert) =>
                applyMultiFieldGeneration(alert, multiFieldConfig, useMitre),
              ),
            );
          }

          // Apply false positive logic if enabled
          if (falsePositiveRate > 0) {
            generatedAlerts = applyFalsePositiveLogic(
              generatedAlerts,
              falsePositiveRate,
            );
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
            let alert = createAlerts(no_overrides, {
              userName: entity.userName,
              hostName: entity.hostName,
              space,
              timestampConfig,
            });

            // Apply false positive logic to fallback alerts too
            if (falsePositiveRate > 0) {
              const alertsArray = applyFalsePositiveLogic(
                [alert],
                falsePositiveRate,
              );
              alert = alertsArray[0];
            }

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

    // Display false positive statistics if enabled
    if (falsePositiveRate > 0) {
      // TODO: Collect actual alerts from AI generation for real statistics
      // For now, showing expected statistics
      const expectedFalsePositives = Math.round(alertCount * falsePositiveRate);
      console.log(`\n📊 False Positive Statistics:`);
      console.log(
        `  🎯 Expected False Positives: ~${expectedFalsePositives} (${(falsePositiveRate * 100).toFixed(1)}%)`,
      );
      console.log(`  ✅ Alerts marked as resolved with workflow reasons`);
      console.log(
        `  📋 Categories: maintenance, authorized_tools, normal_business, false_detection`,
      );
    }

    // Cleanup AI service to allow process to exit cleanly
    cleanupAIService();
    return;
  }

  // Standard generation (non-AI) continues with the existing code
  console.log('Entity names assigned. Batching...');

  const allGeneratedAlerts: BaseCreateAlertsReturnType[] = []; // Collect all alerts for statistics

  // Modified batchOpForIndex to collect alerts
  const batchOpForIndexWithCollection = async ({
    userName,
    hostName,
  }: {
    userName: string;
    hostName: string;
  }) => {
    let alert = createAlerts(no_overrides, {
      userName,
      hostName,
      space,
      timestampConfig,
      sessionView,
      visualAnalyzer,
    });

    // Apply multi-field generation if enabled
    alert = await applyMultiFieldGeneration(alert, multiFieldConfig, useMitre);

    // Apply false positive logic if enabled
    if (falsePositiveRate > 0) {
      const alertsArray = applyFalsePositiveLogic([alert], falsePositiveRate);
      alert = alertsArray[0];
    }

    // Collect alert for statistics
    allGeneratedAlerts.push(alert);

    return alertToBatchOps(alert, getAlertIndex(space));
  };

  console.log('Batching and generating operations...');

  const entityBatches = chunk(alertEntityNames, batchSize);
  console.log(
    `Sending in ${entityBatches.length} batches of ${batchSize} alerts, with up to ${concurrency} batches in parallel\n\n`,
  );
  const progress = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic,
  );

  progress.start(entityBatches.length, 0);

  await pMap(
    entityBatches,
    async (batch) => {
      const operations = [];
      for (const entity of batch) {
        const batchOps = await batchOpForIndexWithCollection(entity);
        operations.push(...batchOps);
      }
      await bulkUpsert(operations);
      progress.increment();
    },
    { concurrency },
  );

  progress.stop();

  // Display false positive statistics if enabled
  if (falsePositiveRate > 0 && allGeneratedAlerts.length > 0) {
    const stats = generateFalsePositiveStats(allGeneratedAlerts);
    console.log(`\n📊 False Positive Statistics:`);
    console.log(`  🎯 Total Alerts: ${stats.total}`);
    console.log(
      `  ❌ False Positives: ${stats.falsePositives} (${stats.rate})`,
    );
    console.log(
      `  ⏱️  Avg Resolution Time: ${stats.avgResolutionTimeMinutes} minutes`,
    );
    console.log(`  📋 Categories:`);
    Object.entries(stats.categories).forEach(([category, count]) => {
      console.log(`     • ${category}: ${count}`);
    });
  }

  // Create cases if requested
  if (
    caseOptions?.createCases &&
    caseOptions.alertsPerCase &&
    caseOptions.alertsPerCase > 0
  ) {
    console.log(`\n🔒 Creating cases for generated alerts...`);

    const caseCount = Math.ceil(alertCount / caseOptions.alertsPerCase);
    console.log(
      `📊 Creating ${caseCount} cases (${caseOptions.alertsPerCase} alerts per case)`,
    );

    try {
      // Create cases that will automatically attach existing alerts
      const caseCreationOptions: CaseCreationOptions = {
        count: caseCount,
        space,
        includeMitre: useMitre,
        owner: 'securitySolution',
        attachExistingAlerts: true,
        alertsPerCase: caseOptions.alertsPerCase,
        alertQuery: '*', // Attach any alerts in the space
        useAI,
        timestampConfig,
        namespace: _namespace,
      };

      const createdCases = await createCases(caseCreationOptions);

      console.log(`✅ Created ${createdCases.length} security cases`);
      console.log(`🔗 Cases automatically linked to ${alertCount} alerts`);
    } catch (error) {
      console.error('❌ Error creating cases:', error);
      console.log(
        '⚠️ Alert generation completed successfully, but case creation failed',
      );
    }
  }

  // Generate correlated process events for Visual Event Analyzer
  if (visualAnalyzer && typeof globalThis !== 'undefined' && globalThis.correlatedProcessEvents) {
    console.log(`\n🔗 Generating ${globalThis.correlatedProcessEvents.length} correlated process events for Visual Event Analyzer...`);
    
    try {
      const esClient = getEsClient();
      const processOps: BulkOperationContainer[] = [];
      
      for (const correlatedEvent of globalThis.correlatedProcessEvents) {
        const processLog = {
          '@timestamp': correlatedEvent.timestamp,
          'agent.type': 'endpoint',
          'agent.version': '8.15.0',
          'data_stream.dataset': 'endpoint.events.process',
          'data_stream.namespace': _namespace,
          'data_stream.type': 'logs',
          'ecs.version': '8.11.0',
          'event.action': correlatedEvent.event.action,
          'event.category': ['process'],
          'event.dataset': 'endpoint.events.process',
          'event.kind': 'event',
          'event.module': 'endpoint',
          'event.type': ['start'],
          'host.name': correlatedEvent.hostName,
          'host.os.family': 'linux',
          'host.os.name': 'Ubuntu',
          'host.os.version': '20.04',
          'process.command_line': correlatedEvent.event.command_line,
          'process.executable': '/usr/bin/security-alert',
          'process.name': correlatedEvent.event.process_name,
          'process.pid': correlatedEvent.event.process_pid,
          'process.entity_id': correlatedEvent.entityId,
          'process.start': correlatedEvent.event.timestamp,
          'process.user.name': correlatedEvent.event.user_name,
          'user.domain': faker.internet.domainName(),
          'user.name': correlatedEvent.userName,
          'related.user': [correlatedEvent.userName, correlatedEvent.event.user_name],
          message: `Correlated process event for Visual Event Analyzer: ${correlatedEvent.event.process_name}`,
        };

        processOps.push({
          create: {
            _index: `logs-endpoint.events.process-${_namespace}`,
          },
        });
        processOps.push(processLog);
      }

      if (processOps.length > 0) {
        await esClient.bulk({ body: processOps });
        console.log(`✅ Generated ${globalThis.correlatedProcessEvents.length} correlated process events`);
      }
      
      // Clear the global correlation data
      globalThis.correlatedProcessEvents = [];
    } catch (error) {
      console.error('❌ Error generating correlated process events:', error);
    }
  }

  // Display generated entities for user reference
  const generatedEntities: GeneratedEntities = {
    userNames,
    hostNames,
  };
  displayGeneratedEntities(generatedEntities, {
    namespace: _namespace,
    space,
    showKQLQueries: true,
    showSampleQueries: true,
  });

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
  _namespace = 'default',
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

  await indexCheck(
    config.eventIndex,
    {
      mappings: eventMappings as MappingTypeMapping,
    },
    false,
  );

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

export const deleteAllLogs = async (
  logTypes: string[] = ['system', 'auth', 'network', 'endpoint'],
) => {
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
          console.log(
            `No ${logType} indices found (this is normal if none were created)`,
          );
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
  multiFieldConfig?: {
    fieldCount: number;
    categories?: string[];
    performanceMode?: boolean;
    contextWeightEnabled?: boolean;
    correlationEnabled?: boolean;
  },
  sessionView = false,
  visualAnalyzer = false,
  namespace = 'default',
  quiet = false,
  theme?: string,
) => {
  // Clear field template cache for fresh generation
  clearFieldTemplateCache();

  // Set global theme configuration
  if (theme) {
    setGlobalTheme(theme);
    if (!quiet) {
      console.log(`🎨 Theme applied: ${theme}`);
    }
  }

  if (!quiet) {
    console.log(
      `Generating ${logCount} realistic source logs across ${logTypes.join(', ')} with ${hostCount} hosts and ${userCount} users${
        useAI ? ' using AI' : ''
      }${
        multiFieldConfig
          ? ` with ${multiFieldConfig.fieldCount} additional fields`
          : ''
      }${sessionView ? ' (Session View compatible)' : ''}${
        visualAnalyzer ? ' (Visual Analyzer compatible)' : ''
      }`,
    );

    // Warn about potential issues with very large field counts
    if (multiFieldConfig?.fieldCount && multiFieldConfig.fieldCount > 5000) {
      console.log(
        '⚠️  WARNING: Field count > 5,000 may exceed Elasticsearch document size limits (~429MB)',
      );
      console.log(
        '   Your cluster appears to have strict limits. Consider using --field-count 1000 for reliability',
      );
      console.log(
        '   or increase cluster settings: indices.breaker.request.limit and http.max_content_length',
      );
    } else if (
      multiFieldConfig?.fieldCount &&
      multiFieldConfig.fieldCount > 1000
    ) {
      console.log(
        '⚠️  NOTE: High field count detected. Using optimized batching for reliability',
      );
    }
  }

  const config = getConfig();
  if (useAI && !config.useAI) {
    console.log(
      'AI generation requested but not enabled in config. Set "useAI": true in config.json',
    );
    process.exit(1);
  }

  // Import log generators
  const { createRealisticLog, detectLogType } = await import(
    '../log_generators'
  );
  const logMappings = await import('../mappings/log_mappings.json', {
    assert: { type: 'json' },
  });

  // Generate entity names
  if (!quiet) console.log('Generating entity names...');

  // Generate themed entity names using universal theme generator
  if (theme && !quiet) {
    console.log(`🎭 Generating themed entity names: ${theme}`);
  }

  // Generate unique user names
  const userNamesSet = new Set<string>();
  while (userNamesSet.size < userCount) {
    const username = await getThemedUsername(faker.internet.username());
    userNamesSet.add(username);
  }
  const userNames = Array.from(userNamesSet);

  // Generate unique host names
  const hostNamesSet = new Set<string>();
  while (hostNamesSet.size < hostCount) {
    const hostname = await getThemedHostname(faker.internet.domainName());
    hostNamesSet.add(hostname);
  }
  const hostNames = Array.from(hostNamesSet);

  if (!quiet) console.log('Generating logs...');
  const operations: unknown[] = [];
  let progress: any = null;

  // Calculate adaptive batch size based on field count
  let batchSize = 1000; // Default batch size (500 documents)
  if (multiFieldConfig?.fieldCount) {
    const fieldCount = multiFieldConfig.fieldCount;
    if (fieldCount > 10000) {
      batchSize = 2; // 1 document at a time
      if (!quiet)
        console.log(
          `⚠️  Using single-document batching due to very high field count (${fieldCount})`,
        );
    } else if (fieldCount > 5000) {
      batchSize = 4; // 2 documents at a time
      if (!quiet)
        console.log(
          `⚠️  Using micro-batching (2 docs) due to high field count (${fieldCount})`,
        );
    } else if (fieldCount > 1000) {
      batchSize = 20; // 10 documents at a time
      if (!quiet)
        console.log(
          `⚠️  Using small batching (10 docs) due to high field count (${fieldCount})`,
        );
    } else if (fieldCount > 500) {
      batchSize = 100; // 50 documents at a time
    }
  }

  if (!quiet) {
    progress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    );
    progress.start(logCount, 0);
  }

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
      let log = await createRealisticLog(
        {},
        {
          hostName,
          userName,
          timestampConfig,
          logTypeWeights,
          namespace,
          sessionView,
          visualAnalyzer,
        },
      );

      // Apply multi-field generation if enabled
      if (multiFieldConfig) {
        const result = await generateFields({
          fieldCount: multiFieldConfig.fieldCount,
          categories: multiFieldConfig.categories,
          outputFormat: 'json',
          sampleDocument: log,
          includeMetadata: false,
        });

        // Merge multi-fields into the log
        log = { ...log, ...result.fields };
      }

      // Use the actual dataset from the log to determine the index
      const dataset = log['data_stream.dataset'] || 'generic.log';
      const logNamespace = log['data_stream.namespace'] || 'default';
      const indexName = `logs-${dataset}-${logNamespace}`;

      // Determine log type for any other operations
      const _logType = detectLogType(log);

      // Ensure index exists with proper mappings (only once per index)
      if (!usedIndices.has(indexName)) {
        await indexCheck(
          indexName,
          {
            mappings: logMappings.default as MappingTypeMapping,
          },
          false,
        );
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

      if (progress) progress.increment(1);

      // Send batch when we have enough operations
      if (operations.length >= batchSize) {
        try {
          await bulkUpsert(operations);
          operations.length = 0; // Clear array
        } catch (error) {
          // Handle payload too large errors with retry
          if (
            (error as any)?.meta?.statusCode === 413 ||
            (error as any)?.meta?.statusCode === 429
          ) {
            if (!quiet)
              console.log(
                '\n⚠️  Payload too large, retrying with smaller batch...',
              );
            batchSize = Math.max(2, Math.floor(batchSize / 2));

            // Retry with current operations split into smaller batches
            const smallBatches = [];
            for (let j = 0; j < operations.length; j += batchSize) {
              smallBatches.push(operations.slice(j, j + batchSize));
            }

            for (const smallBatch of smallBatches) {
              await bulkUpsert(smallBatch);
            }
            operations.length = 0; // Clear array
          } else {
            console.error('Error sending log batch to Elasticsearch:', error);
            process.exit(1);
          }
        }
      }
    } catch (error) {
      console.error(`Error generating log at index ${i}:`, error);
      if (progress) progress.increment(1);
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

  if (progress) progress.stop();

  if (!quiet) {
    console.log(
      `Generated ${logCount} realistic source logs across multiple indices`,
    );
    console.log(`Used indices: ${Array.from(usedIndices).join(', ')}`);
  }

  // Display generated entities for user reference
  if (!quiet) {
    const generatedEntities: GeneratedEntities = {
      userNames,
      hostNames,
    };
    displayGeneratedEntities(generatedEntities, {
      namespace,
      showKQLQueries: true,
      showSampleQueries: true,
    });
  }

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
  _logVolumeMultiplier = 6,
  timestampConfig?: TimestampConfig,
  _namespace = 'default',
  theme?: string,
) => {
  // Set global theme configuration
  if (theme) {
    setGlobalTheme(theme);
    console.log(`🎨 Theme applied: ${theme}`);
  }

  console.log(
    `Generating ${alertCount} correlated alerts with supporting logs across ${hostCount} hosts and ${userCount} users${
      useAI ? ' using AI' : ''
    }${useMitre ? ' with MITRE ATT&CK' : ''}`,
  );

  const config = getConfig();
  if (useAI && !config.useAI) {
    console.log(
      'AI generation requested but not enabled in config. Set "useAI": true in config.json',
    );
    process.exit(1);
  }

  // Use the unified alert generation service for correlated campaigns
  const { unifiedAlertGenerationService } = await import(
    '../services/unified_alert_generation'
  );
  const _logMappings = await import('../mappings/log_mappings.json', {
    assert: { type: 'json' },
  });

  // Generate entity names
  console.log('Generating target entities...');

  // Generate unique user names
  const userNamesSet = new Set<string>();
  while (userNamesSet.size < userCount) {
    const username = await getThemedUsername(faker.internet.username());
    userNamesSet.add(username);
  }
  const userNames = Array.from(userNamesSet);

  // Generate unique host names
  const hostNamesSet = new Set<string>();
  while (hostNamesSet.size < hostCount) {
    const hostname = await getThemedHostname(faker.internet.domainName());
    hostNamesSet.add(hostname);
  }
  const hostNames = Array.from(hostNamesSet);

  console.log('Initializing unified alert generation...');

  const progress = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic,
  );

  progress.start(alertCount, 0);

  try {
    // Generate using the unified alert generation service
    const config = {
      alertCount,
      hostCount,
      userCount,
      space,
      namespace: _namespace,
      useAI,
      useMitre,
      timestampConfig,
      falsePositiveRate: 0.1,
      multiFieldConfig: undefined,
    };

    const result = await unifiedAlertGenerationService.generateAlerts(config);

    progress.stop();

    console.log('\n📊 Campaign Summary:');
    console.log(`  🚨 Total Alerts: ${result.alertsGenerated}`);
    console.log(`  📋 Index: ${result.indexName}`);
    console.log(
      `  🎯 Generated Entities: ${result.generatedEntities.userNames?.length || 0} users, ${result.generatedEntities.hostNames?.length || 0} hosts`,
    );
    console.log(
      `  ⏰ Performance: ${result.performance.overall.totalTimeMs}ms`,
    );
    console.log(
      `  🤖 AI Efficiency: ${result.performance.dataPoolGeneration.aiCalls} calls`,
    );

    console.log('\n✅ Correlated campaign generation completed successfully!');
    console.log(`📊 Generated ${result.alertsGenerated} alerts`);
    console.log(`📁 Index: ${result.indexName}`);
    console.log(
      `👥 Entities: ${result.generatedEntities.userNames?.length || 0} users, ${result.generatedEntities.hostNames?.length || 0} hosts`,
    );
    console.log(`📍 View alerts in Kibana space: ${space}`);
  } catch (error) {
    progress.stop();
    console.error('Error generating correlated campaign:', error);
    throw error;
  }

  // Display generated entities for user reference
  const generatedEntities: GeneratedEntities = {
    userNames,
    hostNames,
  };
  displayGeneratedEntities(generatedEntities, {
    namespace: _namespace,
    space,
    showKQLQueries: true,
    showSampleQueries: true,
  });

  // Cleanup AI service if used
  if (useAI) {
    cleanupAIService();
  }
};

export const generateGraph = async ({
  users = 100,
  maxHosts = 3,
  useAI = false,
  _namespace = 'default',
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

    const result = await client.bulk({ operations: alerts, refresh: true });
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

    // Check if index exists first
    const indexExists = await client.indices.exists({
      index: config.eventIndex,
    });

    if (!indexExists) {
      console.log(
        `No events to delete - index '${config.eventIndex}' does not exist`,
      );
      return;
    }

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

export const deleteAllData = async () => {
  console.log('🗑️  Deleting ALL generated security data...');

  try {
    const client = getEsClient();

    // Get all indices to see what we're dealing with
    console.log('\n🔍 Scanning for generated indices...');
    const indices = await client.cat.indices({ format: 'json' });

    // Filter for generated security data indices
    const securityIndices = indices.filter((idx: any) => {
      const indexName = idx.index;
      return (
        (indexName.startsWith('.ds-logs-') ||
          indexName.startsWith('logs-') ||
          indexName.startsWith('.alerts-security.alerts-') ||
          indexName.startsWith('metrics-') ||
          (indexName.startsWith('.ds-') &&
            (indexName.includes('apache') ||
              indexName.includes('endpoint') ||
              indexName.includes('iptables') ||
              indexName.includes('network') ||
              indexName.includes('security') ||
              indexName.includes('system') ||
              indexName.includes('microsoft')))) &&
        !indexName.includes('.internal.')
      );
    });

    if (securityIndices.length === 0) {
      console.log('No generated security indices found to delete.');
      return;
    }

    console.log(`Found ${securityIndices.length} security indices to delete:`);
    securityIndices.forEach((idx: any) => console.log(`  - ${idx.index}`));

    // Delete data streams first (for .ds- indices)
    console.log('\n📋 Deleting data streams...');
    const dataStreams = securityIndices
      .filter((idx: any) => idx.index.startsWith('.ds-'))
      .map((idx: any) =>
        idx.index
          .replace('.ds-', '')
          .replace(/-\d{4}\.\d{2}\.\d{2}-\d{6}$/, ''),
      );

    const uniqueDataStreams = [...new Set(dataStreams)];

    for (const dataStream of uniqueDataStreams) {
      try {
        console.log(`Deleting data stream: ${dataStream}`);
        await client.indices.deleteDataStream({ name: dataStream });
        console.log(`✅ Deleted data stream: ${dataStream}`);
      } catch (error: any) {
        if (error.meta?.statusCode === 404) {
          console.log(`Data stream ${dataStream} not found (already deleted)`);
        } else {
          console.log(
            `Failed to delete data stream ${dataStream}:`,
            error.message,
          );
        }
      }
    }

    // Delete regular indices
    console.log('\n🗂️  Deleting regular indices...');
    const regularIndices = securityIndices
      .filter((idx: any) => !idx.index.startsWith('.ds-'))
      .map((idx: any) => idx.index);

    if (regularIndices.length > 0) {
      try {
        await client.indices.delete({ index: regularIndices.join(',') });
        console.log(`✅ Deleted ${regularIndices.length} regular indices`);
      } catch (error: any) {
        console.log('Failed to delete some regular indices:', error.message);
      }
    }

    // Delete detection rules if function exists
    try {
      const { deleteAllRules } = await import('./rules');
      console.log('\n📜 Deleting detection rules...');
      await deleteAllRules();
    } catch (_error) {
      console.log('Note: No detection rules to delete');
    }

    console.log('\n✅ All generated security data deleted successfully!');
  } catch (error) {
    console.log('\n❌ Error during cleanup:');
    console.log(error);
  }
};
