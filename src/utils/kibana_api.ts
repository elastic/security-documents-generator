import urlJoin from 'url-join';
import fetch, { Headers } from 'node-fetch';
import { getConfig } from '../get_config';
import { faker } from '@faker-js/faker';
import {
  RISK_SCORE_SCORES_URL,
  RISK_SCORE_ENGINE_INIT_URL,
  DETECTION_ENGINE_RULES_URL,
  COMPONENT_TEMPLATES_URL,
  FLEET_EPM_PACKAGES_URL,
  SPACES_URL,
  SPACE_URL,
  RISK_SCORE_URL,
  RISK_SCORE_DASHBOARD_URL,
  ASSET_CRITICALITY_BULK_URL,
  INIT_ENTITY_ENGINE_URL,
  ENTITY_ENGINE_URL,
  ENTITY_ENGINES_URL,
  DETECTION_ENGINE_RULES_BULK_ACTION_URL,
  API_VERSIONS,
} from '../constants';

export const buildKibanaUrl = (opts: { path: string; space?: string }) => {
  const config = getConfig();
  const { path, space } = opts;
  const pathWithSpace = space ? urlJoin(`/s/${space}`, path) : path;
  return urlJoin(config.kibana.node, pathWithSpace);
};

type ResponseError = Error & { statusCode: number; responseData: unknown };

const throwResponseError = (
  message: string,
  statusCode: number,
  response: unknown,
) => {
  const error = new Error(message) as ResponseError;
  error.statusCode = statusCode;
  error.responseData = response;
  throw error;
};

export const kibanaFetch = async <T>(
  path: string,
  params: object,
  opts: {
    ignoreStatuses?: number[] | number;
    apiVersion?: string;
    space?: string;
  } = {},
): Promise<T> => {
  const config = getConfig();
  const { ignoreStatuses, apiVersion = '1', space } = opts;
  const url = buildKibanaUrl({ path, space });
  const ignoreStatusesArray = Array.isArray(ignoreStatuses)
    ? ignoreStatuses
    : [ignoreStatuses];
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  headers.append('kbn-xsrf', 'true');
  if ('apiKey' in config.kibana) {
    headers.set('Authorization', 'ApiKey ' + config.kibana.apiKey);
  } else {
    headers.set(
      'Authorization',
      'Basic ' +
        Buffer.from(
          config.kibana.username + ':' + config.kibana.password,
        ).toString('base64'),
    );
  }

  headers.set('x-elastic-internal-origin', 'kibana');
  headers.set('elastic-api-version', apiVersion);
  const result = await fetch(url, {
    headers: headers,
    ...params,
  });
  const rawResponse = await result.text();
  // log response status
  const data = rawResponse ? JSON.parse(rawResponse) : {};
  if (!data || typeof data !== 'object') {
    throw new Error();
  }

  if (result.status >= 400 && !ignoreStatusesArray.includes(result.status)) {
    throwResponseError(
      `Failed to fetch data from ${url}, status: ${result.status}`,
      result.status,
      data,
    );
  }
  return data;
};

export const fetchRiskScore = async (space?: string) => {
  await kibanaFetch(
    RISK_SCORE_SCORES_URL,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    { space },
  );
};

export const enableRiskScore = async (space?: string) => {
  return kibanaFetch(
    RISK_SCORE_ENGINE_INIT_URL,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    {
      space,
    },
  );
};

