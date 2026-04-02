/**
 * Integration Registry
 * Central registry for all available security integrations
 */

import {
  BaseIntegration,
  type IntegrationRegistry,
  type IntegrationResult,
  type IntegrationDocument,
  type DataStreamConfig,
  createEmptyCorrelationMap,
} from './base_integration.ts';
import { OktaIntegration } from './okta_integration.ts';
import { CloudAssetIntegration } from './cloud_asset_integration.ts';
import { OktaSystemIntegration } from './okta_system_integration.ts';
import { CloudTrailIntegration } from './cloudtrail_integration.ts';
import { EntraIdIntegration } from './entra_id_integration.ts';
import { CrowdStrikeIntegration } from './crowdstrike_integration.ts';
import { O365Integration } from './o365_integration.ts';
import { GitHubIntegration } from './github_integration.ts';
import { CiscoDuoIntegration } from './cisco_duo_integration.ts';
import { OnePasswordIntegration } from './onepassword_integration.ts';
import { GoogleWorkspaceIntegration } from './google_workspace_integration.ts';
import { CloudflareLogpushIntegration } from './cloudflare_logpush_integration.ts';
import { ZscalerZiaIntegration } from './zscaler_zia_integration.ts';
import { TiAbusechIntegration } from './ti_abusech_integration.ts';
import { JamfProIntegration } from './jamf_pro_integration.ts';
import { ActiveDirectoryIntegration } from './active_directory_integration.ts';
import { ServiceNowIntegration } from './servicenow_integration.ts';
import { SlackIntegration } from './slack_integration.ts';
import { SailPointIntegration } from './sailpoint_integration.ts';
import { PingOneIntegration } from './ping_one_integration.ts';
import { WorkdayIntegration } from './workday_integration.ts';
import { PingDirectoryIntegration } from './ping_directory_integration.ts';
import { SystemIntegration } from './system_integration.ts';
import { EndpointIntegration } from './endpoint_integration.ts';
import { AtlassianBitbucketIntegration } from './atlassian_bitbucket_integration.ts';
import { AtlassianConfluenceIntegration } from './atlassian_confluence_integration.ts';
import { AtlassianJiraIntegration } from './atlassian_jira_integration.ts';
import { Auth0Integration } from './auth0_integration.ts';
import { AuthentikIntegration } from './authentik_integration.ts';
import { BeyondInsightIntegration } from './beyondinsight_integration.ts';
import { BitwardenIntegration } from './bitwarden_integration.ts';
import { BoxIntegration } from './box_integration.ts';
import { CanvaIntegration } from './canva_integration.ts';
import { CyberArkPasIntegration } from './cyberark_pas_integration.ts';
import { ForgeRockIntegration } from './forgerock_integration.ts';
import { GcpIntegration } from './gcp_integration.ts';
import { GitLabIntegration } from './gitlab_integration.ts';
import { HashiCorpVaultIntegration } from './hashicorp_vault_integration.ts';
import { AzureIntegration } from './azure_integration.ts';
import { IslandBrowserIntegration } from './island_browser_integration.ts';
import { JumpCloudIntegration } from './jumpcloud_integration.ts';
import { KeeperIntegration } from './keeper_integration.ts';
import { KeycloakIntegration } from './keycloak_integration.ts';
import { LastPassIntegration } from './lastpass_integration.ts';
import { LyveCloudIntegration } from './lyve_cloud_integration.ts';
import { MattermostIntegration } from './mattermost_integration.ts';
import { MongoDbAtlasIntegration } from './mongodb_atlas_integration.ts';
import { TeleportIntegration } from './teleport_integration.ts';
import { ThycoticSsIntegration } from './thycotic_ss_integration.ts';
import { ZoomIntegration } from './zoom_integration.ts';
import { type IntegrationName } from '../types.ts';

