import urlJoin from 'url-join';
import fetch, { Headers } from 'node-fetch';
import { getConfig } from '../get_config';
import { 
  RISK_SCORE_SCORES_URL, 
  RISK_SCORE_ENGINE_INIT_URL, 
  ASSET_CRITICALITY_URL, 
  DETECTION_ENGINE_RULES_URL,
  COMPONENT_TEMPLATES_URL,
  FLEET_EPM_PACKAGES_URL,
  SPACES_URL,
  SPACE_URL, 
} from '../constants';

const config = getConfig();
export const appendPathToKibanaNode = (path: string) => urlJoin(config.kibana.node, path);

type ResponseError = Error & { statusCode: number };

const throwResponseError = (message: string, statusCode: number) => {
  const error = new Error(message) as ResponseError;
  error.statusCode = statusCode;
  throw error;
}

export const kibanaFetch = async <T>(path: string, params: object, apiVersion = '1', ignoreStatuses: number | number[] = []): Promise<T> => {
  const url = appendPathToKibanaNode(path);
  const ignoreStatusesArray = Array.isArray(ignoreStatuses) ? ignoreStatuses : [ignoreStatuses];
  try {
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
      throwResponseError(`Failed to fetch data from ${url}, status: ${result.status}, data: ${JSON.stringify(data)}`, result.status);
    }
    return data;
  } catch (e) {
    throw new Error(`Failed to fetch data from ${url}, error: ${e}`);
  }
};

export const fetchRiskScore = async () => {
  await kibanaFetch(RISK_SCORE_SCORES_URL, {
    method: 'POST',
    body: JSON.stringify({}),
  });
};

export const enableRiskScore = async () => {
  return kibanaFetch(RISK_SCORE_ENGINE_INIT_URL, {
    method: 'POST',
    body: JSON.stringify({}),
  });
};

export const assignAssetCriticality = async ({
  id_field,
  id_value,
  criticality_level,
}: { id_field: string; id_value: string; criticality_level: string }) => {
  return kibanaFetch(ASSET_CRITICALITY_URL, {
    method: 'POST',
    body: JSON.stringify({
      id_field,
      id_value,
      criticality_level,
    }),
  });
};

export const createRule = ({space, id } : {space?: string, id?: string} = {}): Promise<{ id : string }> => {
  const url = DETECTION_ENGINE_RULES_URL(space);
  return kibanaFetch<{ id : string }>(
    url,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Match All',
        description: 'Tests a simple query',
        enabled: true,
        risk_score: 70,
        rule_id: id || 'rule-1',
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
  const url = DETECTION_ENGINE_RULES_URL(space);
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
  const url = DETECTION_ENGINE_RULES_URL(space);
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
  const url = COMPONENT_TEMPLATES_URL(space);
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
  let url = FLEET_EPM_PACKAGES_URL(packageName, version, space);

  return kibanaFetch(
    url,
    {
      method: 'POST',
    },
    '2023-10-31'
  );
}


export const createSpace = async (space: string) => {
  return kibanaFetch(SPACES_URL, {
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
    await kibanaFetch(SPACE_URL(space), {
      method: 'GET',
    });
  } catch (e) {
    return false;
  }
  return true;
}
