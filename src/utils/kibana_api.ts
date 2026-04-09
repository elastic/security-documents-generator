import { Agent } from 'undici';
import { getConfig } from '../get_config.ts';
import { log } from './logger.ts';
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
  ENTITY_STORE_ENTITIES_URL,
  ENTITY_STORE_V2_INSTALL_URL,
  ENTITY_STORE_V2_FORCE_LOG_EXTRACTION_URL,
  ENTITY_STORE_V2_RESOLUTION_GROUP_URL,
  ENTITY_STORE_V2_RESOLUTION_LINK_URL,
  ENTITY_STORE_V2_RESOLUTION_UNLINK_URL,
  ENTITY_MAINTAINERS_INIT_URL,
  ENTITY_MAINTAINERS_URL,
  ENTITY_MAINTAINERS_RUN_URL,
  WATCHLISTS_URL,
  ENTITY_STORE_V2_CRUD_BULK_URL,
  ML_GROUP_ID,
} from '../constants.ts';

const ENTITY_STORE_V2_SETTING_KEY = 'securitySolution:entityStoreEnableV2';
const ENTITY_STORE_V2_POLL_TIMEOUT_MS = 60_000;
const ENTITY_STORE_V2_POLL_INTERVAL_MS = 5_000;

let insecureDispatcher: Agent | undefined;

const getDispatcher = () => {
  const config = getConfig();
  if (config.allowSelfSignedCerts) {
    if (!insecureDispatcher) {
      insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
    return insecureDispatcher;
  }
  return undefined;
};

const redactUrl = (urlStr: string): string => {
  try {
    const parsed = new URL(urlStr);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return urlStr;
  }
};

const joinUrl = (...parts: string[]) =>
  parts.map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+/, ''))).join('/');

export const buildKibanaUrl = (opts: { path: string; space?: string }) => {
  const config = getConfig();
  const { path, space } = opts;
  const pathWithSpace = space ? joinUrl(`/s/${space}`, path) : path;
  return joinUrl(config.kibana.node, pathWithSpace);
};

type ResponseError = Error & { statusCode: number; responseData: unknown };
type ErrorWithCause = Error & { cause?: unknown };

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

const formatCauseDetails = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details: string[] = [error.message];
  const causeRecord = error as ErrorWithCause & {
    code?: string;
    errno?: number | string;
    address?: string;
    port?: number;
  };

  if (causeRecord.code) details.push(`code=${causeRecord.code}`);
  if (causeRecord.errno !== undefined) details.push(`errno=${String(causeRecord.errno)}`);
  if (causeRecord.address) details.push(`address=${causeRecord.address}`);
  if (causeRecord.port !== undefined) details.push(`port=${String(causeRecord.port)}`);

  return details.join(', ');
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
  const { ignoreStatuses, apiVersion = '1', space } = opts;
  const url = buildKibanaUrl({ path, space });
  const method = ((params as { method?: string }).method ?? 'GET').toUpperCase();
  const ignoreStatusesArray = Array.isArray(ignoreStatuses) ? ignoreStatuses : [ignoreStatuses];
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  headers.append('kbn-xsrf', 'true');
  headers.append('Authorization', getAuthorizationHeader());

  headers.set('x-elastic-internal-origin', 'kibana');
  headers.set('elastic-api-version', apiVersion);
  let result: Response;
  const safeUrl = redactUrl(url);
  try {
    result = await fetch(url, {
      headers: headers,
      ...params,
      dispatcher: getDispatcher(),
    } as RequestInit);
  } catch (error) {
    const details = formatCauseDetails(error);
    const message = `Network request failed for ${method} ${safeUrl}. Details: ${details}. Check Kibana URL, credentials, and whether Kibana is running.`;
    throw new Error(message, { cause: error });
  }
  const rawResponse = await result.text();
  // log response status
  let data: unknown;
  try {
    data = rawResponse ? JSON.parse(rawResponse) : {};
  } catch {
    data = { message: rawResponse };
  }
  if (!data || typeof data !== 'object') {
    throw new Error(
      `Unexpected non-object response from ${method} ${safeUrl}. Raw response: ${rawResponse.slice(0, 500)}`,
    );
  }

  if (result.status >= 400 && !ignoreStatusesArray.includes(result.status)) {
    throwResponseError(
      `Request failed for ${method} ${safeUrl}, status: ${result.status}`,
      result.status,
      data,
    );
  }
  return data as T;
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

