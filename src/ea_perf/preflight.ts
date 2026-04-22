import { API_VERSIONS, INFERENCE_CONNECTORS_URL } from '../constants.ts';
import {
  enableEntityStoreV2,
  getDataView,
  getEntityMaintainers,
  initEntityMaintainers,
  installEntityStoreV2,
  kibanaFetch,
} from '../utils/kibana_api.ts';
import { applyEnvFileToProcess } from '../utils/env_file.ts';
import { discoverLogIndex, esRequest, getEsClientConfig } from '../utils/es_client.ts';
import { resolveLeadGenerationConnector } from './lead_generation.ts';

type CheckStatus = 'pass' | 'fail' | 'warning';

export interface EaPerfPreflightOptions {
  envPath?: string;
  fix?: boolean;
  space?: string;
  leadConnectorId?: string;
  watchlistSourceIndex?: string;
  watchlistIdentifierField?: string;
}

export interface PreflightCheckResult {
  id: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
  fixed?: boolean;
}

export interface EaPerfPreflightResult {
  ok: boolean;
  fixMode: boolean;
  startedAt: string;
  completedAt: string;
  checks: PreflightCheckResult[];
  summary: {
    pass: number;
    fail: number;
    warning: number;
  };
}

const ENTITY_STORE_V2_SETTING_KEY = 'securitySolution:entityStoreEnableV2';

const statusPrefix = (status: CheckStatus): string => {
  if (status === 'pass') return '[PASS]';
  if (status === 'warning') return '[WARN]';
  return '[FAIL]';
};

const parseBooleanSetting = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
};

const getEntityStoreV2Setting = async (space: string): Promise<boolean> => {
  const spacePath = space === 'default' ? '' : `/s/${space}`;
  const response = await kibanaFetch<{
    settings?: Record<string, { userValue?: unknown; value?: unknown }>;
  }>(
    `${spacePath}/internal/kibana/settings?query=${encodeURIComponent(ENTITY_STORE_V2_SETTING_KEY)}`,
    { method: 'GET' },
    { omitApiVersion: true },
  );
  const setting = response.settings?.[ENTITY_STORE_V2_SETTING_KEY];
  return parseBooleanSetting(setting?.userValue ?? setting?.value);
};

const verifyWatchlistMapping = (
  mapping: Record<string, unknown>,
  identifierField: string,
): { ok: boolean; reason: string } => {
  const segments = identifierField.split('.');
  let cursor: unknown = mapping;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object') {
      return { ok: false, reason: `identifier field "${identifierField}" is missing in mapping` };
    }
    const properties = (cursor as { properties?: Record<string, unknown> }).properties;
    if (!properties || !(segment in properties)) {
      return { ok: false, reason: `identifier field "${identifierField}" is missing in mapping` };
    }
    cursor = properties[segment];
  }

  if (!cursor || typeof cursor !== 'object') {
    return { ok: false, reason: `identifier field "${identifierField}" mapping is malformed` };
  }
  const node = cursor as { type?: string; fields?: Record<string, { type?: string }> };
  const fieldType = node.type;
  if (fieldType === 'keyword' || fieldType === 'constant_keyword' || fieldType === 'wildcard') {
    return { ok: true, reason: `identifier field type is ${fieldType}` };
  }
  if (fieldType === 'text' && node.fields?.keyword?.type === 'keyword') {
    return { ok: true, reason: 'identifier field has text+keyword multi-field mapping' };
  }
  return {
    ok: false,
    reason: `identifier field "${identifierField}" has unsupported type "${fieldType ?? 'unknown'}"`,
  };
};

