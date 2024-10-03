import urlJoin from 'url-join';
import fetch, { Headers } from 'node-fetch';
import { getConfig } from '../get_config';
import { faker } from '@faker-js/faker';

const config = getConfig();
export const appendPathToKibanaNode = (path: string) => urlJoin(config.kibana.node, path);

type ResponseError = Error & { statusCode: number, responseData: unknown };

const throwResponseError = (message: string, statusCode: number, response: unknown) => {
  const error = new Error(message) as ResponseError;
  error.statusCode = statusCode;
  error.responseData = response;
  throw error;
}

export const kibanaFetch = async <T>(path: string, params: object, apiVersion = '1', ignoreStatuses: number | number[] = []): Promise<T> => {
  const url = appendPathToKibanaNode(path);
  const ignoreStatusesArray = Array.isArray(ignoreStatuses) ? ignoreStatuses : [ignoreStatuses];
  // try {
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
          config.kibana.username + ':' + config.kibana.password
        ).toString('base64')
    );
  }

  headers.set('x-elastic-internal-origin', 'kibana');
  headers.set('elastic-api-version', apiVersion);
  const result = await fetch(url, {
    headers: headers,
    ...params,
  });
  const data= await result.json() as T;
  if (!data || typeof data !== 'object') {
    throw new Error;
  }

  if (result.status >= 400 && !ignoreStatusesArray.includes(result.status)) {
    throwResponseError(`Failed to fetch data from ${url}, status: ${result.status}`, result.status, data);
  }
  return data;
};

export const fetchRiskScore = async () => {
  await kibanaFetch('/internal/risk_score/scores', {
    method: 'POST',
    body: JSON.stringify({}),
  });
};

export const enableRiskScore = async () => {
  return kibanaFetch('/internal/risk_score/engine/init', {
    method: 'POST',
    body: JSON.stringify({}),
  });
};

export const assignAssetCriticality = async (assetCriticalityRecords: Array<{ id_field: string; id_value: string; criticality_level: string }>) => {
  return kibanaFetch('/api/asset_criticality/bulk', {
    method: 'POST',
    body: JSON.stringify({records: assetCriticalityRecords}),
  }, '2023-10-31');
};

export const enableAssetCriticality = async () => {
  return kibanaFetch('/internal/kibana/settings', {
    method: 'POST',
    body: JSON.stringify({
      changes: {
        'securitySolution:enableAssetCriticality': true,
      },
    }),
  });
};


export const createRule = ({space, id } : {space?: string, id?: string} = {}): Promise<{ id : string }> => {

  const url = space ? `/s/${space}/api/detection_engine/rules` : '/api/detection_engine/rules';
  return kibanaFetch<{ id : string }>(
    url,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Match All',
        description: 'Tests a simple query',
        enabled: true,
        risk_score: 70,
        rule_id: id || faker.string.uuid(),
        severity: 'high',
        index: ['logs-*','metrics-*'],
        type: 'query',
        query: '*:*',
        from: 'now-40d',
        interval: '1m',
      }),
    },
    '2023-10-31'
  );
};

export const getRule = async (ruleId: string, space?: string) => {
  const url = space ? `/s/${space}/api/detection_engine/rules` : '/api/detection_engine/rules';
  try {
    return await kibanaFetch(
      url + '?rule_id=' + ruleId,
      {
        method: 'GET',
      },
      '2023-10-31'
    );
  } catch (e) {
    return null;
  }
}

export const deleteRule = async (ruleId: string, space?: string) => {
  const url = space ? `/s/${space}/api/detection_engine/rules` : '/api/detection_engine/rules';
  return kibanaFetch(
    url + '?rule_id=' + ruleId,
    {
      method: 'DELETE',
      body: JSON.stringify({
        rule_id: ruleId,
      }),
    },
    '2023-10-31'
  );
}

export const createComponentTemplate = async ({ name, mappings, space }: { name: string; mappings: object; space?: string }) => {
  const url = space ? `/s/${space}/api/index_management/component_templates` : '/api/index_management/component_templates';
  const ignoreStatus = 409;
  return kibanaFetch(
    url,
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
    '2023-10-31',
    ignoreStatus
  );
}
export const installPackage = async ({ packageName, version = 'latest', space  }: {packageName: string; version?: string; space?: string;}) => {
  let url = space ? `/s/${space}/api/fleet/epm/packages/${packageName}` : `/api/fleet/epm/packages/${packageName}`;

  if (version !== 'latest') {
    url = `${url}/${version}`;
  }

  return kibanaFetch(
    url,
    {
      method: 'POST',
    },
    '2023-10-31'
  );
}


export const createSpace = async (space: string) => {
  return kibanaFetch('/api/spaces/space', {
    method: 'POST',
    body: JSON.stringify({
      id: space,
      name: space,
      description: 'Created by security-documents-generator for testing',
      disabledFeatures: [],
    }),
  });
}

export const getSpace = async (space: string): Promise<boolean> => {
  try {
    await kibanaFetch(`/api/spaces/space/${space}`, {
      method: 'GET',
    });
  } catch (e) {
    return false;
  }
  return true;
}