export const assignAssetCriticality = async (
  assetCriticalityRecords: Array<{
    id_field: string;
    id_value: string;
    criticality_level: string;
  }>,
  space?: string,
) => {
  return kibanaFetch(
    ASSET_CRITICALITY_BULK_URL,
    {
      method: 'POST',
      body: JSON.stringify({ records: assetCriticalityRecords }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

export const createRule = ({
  space,
  id,
  name,
  description,
  enabled,
  risk_score,
  severity,
  index,
  type,
  query,
  from,
  interval,
}: {
  space?: string;
  id?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  risk_score?: number;
  severity?: string;
  index?: string[];
  type?: string;
  query?: string;
  from?: string;
  interval?: string;
} = {}): Promise<{ id: string; name: string }> => {
  return kibanaFetch<{ id: string; name: string }>(
    DETECTION_ENGINE_RULES_URL,
    {
      method: 'POST',
      body: JSON.stringify({
        name: name || 'Match All',
        description: description || 'Tests a simple query',
        enabled: enabled ?? true,
        risk_score: risk_score || 70,
        rule_id: id || faker.string.uuid(),
        severity: severity || 'high',
        index: index || ['logs-*', 'metrics-*', 'auditbeat-*'],
        type: type || 'query',
        query: query || '*:*',
        from: from || 'now-40d',
        interval: interval || '1m',
      }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

export const getRule = async (ruleId: string, space?: string) => {
  const url = DETECTION_ENGINE_RULES_URL + '?rule_id=' + ruleId;
  try {
    return await kibanaFetch(
      url,
      {
        method: 'GET',
      },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    return null;
  }
};

export const deleteRule = async (ruleId: string, space?: string) => {
  const url = DETECTION_ENGINE_RULES_URL + '?rule_id=' + ruleId;
  return kibanaFetch(
    url,
    {
      method: 'DELETE',
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

export const createComponentTemplate = async ({
  name,
  mappings,
  space,
}: {
  name: string;
  mappings: object;
  space?: string;
}) => {
  return kibanaFetch(
    COMPONENT_TEMPLATES_URL,
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        template: {
          mappings,
        },
        _kbnMeta: {
          usedBy: [],
          isManaged: false,
        },
      }),
    },
    { apiVersion: API_VERSIONS.public.v1, ignoreStatuses: [409], space },
  );
};
export const installPackage = async ({
  packageName,
  version = 'latest',
  space,
}: {
  packageName: string;
  version?: string;
  space?: string;
}) => {
  const url = FLEET_EPM_PACKAGES_URL(packageName, version);

  return kibanaFetch(
    url,
    {
      method: 'POST',
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

export const installLegacyRiskScore = async () => {
  const userResponse = await kibanaFetch(RISK_SCORE_URL, {
    method: 'POST',
    body: JSON.stringify({ riskScoreEntity: 'user' }),
  });

  const hostResponse = await kibanaFetch(RISK_SCORE_URL, {
    method: 'POST',
    body: JSON.stringify({ riskScoreEntity: 'host' }),
  });

  const userDashboardsResponse = await kibanaFetch(
    RISK_SCORE_DASHBOARD_URL('user'),
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );

  const hostDashboardsResponse = await kibanaFetch(
    RISK_SCORE_DASHBOARD_URL('host'),
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );

  return {
    userResponse,
    hostResponse,
    userDashboardsResponse,
    hostDashboardsResponse,
  };
};

export const createSpace = async (space: string) => {
  return kibanaFetch(
    SPACES_URL,
    {
      method: 'POST',
      body: JSON.stringify({
        id: space,
        name: space,
        description: 'Created by security-documents-generator for testing',
        disabledFeatures: [],
      }),
    },
    {
      apiVersion: API_VERSIONS.public.v1,
    },
  );
};

export const doesSpaceExist = async (space: string): Promise<boolean> => {
  try {
    await kibanaFetch(
      SPACE_URL(space),
      {
        method: 'GET',
      },
      { apiVersion: API_VERSIONS.public.v1 },
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    return false;
  }
  return true;
};

const _initEngine = (engineType: string, space?: string) => {
  return kibanaFetch(
    INIT_ENTITY_ENGINE_URL(engineType),
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

const _deleteEngine = (engineType: string, space?: string) => {
  return kibanaFetch(
    ENTITY_ENGINE_URL(engineType),
    {
      method: 'DELETE',
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

export const deleteEngines = async (
  entityTypes: string[] = ['host', 'user'],
  space?: string,
) => {
  const responses = await Promise.all(
    entityTypes.map((entityType) => _deleteEngine(entityType, space)),
  );
  console.log('Delete responses:', responses);
};

const _listEngines = (space?: string) => {
  const res = kibanaFetch(
    ENTITY_ENGINES_URL,
    {
      method: 'GET',
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );

  return res as Promise<{ engines: Array<{ status: string }> }>;
};

const allEnginesAreStarted = async (space?: string) => {
  const { engines } = await _listEngines(space);
  if (engines.length === 0) {
    return false;
  }
  return engines.every((engine) => engine.status === 'started');
};

export const initEntityEngineForEntityTypes = async (
  entityTypes: string[] = ['host', 'user'],
  space?: string,
) => {
  if (await allEnginesAreStarted(space)) {
    console.log('All engines are already started');
    return;
  }
  await Promise.all(
    entityTypes.map((entityType) => _initEngine(entityType, space)),
  );
  const attempts = 20;
  const delay = 2000;

  for (let i = 0; i < attempts; i++) {
    console.log('Checking if all engines are started attempt:', i + 1);
    if (await allEnginesAreStarted(space)) {
      console.log('All engines are started');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error('Failed to start engines');
};

export const getAllRules = async (space?: string) => {
  const perPage = 100; // Maximum items per page
  let page = 1;
  let allRules: Array<{ rule_id: string; name: string; id: string }> = [];

  try {
    while (true) {
      const url =
        DETECTION_ENGINE_RULES_URL + `/_find?page=${page}&per_page=${perPage}`;
      const response = await kibanaFetch<{
        data: Array<{ rule_id: string; name: string; id: string }>;
        total: number;
      }>(
        url,
        {
          method: 'GET',
        },
        { apiVersion: API_VERSIONS.public.v1, space },
      );

      if (!response.data || response.data.length === 0) {
        break;
      }

      allRules = allRules.concat(response.data);

      // If we've fetched all rules, break
      if (allRules.length >= (response.total || 0)) {
        break;
      }

      page++;
    }

    return { data: allRules };
  } catch (e) {
    console.error('Error fetching rules:', e);
    return { data: [] };
  }
};

export const bulkDeleteRules = async (ruleIds: string[], space?: string) => {
  return kibanaFetch(
    DETECTION_ENGINE_RULES_BULK_ACTION_URL,
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete',
        ids: ruleIds,
      }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};
