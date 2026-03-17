import { Client } from '@elastic/elasticsearch';
import { type ConfigType, getConfig } from '../../get_config.ts';
import { type IndicesCreateRequest } from '@elastic/elasticsearch/lib/api/types';
import { exec } from 'child_process';
import { bulkIngest } from '../shared/elasticsearch.ts';
import { log } from '../../utils/logger.ts';

export * from './create_agent_document.ts';

let esClient: Client;

const getClientAuth = (config: ConfigType) => {
  let auth;
  if ('apiKey' in config.elastic) {
    auth = { apiKey: config.elastic.apiKey };
  } else if (config.elastic.username && config.elastic.password) {
    auth = {
      username: config.elastic.username,
      password: config.elastic.password,
    };
  }
  return auth;
};

export const getEsClient = () => {
  if (esClient) return esClient;
  const config = getConfig();

  log.info('Elasticsearch node:', config.elastic.node);

  esClient = new Client({
    node: config.elastic.node,
    auth: getClientAuth(config),
    ...(config.allowSelfSignedCerts && {
      tls: { rejectUnauthorized: false },
    }),
  });

  return esClient;
};

export const getFileLineCount = async (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    exec(`wc -l ${filePath}`, (error, stdout, stderr) => {
      if (error || stderr) {
        reject(error || stderr);
      }

      const count = parseInt(stdout.trim().split(' ')[0], 10);

      if (isNaN(count)) {
        log.error(
          `Failed to parse line count, line count: "${stdout}", split result: "${stdout.split(' ')}"`,
        );
        reject();
      }
      resolve(count);
    });
  });
};

export const indexCheck = async (index: string, body?: Omit<IndicesCreateRequest, 'index'>) => {
  const client = getEsClient();
  if (!client) {
    throw new Error();
  }
  const isExist = await client.indices.exists({ index: index });
  if (isExist) return;

  log.info('Index does not exist, creating...');

  try {
    await client.indices.create({
      index: index,
      settings: {
        'index.mapping.total_fields.limit': 10000,
      },
      ...body,
    });
    log.info('Index created', index);
  } catch (error) {
    log.error('Index creation failed', error);
    throw error;
  }
};

export const ingest = async (
  index: string,
  documents: Array<object>,
  { noMeta, pipeline }: { noMeta?: boolean; pipeline?: string } = {},
) => {
  await bulkIngest({
    index,
    documents,
    chunkSize: 10000,
    action: 'create',
    showProgress: true,
    metadata: !noMeta,
    refresh: true,
    pipeline,
  });
};