export const runEaPerfPreflight = async (
  options: EaPerfPreflightOptions,
): Promise<EaPerfPreflightResult> => {
  if (options.envPath) {
    applyEnvFileToProcess(options.envPath);
  }

  const fixMode = options.fix === true;
  const space = options.space ?? 'default';
  const watchlistSourceIndex = options.watchlistSourceIndex ?? 'perf-watchlist-source';
  const watchlistIdentifierField = options.watchlistIdentifierField ?? 'user.name';
  const startedAt = new Date().toISOString();
  const checks: PreflightCheckResult[] = [];
  const es = getEsClientConfig({});

  const addCheck = (result: PreflightCheckResult): void => {
    checks.push(result);
    process.stdout.write(`${statusPrefix(result.status)} ${result.id}: ${result.message}\n`);
  };

  try {
    await kibanaFetch('/api/status', { method: 'GET' }, { omitApiVersion: true });
    addCheck({ id: 'kibana_reachable', status: 'pass', message: 'Kibana API is reachable' });
  } catch (error) {
    addCheck({
      id: 'kibana_reachable',
      status: 'fail',
      message: 'Kibana API is not reachable',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  try {
    await esRequest(es, '/');
    addCheck({
      id: 'elasticsearch_reachable',
      status: 'pass',
      message: 'Elasticsearch is reachable',
    });
  } catch (error) {
    addCheck({
      id: 'elasticsearch_reachable',
      status: 'fail',
      message: 'Elasticsearch is not reachable',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  const dataViewId = `security-solution-${space}`;
  const dataView = await getDataView(dataViewId, space);
  if (dataView) {
    addCheck({
      id: 'security_default_data_view',
      status: 'pass',
      message: `Data view ${dataViewId} exists`,
    });
  } else if (fixMode) {
    await kibanaFetch(
      '/api/data_views/data_view',
      {
        method: 'POST',
        body: JSON.stringify({
          data_view: {
            id: dataViewId,
            title: `.alerts-security.alerts-${space},apm-*-transaction*,auditbeat-*,endgame-*,filebeat-*,logs-*,packetbeat-*,traces-apm*,winlogbeat-*,-*elastic-cloud-logs-*`,
            timeFieldName: '@timestamp',
            allowNoIndex: true,
            name: `Security solution ${space}`,
          },
        }),
      },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
    addCheck({
      id: 'security_default_data_view',
      status: 'pass',
      message: `Data view ${dataViewId} created`,
      fixed: true,
    });
  } else {
    addCheck({
      id: 'security_default_data_view',
      status: 'fail',
      message: `Data view ${dataViewId} is missing`,
    });
  }

  let settingEnabled = false;
  try {
    settingEnabled = await getEntityStoreV2Setting(space);
  } catch (error) {
    addCheck({
      id: 'entity_store_v2_setting',
      status: 'fail',
      message: 'Unable to read entity store V2 setting',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }
  const settingInitiallyEnabled = settingEnabled;
  if (!settingEnabled && fixMode) {
    await enableEntityStoreV2(space);
    settingEnabled = await getEntityStoreV2Setting(space);
  }
  if (settingEnabled) {
    addCheck({
      id: 'entity_store_v2_setting',
      status: 'pass',
      message: 'Entity store V2 advanced setting is enabled',
      fixed: fixMode && !settingInitiallyEnabled && settingEnabled,
    });
  } else if (!checks.some((c) => c.id === 'entity_store_v2_setting')) {
    addCheck({
      id: 'entity_store_v2_setting',
      status: 'fail',
      message: 'Entity store V2 advanced setting is disabled',
    });
  }

  let maintainersUsable = false; // eslint-disable-line no-useless-assignment
  try {
    await getEntityMaintainers(space);
    maintainersUsable = true;
  } catch {
    maintainersUsable = false;
  }
  let entityStoreFixed = false;
  if (!maintainersUsable && fixMode) {
    await installEntityStoreV2(space);
    await initEntityMaintainers(space);
    await getEntityMaintainers(space);
    maintainersUsable = true;
    entityStoreFixed = true;
  }
  addCheck({
    id: 'entity_store_usable',
    status: maintainersUsable ? 'pass' : 'fail',
    message: maintainersUsable
      ? 'Entity store install/init/enable state is usable'
      : 'Entity store maintainers are not reachable',
    fixed: entityStoreFixed,
  });

  try {
    const logIndex = await discoverLogIndex(es);
    await esRequest<{ count?: number }>(es, `/${encodeURIComponent(logIndex)}/_count`, {
      method: 'POST',
      body: { query: { match_all: {} } },
    });
    const cloudLogsQueryable = logIndex.includes('elastic-cloud-logs');
    addCheck({
      id: 'deployment_logging_queryable',
      status: cloudLogsQueryable ? 'pass' : 'warning',
      message: cloudLogsQueryable
        ? `Deployment logging is queryable via ${logIndex}`
        : `Log index is queryable (${logIndex}) but elastic-cloud-logs-* is not available`,
      details: { discoveredLogIndex: logIndex },
    });
  } catch (error) {
    addCheck({
      id: 'deployment_logging_queryable',
      status: 'fail',
      message: 'Unable to query deployment log index',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  try {
    const connectors = await kibanaFetch<{
      connectors?: Array<{ connectorId: string; name: string }>;
    }>(INFERENCE_CONNECTORS_URL, { method: 'GET' }, {});
    const allConnectors = connectors.connectors ?? [];
    if (options.leadConnectorId) {
      let found:
        | {
            connectorId: string;
            name: string;
          }
        | undefined;
      try {
        found = await resolveLeadGenerationConnector(options.leadConnectorId, space);
      } catch {
        found = undefined;
      }
      addCheck({
        id: 'lead_generation_connector',
        status: found ? 'pass' : 'fail',
        message: found
          ? `Configured connector ${options.leadConnectorId} is available (matched ${found.connectorId})`
          : `Configured connector ${options.leadConnectorId} is not discoverable`,
      });
    } else {
      addCheck({
        id: 'lead_generation_connector',
        status: allConnectors.length > 0 ? 'pass' : 'warning',
        message:
          allConnectors.length > 0
            ? `Found ${allConnectors.length} inference connector(s)`
            : 'No inference connectors found',
      });
    }
  } catch (error) {
    addCheck({
      id: 'lead_generation_connector',
      status: 'fail',
      message: 'Unable to list inference connectors',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  try {
    const mappingResponse = await esRequest<Record<string, unknown>>(
      es,
      `/${encodeURIComponent(watchlistSourceIndex)}/_mapping`,
    );
    const indexMapping = mappingResponse[watchlistSourceIndex] as
      | { mappings?: Record<string, unknown> }
      | undefined;
    const mapping = indexMapping?.mappings;
    if (!mapping) {
      addCheck({
        id: 'watchlist_source_mapping',
        status: 'fail',
        message: `Watchlist source index ${watchlistSourceIndex} exists but mappings were not returned`,
      });
    } else {
      const verification = verifyWatchlistMapping(mapping, watchlistIdentifierField);
      addCheck({
        id: 'watchlist_source_mapping',
        status: verification.ok ? 'pass' : 'fail',
        message: verification.ok
          ? `Watchlist source mapping is valid (${verification.reason})`
          : verification.reason,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status: CheckStatus = message.includes('index_not_found_exception') ? 'warning' : 'fail';
    addCheck({
      id: 'watchlist_source_mapping',
      status,
      message:
        status === 'warning'
          ? `Watchlist source index ${watchlistSourceIndex} does not exist yet`
          : `Unable to verify watchlist source index mapping for ${watchlistSourceIndex}`,
      details: { error: message },
    });
  }

  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    warning: checks.filter((c) => c.status === 'warning').length,
  };
  const result: EaPerfPreflightResult = {
    ok: summary.fail === 0,
    fixMode,
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    summary,
  };
  return result;
};
