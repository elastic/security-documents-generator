import { Agent } from 'undici';
import { getEnvValue, parseEnvFile } from './env_file.ts';

export interface EsAuthOptions {
  envPath?: string;
  esNode?: string;
  esUser?: string;
  esPassword?: string;
  esApiKey?: string;
}

export interface EsClientConfig {
  node: string;
  authHeader: string;
}

interface EsRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

interface CatIndexRow {
  index?: string;
}

const pickDiscoveredLogIndex = (names: string[]): string | undefined => {
  for (const name of names) {
    if (name.includes('elastic-cloud-logs')) {
      return 'elastic-cloud-logs-*';
    }
    if (name.includes('.logs-elastic-cloud')) {
      return '.logs-elastic-cloud-*';
    }
    if (name.includes('logs-elastic-cloud')) {
      return 'logs-elastic-cloud-*';
    }
  }
  return names[0];
};

const getDispatcher = (): Agent | undefined => {
  const allowSelfSigned =
    process.env.ALLOW_SELF_SIGNED_CERTS === 'true' || process.env.ALLOW_SELF_SIGNED_CERTS === '1';
  return allowSelfSigned ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
};

export const getEsClientConfig = (options: EsAuthOptions): EsClientConfig => {
  const fileEnv = options.envPath ? parseEnvFile(options.envPath) : {};
  const node = options.esNode ?? getEnvValue(fileEnv, 'ELASTIC_NODE');
  const apiKey = options.esApiKey ?? getEnvValue(fileEnv, 'ELASTIC_API_KEY');
  const username = options.esUser ?? getEnvValue(fileEnv, 'ELASTIC_USERNAME');
  const password = options.esPassword ?? getEnvValue(fileEnv, 'ELASTIC_PASSWORD');

  if (!node) {
    throw new Error(
      'Missing Elasticsearch node. Provide --es-node or load ELASTIC_NODE via --env-path/environment.',
    );
  }

  if (apiKey) {
    return {
      node,
      authHeader: `ApiKey ${apiKey}`,
    };
  }

  if (username && password) {
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    return {
      node,
      authHeader: `Basic ${encoded}`,
    };
  }

  throw new Error(
    'Missing Elasticsearch credentials. Provide --es-user/--es-password, --es-api-key, or load ELASTIC_* via --env-path/environment.',
  );
};

export const esRequest = async <T>(
  config: EsClientConfig,
  path: string,
  options: EsRequestOptions = {},
): Promise<T> => {
  const baseUrl = config.node.endsWith('/') ? config.node.slice(0, -1) : config.node;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: config.authHeader,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    dispatcher: getDispatcher(),
  } as RequestInit);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Elasticsearch request failed (${response.status} ${response.statusText}): ${body}`,
    );
  }

  return (await response.json()) as T;
};

export const searchPathForIndex = (logIndex: string): string =>
  `/${logIndex
    .split(',')
    .map((part) => encodeURIComponent(part))
    .join(',')}/_search`;

export const countPathForIndex = (logIndex: string): string =>
  `/${logIndex
    .split(',')
    .map((part) => encodeURIComponent(part))
    .join(',')}/_count`;

export const discoverLogIndex = async (config: EsClientConfig): Promise<string> => {
  const indices = await esRequest<CatIndexRow[]>(config, '/_cat/indices/*log*?format=json&h=index');
  const indexNames = indices
    .map((row) => row.index)
    .filter((name): name is string => Boolean(name));
  const preferredIndex = pickDiscoveredLogIndex(indexNames);
  if (preferredIndex) return preferredIndex;
  throw new Error('Could not discover a log index or data stream. Provide --log-index explicitly.');
};
