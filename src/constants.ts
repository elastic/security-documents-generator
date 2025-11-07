export const ENTITY_STORE_OPTIONS = {
  seed: 'seed',
  criticality: 'criticality',
  riskEngine: 'riskEngine',
  rule: 'rule',
  agent: 'agent',
} as const;

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
export const FLEET_EPM_PACKAGES_URL = (packageName: string, version: string = 'latest') => {
  let url = `/api/fleet/epm/packages/${packageName}`;
  if (version !== 'latest') {
    url = `${url}/${version}`;
  }
  return url;
};
export const SPACES_URL = '/api/spaces/space';
export const SPACE_URL = (space: string) => `/api/spaces/space/${space}`;

export const ENTITY_ENGINES_URL = '/api/entity_store/engines';
export const ENTITY_ENGINE_URL = (engineType: string) => `${ENTITY_ENGINES_URL}/${engineType}`;
export const INIT_ENTITY_ENGINE_URL = (engineType: string) =>
  `${ENTITY_ENGINE_URL(engineType)}/init`;

export const ENTITY_CRUD_URL = '/api/entity_store/entities';
export const ENTITY_CRUD_URL_WITH_TYPE = (entityType: string) =>
  `${ENTITY_CRUD_URL}/${entityType}?force=true`;

export const ENTITY_LIST_URL = `${ENTITY_CRUD_URL}/list`;
