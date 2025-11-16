import { faker } from '@faker-js/faker';
import fs from 'fs';
import cliProgress from 'cli-progress';
import { getEsClient, getFileLineCount } from './utils/indices';
import { ensureSecurityDefaultDataView } from '../utils/security_default_data_view';
import readline from 'readline';
import { deleteEngines, initEntityEngineForEntityTypes } from '../utils/kibana_api';
import { get } from 'lodash-es';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../get_config';
import * as path from 'path';

const config = getConfig();

interface EntityFields {
  id: string;
  name: string;
  type: string;
  sub_type: string;
  address: string;
}

interface HostFields {
  entity: EntityFields;
  host: {
    hostname?: string;
    domain?: string;
    ip?: string[];
    name: string;
    id?: string;
    type?: string;
    mac?: string[];
    architecture?: string[];
  };
}

interface UserFields {
  entity: EntityFields;
  user: {
    full_name?: string[];
    domain?: string;
    roles?: string[];
    name: string;
    id?: string;
    email?: string[];
    hash?: string[];
  };
}

interface ServiceFields {
  entity: EntityFields;
  service: {
    name: string;
    id?: string;
    type?: string;
    node?: {
      roles?: string;
      name?: string;
    };
    environment?: string;
    address?: string;
    state?: string;
    ephemeral_id?: string;
    version?: string;
  };
}

interface GenericEntityFields {
  entity: EntityFields;
  event?: {
    ingested?: string;
    dataset?: string;
    module?: string;
  };
  cloud?: {
    provider?: string;
    region?: string;
    account?: {
      name?: string;
      id?: string;
    };
  };
}

let stop = false;

