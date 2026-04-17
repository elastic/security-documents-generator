// Index names
export const EVENT_INDEX_NAME = 'auditbeat-8.12.0-2024.01.18-000001';
export const AGENT_INDEX_NAME = '.fleet-agents-7';
export const EVENTS_INDEX = 'logs-*';

// Bulk ingest chunk sizes
export const DEFAULT_CHUNK_SIZE = 10_000;
export const SMALL_CHUNK_SIZE = 1_000;

export const ENTITY_STORE_OPTIONS = {
  seed: 'seed',
  criticality: 'criticality',
  riskEngine: 'riskEngine',
  rule: 'rule',
  agent: 'agent',
  apiEnrichment: 'apiEnrichment',
} as const;

export const getEntityStoreIndex = (space: string = 'default') => `entities-latest-${space}`;

export const ENTITY_STORE_INDEX = getEntityStoreIndex();
export const ENTITY_MAINTAINERS_OPTIONS = {
  riskScore: 'riskScore',
  assetCriticality: 'assetCriticality',
  anomalyBehaviors: 'anomalyBehaviors',
  relationships: 'relationships',
  watchlist: 'watchlist',
  snapshot: 'snapshot',
} as const;

export type EntityMaintainerOption =
  (typeof ENTITY_MAINTAINERS_OPTIONS)[keyof typeof ENTITY_MAINTAINERS_OPTIONS];

export type EntityMaintainerConfig = {
  key: EntityMaintainerOption;
  label: string;
  defaultChecked: boolean;
  quickDefault: boolean;
  excludeOnQuick?: boolean;
};

export const ENTITY_MAINTAINERS_CONFIG: EntityMaintainerConfig[] = [
  {
    key: ENTITY_MAINTAINERS_OPTIONS.riskScore,
    label: 'Risk Score',
    defaultChecked: true,
    quickDefault: true,
  },
  {
    key: ENTITY_MAINTAINERS_OPTIONS.assetCriticality,
    label: 'Asset Criticality',
    defaultChecked: true,
    quickDefault: true,
  },
  {
    key: ENTITY_MAINTAINERS_OPTIONS.anomalyBehaviors,
    label: 'Anomaly Behaviors',
    defaultChecked: true,
    quickDefault: true,
  },
  {
    key: ENTITY_MAINTAINERS_OPTIONS.relationships,
    label: 'Relationships',
    defaultChecked: true,
    quickDefault: true,
  },
  {
    key: ENTITY_MAINTAINERS_OPTIONS.watchlist,
    label: 'Watchlist',
    defaultChecked: true,
    quickDefault: true,
    excludeOnQuick: true,
  },
  {
    key: ENTITY_MAINTAINERS_OPTIONS.snapshot,
    label: 'Snapshot (30-day history)',
    defaultChecked: true,
    quickDefault: true,
  },
];

export const PRIVILEGED_USER_MONITORING_OPTIONS = {
  anomalyData: 'anomalyData',
  sourceEventData: 'sourceEventData',
  csvFile: 'csvFile',
  riskEngineAndRule: 'riskEngineAndRule',
  integrationSyncSourceEventData: 'integrationSyncSourceEventData',
  assetCriticality: 'assetCriticality',
  installPad: 'installPad',
  entityStore: 'entityStore',
} as const;

export type PrivilegedUserMonitoringOption = keyof typeof PRIVILEGED_USER_MONITORING_OPTIONS;

export const generateNewSeed = () => {
  return Math.round(Math.random() * 100000);
};

export const API_VERSIONS = {
  public: {
    v1: '2023-10-31',
  },
  internal: {
    v1: '1',
  },
};

export type AssetCriticality =
  | 'low_impact'
  | 'medium_impact'
  | 'high_impact'
  | 'extreme_impact'
  | 'unknown'; // not a valid value for assignment, signifies no criticality assigned

export const ASSET_CRITICALITY: AssetCriticality[] = [
  'low_impact',
  'medium_impact',
  'high_impact',
  'extreme_impact',
  'unknown',
];

// API Endpoint URL's for Kibana
export const RISK_SCORE_URL = '/internal/risk_score';
export const RISK_SCORE_DASHBOARD_URL = (entityType: 'host' | 'user') =>
  `/internal/risk_score/prebuilt_content/saved_objects/_bulk_create/${entityType}RiskScoreDashboards`;