export const scheduleRiskEngineNow = async (space?: string) => {
  return kibanaFetch(
    RISK_SCORE_ENGINE_SCHEDULE_NOW_URL,
    {
      method: 'POST',
      body: JSON.stringify({ runNow: true }),
    },
    { space, apiVersion: API_VERSIONS.public.v1 },
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
        max_signals: 1000,
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
  prerelease = false,
}: {
  packageName: string;
  version?: string;
  space?: string;
  prerelease?: boolean;
}) => {
  let url = FLEET_EPM_PACKAGES_URL(packageName, version);
  if (prerelease) {
    url += '?prerelease=true';
  }

  return kibanaFetch(
    url,
    {
      method: 'POST',
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

export const createAgentPolicy = async ({
  name,
  namespace = 'default',
  space,
}: {
  name: string;
  namespace?: string;
  space?: string;
}): Promise<{ item: { id: string; name: string } }> => {
  // Check if an agent policy with this name already exists
  const escapedName = name.replace(/"/g, '\\"');
  const kuery = encodeURIComponent(`name:"${escapedName}"`);
  const existing = await kibanaFetch<{
    items: Array<{ id: string; name: string }>;
  }>(
    `/api/fleet/agent_policies?kuery=${kuery}`,
    { method: 'GET' },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  if (existing.items.length > 0) {
    return { item: existing.items[0] };
  }

  return kibanaFetch(
    '/api/fleet/agent_policies',
    {
      method: 'POST',
      body: JSON.stringify({ name, namespace }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

export const getPackageInfo = async ({
  packageName,
  space,
}: {
  packageName: string;
  space?: string;
}): Promise<{ item: { name: string; version: string; status: string } }> => {
  return kibanaFetch(
    FLEET_EPM_PACKAGES_URL(packageName),
    { method: 'GET' },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

export const getPackagePolicies = async ({
  packageName,
  space,
}: {
  packageName: string;
  space?: string;
}): Promise<{ items: Array<{ id: string; name: string; package?: { name: string } }> }> => {
  const result = await kibanaFetch<{
    items: Array<{ id: string; name: string; package?: { name: string } }>;
  }>(
    '/api/fleet/package_policies?perPage=1000',
    { method: 'GET' },
    { apiVersion: API_VERSIONS.public.v1, space },
  );

  return {
    items: result.items.filter((p) => p.package?.name === packageName),
  };
};

export const createPackagePolicy = async ({
  name,
  agentPolicyIds,
  packageName,
  packageVersion,
  inputs,
  vars,
  namespace = 'default',
  space,
}: {
  name: string;
  agentPolicyIds: string[];
  packageName: string;
  packageVersion: string;
  inputs: Record<string, unknown>;
  vars?: Record<string, unknown>;
  namespace?: string;
  space?: string;
}): Promise<{ item: { id: string; name: string } }> => {
  return kibanaFetch(
    '/api/fleet/package_policies',
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        namespace,
        policy_ids: agentPolicyIds,
        package: {
          name: packageName,
          version: packageVersion,
        },
        inputs,
        ...(vars && { vars }),
      }),
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
  entityTypes: string[] = ['host', 'user', 'service', 'generic'],
  space?: string,
) => {
  const responses = await Promise.all(
    entityTypes.map((entityType) => _deleteEngine(entityType, space)),
  );
  log.info('Delete responses:', responses);
};

const _listEngines = (space?: string) => {
  const res = kibanaFetch(
    ENTITY_ENGINES_URL,
    {
      method: 'GET',
    },
    { apiVersion: API_VERSIONS.public.v1, space },
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
      (e) => e.type === entityType || e.name === entityType || e.id === entityType,
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
      !engines.find((e) => e.type === entityType || e.name === entityType || e.id === entityType),
  );
  const errorEngines = entityTypes.filter((entityType) => {
    const engine = engines.find(
      (e) => e.type === entityType || e.name === entityType || e.id === entityType,
    );
    return engine && engine.status === 'error';
  });
  const notStartedEngines = entityTypes.filter((entityType) => {
    const engine = engines.find(
      (e) => e.type === entityType || e.name === entityType || e.id === entityType,
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
    log.info('Detected serverless deployment, switching to internal API endpoint.');
  } else {
    log.info('Using standard Kibana settings API endpoint.');
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
        // Advanced Settings API version
        apiVersion: '1',
      },
    );

    log.info('Kibana settings updated successfully.');
    return response;
  } catch (error) {
    log.error('Failed to update Kibana settings:', error);
    throw error;
  }
};

function getEntityStoreV2SpacePath(space?: string): string {
  return !space || space === 'default' ? '' : `/s/${space}`;
}

/**
 * Enables Entity Store V2 feature flag and waits until it is active in Kibana.
 * Uses the same APIs as ecp-synthetics-monitors (settings POST + poll).
 */
export const enableEntityStoreV2 = async (space: string = 'default'): Promise<void> => {
  const spacePath = getEntityStoreV2SpacePath(space);
  const settingsPath = `${spacePath}${KIBANA_SETTINGS_INTERNAL_URL}`;

  await kibanaFetch<{ settings?: Record<string, unknown> }>(
    settingsPath,
    {
      method: 'POST',
      body: JSON.stringify({ changes: { [ENTITY_STORE_V2_SETTING_KEY]: true } }),
    },
    { apiVersion: '1' },
  );
  log.info('Entity Store V2 feature flag posted, waiting for it to be active...');

  const deadline = Date.now() + ENTITY_STORE_V2_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await kibanaFetch<{
      settings?: { [key: string]: { userValue?: unknown } };
    }>(
      `${settingsPath}?query=${encodeURIComponent(ENTITY_STORE_V2_SETTING_KEY)}`,
      { method: 'GET' },
      { apiVersion: '1' },
    );
    if (response?.settings?.[ENTITY_STORE_V2_SETTING_KEY]?.userValue === true) {
      log.info('Entity Store V2 feature flag enabled and active');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ENTITY_STORE_V2_POLL_INTERVAL_MS));
  }
  throw new Error(
    `Entity Store V2 setting did not become active within ${ENTITY_STORE_V2_POLL_TIMEOUT_MS / 1000}s`,
  );
};

/**
 * Installs Entity Store V2 (ESQL-based). Uses the same API as ecp-synthetics-monitors.
 */
export const installEntityStoreV2 = async (space: string = 'default'): Promise<void> => {
  const spacePath = getEntityStoreV2SpacePath(space);
  const installPath = `${spacePath}${ENTITY_STORE_V2_INSTALL_URL}?apiVersion=2`;

  await kibanaFetch(installPath, { method: 'POST', body: JSON.stringify({}) }, { apiVersion: '2' });
  log.info('Entity Store V2 installed successfully');
};

export const forceLogExtraction = async (
  entityType: 'user' | 'host' | 'service',
  {
    fromDateISO,
    toDateISO,
    space = 'default',
  }: { fromDateISO: string; toDateISO: string; space?: string },
) => {
  const spacePath = getEntityStoreV2SpacePath(space);
  const path = `${spacePath}${ENTITY_STORE_V2_FORCE_LOG_EXTRACTION_URL(entityType)}`;
  return kibanaFetch(
    path,
    {
      method: 'POST',
      body: JSON.stringify({ fromDateISO, toDateISO }),
    },
    { apiVersion: '2' },
  );
};

export const initEntityMaintainers = async (space: string = 'default') => {
  const spacePath = getEntityStoreV2SpacePath(space);
  const path = `${spacePath}${ENTITY_MAINTAINERS_INIT_URL}?apiVersion=2`;
  return kibanaFetch(
    path,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    { apiVersion: '2' },
  );
};

export interface EntityMaintainerStatus {
  id: string;
  runs: number;
  taskStatus: string;
}

export const getEntityMaintainers = async (space: string = 'default', ids?: string[]) => {
  const spacePath = getEntityStoreV2SpacePath(space);
  const query = new URLSearchParams();
  query.set('apiVersion', '2');
  if (ids && ids.length > 0) {
    query.set('ids', ids.join(','));
  }
  const path = `${spacePath}${ENTITY_MAINTAINERS_URL}?${query.toString()}`;

  return kibanaFetch<{ maintainers: EntityMaintainerStatus[] }>(
    path,
    { method: 'GET' },
    { apiVersion: '2' },
  );
};

export const runEntityMaintainer = async (maintainerId: string, space: string = 'default') => {
  const spacePath = getEntityStoreV2SpacePath(space);
  const path = `${spacePath}${ENTITY_MAINTAINERS_RUN_URL(maintainerId)}?apiVersion=2`;
  return kibanaFetch(
    path,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    { apiVersion: '2' },
  );
};

export interface ResolutionLinkResponse {
  linked: string[];
  skipped: string[];
  target_id: string;
}

export interface ResolutionUnlinkResponse {
  unlinked: string[];
  skipped: string[];
}

export interface ResolutionGroupResponse {
  target: Record<string, unknown>;
  aliases: Array<Record<string, unknown>>;
  group_size: number;
}

export const linkResolutionEntities = async ({
  targetId,
  entityIds,
  space = 'default',
}: {
  targetId: string;
  entityIds: string[];
  space?: string;
}) => {
  const spacePath = getEntityStoreV2SpacePath(space);
  const path = `${spacePath}${ENTITY_STORE_V2_RESOLUTION_LINK_URL}?apiVersion=2`;
  return kibanaFetch<ResolutionLinkResponse>(
    path,
    {
      method: 'POST',
      body: JSON.stringify({
        target_id: targetId,
        entity_ids: entityIds,
      }),
    },
    { apiVersion: '2' },
  );
};

export const unlinkResolutionEntities = async ({
  entityIds,
  space = 'default',
}: {
  entityIds: string[];
  space?: string;
}) => {
  const spacePath = getEntityStoreV2SpacePath(space);
  const path = `${spacePath}${ENTITY_STORE_V2_RESOLUTION_UNLINK_URL}?apiVersion=2`;
  return kibanaFetch<ResolutionUnlinkResponse>(
    path,
    {
      method: 'POST',
      body: JSON.stringify({
        entity_ids: entityIds,
      }),
    },
    { apiVersion: '2' },
  );
};

export const getResolutionGroup = async ({
  entityId,
  space = 'default',
}: {
  entityId: string;
  space?: string;
}) => {
  const spacePath = getEntityStoreV2SpacePath(space);
  const query = new URLSearchParams();
  query.set('apiVersion', '2');
  query.set('entity_id', entityId);
  const path = `${spacePath}${ENTITY_STORE_V2_RESOLUTION_GROUP_URL}?${query.toString()}`;
  return kibanaFetch<ResolutionGroupResponse>(path, { method: 'GET' }, { apiVersion: '2' });
};

export const createWatchlist = async ({
  name,
  riskModifier,
  space = 'default',
}: {
  name: string;
  riskModifier: number;
  space?: string;
}) => {
  return kibanaFetch<{ id: string; name: string }>(
    WATCHLISTS_URL,
    {
      method: 'POST',
      body: JSON.stringify({ name, riskModifier }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

export const forceBulkUpdateEntitiesViaCrud = async ({
  entities,
  space = 'default',
}: {
  entities: Array<{
    type: 'user' | 'host' | 'service';
    doc: Record<string, unknown>;
  }>;
  space?: string;
}) => {
  const spacePath = getEntityStoreV2SpacePath(space);
  const path = `${spacePath}${ENTITY_STORE_V2_CRUD_BULK_URL}?apiVersion=2&force=true`;
  return kibanaFetch<{ ok: boolean; errors?: unknown[] }>(
    path,
    {
      method: 'PUT',
      body: JSON.stringify({ entities }),
    },
    { apiVersion: '2' },
  );
};

/**
 * Enables the Asset Inventory feature in Kibana.
 * This is required for generic entity types to work.
 */
export const enableAssetInventory = async () => {
  log.info('Enabling Asset Inventory feature...');
  await updateKibanaSettings({
    'securitySolution:enableAssetInventory': true,
  });
  log.info('Asset Inventory feature enabled.');
  // Wait a moment for the setting to take effect
  await new Promise((resolve) => setTimeout(resolve, 5000));
};

export const initEntityEngineForEntityTypes = async (
  entityTypes: string[] = ['host', 'user', 'service', 'generic'],
  space?: string,
) => {
  // Enable Asset Inventory if generic entities are requested
  if (entityTypes.includes('generic')) {
    try {
      await enableAssetInventory();
    } catch (error) {
      log.warn('Failed to enable Asset Inventory feature, continuing anyway:', error);
    }
  }

  if (await allRequestedEnginesAreStarted(entityTypes, space)) {
    log.info('All requested engines are already started');
    return;
  }

  log.info(`Initializing engines for types: ${entityTypes.join(', ')}`);
  const initResults = await Promise.allSettled(
    entityTypes.map((entityType) => _initEngine(entityType, space)),
  );

  // Log any initialization failures
  initResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      log.error(`Failed to initialize engine for '${entityTypes[index]}':`, result.reason);
    } else {
      log.info(`Successfully initialized engine for '${entityTypes[index]}'`);
    }
  });

  const attempts = 20;
  const delay = 2000;

  for (let i = 0; i < attempts; i++) {
    log.info('Checking if all engines are started attempt:', i + 1);

    // Check for engines in error state during polling
    const statusDetails = await getEngineStatusDetails(entityTypes, space);
    if (statusDetails.errorEngines.length > 0) {
      log.warn(
        `Engines in error state detected: ${statusDetails.errorEngines.join(', ')}. This may indicate a configuration issue.`,
      );
      if (statusDetails.errorEngines.includes('generic')) {
        log.warn(
          'Generic engine is in error state. Ensure Asset Inventory feature is enabled in Kibana advanced settings.',
        );
      }
    }

    if (await allRequestedEnginesAreStarted(entityTypes, space)) {
      log.info('All engines are started');
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
        (e) => e.type === entityType || e.name === entityType || e.id === entityType,
      );
      if (engine) {
        log.error(
          `Engine '${entityType}' error details:`,
          engine.error || engine.message || 'No error details available',
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
    log.error('Error fetching rules:', e);
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

export const uploadPrivmonCsv = async (
  csvFilePath: string,
  space?: string,
): Promise<{ success: boolean; message?: string }> => {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(csvFilePath));

    const uploadUrl = buildKibanaUrl({
      path: '/api/entity_analytics/monitoring/users/_csv',
      space,
    });
    const safeUploadUrl = redactUrl(uploadUrl);
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'kbn-xsrf': 'true',
        'elastic-api-version': API_VERSIONS.public.v1,
        ...formData.getHeaders(),
        Authorization: getAuthorizationHeader(),
      },
      body: formData as unknown as BodyInit,
      dispatcher: getDispatcher(),
    } as RequestInit);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload CSV to ${safeUploadUrl}: ${errorText}`);
    }

    return { success: true };
  } catch (error) {
    log.error('Error uploading CSV:', error);
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
      { apiVersion: API_VERSIONS.public.v1, space },
    );
    return response;
  } catch (error) {
    log.error('Error enabling Privileged User Monitoring:', error);
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
      { apiVersion: API_VERSIONS.public.v1, space },
    );
    return response;
  } catch (error) {
    log.error('Error installing PAD:', error);
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
      { apiVersion: API_VERSIONS.public.v1, space },
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
    log.error('Error getting PAD status:', error);
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
      { apiVersion: API_VERSIONS.internal.v1, space },
    );
    return response as {
      datafeeds: Array<{ id: string; success: boolean; error?: string; started: boolean }>;
    };
  } catch (error) {
    log.error('Error setting up ML module:', error);
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
    { apiVersion: API_VERSIONS.internal.v1, space },
  );
};

export const getMlJobsSummary = async (jobIds: string[], space?: string) => {
  return kibanaFetch(
    '/internal/ml/jobs/jobs_summary',
    {
      method: 'POST',
      body: JSON.stringify({ jobIds }),
    },
    { apiVersion: API_VERSIONS.internal.v1, space },
  );
};

export const setupMlModule = async (
  moduleId: string,
  indexPatternName: string,
  space?: string,
): Promise<{ jobs?: Array<{ id: string; success: boolean; error?: { status: number } }> }> => {
  return kibanaFetch(
    `/internal/ml/modules/setup/${moduleId}`,
    {
      method: 'POST',
      body: JSON.stringify({
        prefix: '',
        groups: [ML_GROUP_ID],
        indexPatternName,
        startDatafeed: false,
        useDedicatedIndex: true,
        applyToAllSpaces: true,
      }),
    },
    { apiVersion: API_VERSIONS.internal.v1, space },
  );
};

export const installIntegrationAndCreatePolicy = async (
  integrationName: string,
  space?: string,
): Promise<{ agentPolicyId: string; packagePolicyId: string }> => {
  await installPackage({ packageName: integrationName, space });
  const pkg = await getPackageInfo({ packageName: integrationName, space });
  const packageName = pkg.item.name;
  const packageVersion = pkg.item.version;

  const agentPolicy = await createAgentPolicy({
    name: `Test agent policy ${faker.string.uuid()}`,
    namespace: space ?? 'default',
    space,
  });
  const agentPolicyId = agentPolicy.item.id;

  const packagePolicy = await createPackagePolicy({
    name: `Test package policy ${faker.string.uuid()}`,
    agentPolicyIds: [agentPolicyId],
    packageName,
    packageVersion,
    namespace: space ?? 'default',
    inputs: {},
    space,
  });

  return {
    agentPolicyId,
    packagePolicyId: packagePolicy.item.id,
  };
};

export const getDataView = async (dataViewId: string, space?: string) => {
  try {
    return await kibanaFetch(
      `/api/data_views/data_view/${dataViewId}`,
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

export const createDataView = async (dataview: object, space?: string) => {
  return kibanaFetch(
    '/api/data_views/data_view',
    {
      method: 'POST',
      body: JSON.stringify({ data_view: dataview }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

export const createAlertsIndex = async (space?: string) => {
  return kibanaFetch(
    '/api/detection_engine/index',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

// Entity Store enrichment types and functions
export interface EntityEnrichment {
  id: string;
  behaviors?: {
    brute_force_victim?: boolean;
    new_country_login?: boolean;
    used_usb_device?: boolean;
    anomaly_job_ids?: string[];
    rule_names?: string[];
  };
  attributes?: {
    asset?: boolean;
    managed?: boolean;
    mfa_enabled?: boolean;
    privileged?: boolean;
  };
  lifecycle?: {
    first_seen?: string;
    last_activity?: string;
  };
  relationships?: Record<string, string[]>;
}

export const enrichEntityViaApi = async (
  entityType: 'user' | 'host',
  enrichment: EntityEnrichment,
  space?: string,
) => {
  return kibanaFetch(
    ENTITY_STORE_ENTITIES_URL(entityType) + '?force=true',
    {
      method: 'PUT',
      body: JSON.stringify({ entity: enrichment }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};