// Re-export types and classes from base_integration
export type { IntegrationRegistry, IntegrationResult, IntegrationDocument, DataStreamConfig };
export { BaseIntegration, createEmptyCorrelationMap };
export { OktaIntegration } from './okta_integration.ts';
export { CloudAssetIntegration } from './cloud_asset_integration.ts';
export { OktaSystemIntegration } from './okta_system_integration.ts';
export { CloudTrailIntegration } from './cloudtrail_integration.ts';
export { EntraIdIntegration } from './entra_id_integration.ts';
export { CrowdStrikeIntegration } from './crowdstrike_integration.ts';
export { O365Integration } from './o365_integration.ts';
export { GitHubIntegration } from './github_integration.ts';
export { CiscoDuoIntegration } from './cisco_duo_integration.ts';
export { OnePasswordIntegration } from './onepassword_integration.ts';
export { GoogleWorkspaceIntegration } from './google_workspace_integration.ts';
export { CloudflareLogpushIntegration } from './cloudflare_logpush_integration.ts';
export { ZscalerZiaIntegration } from './zscaler_zia_integration.ts';
export { TiAbusechIntegration } from './ti_abusech_integration.ts';
export { JamfProIntegration } from './jamf_pro_integration.ts';
export { ActiveDirectoryIntegration } from './active_directory_integration.ts';
export { ServiceNowIntegration } from './servicenow_integration.ts';
export { SlackIntegration } from './slack_integration.ts';
export { SailPointIntegration } from './sailpoint_integration.ts';
export { PingOneIntegration } from './ping_one_integration.ts';
export { WorkdayIntegration } from './workday_integration.ts';
export { PingDirectoryIntegration } from './ping_directory_integration.ts';
export { SystemIntegration } from './system_integration.ts';
export { EndpointIntegration } from './endpoint_integration.ts';
export { AtlassianBitbucketIntegration } from './atlassian_bitbucket_integration.ts';
export { AtlassianConfluenceIntegration } from './atlassian_confluence_integration.ts';
export { AtlassianJiraIntegration } from './atlassian_jira_integration.ts';
export { Auth0Integration } from './auth0_integration.ts';
export { AuthentikIntegration } from './authentik_integration.ts';
export { BeyondInsightIntegration } from './beyondinsight_integration.ts';
export { BitwardenIntegration } from './bitwarden_integration.ts';
export { BoxIntegration } from './box_integration.ts';
export { CanvaIntegration } from './canva_integration.ts';
export { CyberArkPasIntegration } from './cyberark_pas_integration.ts';
export { ForgeRockIntegration } from './forgerock_integration.ts';
export { GcpIntegration } from './gcp_integration.ts';
export { GitLabIntegration } from './gitlab_integration.ts';
export { HashiCorpVaultIntegration } from './hashicorp_vault_integration.ts';
export { AzureIntegration } from './azure_integration.ts';
export { IslandBrowserIntegration } from './island_browser_integration.ts';
export { JumpCloudIntegration } from './jumpcloud_integration.ts';
export { KeeperIntegration } from './keeper_integration.ts';
export { KeycloakIntegration } from './keycloak_integration.ts';
export { LastPassIntegration } from './lastpass_integration.ts';
export { LyveCloudIntegration } from './lyve_cloud_integration.ts';
export { MattermostIntegration } from './mattermost_integration.ts';
export { MongoDbAtlasIntegration } from './mongodb_atlas_integration.ts';
export { TeleportIntegration } from './teleport_integration.ts';
export { ThycoticSsIntegration } from './thycotic_ss_integration.ts';
export { ZoomIntegration } from './zoom_integration.ts';

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

  // Register endpoint (Elastic Defend) integration
  registry.set('endpoint', new EndpointIntegration());

  // Register Atlassian, Auth0, and authentik integrations
  registry.set('atlassian_bitbucket', new AtlassianBitbucketIntegration());
  registry.set('atlassian_confluence', new AtlassianConfluenceIntegration());
  registry.set('atlassian_jira', new AtlassianJiraIntegration());
  registry.set('auth0', new Auth0Integration());
  registry.set('authentik', new AuthentikIntegration());

  // Register PAM, credential management, and collaboration integrations
  registry.set('beyondinsight', new BeyondInsightIntegration());
  registry.set('bitwarden', new BitwardenIntegration());
  registry.set('box', new BoxIntegration());
  registry.set('canva', new CanvaIntegration());
  registry.set('cyberark_pas', new CyberArkPasIntegration());

  // Register identity platform, cloud, DevOps, and secrets management integrations
  registry.set('forgerock', new ForgeRockIntegration());
  registry.set('gcp', new GcpIntegration());
  registry.set('gitlab', new GitLabIntegration());
  registry.set('hashicorp_vault', new HashiCorpVaultIntegration());

  // Register Azure (cloud + identity) integration
  registry.set('azure', new AzureIntegration());

  // Register identity provider and credential management integrations
  registry.set('island_browser', new IslandBrowserIntegration());
  registry.set('jumpcloud', new JumpCloudIntegration());
  registry.set('keeper', new KeeperIntegration());
  registry.set('keycloak', new KeycloakIntegration());
  registry.set('lastpass', new LastPassIntegration());

  // Register cloud storage, collaboration, database, access, secrets, and video integrations
  registry.set('lyve_cloud', new LyveCloudIntegration());
  registry.set('mattermost', new MattermostIntegration());
  registry.set('mongodb_atlas', new MongoDbAtlasIntegration());
  registry.set('teleport', new TeleportIntegration());
  registry.set('thycotic_ss', new ThycoticSsIntegration());
  registry.set('zoom', new ZoomIntegration());

  return registry;
};

/**
 * Get integration by name
 */
export const getIntegration = (
  registry: IntegrationRegistry,
  name: IntegrationName,
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
    'endpoint',
    'atlassian_bitbucket',
    'atlassian_confluence',
    'atlassian_jira',
    'auth0',
    'authentik',
    'beyondinsight',
    'bitwarden',
    'box',
    'canva',
    'cyberark_pas',
    'forgerock',
    'gcp',
    'gitlab',
    'hashicorp_vault',
    'azure',
    'island_browser',
    'jumpcloud',
    'keeper',
    'keycloak',
    'lastpass',
    'lyve_cloud',
    'mattermost',
    'mongodb_atlas',
    'teleport',
    'thycotic_ss',
    'zoom',
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