export const RISK_SCORE_SCORES_URL = '/internal/risk_score/scores';
export const RISK_SCORE_ENGINE_INIT_URL = '/internal/risk_score/engine/init';
export const RISK_SCORE_ENGINE_SCHEDULE_NOW_URL = '/internal/risk_score/engine/schedule_now';
export const ASSET_CRITICALITY_URL = '/api/asset_criticality';
export const ASSET_CRITICALITY_BULK_URL = '/api/asset_criticality/bulk';
export const DETECTION_ENGINE_RULES_URL = '/api/detection_engine/rules';
export const DETECTION_ENGINE_RULES_BULK_ACTION_URL = `${DETECTION_ENGINE_RULES_URL}/_bulk_action`;
export const COMPONENT_TEMPLATES_URL = '/api/index_management/component_templates';
/** GET package metadata — path is /packages/{pkgName} only (Kibana Fleet API). */
export const FLEET_EPM_PACKAGES_URL = (packageName: string) =>
  `/api/fleet/epm/packages/${packageName}`;

/** POST install from registry — {pkgVersion} must be a semver (resolve “latest” via GET package first). */
export const FLEET_EPM_INSTALL_PACKAGE_URL = (packageName: string, version: string) =>
  `/api/fleet/epm/packages/${packageName}/${encodeURIComponent(version)}`;
export const SPACES_URL = '/api/spaces/space';
export const SPACE_URL = (space: string) => `/api/spaces/space/${space}`;

export const ENTITY_ENGINES_URL = '/api/entity_store/engines';
export const ENTITY_ENGINE_URL = (engineType: string) => `${ENTITY_ENGINES_URL}/${engineType}`;
export const INIT_ENTITY_ENGINE_URL = (engineType: string) =>
  `${ENTITY_ENGINE_URL(engineType)}/init`;
export const ENTITY_STORE_ENTITIES_URL = (entityType: 'user' | 'host' | 'service') =>
  `/api/security/entity_store/entities/${entityType}`;

// Kibana Settings API endpoints
export const KIBANA_SETTINGS_URL = '/api/kibana/settings';
export const KIBANA_SETTINGS_INTERNAL_URL = '/internal/kibana/settings';

// Entity Store V2 (ESQL) API
export const ENTITY_STORE_V2_INSTALL_URL = '/api/security/entity_store/install';
export const ENTITY_STORE_V2_FORCE_LOG_EXTRACTION_URL = (entityType: 'user' | 'host' | 'service') =>
  `/internal/security/entity_store/${entityType}/force_log_extraction`;
export const ENTITY_STORE_V2_CRUD_BULK_URL = '/api/security/entity_store/entities/bulk';
export const ENTITY_STORE_V2_RESOLUTION_LINK_URL = '/api/security/entity_store/resolution/link';
export const ENTITY_STORE_V2_RESOLUTION_UNLINK_URL = '/api/security/entity_store/resolution/unlink';
export const ENTITY_STORE_V2_RESOLUTION_GROUP_URL = '/api/security/entity_store/resolution/group';
export const ENTITY_MAINTAINERS_INIT_URL =
  '/internal/security/entity_store/entity_maintainers/init';
export const ENTITY_MAINTAINERS_URL = '/internal/security/entity_store/entity_maintainers';
export const ENTITY_MAINTAINERS_RUN_URL = (id: string) =>
  `/internal/security/entity_store/entity_maintainers/run/${id}`;
export const WATCHLISTS_URL = '/api/entity_analytics/watchlists';

// ML module group used by Security
export const ML_GROUP_ID = 'security';

// Lead Generation
export const INFERENCE_CONNECTORS_URL = '/internal/inference/connectors';
export const LEAD_GENERATION_ENABLE_URL = '/internal/entity_analytics/leads/enable';
export const LEAD_GENERATION_GENERATE_URL = '/internal/entity_analytics/leads/generate';
export const LEAD_GENERATION_STATUS_URL = '/internal/entity_analytics/leads/status';
export const LEAD_GENERATION_LIST_URL = '/internal/entity_analytics/leads';
