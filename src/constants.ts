// ============================================================================
// Entity Store
// ============================================================================

export const ENTITY_STORE_OPTIONS = {
  seed: 'seed',
  criticality: 'criticality',
  riskEngine: 'riskEngine',
  rule: 'rule',
  agent: 'agent',
  apiEnrichment: 'apiEnrichment',
} as const;

// ============================================================================
// Privileged User Monitoring
// ============================================================================

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

// ============================================================================
// Asset Criticality
// ============================================================================

export type AssetCriticality =
  | 'low_impact'
  | 'medium_impact'
  | 'high_impact'
  | 'extreme_impact'
  | 'unknown'; // Not a valid value for assignment, signifies no criticality assigned

export const ASSET_CRITICALITY: AssetCriticality[] = [
  'low_impact',
  'medium_impact',
  'high_impact',
  'extreme_impact',
  'unknown',
];

// ============================================================================
// API Versions
// ============================================================================

export const API_VERSIONS = {
  public: {
    v1: '2023-10-31',
  },
  internal: {
    v1: '1',
  },
};

// ============================================================================
// API Endpoints - Risk Score
// ============================================================================

export const RISK_SCORE_URL = '/internal/risk_score';
export const RISK_SCORE_DASHBOARD_URL = (entityType: 'host' | 'user') =>
  `/internal/risk_score/prebuilt_content/saved_objects/_bulk_create/${entityType}RiskScoreDashboards`;
export const RISK_SCORE_SCORES_URL = '/internal/risk_score/scores';
export const RISK_SCORE_ENGINE_INIT_URL = '/internal/risk_score/engine/init';
export const RISK_SCORE_ENGINE_SCHEDULE_NOW_URL = '/internal/risk_score/engine/schedule_now';

// ============================================================================
// API Endpoints - Asset Criticality
// ============================================================================

export const ASSET_CRITICALITY_URL = '/api/asset_criticality';
export const ASSET_CRITICALITY_BULK_URL = '/api/asset_criticality/bulk';

// ============================================================================
// API Endpoints - Detection Engine
// ============================================================================

export const DETECTION_ENGINE_RULES_URL = '/api/detection_engine/rules';
export const DETECTION_ENGINE_RULES_BULK_ACTION_URL = `${DETECTION_ENGINE_RULES_URL}/_bulk_action`;

// ============================================================================
// API Endpoints - Entity Store
// ============================================================================

export const ENTITY_ENGINES_URL = '/api/entity_store/engines';
export const ENTITY_ENGINE_URL = (engineType: string) => `${ENTITY_ENGINES_URL}/${engineType}`;
export const INIT_ENTITY_ENGINE_URL = (engineType: string) =>
  `${ENTITY_ENGINE_URL(engineType)}/init`;
export const ENTITY_STORE_ENTITIES_URL = (entityType: 'user' | 'host') =>
  `/api/entity_store/entities/${entityType}`;

// ============================================================================
// API Endpoints - Fleet
// ============================================================================

export const FLEET_EPM_PACKAGES_URL = (packageName: string, version: string = 'latest') => {
  let url = `/api/fleet/epm/packages/${packageName}`;
  if (version !== 'latest') {
    url = `${url}/${version}`;
  }
  return url;
};

// ============================================================================
// API Endpoints - Index Management
// ============================================================================

export const COMPONENT_TEMPLATES_URL = '/api/index_management/component_templates';

// ============================================================================
// API Endpoints - Spaces
// ============================================================================

export const SPACES_URL = '/api/spaces/space';
export const SPACE_URL = (space: string) => `/api/spaces/space/${space}`;

// ============================================================================
// API Endpoints - Kibana Settings
// ============================================================================

export const KIBANA_SETTINGS_URL = '/api/kibana/settings';
export const KIBANA_SETTINGS_INTERNAL_URL = '/internal/kibana/settings';

// ============================================================================
// Utility Functions
// ============================================================================

export const generateNewSeed = () => {
  return Math.round(Math.random() * 100000);
};
