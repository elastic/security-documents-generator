import { log } from '../../utils/logger.ts';
import { faker } from '@faker-js/faker';
import fs from 'fs';
import { getEsClient, getFileLineCount } from '../utils/indices.ts';
import { streamingBulkIngest } from '../shared/elasticsearch.ts';
import { createProgressBar } from '../utils/cli_utils.ts';
import { ensureSecurityDefaultDataView } from '../../utils/security_default_data_view.ts';
import readline from 'readline';
import {
  deleteEngines,
  enableEntityStoreV2,
  initEntityEngineForEntityTypes,
  installEntityStoreV2,
  kibanaFetch,
} from '../../utils/kibana_api.ts';
import { get } from 'lodash-es';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../../get_config.ts';
import * as path from 'path';
import {
  type GenericEntityFields,
  type HostFields,
  type ServiceFields,
  type UserFields,
} from '../../types/entities.ts';
import { getEntityStorePerfDataDir } from '../../utils/data_paths.ts';

// Checkpoint stability configuration for transform completion detection
// Consider checkpoint stable if it hasn't changed in this duration (10 seconds)
const CHECKPOINT_STABLE_TIME_MS = 10000;
// Consider stable after this many consecutive checks with the same checkpoint
const STABLE_CHECKPOINT_THRESHOLD = 3;

let stop = false;

process.on('SIGINT', () => {
  log.info('Caught interrupt signal (Ctrl + C), stopping...');
  stop = true;
});

const generateIpAddresses = (startIndex: number, count: number) => {
  const ips = [];
  for (let i = 0; i < count; i++) {
    ips.push(`192.168.1.${startIndex + i}`);
  }
  return ips;
};

const generateMacAddresses = (startIndex: number, count: number) => {
  const macs = [];
  for (let i = 0; i < count; i++) {
    const macPart = (startIndex + i)
      .toString(16)
      .padStart(12, '0')
      .match(/.{1,2}/g)
      ?.join(':');
    macs.push(macPart ? macPart : '00:00:00:00:00:00');
  }
  return macs;
};

interface GeneratorOptions {
  entityIndex: number;
  valueStartIndex: number;
  fieldLength: number;
  idPrefix: string;
}

const getLogsPerEntity = (filePath: string) => {
  return new Promise<number>((resolve, reject) => {
    let idField: string | undefined;
    let idValue: string | undefined;
    let count: number = 0;
    let resolved = false;
    const readStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      const doc = JSON.parse(line);
      if (!idField) {
        if (doc.host) {
          idField = 'host.name';
          idValue = doc.host.name;
        } else if (doc.user) {
          idField = 'user.name';
          idValue = doc.user.name;
        } else if (doc.service) {
          idField = 'service.name';
          idValue = doc.service.name;
        } else if (doc.entity) {
          idField = 'entity.id';
          idValue = doc.entity.id;
        }
      }

      if (!idField) {
        return;
      }

      const docId = get(doc, idField);
      if (docId !== idValue && !resolved) {
        resolved = true;
        rl.close();
        resolve(count);
      } else {
        count++;
      }
    });

    rl.on('error', (err) => {
      reject(err);
    });

    rl.on('close', () => {
      if (!resolved) {
        if (!idField) {
          reject(
            new Error(
              'Could not determine entity type from file. Expected host, user, service, or entity fields.',
            ),
          );
        } else {
          // All documents have the same entity ID, resolve with total count
          resolve(count);
        }
      }
    });
  });
};

