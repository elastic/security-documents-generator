import { Client } from '@elastic/elasticsearch';
import { ConfigType, getConfig } from '../../get_config';
import { IndicesCreateRequest } from '@elastic/elasticsearch/lib/api/types';
import { exec } from 'child_process';
import { chunk, once } from 'lodash-es';
import { createProgressBar } from './cli_utils';

export * from './create_agent_document';

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

  once(() => console.log('Elasticsearch node:', config.elastic.node));

  esClient = new Client({
    node: config.elastic.node,
    auth: getClientAuth(config),
  });

  return esClient;
};

export const getFileLineCount = async (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    exec(`wc -l ${filePath}`, (error, stdout, stderr) => {
      if (error || stderr) {
        reject(error || stderr);
      }

      const count = parseInt(stdout.trim().split(' ')[0]);

      if (isNaN(count)) {
        console.log(
          `Failed to parse line count, line count: "${stdout}", split result: "${stdout.split(' ')}"`,
        );
        reject();
      }
      resolve(count);
    });
  });
};

export const indexCheck = async (
  index: string,
  body?: Omit<IndicesCreateRequest, 'index'>,
) => {
  const client = getEsClient();
  if (!client) {
    throw new Error();
  }
  const isExist = await client.indices.exists({ index: index });
  if (isExist) return;

  console.log('Index does not exist, creating...');

  try {
    await client.indices.create({
      index: index,
      settings: {
        'index.mapping.total_fields.limit': 10000,
      },
      ...body,
    });
    console.log('Index created', index);
  } catch (error) {
    console.log('Index creation failed', JSON.stringify(error));
    throw error;
  }
};

export const ingest = async (index: string, documents: Array<object>) => {
  const esClient = getEsClient();

  const progressBar = createProgressBar(index);

  const chunks = chunk(documents, 10000);
  progressBar.start(documents.length, 0);

  for (const chunk of chunks) {
    try {
      const operations = chunk.flatMap((doc) => [{ create: {} }, doc]);

      const results = await esClient.bulk({ index, operations, refresh: true });
      if (results.errors) {
        console.log(
          'The errors below occurred when bulk creating documents. Continuing with the potential for partial data.',
        );
        results.items.forEach((each) => {
          console.log(each);
        });
      }
      progressBar.increment(chunk.length);
    } catch (err) {
      console.log('Error: ', err);
    }
  }
  progressBar.stop();
};