process.on('SIGINT', () => {
  console.log('Caught interrupt signal (Ctrl + C), stopping...');
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
          idField = 'entity.name';
          idValue = doc.entity.name;
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
    entity: {
      id: id,
      name: id,
      type: 'host',
      sub_type: 'aws_ec2_instance',
      address: `example.${idPrefix}.com`,
    },
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
  doc.entity.name = newName;
  doc.entity.id = newName;
  return doc;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const changeGenericEntityName = (doc: Record<string, any>, addition: string) => {
  const newName = `${doc.entity.name}-${addition}`;
  doc.entity.name = newName;
  if (doc.entity.id && doc.entity.id.includes(doc.entity.name.split('-').slice(0, -1).join('-'))) {
    // Update ARN if it contains the name
    doc.entity.id = doc.entity.id.replace(
      /([^:]+)$/,
      `${newName.split('-').slice(0, -1).join('-')}-${addition}`
    );
  }
  return doc;
};

const generateUserFields = ({ idPrefix, entityIndex }: GeneratorOptions): UserFields => {
  const id = `${idPrefix}-user-${entityIndex}`;
  return {
    entity: {
      id: id,
      name: id,
      type: 'user',
      sub_type: 'aws_iam_user',
      address: `example.${idPrefix}.com`,
    },
    user: {
      id: id,
      name: id,
      full_name: [`User ${idPrefix} ${entityIndex}`],
      domain: `example.${idPrefix}.com`,
      roles: ['admin'],
      email: [`${id}.example.${idPrefix}.com`],
    },
  };
};

const generateServiceFields = ({ idPrefix, entityIndex }: GeneratorOptions): ServiceFields => {
  const id = `${idPrefix}-service-${entityIndex}`;
  return {
    entity: {
      id: id,
      name: id,
      type: 'service',
      sub_type: 'system',
      address: `example.${idPrefix}.com`,
    },
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
const DATA_DIRECTORY = directoryName + '/../../data/entity_store_perf_data';
const LOGS_DIRECTORY = directoryName + '/../../logs';

const getFilePath = (name: string) => {
  return `${DATA_DIRECTORY}/${name}${name.endsWith('.jsonl') ? '' : '.jsonl'}`;
};

export const listPerfDataFiles = () => fs.readdirSync(DATA_DIRECTORY);

const deleteAllEntities = async () => {
  const esClient = getEsClient();
  return await esClient.deleteByQuery({
    index: '.entities.v1.latest*',
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
    { ignore: [404] }
  );
};

const deleteDataStream = async (index: string) => {
  return await getEsClient().indices.deleteDataStream(
    {
      name: index,
    },
    { ignore: [404] }
  );
};

const countEntities = async (baseDomainName: string) => {
  const esClient = getEsClient();
  const res = await esClient.count({
    index: '.entities.v1.latest*',
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
            term: {
              'service.name': `example.${baseDomainName}.com`,
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

const countEntitiesUntil = async (name: string, count: number) => {
  let total = 0;
  console.log('Polling for entities...');
  const progress = new cliProgress.SingleBar(
    {
      format: 'Progress | {value}/{total} Entities',
    },
    cliProgress.Presets.shades_classic
  );
  progress.start(count, 0);

  while (total < count && !stop) {
    total = await countEntities(path.parse(name).name);
    progress.update(total);

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  progress.stop();

  if (stop) {
    console.log('Process stopped before reaching the count.');
  }

  return total;
};

const logClusterHealthEvery = (name: string, interval: number): (() => void) => {
  if (config.serverless) {
    console.log('Skipping cluster health on serverless cluster');
    return () => {};
  }

  let stopCalled = false;

  const stopCallback = () => {
    stopCalled = true;
  };

  const logFile = `${LOGS_DIRECTORY}/${name}-${new Date().toISOString()}-cluster-health.log`;

  const stream = fs.createWriteStream(logFile, { flags: 'a' });

  const log = (message: string) => {
    stream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  const logClusterHealth = async () => {
    const esClient = getEsClient();
    const res = await esClient.cluster.health();
    log(JSON.stringify(res));
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

  const log = (message: string) => {
    stream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  const logTransformStatsEvery = async () => {
    const esClient = getEsClient();
    for (const transform of TRANSFORM_NAMES) {
      const res = await esClient.transform.getTransformStats({
        transform_id: transform,
      });

      log(`Transform ${transform} stats: ${JSON.stringify(res)}`);
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
  if (config.serverless) {
    console.log('Skipping node stats on serverless cluster');
    return () => {};
  }

  let stopCalled = false;

  const stopCallback = () => {
    stopCalled = true;
  };

  const logFile = `${LOGS_DIRECTORY}/${name}-${new Date().toISOString()}-node-stats.log`;

  const stream = fs.createWriteStream(logFile, { flags: 'a' });

  const log = (message: string) => {
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

    log(JSON.stringify({ nodes: nodeStats }));
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

export const createPerfDataFile = ({
  entityCount,
  logsPerEntity,
  startIndex,
  name,
}: {
  name: string;
  entityCount: number;
  logsPerEntity: number;
  startIndex: number;
}) => {
  const filePath = getFilePath(name);
  console.log(
    `Creating performance data file ${name} at with ${entityCount} entities and ${logsPerEntity} logs per entity. Starting at index ${startIndex}`
  );

  if (fs.existsSync(filePath)) {
    console.log(`Data file ${name}.json already exists. Deleting...`);
    fs.unlinkSync(filePath);
  }

  console.log(`Generating ${entityCount * logsPerEntity} logs...`);
  const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

  progress.start(entityCount * logsPerEntity, 0);
  // we could be generating up to 1 million entities, so we need to be careful with memory
  // we will write to the file as we generate the data to avoid running out of memory
  const writeStream = fs.createWriteStream(filePath, { flags: 'a' });

  const generateLogs = async () => {
    for (let i = 0; i < entityCount; i++) {
      // Generate 25% each: host, user, service, generic
      const entityTypeIndex = i % 4;
      const entityType =
        entityTypeIndex === 0
          ? 'host'
          : entityTypeIndex === 1
            ? 'user'
            : entityTypeIndex === 2
              ? 'service'
              : 'generic';

      // Calculate entity index within its type
      const entityIndex = Math.floor(i / 4) + 1;

      for (let j = 0; j < logsPerEntity; j++) {
        // start index for IP/MAC addresses
        // host-0: 0-1, host-1: 2-3, host-2: 4-5
        const valueStartIndex = startIndex + j * FIELD_LENGTH;
        const generatorOpts = {
          entityIndex,
          valueStartIndex: valueStartIndex,
          fieldLength: FIELD_LENGTH,
          idPrefix: name,
        };

        let doc;
        if (entityType === 'host') {
          doc = generateHostFields(generatorOpts);
        } else if (entityType === 'user') {
          doc = generateUserFields(generatorOpts);
        } else if (entityType === 'service') {
          doc = generateServiceFields(generatorOpts);
        } else {
          doc = generateGenericEntityFields(generatorOpts);
        }

        const finalDoc = {
          // @timestamp is generated on ingest
          ...doc,
          message: faker.lorem.sentence(),
          tags: ['entity-store-perf'],
        };

        writeStream.write(JSON.stringify(finalDoc) + '\n');
        progress.increment();
      }

      // Yield to the event loop to prevent blocking
      await new Promise((resolve) => setImmediate(resolve));
    }
    progress.stop();
    console.log(`Data file ${filePath} created`);
  };

  generateLogs().catch((err) => {
    console.error('Error generating logs:', err);
  });
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
  const esClient = getEsClient();
  const stream = fs.createReadStream(filePath);
  const progress = new cliProgress.SingleBar(
    {
      format: '{bar} | {percentage}% | {value}/{total} Documents Uploaded',
    },
    cliProgress.Presets.shades_classic
  );
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await esClient.helpers.bulk<Record<string, any>>({
    datasource: lineGenerator(),
    onDocument: (doc) => {
      if (stop) {
        throw new Error('Stopped');
      }

      doc['@timestamp'] = new Date().toISOString();

      if (modifyDoc) {
        doc = modifyDoc(doc);
      }

      return [{ create: { _index: index } }, { ...doc }];
    },
    flushBytes: 1024 * 1024 * 1,
    flushInterval: 3000,
    onSuccess: () => {
      progress.increment();
    },
    onDrop: (doc) => {
      console.log('Failed to index document:', doc);
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
  deleteEntities?: boolean
) => {
  const index = indexOverride || `logs-perftest.${name}-default`;

  if (deleteEntities) {
    console.log('Deleting all entities...');
    await deleteAllEntities();
    console.log('All entities deleted');

    console.log('Deleting data stream...');
    await deleteDataStream(index);
    console.log('Data stream deleted');

    console.log('Deleting logs index...');
    await deleteLogsIndex(index);
    console.log('Logs index deleted');
  }
  const filePath = getFilePath(name);

  console.log(`Uploading performance data file ${name} to index ${index}`);

  if (!fs.existsSync(filePath)) {
    console.log(`Data file ${name} does not exist`);
    process.exit(1);
  }

  console.log('initialising entity engines');
  await initEntityEngineForEntityTypes(['host', 'user', 'service', 'generic']);
  console.log('entity engines initialised');

  const { lineCount, logsPerEntity, entityCount } = await getFileStats(filePath);
  console.log(
    `Data file ${name} has ${lineCount} lines, ${entityCount} entities and ${logsPerEntity} logs per entity`
  );
  const startTime = Date.now();

  await uploadFile({ filePath, index, lineCount });
  const ingestTook = Date.now() - startTime;
  console.log(`Data file ${name} uploaded to index ${index} in ${ingestTook}ms`);

  await countEntitiesUntil(name, entityCount);

  const tookTotal = Date.now() - startTime;

  console.log(`Total time: ${tookTotal}ms`);
};

export const uploadPerfDataFileInterval = async (
  name: string,
  intervalMs: number,
  uploadCount: number,
  deleteEntities?: boolean,
  doDeleteEngines?: boolean
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

  const index = `logs-perftest.${name}-default`;
  const filePath = getFilePath(name);

  console.log(
    `Uploading performance data file ${name} every ${intervalMs}ms ${uploadCount} times to index ${index}`
  );

  if (doDeleteEngines) {
    console.log('Deleting all engines...');
    await deleteEngines();
    console.log('All engines deleted');
  }
  if (deleteEntities) {
    console.log('Deleting all entities...');
    await deleteAllEntities();
    console.log('All entities deleted');

    console.log('Deleting data stream...');
    await deleteDataStream(index);
    console.log('Data stream deleted');

    console.log('Deleting logs index...');
    await deleteLogsIndex(index);
    console.log('Logs index deleted');
  }

  if (!fs.existsSync(filePath)) {
    console.log(`Data file ${name} does not exist`);
    process.exit(1);
  }

  console.log('initialising entity engines');

  await ensureSecurityDefaultDataView('default');

  await initEntityEngineForEntityTypes(['host', 'user', 'service', 'generic']);

  console.log('entity engines initialised');

  const { lineCount, logsPerEntity, entityCount } = await getFileStats(filePath);

  console.log(
    `Data file ${name} has ${lineCount} lines, ${entityCount} entities and ${logsPerEntity} logs per entity`
  );

  const startTime = Date.now();

  let previousUpload = Promise.resolve();

  const stopHealthLogging = logClusterHealthEvery(name, 5000);
  const stopTransformsLogging = logTransformStatsEvery(name, 5000);
  const stopNodeStatsLogging = logNodeStatsEvery(name, 5000);

  for (let i = 0; i < uploadCount; i++) {
    if (stop) {
      break;
    }
    let uploadCompleted = false;
    const onComplete = () => {
      uploadCompleted = true;
    };
    const intervalS = intervalMs / 1000;
    console.log(`Uploading ${i + 1} of ${uploadCount}, next upload in ${intervalS}s...`);
    previousUpload = previousUpload.then(() =>
      uploadFile({
        onComplete,
        filePath,
        index,
        lineCount,
        modifyDoc: addIdPrefix(i.toString()),
      })
    );
    let progress: cliProgress.SingleBar | null = null;
    for (let j = 0; j < intervalS; j++) {
      if (stop) {
        break;
      }
      if (uploadCompleted) {
        if (!progress) {
          progress = new cliProgress.SingleBar(
            {
              format: '{bar} | {value}s | waiting {total}s until next upload',
            },
            cliProgress.Presets.shades_classic
          );

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
  console.log(`Data file ${name} uploaded to index ${index} in ${ingestTook}ms`);

  await countEntitiesUntil(name, entityCount * uploadCount);

  const tookTotal = Date.now() - startTime;

  stopHealthLogging();
  stopTransformsLogging();
  stopNodeStatsLogging();

  console.log(`Total time: ${tookTotal}ms`);
};
