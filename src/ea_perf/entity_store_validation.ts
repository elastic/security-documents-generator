import { getEntityStoreIndex } from '../constants.ts';
import { countPathForIndex, esRequest, getEsClientConfig } from '../utils/es_client.ts';
import { applyEnvFileToProcess, parseEnvFile } from '../utils/env_file.ts';

interface CountResponse {
  count?: number;
}

interface SearchHitSource {
  entity?: {
    type?: string;
    name?: string;
  };
  host?: {
    name?: string;
    domain?: string;
  };
  user?: {
    name?: string;
    domain?: string;
  };
  service?: {
    name?: string;
  };
}

interface SearchResponse {
  hits?: {
    hits?: Array<{
      _index?: string;
      _source?: SearchHitSource;
    }>;
  };
}

interface KibanaRouteDiagnostic {
  ok: boolean;
  statusCode?: number;
  message: string;
}

export interface ValidateEntityStoreSeedOptions {
  envPath?: string;
  space?: string;
  prefix: string;
  expectedCount?: number;
}

export interface ValidateEntityStoreSeedResult {
  ok: boolean;
  space: string;
  prefix: string;
  entityIndex: string;
  expectedCount?: number;
  totalEntityCount: number;
  matchingEntityCount: number;
  matchingUserCount: number;
  matchingHostCount: number;
  sampleEntities: string[];
  legacyCombinedApi: KibanaRouteDiagnostic;
  message: string;
}

const asCount = (value: CountResponse): number =>
  typeof value.count === 'number' ? value.count : 0;

const buildPrefixQuery = (prefix: string) => ({
  bool: {
    should: [
      { term: { 'host.domain': `example.${prefix}.com` } },
      { term: { 'user.domain': `example.${prefix}.com` } },
      { prefix: { 'service.name': `${prefix}-service-` } },
      { prefix: { 'entity.name': `${prefix}-generic` } },
    ],
    minimum_should_match: 1,
  },
});

const buildName = (source: SearchHitSource | undefined): string | undefined =>
  source?.entity?.name ?? source?.host?.name ?? source?.user?.name ?? source?.service?.name;

const checkLegacyCombinedApi = async (
  envPath: string | undefined,
  space: string,
): Promise<KibanaRouteDiagnostic> => {
  const fileEnv = envPath ? parseEnvFile(envPath) : {};
  const kibanaNode = process.env.KIBANA_NODE ?? fileEnv.KIBANA_NODE;
  const username =
    process.env.KIBANA_USERNAME ??
    fileEnv.KIBANA_USERNAME ??
    process.env.ELASTIC_USERNAME ??
    fileEnv.ELASTIC_USERNAME;
  const password =
    process.env.KIBANA_PASSWORD ??
    fileEnv.KIBANA_PASSWORD ??
    process.env.ELASTIC_PASSWORD ??
    fileEnv.ELASTIC_PASSWORD;

  if (!kibanaNode || !username || !password) {
    return {
      ok: false,
      message:
        'Skipped legacy combined entities API probe because Kibana credentials were incomplete.',
    };
  }

  const baseUrl = kibanaNode.endsWith('/') ? kibanaNode.slice(0, -1) : kibanaNode;
  const spacePath = !space || space === 'default' ? '' : `/s/${space}`;
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const response = await fetch(`${baseUrl}${spacePath}/api/security/entity_store/entities`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'kbn-xsrf': 'true',
    },
    body: JSON.stringify({
      entities: ['user', 'host'],
      filterQuery: '',
      from: 'now-7d',
      to: 'now',
      page: 1,
      perPage: 1,
    }),
  });

  if (response.ok) {
    return {
      ok: true,
      statusCode: response.status,
      message: 'Legacy combined entities API responded successfully.',
    };
  }

  const body = await response.text();
  return {
    ok: false,
    statusCode: response.status,
    message: `Legacy combined entities API responded with HTTP ${response.status}: ${body.slice(0, 200)}`,
  };
};

export const validateEntityStoreSeed = async (
  options: ValidateEntityStoreSeedOptions,
): Promise<ValidateEntityStoreSeedResult> => {
  if (options.envPath) {
    applyEnvFileToProcess(options.envPath);
  }

  const space = options.space ?? 'default';
  const entityIndex = getEntityStoreIndex(space);
  const es = getEsClientConfig({ envPath: options.envPath });

  const [
    totalEntityCountResponse,
    matchingEntityCountResponse,
    matchingUserCountResponse,
    matchingHostCountResponse,
  ] = await Promise.all([
    esRequest<CountResponse>(es, countPathForIndex(entityIndex), {
      method: 'POST',
      body: { query: { match_all: {} } },
    }),
    esRequest<CountResponse>(es, countPathForIndex(entityIndex), {
      method: 'POST',
      body: { query: buildPrefixQuery(options.prefix) },
    }),
    esRequest<CountResponse>(es, countPathForIndex(entityIndex), {
      method: 'POST',
      body: { query: { term: { 'user.domain': `example.${options.prefix}.com` } } },
    }),
    esRequest<CountResponse>(es, countPathForIndex(entityIndex), {
      method: 'POST',
      body: { query: { term: { 'host.domain': `example.${options.prefix}.com` } } },
    }),
  ]);

  const sampleResponse = await esRequest<SearchResponse>(
    es,
    `/${encodeURIComponent(entityIndex)}/_search`,
    {
      method: 'POST',
      body: {
        size: 5,
        sort: [{ '@timestamp': { order: 'desc' } }],
        _source: [
          'entity.name',
          'entity.type',
          'host.name',
          'host.domain',
          'user.name',
          'user.domain',
        ],
        query: buildPrefixQuery(options.prefix),
      },
    },
  );

  const sampleEntities = (sampleResponse.hits?.hits ?? [])
    .map((hit) => buildName(hit._source))
    .filter((value): value is string => Boolean(value));

  const legacyCombinedApi = await checkLegacyCombinedApi(options.envPath, space);
  const totalEntityCount = asCount(totalEntityCountResponse);
  const matchingEntityCount = asCount(matchingEntityCountResponse);
  const matchingUserCount = asCount(matchingUserCountResponse);
  const matchingHostCount = asCount(matchingHostCountResponse);

  let ok = matchingEntityCount > 0;
  let message = `Matched ${matchingEntityCount} entity-store documents for prefix "${options.prefix}".`;

  if (options.expectedCount !== undefined) {
    ok = matchingEntityCount === options.expectedCount;
    if (ok) {
      message = `Matched expected entity count (${matchingEntityCount}) for prefix "${options.prefix}".`;
    } else if (matchingEntityCount === 0) {
      message =
        `Found 0 entity-store documents for prefix "${options.prefix}" in ${entityIndex}, ` +
        `while the alias currently holds ${totalEntityCount} total documents.`;
    } else {
      message =
        `Entity-store count mismatch for prefix "${options.prefix}": expected ${options.expectedCount}, ` +
        `found ${matchingEntityCount}.`;
    }
  }

  if (!legacyCombinedApi.ok) {
    message += ` Legacy combined API diagnostic: ${legacyCombinedApi.message}`;
  }

  return {
    ok,
    space,
    prefix: options.prefix,
    entityIndex,
    expectedCount: options.expectedCount,
    totalEntityCount,
    matchingEntityCount,
    matchingUserCount,
    matchingHostCount,
    sampleEntities,
    legacyCombinedApi,
    message,
  };
};
