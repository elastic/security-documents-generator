/**
 * Integration Registry
 * Central registry for all available security integrations
 */

import {
  BaseIntegration,
  IntegrationRegistry,
  IntegrationResult,
  IntegrationDocument,
  DataStreamConfig,
  createEmptyCorrelationMap,
} from './base_integration';
import { OktaIntegration } from './okta_integration';
import { CloudAssetIntegration } from './cloud_asset_integration';
import { OktaSystemIntegration } from './okta_system_integration';
import { CloudTrailIntegration } from './cloudtrail_integration';
import { EntraIdIntegration } from './entra_id_integration';
import { CrowdStrikeIntegration } from './crowdstrike_integration';
import { O365Integration } from './o365_integration';
import { GitHubIntegration } from './github_integration';
import { CiscoDuoIntegration } from './cisco_duo_integration';
import { OnePasswordIntegration } from './onepassword_integration';
import { GoogleWorkspaceIntegration } from './google_workspace_integration';
import { CloudflareLogpushIntegration } from './cloudflare_logpush_integration';
import { ZscalerZiaIntegration } from './zscaler_zia_integration';
import { TiAbusechIntegration } from './ti_abusech_integration';
import { JamfProIntegration } from './jamf_pro_integration';
import { ActiveDirectoryIntegration } from './active_directory_integration';
import { ServiceNowIntegration } from './servicenow_integration';
import { SlackIntegration } from './slack_integration';
import { SailPointIntegration } from './sailpoint_integration';
import { PingOneIntegration } from './ping_one_integration';
import { WorkdayIntegration } from './workday_integration';
import { PingDirectoryIntegration } from './ping_directory_integration';
import { SystemIntegration } from './system_integration';
import { IntegrationName } from '../types';

// Re-export types and classes from base_integration
export type { IntegrationRegistry, IntegrationResult, IntegrationDocument, DataStreamConfig };
export { BaseIntegration, createEmptyCorrelationMap };
export { OktaIntegration } from './okta_integration';
export { CloudAssetIntegration } from './cloud_asset_integration';
export { OktaSystemIntegration } from './okta_system_integration';
export { CloudTrailIntegration } from './cloudtrail_integration';
export { EntraIdIntegration } from './entra_id_integration';
export { CrowdStrikeIntegration } from './crowdstrike_integration';
export { O365Integration } from './o365_integration';
export { GitHubIntegration } from './github_integration';
export { CiscoDuoIntegration } from './cisco_duo_integration';
export { OnePasswordIntegration } from './onepassword_integration';
export { GoogleWorkspaceIntegration } from './google_workspace_integration';
export { CloudflareLogpushIntegration } from './cloudflare_logpush_integration';
export { ZscalerZiaIntegration } from './zscaler_zia_integration';
export { TiAbusechIntegration } from './ti_abusech_integration';
export { JamfProIntegration } from './jamf_pro_integration';
export { ActiveDirectoryIntegration } from './active_directory_integration';
export { ServiceNowIntegration } from './servicenow_integration';
export { SlackIntegration } from './slack_integration';
export { SailPointIntegration } from './sailpoint_integration';
export { PingOneIntegration } from './ping_one_integration';
export { WorkdayIntegration } from './workday_integration';
export { PingDirectoryIntegration } from './ping_directory_integration';
export { SystemIntegration } from './system_integration';

/**
 * Create integration registry with all available integrations
 */
export const createIntegrationRegistry = (): IntegrationRegistry => {
  const registry: IntegrationRegistry = new Map();

  // Register entity/asset integrations
  registry.set('okta', new OktaIntegration());
  registry.set('cloud_asset', new CloudAssetIntegration());
  registry.set('entra_id', new EntraIdIntegration());

  // Register log integrations
  registry.set('okta_system', new OktaSystemIntegration());
  registry.set('cloudtrail', new CloudTrailIntegration());

  // Register new integrations
  registry.set('crowdstrike', new CrowdStrikeIntegration());
  registry.set('o365', new O365Integration());
  registry.set('github', new GitHubIntegration());
  registry.set('cisco_duo', new CiscoDuoIntegration());
  registry.set('1password', new OnePasswordIntegration());
  registry.set('google_workspace', new GoogleWorkspaceIntegration());
  registry.set('cloudflare_logpush', new CloudflareLogpushIntegration());
  registry.set('zscaler_zia', new ZscalerZiaIntegration());
  registry.set('ti_abusech', new TiAbusechIntegration());

  // Register Entity Analytics / MDM integrations
  registry.set('jamf_pro', new JamfProIntegration());
  registry.set('active_directory', new ActiveDirectoryIntegration());

  // Register ITSM, collaboration, and identity governance integrations
  registry.set('servicenow', new ServiceNowIntegration());
  registry.set('slack', new SlackIntegration());
  registry.set('sailpoint', new SailPointIntegration());
  registry.set('ping_one', new PingOneIntegration());

  // Register custom integrations (no Fleet package)
  registry.set('workday', new WorkdayIntegration());
  registry.set('ping_directory', new PingDirectoryIntegration());

  // Register system log integrations
  registry.set('system', new SystemIntegration());

  return registry;
};

/**
 * Get integration by name
 */
export const getIntegration = (
  registry: IntegrationRegistry,
  name: IntegrationName
): BaseIntegration | undefined => {
  return registry.get(name);
};

/**
 * Get all available integration names
 */
export const getAvailableIntegrations = (): IntegrationName[] => {
  return [
    'okta',
    'cloud_asset',
    'okta_system',
    'cloudtrail',
    'entra_id',
    'crowdstrike',
    'o365',
    'github',
    'cisco_duo',
    '1password',
    'google_workspace',
    'cloudflare_logpush',
    'zscaler_zia',
    'ti_abusech',
    'jamf_pro',
    'active_directory',
    'servicenow',
    'slack',
    'sailpoint',
    'ping_one',
    'workday',
    'ping_directory',
    'system',
  ];
};

/**
 * Parse comma-separated integration list
 */
export const parseIntegrationList = (list: string): IntegrationName[] => {
  const available = getAvailableIntegrations();
  const requested = list.split(',').map((s) => s.trim() as IntegrationName);
  return requested.filter((name) => available.includes(name));
};
