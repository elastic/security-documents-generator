import { faker } from '@faker-js/faker';
import fs from 'fs';
import cliProgress from 'cli-progress';
import { getEsClient, getFileLineCount } from './utils/index';
import readline from 'readline';
import {
  initEntityEngineForEntityTypes,
  deleteEngines,
} from '../utils/kibana_api';
import { get } from 'lodash-es';
const esClient = getEsClient();

interface HostFields {
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
        } else {
          idField = 'user.name';
          idValue = doc.user.name;
        }
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

const generateUserFields = ({
  idPrefix,
  entityIndex,
}: GeneratorOptions): UserFields => {
  const id = `${idPrefix}-user-${entityIndex}`;
  return {
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

const FIELD_LENGTH = 2;
const DATA_DIRECTORY = __dirname + '/../../data/entity_store_perf_data';
const LOGS_DIRECTORY = __dirname + '/../../logs';

const getFilePath = (name: string) => {
  return `${DATA_DIRECTORY}/${name}${name.endsWith('.jsonl') ? '' : '.jsonl'}`;
};

export const listPerfDataFiles = () => fs.readdirSync(DATA_DIRECTORY);

const deleteAllEntities = async () => {
  const res = await esClient.deleteByQuery({
    index: '.entities.v1.latest*',
    body: {
      query: {
        match_all: {},
      },
    },
  });

  return res;
};

const deleteLogsIndex = async (index: string) => {
  const res = await esClient.indices.delete(
    {
      index,
    },
    { ignore: [404] },
  );

  return res;
};

const countEntities = async (name: string) => {
  const res = await esClient.count({
    index: '.entities.v1.latest*',
    body: {
      query: {
        bool: {
          should: [
            {
              term: {
                'host.domain': `example.${name}.com`,
              },
            },
            {
              term: {
                'user.domain': `example.${name}.com`,
              },
            },
          ],
          minimum_should_match: 1,
        },
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
    cliProgress.Presets.shades_classic,
  );
  progress.start(count, 0);

  while (total < count && !stop) {
    total = await countEntities(name);
    progress.update(total);

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  progress.stop();

  if (stop) {
    console.log('Process stopped before reaching the count.');
  }

  return total;
};

const logClusterHealthEvery = (
  name: string,
  interval: number,
): (() => void) => {
  let stopCalled = false;

  const stopCallback = () => {
    stopCalled = true;
  };

  const logFile = `${LOGS_DIRECTORY}/${name}-${new Date().toISOString()}-cluster-health.log`;

  const stream = fs.createWriteStream(logFile, { flags: 'a' });

  const log = (message: string) => {
    stream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  const logClusterHealthEvery = async () => {
    const res = await esClient.cluster.health();
    log(JSON.stringify(res));
  };

  const int = setInterval(async () => {
    await logClusterHealthEvery();

    if (stopCalled || stop) {
      clearInterval(int);
      stream.end();
    }
  }, interval);

  return stopCallback;
};

const logTransformStatsEvery = (
  name: string,
  interval: number,
): (() => void) => {
  const TRANSFORM_NAMES = [
    'entities-v1-latest-security_host_default',
    'entities-v1-latest-security_user_default',
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
    `Creating performance data file ${name}.jsonl at with ${entityCount} entities and ${logsPerEntity} logs per entity. Starting at index ${startIndex}`,
  );

  if (fs.existsSync(filePath)) {
    console.log(`Data file ${name}.json already exists. Deleting...`);
    fs.unlinkSync(filePath);
  }

  console.log(`Generating ${entityCount * logsPerEntity} logs...`);
  const progress = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic,
  );

  progress.start(entityCount * logsPerEntity, 0);
  // we could be generating up to 1 million entities, so we need to be careful with memory
  // we will write to the file as we generate the data to avoid running out of memory
  const writeStream = fs.createWriteStream(filePath, { flags: 'a' });

  const generateLogs = async () => {
    for (let i = 0; i < entityCount; i++) {
      // we generate 50/50 host/user entities
      const entityType = i % 2 === 0 ? 'host' : 'user';

      // user-0 host-0 user-1 host-1 user-2 host-2
      const entityIndex = Math.floor(i / 2) + 1;

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
        const doc = {
          // @timestamp is generated on ingest
          ...(entityType === 'host'
            ? generateHostFields(generatorOpts)
            : generateUserFields(generatorOpts)),
          message: faker.lorem.sentence(),
          tags: ['entity-store-perf'],
        };

        writeStream.write(JSON.stringify(doc) + '\n');
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

const uploadFile = async ({
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
  const progress = new cliProgress.SingleBar(
    {
      format: '{bar} | {percentage}% | {value}/{total} Documents Uploaded',
    },
    cliProgress.Presets.shades_classic,
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

      return {
        create: {
          _index: index,
        },
        document: doc,
      };
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
  deleteEntities?: boolean,
) => {
  const index = indexOverride || `logs-perftest.${name}-default`;

  if (deleteEntities) {
    console.log('Deleting all entities...');
    await deleteAllEntities();
    console.log('All entities deleted');

    console.log('Deleting logs index...');
    await deleteLogsIndex(index);
    console.log('Logs index deleted');
  }
  const filePath = getFilePath(name);

  console.log(
    `Uploading performance data file ${name}.jsonl to index ${index}`,
  );

  if (!fs.existsSync(filePath)) {
    console.log(`Data file ${name}.jsonl does not exist`);
    process.exit(1);
  }

  console.log('initialising entity engines');
  await initEntityEngineForEntityTypes(['host', 'user']);
  console.log('entity engines initialised');

  const { lineCount, logsPerEntity, entityCount } =
    await getFileStats(filePath);
  console.log(
    `Data file ${name}.jsonl has ${lineCount} lines, ${entityCount} entities and ${logsPerEntity} logs per entity`,
  );
  const startTime = Date.now();

  await uploadFile({ filePath, index, lineCount });
  const ingestTook = Date.now() - startTime;
  console.log(
    `Data file ${name}.jsonl uploaded to index ${index} in ${ingestTook}ms`,
  );

  await countEntitiesUntil(name, entityCount);

  const tookTotal = Date.now() - startTime;

  console.log(`Total time: ${tookTotal}ms`);
};

export const uploadPerfDataFileInterval = async (
  name: string,
  intervalMs: number,
  uploadCount: number,
  deleteEntities?: boolean,
  doDeleteEngines?: boolean,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addIdPrefix = (prefix: string) => (doc: Record<string, any>) => {
    const isHost = !!doc.host;

    if (isHost) {
      return changeHostName(doc, prefix);
    }

    return changeUserName(doc, prefix);
  };

  const index = `logs-perftest.${name}-default`;
  const filePath = getFilePath(name);

  console.log(
    `Uploading performance data file ${name}.jsonl every ${intervalMs}ms ${uploadCount} times to index ${index}`,
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

    console.log('Deleting logs index...');
    await deleteLogsIndex(index);
    console.log('Logs index deleted');
  }

  if (!fs.existsSync(filePath)) {
    console.log(`Data file ${name}.jsonl does not exist`);
    process.exit(1);
  }

  console.log('initialising entity engines');

  await initEntityEngineForEntityTypes(['host', 'user']);

  console.log('entity engines initialised');

  const { lineCount, logsPerEntity, entityCount } =
    await getFileStats(filePath);

  console.log(
    `Data file ${name}.jsonl has ${lineCount} lines, ${entityCount} entities and ${logsPerEntity} logs per entity`,
  );

  const startTime = Date.now();

  let previousUpload = Promise.resolve();

  const stopHealthLogging = logClusterHealthEvery(name, 5000);
  const stopTransformsLogging = logTransformStatsEvery(name, 5000);

  for (let i = 0; i < uploadCount; i++) {
    if (stop) {
      break;
    }
    let uploadCompleted = false;
    const onComplete = () => {
      uploadCompleted = true;
    };
    const intervalS = intervalMs / 1000;
    console.log(
      `Uploading ${i + 1} of ${uploadCount}, next upload in ${intervalS}s...`,
    );
    previousUpload = previousUpload.then(() =>
      uploadFile({
        onComplete,
        filePath,
        index,
        lineCount,
        modifyDoc: addIdPrefix(i.toString()),
      }),
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
            cliProgress.Presets.shades_classic,
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
  console.log(
    `Data file ${name}.jsonl uploaded to index ${index} in ${ingestTook}ms`,
  );

  await countEntitiesUntil(name, entityCount * uploadCount);

  const tookTotal = Date.now() - startTime;

  stopHealthLogging();
  stopTransformsLogging();

  console.log(`Total time: ${tookTotal}ms`);
};
