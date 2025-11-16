import urlJoin from 'url-join';
import fetch, { Headers } from 'node-fetch';
import { getConfig } from '../get_config';
import { faker } from '@faker-js/faker';
import fs from 'fs';
import FormData from 'form-data';
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
  RISK_SCORE_ENGINE_SCHEDULE_NOW_URL,
  KIBANA_SETTINGS_URL,
  KIBANA_SETTINGS_INTERNAL_URL,
} from '../constants';

export const buildKibanaUrl = (opts: { path: string; space?: string }) => {
  const config = getConfig();
  const { path, space } = opts;
  const pathWithSpace = space ? urlJoin(`/s/${space}`, path) : path;
  return urlJoin(config.kibana.node, pathWithSpace);
};

type ResponseError = Error & { statusCode: number; responseData: unknown };

const getAuthorizationHeader = () => {
  const config = getConfig();
  if ('apiKey' in config.kibana) {
    return 'ApiKey ' + config.kibana.apiKey;
  } else
    return (
      'Basic ' +
      Buffer.from(config.kibana.username + ':' + config.kibana.password).toString('base64')
    );
};

const throwResponseError = (message: string, statusCode: number, response: unknown) => {
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
  } = {}
): Promise<T> => {
  const { ignoreStatuses, apiVersion = '1', space } = opts;
  const url = buildKibanaUrl({ path, space });
  const ignoreStatusesArray = Array.isArray(ignoreStatuses) ? ignoreStatuses : [ignoreStatuses];
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  headers.append('kbn-xsrf', 'true');
  headers.append('Authorization', getAuthorizationHeader());
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
      data
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
    { space }
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
    }
  );
};

export const scheduleRiskEngineNow = async (space?: string) => {
  return kibanaFetch(
    RISK_SCORE_ENGINE_SCHEDULE_NOW_URL,
    {
      method: 'POST',
      body: JSON.stringify({ runNow: true }),
    },
    { space, apiVersion: API_VERSIONS.public.v1 }
  );
};

export const assignAssetCriticality = async (
  assetCriticalityRecords: Array<{
    id_field: string;
    id_value: string;
    criticality_level: string;
  }>,
  space?: string
) => {
  return kibanaFetch(
    ASSET_CRITICALITY_BULK_URL,
    {
      method: 'POST',
      body: JSON.stringify({ records: assetCriticalityRecords }),
    },
    { apiVersion: API_VERSIONS.public.v1, space }
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
        max_signals: 1000,
      }),
    },
    { apiVersion: API_VERSIONS.public.v1, space }
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
      { apiVersion: API_VERSIONS.public.v1, space }
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
    { apiVersion: API_VERSIONS.public.v1, space }
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
    { apiVersion: API_VERSIONS.public.v1, ignoreStatuses: [409], space }
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
    { apiVersion: API_VERSIONS.public.v1, space }
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

  const userDashboardsResponse = await kibanaFetch(RISK_SCORE_DASHBOARD_URL('user'), {
    method: 'POST',
    body: JSON.stringify({}),
  });

  const hostDashboardsResponse = await kibanaFetch(RISK_SCORE_DASHBOARD_URL('host'), {
    method: 'POST',
    body: JSON.stringify({}),
  });

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
    }
  );
};

