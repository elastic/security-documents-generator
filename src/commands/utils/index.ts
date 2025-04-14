import { Client } from '@elastic/elasticsearch';
import { getConfig } from '../../get_config';
import { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { exec } from 'child_process';
import { once } from 'lodash-es';

export * from './create_agent_document';

export const getEsClient = () => {
  const config = getConfig();

  let client = null;
  let auth;
  if ('apiKey' in config.elastic) {
    auth = { apiKey: config.elastic.apiKey };
  } else if (config.elastic.username && config.elastic.password) {
    auth = {
      username: config.elastic.username,
      password: config.elastic.password,
    };
  }

  once(() => console.log('Elasticsearch node:', config.elastic.node));

  client = new Client({
    node: config.elastic.node,
    auth,
  });

  return client;
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
  mappings?: MappingTypeMapping,
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
      body: {
        mappings: mappings,
        settings: {
          'index.mapping.total_fields.limit': 10000,
        },
      },
    });
    console.log('Index created', index);
  } catch (error) {
    console.log('Index creation failed', JSON.stringify(error));
    throw error;
  }
};
