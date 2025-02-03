export const ENTITY_STORE_OPTIONS = {
  seed: 'seed',
  criticality: 'criticality',
  riskEngine: 'riskEngine',
  rule: 'rule',
  agent: 'agent',
};

export const generateNewSeed = () => {
  return Math.round(Math.random() * 100000);
}

// API Endpoint URL's for Kibana
export const RISK_SCORE_URL = '/internal/risk_score';
export const RISK_SCORE_DASHBOARD_URL = (entityType: 'host' | 'user') => `/internal/risk_score/prebuilt_content/saved_objects/_bulk_create/${entityType}RiskScoreDashboards`;
export const RISK_SCORE_SCORES_URL = '/internal/risk_score/scores';
export const RISK_SCORE_ENGINE_INIT_URL = '/internal/risk_score/engine/init';
export const ASSET_CRITICALITY_URL = '/api/asset_criticality';
export const DETECTION_ENGINE_RULES_URL = (space?: string) => space ? `/s/${space}/api/detection_engine/rules` : '/api/detection_engine/rules';
export const COMPONENT_TEMPLATES_URL = (space?: string) => space ? `/s/${space}/api/index_management/component_templates` : '/api/index_management/component_templates';
export const FLEET_EPM_PACKAGES_URL = (packageName: string, version: string = 'latest', space?: string) => {
  let url = space ? `/s/${space}/api/fleet/epm/packages/${packageName}` : `/api/fleet/epm/packages/${packageName}`;
  if (version !== 'latest') {
    url = `${url}/${version}`;
  }
  return url;
};
export const SPACES_URL = '/api/spaces/space';
export const SPACE_URL = (space: string) => `/api/spaces/space/${space}`;