export const doesSpaceExist = async (space: string): Promise<boolean> => {
  try {
    await kibanaFetch(
      SPACE_URL(space),
      {
        method: 'GET',
      },
      { apiVersion: API_VERSIONS.public.v1 }
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
    { apiVersion: API_VERSIONS.public.v1, space }
  );
};

const _deleteEngine = (engineType: string, space?: string) => {
  return kibanaFetch(
    ENTITY_ENGINE_URL(engineType),
    {
      method: 'DELETE',
    },
    { apiVersion: API_VERSIONS.public.v1, space }
  );
};

export const deleteEngines = async (
  entityTypes: string[] = ['host', 'user', 'service', 'generic'],
  space?: string
) => {
  const responses = await Promise.all(
    entityTypes.map((entityType) => _deleteEngine(entityType, space))
  );
  console.log('Delete responses:', responses);
};

const _listEngines = (space?: string) => {
  const res = kibanaFetch(
    ENTITY_ENGINES_URL,
    {
      method: 'GET',
    },
    { apiVersion: API_VERSIONS.public.v1, space }
  );

  return res as Promise<{
    engines: Array<{
      type?: string;
      name?: string;
      id?: string;
      status: string;
      error?: string;
      message?: string;
    }>;
  }>;
};

const allRequestedEnginesAreStarted = async (entityTypes: string[], space?: string) => {
  const { engines } = await _listEngines(space);
  if (engines.length === 0) {
    return false;
  }

  // Check that all requested entity types are present and started
  for (const entityType of entityTypes) {
    // Try to find engine by type, name, or id field
    const engine = engines.find(
      (e) => e.type === entityType || e.name === entityType || e.id === entityType
    );
    if (!engine || engine.status !== 'started') {
      return false;
    }
  }

  return true;
};

const getEngineStatusDetails = async (entityTypes: string[], space?: string) => {
  const { engines } = await _listEngines(space);
  const missingEngines = entityTypes.filter(
    (entityType) =>
      !engines.find((e) => e.type === entityType || e.name === entityType || e.id === entityType)
  );
  const errorEngines = entityTypes.filter((entityType) => {
    const engine = engines.find(
      (e) => e.type === entityType || e.name === entityType || e.id === entityType
    );
    return engine && engine.status === 'error';
  });
  const notStartedEngines = entityTypes.filter((entityType) => {
    const engine = engines.find(
      (e) => e.type === entityType || e.name === entityType || e.id === entityType
    );
    return engine && engine.status !== 'started' && engine.status !== 'error';
  });

  return {
    missingEngines,
    errorEngines,
    notStartedEngines,
    availableEngines: engines.map((e) => ({
      type: e.type,
      name: e.name,
      id: e.id,
      status: e.status,
      error: e.error,
      message: e.message,
    })),
  };
};

/**
 * Updates Kibana advanced settings.
 *
 * @param settings - Dictionary of settings to update in Kibana
 * @returns The response from the Kibana settings API
 */
export const updateKibanaSettings = async (settings: Record<string, unknown>) => {
  const config = getConfig();

  // Use standard API endpoint by default
  let path = KIBANA_SETTINGS_URL;

  // Update to serverless endpoint if needed
  if (config.serverless) {
    path = KIBANA_SETTINGS_INTERNAL_URL;
    console.log('Detected serverless deployment, switching to internal API endpoint.');
  } else {
    console.log('Using standard Kibana settings API endpoint.');
  }

  const payload = {
    changes: settings,
  };

  try {
    const response = await kibanaFetch<{ settings: Record<string, unknown> }>(
      path,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      {
        // Settings API might not use API versioning
        apiVersion: '1',
      }
    );

    console.log('Kibana settings updated successfully.');
    return response;
  } catch (error) {
    console.error('Failed to update Kibana settings:', error);
    throw error;
  }
};

/**
 * Enables the Asset Inventory feature in Kibana.
 * This is required for generic entity types to work.
 */
export const enableAssetInventory = async () => {
  console.log('Enabling Asset Inventory feature...');
  await updateKibanaSettings({
    'securitySolution:enableAssetInventory': true,
  });
  console.log('Asset Inventory feature enabled.');
  // Wait a moment for the setting to take effect
  await new Promise((resolve) => setTimeout(resolve, 5000));
};

export const initEntityEngineForEntityTypes = async (
  entityTypes: string[] = ['host', 'user', 'service', 'generic'],
  space?: string
) => {
  // Enable Asset Inventory if generic entities are requested
  if (entityTypes.includes('generic')) {
    try {
      await enableAssetInventory();
    } catch (error) {
      console.warn('Failed to enable Asset Inventory feature, continuing anyway:', error);
    }
  }

  if (await allRequestedEnginesAreStarted(entityTypes, space)) {
    console.log('All requested engines are already started');
    return;
  }

  console.log(`Initializing engines for types: ${entityTypes.join(', ')}`);
  const initResults = await Promise.allSettled(
    entityTypes.map((entityType) => _initEngine(entityType, space))
  );

  // Log any initialization failures
  initResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Failed to initialize engine for '${entityTypes[index]}':`, result.reason);
    } else {
      console.log(`Successfully initialized engine for '${entityTypes[index]}'`);
    }
  });

  const attempts = 20;
  const delay = 2000;

  for (let i = 0; i < attempts; i++) {
    console.log('Checking if all engines are started attempt:', i + 1);

    // Check for engines in error state during polling
    const statusDetails = await getEngineStatusDetails(entityTypes, space);
    if (statusDetails.errorEngines.length > 0) {
      console.warn(
        `Engines in error state detected: ${statusDetails.errorEngines.join(', ')}. This may indicate a configuration issue.`
      );
      if (statusDetails.errorEngines.includes('generic')) {
        console.warn(
          'Generic engine is in error state. Ensure Asset Inventory feature is enabled in Kibana advanced settings.'
        );
      }
    }

    if (await allRequestedEnginesAreStarted(entityTypes, space)) {
      console.log('All engines are started');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Final check with detailed error message
  const statusDetails = await getEngineStatusDetails(entityTypes, space);
  let errorMessage = 'Failed to start engines.';
  if (statusDetails.missingEngines.length > 0) {
    errorMessage += ` Missing engines: ${statusDetails.missingEngines.join(', ')}.`;
  }
  if (statusDetails.errorEngines.length > 0) {
    errorMessage += ` Engines in error state: ${statusDetails.errorEngines.join(', ')}.`;
    // Log error details for engines in error state
    statusDetails.errorEngines.forEach((entityType) => {
      const engine = statusDetails.availableEngines.find(
        (e) => e.type === entityType || e.name === entityType || e.id === entityType
      );
      if (engine) {
        console.error(
          `Engine '${entityType}' error details:`,
          engine.error || engine.message || 'No error details available'
        );
      }
    });
  }
  if (statusDetails.notStartedEngines.length > 0) {
    errorMessage += ` Engines not started: ${statusDetails.notStartedEngines.join(', ')}.`;
  }
  errorMessage += ` Available engines: ${JSON.stringify(statusDetails.availableEngines)}`;

  throw new Error(errorMessage);
};

export const getAllRules = async (space?: string) => {
  const perPage = 100; // Maximum items per page
  let page = 1;
  let allRules: Array<{ rule_id: string; name: string; id: string }> = [];

  try {
    while (true) {
      const url = DETECTION_ENGINE_RULES_URL + `/_find?page=${page}&per_page=${perPage}`;
      const response = await kibanaFetch<{
        data: Array<{ rule_id: string; name: string; id: string }>;
        total: number;
      }>(
        url,
        {
          method: 'GET',
        },
        { apiVersion: API_VERSIONS.public.v1, space }
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
    { apiVersion: API_VERSIONS.public.v1, space }
  );
};

export const uploadPrivmonCsv = async (
  csvFilePath: string,
  space?: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(csvFilePath));

    const response = await fetch(
      buildKibanaUrl({
        path: '/api/entity_analytics/monitoring/users/_csv',
        space,
      }),
      {
        method: 'POST',
        headers: {
          'kbn-xsrf': 'true',
          'elastic-api-version': API_VERSIONS.public.v1,
          ...formData.getHeaders(),
          Authorization: getAuthorizationHeader(),
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload CSV: ${errorText}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Error uploading CSV:', error);
    // @ts-expect-error to have a message property
    return { success: false, message: error.message };
  }
};

export const enablePrivmon = async (space?: string) => {
  try {
    const response = await kibanaFetch(
      '/api/entity_analytics/monitoring/engine/init',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      { apiVersion: API_VERSIONS.public.v1, space }
    );
    return response;
  } catch (error) {
    console.error('Error enabling Privileged User Monitoring:', error);
    throw error;
  }
};

export const installPad = async (space?: string) => {
  try {
    const response = await kibanaFetch(
      '/api/entity_analytics/privileged_user_monitoring/pad/install',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      { apiVersion: API_VERSIONS.public.v1, space }
    );
    return response;
  } catch (error) {
    console.error('Error installing PAD:', error);
    throw error;
  }
};

export const getPadStatus = async (space?: string) => {
  try {
    const response = await kibanaFetch(
      '/api/entity_analytics/privileged_user_monitoring/pad/status',
      {
        method: 'GET',
      },
      { apiVersion: API_VERSIONS.public.v1, space }
    );
    const status = response as {
      package_installation_status: 'complete' | 'incomplete';
      ml_module_setup_status: 'complete' | 'incomplete';
      jobs: Array<{
        job_id: string;
        description?: string;
        state: 'closing' | 'closed' | 'opened' | 'failed' | 'opening';
      }>;
    };
    return status;
  } catch (error) {
    console.error('Error getting PAD status:', error);
    throw error;
  }
};

export const setupPadMlModule = async (space?: string) => {
  const body = {
    indexPatternName:
      'logs-*,ml_okta_multiple_user_sessions_pad.all,ml_windows_privilege_type_pad.all',
    useDedicatedIndex: false,
    startDatafeed: false,
  };

  try {
    const response = await kibanaFetch(
      `/internal/ml/modules/setup/pad-ml`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      { apiVersion: API_VERSIONS.internal.v1, space }
    );
    return response as {
      datafeeds: Array<{ id: string; success: boolean; error?: string; started: boolean }>;
    };
  } catch (error) {
    console.error('Error setting up ML module:', error);
    throw error;
  }
};

export const forceStartDatafeeds = async (datafeedIds: string[], space?: string) => {
  return kibanaFetch(
    '/internal/ml/jobs/force_start_datafeeds',
    {
      method: 'POST',
      body: JSON.stringify({
        datafeedIds,
        start: Date.now(),
      }),
    },
    { apiVersion: API_VERSIONS.internal.v1, space }
  );
};

export const getDataView = async (dataViewId: string, space?: string) => {
  try {
    return await kibanaFetch(
      `/api/data_views/data_view/${dataViewId}`,
      {
        method: 'GET',
      },
      { apiVersion: API_VERSIONS.public.v1, space }
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    return null;
  }
};

export const createDataView = async (dataview: object, space?: string) => {
  return kibanaFetch(
    '/api/data_views/data_view',
    {
      method: 'POST',
      body: JSON.stringify({ data_view: dataview }),
    },
    { apiVersion: API_VERSIONS.public.v1, space }
  );
};