const generateHostFields = ({
  entityIndex,
  valueStartIndex,
  fieldLength,
  idPrefix,
}: GeneratorOptions): HostFields => {
  const id = `${idPrefix}-host-${entityIndex}`;
  return {
    host: {
      id: id,
      name: id,
      hostname: `${id}.example.${idPrefix}.com`,
      domain: `example.${idPrefix}.com`,
      ip: generateIpAddresses(valueStartIndex, fieldLength),
      mac: generateMacAddresses(valueStartIndex, fieldLength),
      type: 'server',
      architecture: ['x86_64'],
    },
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const changeHostName = (doc: Record<string, any>, addition: string) => {
  const newName = `${doc.host.hostname}-${addition}`;
  doc.host.hostname = newName;
  doc.host.name = newName;
  doc.host.id = newName;
  return doc;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const changeUserName = (doc: Record<string, any>, addition: string) => {
  const newName = `${doc.user.name}-${addition}`;
  doc.user.name = newName;
  doc.user.id = newName;
  return doc;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const changeServiceName = (doc: Record<string, any>, addition: string) => {
  const newName = `${doc.service.name}-${addition}`;
  doc.service.name = newName;
  doc.service.id = newName;
  return doc;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const changeGenericEntityName = (doc: Record<string, any>, addition: string) => {
  const originalName = doc.entity.name; // Store original name before modification
  const newName = `${originalName}-${addition}`;
  doc.entity.name = newName;

  // Check if ARN contains the original name (before modification)
  if (doc.entity.id && doc.entity.id.includes(originalName)) {
    // Update ARN: replace the last part (after last colon or slash) with new name
    // ARN format: arn:aws:service:region:account:resource or arn:aws:service:region:account:type/resource
    doc.entity.id = doc.entity.id.replace(/([^:/]+)$/, newName);
  }
  return doc;
};

const generateUserFields = ({ idPrefix, entityIndex }: GeneratorOptions): UserFields => {
  const id = `${idPrefix}-user-${entityIndex}`;
  return {
    user: {
      id: id,
      name: id,
      full_name: [`User ${idPrefix} ${entityIndex}`],
      domain: `example.${idPrefix}.com`,
      roles: ['admin'],
      email: `${id}@example.${idPrefix}.com`,
      entity: { id },
    },
    event: {
      kind: 'event',
      category: 'iam',
      type: 'user',
    },
  };
};

const generateServiceFields = ({ idPrefix, entityIndex }: GeneratorOptions): ServiceFields => {
  const id = `${idPrefix}-service-${entityIndex}`;
  return {
    service: {
      id: id,
      name: id,
      type: 'system',
      node: {
        roles: 'data',
        name: `${id}-node`,
      },
      environment: 'production',
      address: generateIpAddresses(entityIndex * FIELD_LENGTH, 1)[0],
      state: 'running',
      ephemeral_id: `${id}-ephemeral`,
      version: '8.0.0',
    },
  };
};

const generateGenericEntityFields = ({
  idPrefix,
  entityIndex,
}: GeneratorOptions): GenericEntityFields => {
  const id = `${idPrefix}-generic-${entityIndex}`;
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
  const taxonomy = genericTypes[entityIndex % genericTypes.length];
  const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];
  const region = regions[entityIndex % regions.length];
  const accountId = '123456789012';

  let resourceId: string;
  if (taxonomy.subType.includes('SNS')) {
    resourceId = `arn:aws:sns:${region}:${accountId}:${id}`;
  } else if (taxonomy.subType.includes('S3')) {
    resourceId = `arn:aws:s3:::${id}`;
  } else if (taxonomy.subType.includes('EC2')) {
    resourceId = `arn:aws:ec2:${region}:${accountId}:instance/${id}`;
  } else if (taxonomy.subType.includes('RDS')) {
    resourceId = `arn:aws:rds:${region}:${accountId}:db:${id}`;
  } else if (taxonomy.subType.includes('Lambda')) {
    resourceId = `arn:aws:lambda:${region}:${accountId}:function:${id}`;
  } else if (taxonomy.subType.includes('VPC')) {
    resourceId = `arn:aws:ec2:${region}:${accountId}:vpc/${id}`;
  } else if (taxonomy.subType.includes('EBS')) {
    resourceId = `arn:aws:ec2:${region}:${accountId}:volume/${id}`;
  } else if (taxonomy.subType.includes('DynamoDB')) {
    resourceId = `arn:aws:dynamodb:${region}:${accountId}:table/${id}`;
  } else if (taxonomy.subType.includes('ECS')) {
    resourceId = `arn:aws:ecs:${region}:${accountId}:service/${id}`;
  } else if (taxonomy.subType.includes('Load Balancer')) {
    resourceId = `arn:aws:elasticloadbalancing:${region}:${accountId}:loadbalancer/${id}`;
  } else {
    resourceId = `arn:aws:${taxonomy.subType.toLowerCase().replace(/\s+/g, '-')}:${region}:${accountId}:${id}`;
  }

  return {
    entity: {
      id: resourceId,
      name: id,
      type: taxonomy.type,
      sub_type: taxonomy.subType,
      address: `example.${idPrefix}.com`,
    },
    event: {
      ingested: new Date().toISOString(),
      dataset: 'cloud_asset_inventory.asset_inventory',
      module: 'cloud_asset_inventory',
    },
    cloud: {
      provider: 'aws',
      region: region,
      account: {
        name: `${idPrefix}-account`,
        id: accountId,
      },
    },
  };
};

const FIELD_LENGTH = 2;
const directoryName = dirname(fileURLToPath(import.meta.url));
const DATA_DIRECTORY = getEntityStorePerfDataDir();
const LOGS_DIRECTORY = directoryName + '/../../../logs';

/**
 * Predefined entity distribution presets
 */
export const ENTITY_DISTRIBUTIONS = {
  // Equal distribution: 25% each
  equal: {
    user: 0.25,
    host: 0.25,
    generic: 0.25,
    service: 0.25,
  },
  // Standard distribution: 33% users, 33% hosts, 33% generic, 1% service
  standard: {
    user: 0.33,
    host: 0.33,
    generic: 0.33,
    service: 0.01,
  },
} as const;

export type PresetDistributionType = keyof typeof ENTITY_DISTRIBUTIONS;
/** CLI / API: preset ratios (`equal`, `standard`) or `absolute` (explicit per-type counts). */
export type DistributionType = PresetDistributionType | 'absolute';
export type EntityType = 'user' | 'host' | 'service' | 'generic';

export const DEFAULT_DISTRIBUTION: PresetDistributionType = 'standard';

export const isValidDistributionType = (value: string): value is DistributionType =>
  value === 'absolute' || Object.prototype.hasOwnProperty.call(ENTITY_DISTRIBUTIONS, value);

export type ExplicitEntityCountsInput = {
  user: number;
  host: number;
  service: number;
  generic: number;
};

/**
 * Validates explicit per-type counts for `--distribution absolute`.
 * Each count must be a non-negative integer; the sum must equal totalEntityCount.
 */
export const validateExplicitEntityCounts = (
  totalEntityCount: number,
  counts: ExplicitEntityCountsInput,
) => {
  const keys: (keyof ExplicitEntityCountsInput)[] = ['user', 'host', 'service', 'generic'];
  for (const key of keys) {
    const v = counts[key];
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`Invalid ${key} count: expected a non-negative integer, got ${String(v)}`);
    }
  }
  const { user, host, service, generic } = counts;
  const sum = user + host + service + generic;
  if (sum !== totalEntityCount) {
    throw new Error(`Explicit entity counts sum to ${sum} but entity-count is ${totalEntityCount}`);
  }
  return {
    user,
    host,
    generic,
    service,
    total: totalEntityCount,
  };
};

/**
 * Get entity distribution by type (preset only; not used for `absolute`)
 */
export const getEntityDistribution = (type: PresetDistributionType = DEFAULT_DISTRIBUTION) => {
  return ENTITY_DISTRIBUTIONS[type];
};

/**
 * Calculate entity counts for each type based on total entity count and distribution
 */
export const calculateEntityCounts = (
  totalEntityCount: number,
  distribution = getEntityDistribution(),
) => {
  const userCount = Math.floor(totalEntityCount * distribution.user);
  const hostCount = Math.floor(totalEntityCount * distribution.host);
  const genericCount = Math.floor(totalEntityCount * distribution.generic);
  const serviceCount = totalEntityCount - userCount - hostCount - genericCount; // Remaining

  return {
    user: userCount,
    host: hostCount,
    generic: genericCount,
    service: serviceCount,
    total: totalEntityCount,
  };
};

const getFilePath = (name: string) => {
  return `${DATA_DIRECTORY}/${name}${name.endsWith('.jsonl') ? '' : '.jsonl'}`;
};

export const listPerfDataFiles = () => fs.readdirSync(DATA_DIRECTORY);

const ENTITY_INDEX_V1 = '.entities.v1.latest*';
const ENTITY_INDEX_V2 = '.entities.v2.latest*';

const deleteAllEntities = async (entityIndex: string = ENTITY_INDEX_V1) => {
  const esClient = getEsClient();
  return await esClient.deleteByQuery({
    index: entityIndex,
    query: {
      match_all: {},
    },
  });
};

const deleteLogsIndex = async (index: string) => {
  return await getEsClient().indices.delete(
    {
      index,
    },
    { ignore: [404] },
  );
};

const deleteDataStream = async (index: string) => {
  return await getEsClient().indices.deleteDataStream(
    {
      name: index,
    },
    { ignore: [404] },
  );
};

const countEntities = async (baseDomainName: string, entityIndex: string = ENTITY_INDEX_V1) => {
  const esClient = getEsClient();
  const res = await esClient.count({
    index: entityIndex,
    query: {
      bool: {
        should: [
          {
            term: {
              'host.domain': `example.${baseDomainName}.com`,
            },
          },
          {
            term: {
              'user.domain': `example.${baseDomainName}.com`,
            },
          },
          {
            prefix: {
              'service.name': `${baseDomainName}-service-`,
            },
          },
          {
            prefix: {
              'entity.name': `${baseDomainName}-generic`,
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
  });

  return res.count;
};

const countEntitiesUntil = async (
  name: string,
  count: number,
  entityIndex: string = ENTITY_INDEX_V1,
) => {
  let total = 0;
  log.info('Polling for entities...');
  const progress = createProgressBar('entities', {
    format: 'Progress | {value}/{total} Entities',
  });
  progress.start(count, 0);

  while (total < count && !stop) {
    total = await countEntities(path.parse(name).name, entityIndex);
    progress.update(total);

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  progress.stop();

  if (stop) {
    log.info('Process stopped before reaching the count.');
  }

  return total;
};

const waitForTransformToComplete = async (
  transformId: string,
  expectedDocumentsProcessed: number,
  timeoutMs: number = 1800000, // 30 minutes default timeout
): Promise<void> => {
  const esClient = getEsClient();
  const startTime = Date.now();
  const pollInterval = 5000; // Check every 5 seconds

  log.info(
    `Waiting for transform ${transformId} to process ${expectedDocumentsProcessed} documents (timeout: ${timeoutMs / 1000 / 60} minutes)...`,
  );

  // Create progress bar similar to countEntitiesUntil
  const progress = createProgressBar('documents', {
    format: 'Progress | {value}/{total} Documents | Checkpoint: {checkpoint}',
  });
  progress.start(expectedDocumentsProcessed, 0, { checkpoint: 0 });

  let lastCheckpoint = 0;
  let stableCheckpointCount = 0;

  try {
    while (Date.now() - startTime < timeoutMs) {
      try {
        const res = await esClient.transform.getTransformStats({
          transform_id: transformId,
        });

        if (res.transforms && res.transforms.length > 0) {
          const stats = res.transforms[0].stats;
          const documentsProcessed = stats.documents_processed || 0;
          const checkpointing = res.transforms[0].checkpointing;
          const currentCheckpoint = checkpointing?.last?.checkpoint || 0;
          const checkpointTimestamp = checkpointing?.last?.timestamp_millis || 0;

          // Update progress bar
          progress.update(documentsProcessed, { checkpoint: currentCheckpoint });

          // Check if checkpoint is stable (not changing)
          if (currentCheckpoint === lastCheckpoint) {
            stableCheckpointCount++;
          } else {
            stableCheckpointCount = 0;
            lastCheckpoint = currentCheckpoint;
          }

          // Check if checkpoint has been stable for a while
          const timeSinceLastCheckpoint = Date.now() - checkpointTimestamp;
          const checkpointStable = timeSinceLastCheckpoint >= CHECKPOINT_STABLE_TIME_MS;

          // Transform has finished processing when:
          // 1. Documents processed >= expected
          // 2. Checkpoint has been stable for several checks (not incrementing)
          // 3. Checkpoint timestamp indicates it's been stable for a while
          if (
            documentsProcessed >= expectedDocumentsProcessed &&
            stableCheckpointCount >= STABLE_CHECKPOINT_THRESHOLD &&
            checkpointStable
          ) {
            progress.stop();
            log.info(
              `\nTransform ${transformId} completed processing ${documentsProcessed} documents (checkpoint: ${currentCheckpoint})`,
            );
            return;
          }
        }
      } catch (error) {
        log.warn(`\nError checking transform stats: ${error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    progress.stop();
    throw new Error(
      `Timeout waiting for transform ${transformId} to process ${expectedDocumentsProcessed} documents after ${timeoutMs / 1000 / 60} minutes`,
    );
  } finally {
    // Ensure progress bar is stopped even if there's an error
    if (progress) {
      progress.stop();
    }
  }
};

const logClusterHealthEvery = (name: string, interval: number): (() => void) => {
  const config = getConfig();
  if (config.serverless) {
    log.info('Skipping cluster health on serverless cluster');
    return () => {};
  }

  let stopCalled = false;

  const stopCallback = () => {
    stopCalled = true;
  };

  const logFile = `${LOGS_DIRECTORY}/${name}-${new Date().toISOString()}-cluster-health.log`;

  const stream = fs.createWriteStream(logFile, { flags: 'a' });

  const writeToFile = (message: string) => {
    stream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  const logClusterHealth = async () => {
    const esClient = getEsClient();
    const res = await esClient.cluster.health();
    writeToFile(JSON.stringify(res));
  };

  const int = setInterval(async () => {
    await logClusterHealth();

    if (stopCalled || stop) {
      clearInterval(int);
      stream.end();
    }
  }, interval);

  return stopCallback;
};

const logTransformStatsEvery = (name: string, interval: number): (() => void) => {
  const TRANSFORM_NAMES = [
    'entities-v1-latest-security_host_default',
    'entities-v1-latest-security_user_default',
    'entities-v1-latest-security_service_default',
    'entities-v1-latest-security_generic_default',
  ];

  let stopCalled = false;

  const stopCallback = () => {
    stopCalled = true;
  };

  const logFile = `${LOGS_DIRECTORY}/${name}-${new Date().toISOString()}-transform-stats.log`;

  const stream = fs.createWriteStream(logFile, { flags: 'a' });

  const writeToFile = (message: string) => {
    stream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  const logTransformStatsEvery = async () => {
    const esClient = getEsClient();
    for (const transform of TRANSFORM_NAMES) {
      const res = await esClient.transform.getTransformStats({
        transform_id: transform,
      });

      writeToFile(`Transform ${transform} stats: ${JSON.stringify(res)}`);
    }
  };

  const int = setInterval(async () => {
    await logTransformStatsEvery();

    if (stopCalled || stop) {
      clearInterval(int);
      stream.end();
    }
  }, interval);

  return stopCallback;
};

const logNodeStatsEvery = (name: string, interval: number): (() => void) => {
  const config = getConfig();
  if (config.serverless) {
    log.info('Skipping node stats on serverless cluster');
    return () => {};
  }

  let stopCalled = false;

  const stopCallback = () => {
    stopCalled = true;
  };

  const logFile = `${LOGS_DIRECTORY}/${name}-${new Date().toISOString()}-node-stats.log`;

  const stream = fs.createWriteStream(logFile, { flags: 'a' });

  const writeToStream = (message: string) => {
    stream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  const logNodeStats = async () => {
    const esClient = getEsClient();
    // Get node stats with CPU, JVM, and OS metrics
    const res = await esClient.nodes.stats({
      metric: ['process', 'jvm', 'os'],
      human: false, // Get raw numbers, not human-readable format
    });

    // Extract CPU and performance metrics for each node
    const nodeStats = Object.entries(res.nodes).map(([nodeId, node]) => ({
      node_id: nodeId,
      node_name: node.name,
      timestamp: new Date().toISOString(),
      cpu: {
        percent: node.process?.cpu?.percent, // CPU usage percentage
        total_in_millis: node.process?.cpu?.total_in_millis, // Total CPU time
      },
      jvm: {
        mem: {
          heap_used_percent: node.jvm?.mem?.heap_used_percent, // Heap usage %
          heap_used_in_bytes: node.jvm?.mem?.heap_used_in_bytes,
          heap_max_in_bytes: node.jvm?.mem?.heap_max_in_bytes,
        },
        gc: {
          collectors: node.jvm?.gc?.collectors, // GC stats
        },
      },
      os: {
        cpu: {
          percent: node.os?.cpu?.percent, // OS-level CPU %
          load_average: node.os?.cpu?.load_average, // Load average (1m, 5m, 15m)
        },
        mem: {
          used_percent: node.os?.mem?.used_percent, // OS memory usage %
          total_in_bytes: node.os?.mem?.total_in_bytes,
          free_in_bytes: node.os?.mem?.free_in_bytes,
        },
      },
    }));

    writeToStream(JSON.stringify({ nodes: nodeStats }));
  };

  const int = setInterval(async () => {
    await logNodeStats();

    if (stopCalled || stop) {
      clearInterval(int);
      stream.end();
    }
  }, interval);

  return stopCallback;
};

const logKibanaStatsEvery = (name: string, interval: number): (() => void) => {
  let stopCalled = false;

  const stopCallback = () => {
    stopCalled = true;
  };

  const logFile = `${LOGS_DIRECTORY}/${name}-${new Date().toISOString()}-kibana-stats.log`;

  const stream = fs.createWriteStream(logFile, { flags: 'a' });

  const writeToStream = (message: string) => {
    stream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  const logKibanaStats = async () => {
    try {
      const stats = await kibanaFetch<{
        process: {
          uptime_in_millis: number;
          memory: {
            heap: {
              total_in_bytes: number;
              used_in_bytes: number;
              size_limit: number;
            };
          };
        };
        requests: {
          total: number;
          disconnects: number;
          statusCodes: Record<string, number>;
        };
        response_times: {
          avg_in_millis: number;
          max_in_millis: number;
        };
        concurrent_connections: number;
        os: {
          load: {
            '1m': number;
            '5m': number;
            '15m': number;
          };
          memory: {
            total_in_bytes: number;
            free_in_bytes: number;
            used_in_bytes: number;
          };
        };
      }>(
        '/api/stats',
        {
          method: 'GET',
        },
        {
          apiVersion: '1',
        },
      );

      writeToStream(JSON.stringify(stats));
    } catch (error) {
      writeToStream(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      );
    }
  };

  const int = setInterval(async () => {
    await logKibanaStats();

    if (stopCalled || stop) {
      clearInterval(int);
      stream.end();
    }
  }, interval);

  return stopCallback;
};

export const createPerfDataFile = async ({
  entityCount,
  logsPerEntity,
  startIndex,
  name,
  distribution = DEFAULT_DISTRIBUTION,
  explicitEntityCounts,
}: {
  name: string;
  entityCount: number;
  logsPerEntity: number;
  startIndex: number;
  distribution?: DistributionType;
  explicitEntityCounts?: ExplicitEntityCountsInput;
}): Promise<void> => {
  const filePath = getFilePath(name);

  let entityCounts: ReturnType<typeof calculateEntityCounts>;

  if (distribution === 'absolute') {
    if (explicitEntityCounts === undefined) {
      throw new Error('explicitEntityCounts is required when distribution is absolute');
    }
    entityCounts = validateExplicitEntityCounts(entityCount, explicitEntityCounts);
  } else {
    if (explicitEntityCounts !== undefined) {
      throw new Error('explicitEntityCounts must not be set unless distribution is absolute');
    }
    const dist = getEntityDistribution(distribution);
    entityCounts = calculateEntityCounts(entityCount, dist);
  }

  log.info(
    `Creating performance data file ${name} with ${entityCount} entities and ${logsPerEntity} logs per entity. Starting at index ${startIndex}`,
  );

  if (distribution === 'absolute') {
    // if there are no entities, we will show 100% for each type
    const pct = (n: number) => (entityCount > 0 ? ((n / entityCount) * 100).toFixed(1) : '100');
    log.info(
      `Distribution (absolute): ${entityCounts.user} users (${pct(entityCounts.user)}%), ` +
        `${entityCounts.host} hosts (${pct(entityCounts.host)}%), ` +
        `${entityCounts.service} services (${pct(entityCounts.service)}%), ` +
        `${entityCounts.generic} generic entities (${pct(entityCounts.generic)}%)`,
    );
  } else {
    const dist = getEntityDistribution(distribution);
    log.info(
      `Distribution (${distribution}): ${entityCounts.user} users (${(dist.user * 100).toFixed(1)}%), ` +
        `${entityCounts.host} hosts (${(dist.host * 100).toFixed(1)}%), ` +
        `${entityCounts.service} services (${(dist.service * 100).toFixed(1)}%), ` +
        `${entityCounts.generic} generic entities (${(dist.generic * 100).toFixed(1)}%)`,
    );
  }

  if (fs.existsSync(filePath)) {
    log.info(`Data file ${name}.json already exists. Deleting...`);
    fs.unlinkSync(filePath);
  }

  log.info(`Generating ${entityCount * logsPerEntity} logs...`);
  const progress = createProgressBar('logs');

  progress.start(entityCount * logsPerEntity, 0);
  // we could be generating up to 1 million entities, so we need to be careful with memory
  // we will write to the file as we generate the data to avoid running out of memory
  const writeStream = fs.createWriteStream(filePath, { flags: 'a' });

  // Map entity types to their generator functions for cleaner code
  const entityGenerators: Record<
    EntityType,
    (opts: GeneratorOptions) => HostFields | UserFields | ServiceFields | GenericEntityFields
  > = {
    host: generateHostFields,
    user: generateUserFields,
    service: generateServiceFields,
    generic: generateGenericEntityFields,
  };

  const generateLogs = async () => {
    let globalEntityIndex = 0;
    let streamError: Error | null = null;

    // Set up error handler once for the entire stream
    writeStream.on('error', (error) => {
      streamError = error;
    });

    // Generate entities in order: users, hosts, services, generic
    const entityOrder: Array<{ type: EntityType; count: number }> = [
      { type: 'user', count: entityCounts.user },
      { type: 'host', count: entityCounts.host },
      { type: 'service', count: entityCounts.service },
      { type: 'generic', count: entityCounts.generic },
    ];

    // Helper function to write to stream and wait for drain if needed
    const writeToStream = (data: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Check for previous errors
        if (streamError) {
          reject(streamError);
          return;
        }

        const canContinue = writeStream.write(data);
        if (canContinue) {
          // Check again after write in case error occurred synchronously
          if (streamError) {
            reject(streamError);
          } else {
            resolve();
          }
        } else {
          writeStream.once('drain', () => {
            if (streamError) {
              reject(streamError);
            } else {
              resolve();
            }
          });
        }
      });
    };

    try {
      for (const { type, count } of entityOrder) {
        for (let i = 0; i < count; i++) {
          const entityIndex = i + 1; // 1-based index for entity within its type

          for (let j = 0; j < logsPerEntity; j++) {
            // Fix: Calculate valueStartIndex to ensure unique IP addresses per entity
            // Each entity gets a unique range: entity 0 uses 0-1, entity 1 uses 2-3, etc.
            // Each log within an entity also gets unique values
            const valueStartIndex =
              startIndex + globalEntityIndex * logsPerEntity * FIELD_LENGTH + j * FIELD_LENGTH;

            const generatorOpts = {
              entityIndex,
              valueStartIndex,
              fieldLength: FIELD_LENGTH,
              idPrefix: name,
            };

            // Use map lookup instead of if/else chain
            const doc = entityGenerators[type](generatorOpts);

            const finalDoc = {
              ...doc,
              message: faker.lorem.sentence(),
              tags: ['entity-store-perf'],
            };

            await writeToStream(JSON.stringify(finalDoc) + '\n');
            progress.increment();
          }

          globalEntityIndex++;
          // Yield to the event loop to prevent blocking
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      // Wait for all writes to complete before closing
      await new Promise<void>((resolve, reject) => {
        writeStream.once('finish', resolve);
        writeStream.once('error', reject);
        writeStream.end();
      });

      progress.stop();
      log.info(`Data file ${filePath} created`);
    } catch (error) {
      // Ensure stream is closed even on error
      writeStream.destroy();
      progress.stop();
      throw error;
    }
  };

  // Properly await the operation to ensure stream is closed
  await generateLogs();
};

export const uploadFile = async ({
  filePath,
  index,
  lineCount,
  modifyDoc,
  onComplete,
}: {
  filePath: string;
  index: string;
  lineCount: number;
  modifyDoc?: (doc: Record<string, any>) => Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  onComplete?: () => void;
}) => {
  const stream = fs.createReadStream(filePath);
  const progress = createProgressBar('upload', {
    format: '{bar} | {percentage}% | {value}/{total} Documents Uploaded',
  });
  progress.start(lineCount, 0);

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  const lineGenerator = async function* () {
    for await (const line of rl) {
      yield JSON.parse(line);
    }
  };

  await streamingBulkIngest({
    index,
    datasource: lineGenerator(),
    flushBytes: 1024 * 1024 * 1,
    flushInterval: 3000,
    onDocument: (doc) => {
      if (stop) {
        throw new Error('Stopped');
      }
      const record = doc as Record<string, unknown>;
      record['@timestamp'] = new Date().toISOString();
      const payload = modifyDoc ? modifyDoc(doc as Record<string, any>) : doc; // eslint-disable-line @typescript-eslint/no-explicit-any
      return [{ create: { _index: index } }, { ...payload }];
    },
    onSuccess: () => {
      progress.increment();
    },
    onDrop: (doc) => {
      log.error('Failed to index document:', doc);
      process.exit(1);
    },
  });

  progress.stop();
  if (onComplete) {
    onComplete();
  }
};

const getFileStats = async (filePath: string) => {
  const lineCount = await getFileLineCount(filePath);
  const logsPerEntity = await getLogsPerEntity(filePath);
  const entityCount = lineCount / logsPerEntity;

  return { lineCount, logsPerEntity, entityCount };
};

export const uploadPerfDataFile = async (
  name: string,
  indexOverride?: string,
  deleteEntities?: boolean,
  noTransforms?: boolean,
  metricsOptions?: {
    enabled: boolean;
    samplingIntervalMs: number;
    transformTimeoutMs: number;
  },
) => {
  const index = indexOverride || `logs-perftest.${name}-default`;
  const entityIndex = noTransforms ? ENTITY_INDEX_V2 : ENTITY_INDEX_V1;

  if (deleteEntities) {
    log.info(`Deleting all entities (${noTransforms ? 'V2' : 'V1'})...`);
    await deleteAllEntities(entityIndex);
    log.info('All entities deleted');

    log.info('Deleting data stream...');
    await deleteDataStream(index);
    log.info('Data stream deleted');

    log.info('Deleting logs index...');
    await deleteLogsIndex(index);
    log.info('Logs index deleted');
  }
  const filePath = getFilePath(name);

  log.info(`Uploading performance data file ${name} to index ${index}`);

  if (!fs.existsSync(filePath)) {
    log.info(`Data file ${name} does not exist`);
    process.exit(1);
  }

  if (noTransforms) {
    log.info('Enabling Entity Store V2...');
    await enableEntityStoreV2('default');
    await installEntityStoreV2('default');
    log.info('Entity Store V2 ready');
  } else {
    log.info('initialising entity engines');
    await initEntityEngineForEntityTypes(['host', 'user', 'service', 'generic']);
    log.info('entity engines initialised');
  }

  const { lineCount, logsPerEntity, entityCount } = await getFileStats(filePath);
  log.info(
    `Data file ${name} has ${lineCount} lines, ${entityCount} entities and ${logsPerEntity} logs per entity`,
  );
  const startTime = Date.now();
  const samplingInterval = metricsOptions?.samplingIntervalMs ?? 5000;
  const transformTimeout = metricsOptions?.transformTimeoutMs ?? 1800000;
  const metricsEnabled = metricsOptions?.enabled ?? false;

  let stopHealthLogging = () => {};
  let stopTransformsLogging = () => {};
  let stopNodeStatsLogging = () => {};
  let stopKibanaStatsLogging = () => {};

  if (metricsEnabled) {
    stopHealthLogging = logClusterHealthEvery(name, samplingInterval);
    stopNodeStatsLogging = logNodeStatsEvery(name, samplingInterval);
    stopKibanaStatsLogging = logKibanaStatsEvery(name, samplingInterval);
    if (!noTransforms) {
      stopTransformsLogging = logTransformStatsEvery(name, samplingInterval);
    }
  }

  try {
    await uploadFile({ filePath, index, lineCount });
    const ingestTook = Date.now() - startTime;
    log.info(`Data file ${name} uploaded to index ${index} in ${ingestTook}ms`);

    await countEntitiesUntil(name, entityCount, entityIndex);

    if (metricsEnabled && !noTransforms) {
      log.info(
        `Waiting for generic transform to process ${lineCount} documents (timeout: ${transformTimeout / 1000 / 60} minutes)...`,
      );
      try {
        await waitForTransformToComplete(
          'entities-v1-latest-security_generic_default',
          lineCount,
          transformTimeout,
        );
      } catch (error) {
        log.warn(
          `Warning: ${error instanceof Error ? error.message : 'Failed to wait for transform completion'}. Continuing...`,
        );
      }
    }

    const tookTotal = Date.now() - startTime;
    log.info(`Total time: ${tookTotal}ms`);
  } finally {
    if (metricsEnabled) {
      stopHealthLogging();
      stopTransformsLogging();
      stopNodeStatsLogging();
      stopKibanaStatsLogging();
    }
  }
};

/**
 * V2 flow (Entity Store V2 / ESQL): enable + install V2, use .entities.v2.latest*, no transforms.
 */
const runUploadPerfDataIntervalV2 = async (
  name: string,
  intervalMs: number,
  uploadCount: number,
  deleteEntities?: boolean,
  _doDeleteEngines?: boolean,
  _transformTimeoutMs?: number,
  samplingIntervalMs?: number,
  indexOverride?: string,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addIdPrefix = (prefix: string) => (doc: Record<string, any>) => {
    if (doc.host) {
      return changeHostName(doc, prefix);
    } else if (doc.user) {
      return changeUserName(doc, prefix);
    } else if (doc.service) {
      return changeServiceName(doc, prefix);
    } else if (doc.entity && doc.cloud) {
      return changeGenericEntityName(doc, prefix);
    }
    return doc;
  };

  const index = indexOverride ?? `logs-perftest.${name}-default`;
  const filePath = getFilePath(name);

  log.info(
    `Uploading performance data file ${name} every ${intervalMs}ms ${uploadCount} times to index ${index} (Entity Store V2)`,
  );

  if (deleteEntities) {
    log.info('Deleting all entities (V2)...');
    await deleteAllEntities(ENTITY_INDEX_V2);
    log.info('All entities deleted');

    log.info('Deleting data stream...');
    await deleteDataStream(index);
    log.info('Data stream deleted');

    log.info('Deleting logs index...');
    await deleteLogsIndex(index);
    log.info('Logs index deleted');
  }

  if (!fs.existsSync(filePath)) {
    log.info(`Data file ${name} does not exist`);
    process.exit(1);
  }

  log.info('Enabling Entity Store V2...');
  await enableEntityStoreV2('default');
  await installEntityStoreV2('default');
  log.info('Entity Store V2 ready');

  const { lineCount, logsPerEntity, entityCount } = await getFileStats(filePath);

  log.info(
    `Data file ${name} has ${lineCount} lines, ${entityCount} entities and ${logsPerEntity} logs per entity`,
  );

  const startTime = Date.now();
  let previousUpload = Promise.resolve();
  const samplingInterval = samplingIntervalMs ?? 5000;

  const stopHealthLogging = logClusterHealthEvery(name, samplingInterval);
  const stopNodeStatsLogging = logNodeStatsEvery(name, samplingInterval);
  const stopKibanaStatsLogging = logKibanaStatsEvery(name, samplingInterval);

  for (let i = 0; i < uploadCount; i++) {
    if (stop) break;
    let uploadCompleted = false;
    const onComplete = () => {
      uploadCompleted = true;
    };
    const intervalS = intervalMs / 1000;
    log.info(`Uploading ${i + 1} of ${uploadCount}, next upload in ${intervalS}s...`);
    previousUpload = previousUpload.then(() =>
      uploadFile({
        onComplete,
        filePath,
        index,
        lineCount,
        modifyDoc: addIdPrefix(i.toString()),
      }),
    );
    let progress: ReturnType<typeof createProgressBar> | null = null;
    for (let j = 0; j < intervalS; j++) {
      if (stop) break;
      if (uploadCompleted) {
        if (!progress) {
          progress = createProgressBar('interval', {
            format: '{bar} | {value}s | waiting {total}s until next upload',
          });
          progress.start(intervalS, j + 1);
        } else {
          progress.update(j + 1);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    progress?.update(intervalS);
    progress?.stop();
  }

  await previousUpload;

  const ingestTook = Date.now() - startTime;
  log.info(`Data file ${name} uploaded to index ${index} in ${ingestTook}ms`);

  await countEntitiesUntil(name, entityCount * uploadCount, ENTITY_INDEX_V2);

  log.info('Skipping transform completion wait (Entity Store V2 / ESQL mode)');

  const tookTotal = Date.now() - startTime;
  stopHealthLogging();
  stopNodeStatsLogging();
  stopKibanaStatsLogging();
  log.info(`Total time: ${tookTotal}ms`);
};

/**
 * V1 flow (transform-based): deleteEngines, initEntityEngineForEntityTypes, .entities.v1.latest*, transform wait.
 */
const runUploadPerfDataIntervalV1 = async (
  name: string,
  intervalMs: number,
  uploadCount: number,
  deleteEntities?: boolean,
  doDeleteEngines?: boolean,
  transformTimeoutMs?: number,
  samplingIntervalMs?: number,
  indexOverride?: string,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addIdPrefix = (prefix: string) => (doc: Record<string, any>) => {
    if (doc.host) {
      return changeHostName(doc, prefix);
    } else if (doc.user) {
      return changeUserName(doc, prefix);
    } else if (doc.service) {
      return changeServiceName(doc, prefix);
    } else if (doc.entity && doc.cloud) {
      return changeGenericEntityName(doc, prefix);
    }
    return doc;
  };

  const index = indexOverride ?? `logs-perftest.${name}-default`;
  const filePath = getFilePath(name);

  log.info(
    `Uploading performance data file ${name} every ${intervalMs}ms ${uploadCount} times to index ${index} (Entity Store V1)`,
  );

  if (doDeleteEngines) {
    log.info('Deleting all engines...');
    await deleteEngines();
    log.info('All engines deleted');
  }
  if (deleteEntities) {
    log.info('Deleting all entities...');
    await deleteAllEntities(ENTITY_INDEX_V1);
    log.info('All entities deleted');

    log.info('Deleting data stream...');
    await deleteDataStream(index);
    log.info('Data stream deleted');

    log.info('Deleting logs index...');
    await deleteLogsIndex(index);
    log.info('Logs index deleted');
  }

  if (!fs.existsSync(filePath)) {
    log.info(`Data file ${name} does not exist`);
    process.exit(1);
  }

  log.info('initialising entity engines');
  await ensureSecurityDefaultDataView('default');
  await initEntityEngineForEntityTypes(['host', 'user', 'service', 'generic']);
  log.info('entity engines initialised');

  const { lineCount, logsPerEntity, entityCount } = await getFileStats(filePath);

  log.info(
    `Data file ${name} has ${lineCount} lines, ${entityCount} entities and ${logsPerEntity} logs per entity`,
  );

  const startTime = Date.now();
  let previousUpload = Promise.resolve();
  const samplingInterval = samplingIntervalMs ?? 5000;

  const stopHealthLogging = logClusterHealthEvery(name, samplingInterval);
  const stopTransformsLogging = logTransformStatsEvery(name, samplingInterval);
  const stopNodeStatsLogging = logNodeStatsEvery(name, samplingInterval);
  const stopKibanaStatsLogging = logKibanaStatsEvery(name, samplingInterval);

  for (let i = 0; i < uploadCount; i++) {
    if (stop) break;
    let uploadCompleted = false;
    const onComplete = () => {
      uploadCompleted = true;
    };
    const intervalS = intervalMs / 1000;
    log.info(`Uploading ${i + 1} of ${uploadCount}, next upload in ${intervalS}s...`);
    previousUpload = previousUpload.then(() =>
      uploadFile({
        onComplete,
        filePath,
        index,
        lineCount,
        modifyDoc: addIdPrefix(i.toString()),
      }),
    );
    let progress: ReturnType<typeof createProgressBar> | null = null;
    for (let j = 0; j < intervalS; j++) {
      if (stop) break;
      if (uploadCompleted) {
        if (!progress) {
          progress = createProgressBar('interval', {
            format: '{bar} | {value}s | waiting {total}s until next upload',
          });
          progress.start(intervalS, j + 1);
        } else {
          progress.update(j + 1);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    progress?.update(intervalS);
    progress?.stop();
  }

  await previousUpload;

  const ingestTook = Date.now() - startTime;
  log.info(`Data file ${name} uploaded to index ${index} in ${ingestTook}ms`);

  await countEntitiesUntil(name, entityCount * uploadCount, ENTITY_INDEX_V1);

  const totalDocumentsIngested = lineCount * uploadCount;
  const timeout = transformTimeoutMs ?? 1800000;
  log.info(
    `Waiting for generic transform to process ${totalDocumentsIngested} documents (timeout: ${timeout / 1000 / 60} minutes)...`,
  );
  try {
    await waitForTransformToComplete(
      'entities-v1-latest-security_generic_default',
      totalDocumentsIngested,
      timeout,
    );
  } catch (error) {
    log.warn(
      `Warning: ${error instanceof Error ? error.message : 'Failed to wait for transform completion'}. Continuing...`,
    );
  }

  const tookTotal = Date.now() - startTime;
  stopHealthLogging();
  stopTransformsLogging();
  stopNodeStatsLogging();
  stopKibanaStatsLogging();
  log.info(`Total time: ${tookTotal}ms`);
};

export const uploadPerfDataFileInterval = async (
  name: string,
  intervalMs: number,
  uploadCount: number,
  deleteEntities?: boolean,
  doDeleteEngines?: boolean,
  transformTimeoutMs?: number,
  samplingIntervalMs?: number,
  noTransforms?: boolean,
  indexOverride?: string,
) => {
  if (noTransforms) {
    return runUploadPerfDataIntervalV2(
      name,
      intervalMs,
      uploadCount,
      deleteEntities,
      doDeleteEngines,
      transformTimeoutMs,
      samplingIntervalMs,
      indexOverride,
    );
  }
  return runUploadPerfDataIntervalV1(
    name,
    intervalMs,
    uploadCount,
    deleteEntities,
    doDeleteEngines,
    transformTimeoutMs,
    samplingIntervalMs,
    indexOverride,
  );
};
