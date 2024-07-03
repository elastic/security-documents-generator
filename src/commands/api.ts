import urlJoin from 'url-join';
import fetch, { Headers } from 'node-fetch';
import { getConfig } from '../get_config';

const config = getConfig();
const appendPathToKibanaNode = (path: string) => urlJoin(config.kibana.node, path);

export const kibanaFetch = async <T>(path: string, params: object, apiVersion = '1'): Promise<T> => {
  const url = appendPathToKibanaNode(path);

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

    if (result.status >= 400) {
      console.log(data)
      throw new Error(`Failed to fetch data from ${url}, error: ${JSON.stringify(data)}`)
    }
    return data;
  } catch (e) {
    throw new Error(`Failed to fetch data from ${url}`);
  }
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

export const assignAssetCriticality = async ({
  id_field,
  id_value,
  criticality_level,
}: { id_field: string; id_value: string; criticality_level: string }) => {
  return kibanaFetch('/internal/asset_criticality', {
    method: 'POST',
    body: JSON.stringify({
      id_field,
      id_value,
      criticality_level,
    }),
  });
};

export const createRule = ({space, id } : {space?: string, id?: string}): Promise<{ id : string }> => {

  const url = space ? `/s/${space}/api/detection_engine/rules` : '/api/detection_engine/rules';
  return kibanaFetch<{ id : string }>(
    url,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Alert Testing Query',
        description: 'Tests a simple query',
        enabled: true,
        risk_score: 70,
        rule_id: id || 'rule-1',
        severity: 'high',
        index: ['auditbeat-*'],
        type: 'query',
        query: '*:*',
        from: 'now-40d',
        interval: '1m',
      }),
    },
    '2023-10-31'
  );
};

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
