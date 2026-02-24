/**
 * Organization Command
 * Main entry point for generating realistic organization security integration data
 */

import { select, confirm } from '@inquirer/prompts';
import { generateNewSeed } from '../../constants';
import { buildKibanaUrl } from '../../utils/kibana_api';
import {
  OrganizationOptions,
  OrganizationSize,
  OrganizationConfig,
  ProductivitySuite,
} from './types';
import { generateOrganization, getOrganizationSummary } from './organization_generator';
import { buildCorrelationMap, verifyCorrelationIntegrity } from './correlation';
import {
  createIntegrationRegistry,
  parseIntegrationList,
  getAvailableIntegrations,
  IntegrationResult,
} from './integrations';
import {
  createIntegrationDetectionRules,
  generateAndIndexMatchingEvents,
  DetectionRuleResult,
} from './detection_rules';

/**
 * Valid organization sizes with descriptions
 */
const SIZE_OPTIONS: Array<{ value: OrganizationSize; name: string; description: string }> = [
  {
    value: 'john_doe',
    name: 'John Doe (1 employee)',
    description: 'Single employee for focused entity analysis, AWS only, basic resources',
  },
  {
    value: 'small',
    name: 'Small (10-50 employees)',
    description: 'AWS only, basic resources, 1 cloud account',
  },
  {
    value: 'medium',
    name: 'Medium (51-200 employees)',
    description: 'AWS only, moderate resources, 3 cloud accounts',
  },
  {
    value: 'enterprise',
    name: 'Enterprise (201-1000+ employees)',
    description: 'Multi-cloud (AWS, GCP, Azure), 6+ cloud accounts',
  },
];

/**
 * Prompt for organization size selection
 */
const promptForSize = async (): Promise<OrganizationSize> => {
  return select<OrganizationSize>({
    message: 'Select organization size:',
    choices: SIZE_OPTIONS.map((opt) => ({
      value: opt.value,
      name: opt.name,
      description: opt.description,
    })),
  });
};

/**
 * Prompt for productivity suite selection
 */
const promptForProductivitySuite = async (): Promise<ProductivitySuite> => {
  return select<ProductivitySuite>({
    message: 'Select productivity suite:',
    choices: [
      {
        value: 'microsoft',
        name: 'Microsoft 365 (Exchange, SharePoint, OneDrive, Teams)',
      },
      {
        value: 'google',
        name: 'Google Workspace (Gmail, Drive, Admin)',
      },
    ],
  });
};

/**
 * Main command function for generating SaaS organization data
 */
export const runOrganization = async (options: OrganizationOptions): Promise<void> => {
  console.log('\n=== Organization Security Integration Generator ===\n');

  // Prompt for organization size
  const size = await promptForSize();

  // Prompt for productivity suite
  const productivitySuite = await promptForProductivitySuite();

  // Prompt for detection rules if not set via CLI flag
  const includeDetectionRules =
    options.detectionRules ??
    (await confirm({
      message: 'Include sample detection rules for applicable integrations?',
      default: false,
    }));

  // Validate and fill in other options
  const validatedOptions = await validateOptions({ ...options, size, productivitySuite });
  const { name, space, seed, integrations } = validatedOptions;

  // Parse integrations to enable
  const enabledIntegrations = parseIntegrationList(integrations);
  if (enabledIntegrations.length === 0) {
    console.error(
      `No valid integrations specified. Available: ${getAvailableIntegrations().join(', ')}`
    );
    process.exit(1);
  }

  console.log(`Organization: ${name}`);
  console.log(`Size: ${size}`);
  console.log(`Space: ${space}`);
  console.log(`Seed: ${seed}`);
  console.log(`Integrations: ${enabledIntegrations.join(', ')}`);
  console.log('');

  // Generate organization
  console.log('Generating organization structure...');
  const orgConfig: OrganizationConfig = {
    name,
    domain: `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
    size,
    seed,
    productivitySuite: validatedOptions.productivitySuite,
  };

  const organization = generateOrganization(orgConfig);

  // Display organization summary
  console.log('\n' + getOrganizationSummary(organization) + '\n');

  // Build correlation map
  console.log('Building correlation map...');
  const correlationMap = buildCorrelationMap(organization);

  // Verify correlation integrity
  const verification = verifyCorrelationIntegrity(organization, correlationMap);
  if (!verification.valid) {
    console.error('Correlation verification failed:');
    verification.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  if (verification.warnings.length > 0) {
    console.log('Correlation warnings:');
    verification.warnings.forEach((w) => console.log(`  - ${w}`));
  }

  console.log('Correlation verification: ✓ PASSED\n');

  // Create integration registry
  const registry = createIntegrationRegistry();

  // Run enabled integrations
  const results: IntegrationResult[] = [];
  for (const integrationName of enabledIntegrations) {
    const integration = registry.get(integrationName);
    if (integration) {
      const result = await integration.run(organization, correlationMap, space);
      results.push(result);
    }
  }

  // Create detection rules and matching events if requested
  let detectionRuleResults: DetectionRuleResult[] = [];
  if (includeDetectionRules) {
    detectionRuleResults = await createIntegrationDetectionRules(enabledIntegrations, space);
    await generateAndIndexMatchingEvents(enabledIntegrations);
  }

  // Display summary
  displaySummary(results, organization, space, detectionRuleResults);
};

/**
 * Validated options type (all required except employeeCount)
 */
interface ValidatedOptions {
  size: OrganizationSize;
  name: string;
  space: string;
  seed: number;
  integrations: string;
  employeeCount?: number;
  productivitySuite: ProductivitySuite;
  detectionRules?: boolean;
}

/**
 * Validate and normalize command options
 */
const validateOptions = async (options: OrganizationOptions): Promise<ValidatedOptions> => {
  const seed = options.seed ?? generateNewSeed();
  const productivitySuite = options.productivitySuite || 'microsoft';

  // Pick the correct productivity integration based on suite choice
  const productivityIntegration = productivitySuite === 'google' ? 'google_workspace' : 'o365';

  // When --all is passed, use all available integrations regardless of other options
  const integrations = options.all
    ? getAvailableIntegrations().join(',')
    : options.integrations ||
      `active_directory,okta,okta_system,entra_id,jamf_pro,workday,ping_directory,sailpoint,github,slack,${productivityIntegration},servicenow`;

  return {
    size: options.size,
    name: options.name || 'Acme CRM',
    space: options.space || 'default',
    seed,
    integrations,
    employeeCount: options.employeeCount,
    productivitySuite,
  };
};

/**
 * Display final summary with links
 */
const displaySummary = (
  results: IntegrationResult[],
  organization: ReturnType<typeof generateOrganization>,
  space: string,
  detectionRuleResults: DetectionRuleResult[] = []
): void => {
  console.log('\n=== Generation Complete ===\n');

  // Integration results
  console.log('Integration Results:');
  let totalDocs = 0;
  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    console.log(`  ${status} ${result.integrationName}: ${result.documentsGenerated} documents`);
    if (result.error) {
      console.log(`    Error: ${result.error}`);
    }
    totalDocs += result.documentsGenerated;
  }
  console.log(`\nTotal documents generated: ${totalDocs}`);

  if (detectionRuleResults.length > 0) {
    console.log(`\nDetection Rules Created: ${detectionRuleResults.length}`);
    for (const rule of detectionRuleResults) {
      console.log(`  ✓ ${rule.name} (${rule.integration})`);
    }
  }

  // Quick stats
  console.log('\nQuick Stats:');
  console.log(`  Employees: ${organization.employees.length}`);
  console.log(`  Devices: ${organization.employees.reduce((sum, e) => sum + e.devices.length, 0)}`);
  console.log(`  Cloud Resources: ${organization.cloudResources.length}`);
  console.log(`  IAM Users: ${organization.cloudIamUsers.length}`);

  // Helpful links
  const successfulIntegrations = results.filter((r) => r.success);
  if (successfulIntegrations.length > 0) {
    console.log('\nView your data:');

    // Entity Analytics link
    console.log(
      `  Entity Analytics: ${buildKibanaUrl({ path: '/app/security/entity_analytics', space })}`
    );

    // Discover link with Okta Entity Analytics data
    const oktaResult = results.find((r) => r.integrationName === 'entityanalytics_okta');
    if (oktaResult?.success) {
      console.log(
        `  Okta Users: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-entityanalytics_okta.user-*')", space })}`
      );
      console.log(
        `  Okta Devices: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-entityanalytics_okta.device-*')", space })}`
      );
    }

    // Discover link with Okta System Logs data
    const oktaSystemResult = results.find((r) => r.integrationName === 'okta');
    if (oktaSystemResult?.success) {
      console.log(
        `  Okta System Logs: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-okta.system-*')", space })}`
      );
    }

    // Discover link with Cloud Asset data
    const cloudResult = results.find((r) => r.integrationName === 'cloud_asset_inventory');
    if (cloudResult?.success) {
      console.log(
        `  Cloud Assets: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-cloud_asset_inventory.asset_inventory-*')", space })}`
      );
    }

    // Discover link with CloudTrail data
    const cloudTrailResult = results.find((r) => r.integrationName === 'aws');
    if (cloudTrailResult?.success) {
      console.log(
        `  AWS CloudTrail: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-aws.cloudtrail-*')", space })}`
      );
    }

    // Discover link with Entra ID Entity Analytics data
    const entraIdResult = results.find((r) => r.integrationName === 'entityanalytics_entra_id');
    if (entraIdResult?.success) {
      console.log(
        `  Entra ID Users: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-entityanalytics_entra_id.user-*')", space })}`
      );
      console.log(
        `  Entra ID Devices: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-entityanalytics_entra_id.device-*')", space })}`
      );
    }

    // CrowdStrike links
    const crowdstrikeResult = results.find((r) => r.integrationName === 'crowdstrike');
    if (crowdstrikeResult?.success) {
      console.log(
        `  CrowdStrike Hosts: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-crowdstrike.host-*')", space })}`
      );
      console.log(
        `  CrowdStrike Alerts: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-crowdstrike.alert-*')", space })}`
      );
    }

    // O365 link
    const o365Result = results.find((r) => r.integrationName === 'o365');
    if (o365Result?.success) {
      console.log(
        `  Microsoft 365: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-o365.audit-*')", space })}`
      );
    }

    // GitHub link
    const githubResult = results.find((r) => r.integrationName === 'github');
    if (githubResult?.success) {
      console.log(
        `  GitHub Audit: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-github.audit-*')", space })}`
      );
    }

    // Cisco Duo link
    const duoResult = results.find((r) => r.integrationName === 'cisco_duo');
    if (duoResult?.success) {
      console.log(
        `  Cisco Duo Auth: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-cisco_duo.auth-*')", space })}`
      );
    }

    // 1Password link
    const onepassResult = results.find((r) => r.integrationName === '1password');
    if (onepassResult?.success) {
      console.log(
        `  1Password: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-1password.*-*')", space })}`
      );
    }

    // Google Workspace link
    const gwsResult = results.find((r) => r.integrationName === 'google_workspace');
    if (gwsResult?.success) {
      console.log(
        `  Google Workspace: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-google_workspace.*-*')", space })}`
      );
    }

    // Cloudflare link
    const cfResult = results.find((r) => r.integrationName === 'cloudflare_logpush');
    if (cfResult?.success) {
      console.log(
        `  Cloudflare: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-cloudflare_logpush.*-*')", space })}`
      );
    }

    // Zscaler link
    const zscalerResult = results.find((r) => r.integrationName === 'zscaler_zia');
    if (zscalerResult?.success) {
      console.log(
        `  Zscaler ZIA: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-zscaler_zia.*-*')", space })}`
      );
    }

    // TI AbuseCH link
    const tiResult = results.find((r) => r.integrationName === 'ti_abusech');
    if (tiResult?.success) {
      console.log(
        `  Threat Intel: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-ti_abusech.*-*')", space })}`
      );
    }

    // Jamf Pro link
    const jamfResult = results.find((r) => r.integrationName === 'jamf_pro');
    if (jamfResult?.success) {
      console.log(
        `  Jamf Pro Inventory: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-jamf_pro.inventory-*')", space })}`
      );
      console.log(
        `  Jamf Pro Events: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-jamf_pro.events-*')", space })}`
      );
    }

    // Active Directory link
    const adResult = results.find((r) => r.integrationName === 'entityanalytics_ad');
    if (adResult?.success) {
      console.log(
        `  Active Directory: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-entityanalytics_ad.*-*')", space })}`
      );
    }

    // ServiceNow link
    const servicenowResult = results.find((r) => r.integrationName === 'servicenow');
    if (servicenowResult?.success) {
      console.log(
        `  ServiceNow: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-servicenow.event-*')", space })}`
      );
    }

    // Slack link
    const slackResult = results.find((r) => r.integrationName === 'slack');
    if (slackResult?.success) {
      console.log(
        `  Slack Audit: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-slack.audit-*')", space })}`
      );
    }

    // SailPoint link
    const sailpointResult = results.find((r) => r.integrationName === 'sailpoint_identity_sc');
    if (sailpointResult?.success) {
      console.log(
        `  SailPoint: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-sailpoint_identity_sc.events-*')", space })}`
      );
    }

    // PingOne link
    const pingOneResult = results.find((r) => r.integrationName === 'ping_one');
    if (pingOneResult?.success) {
      console.log(
        `  PingOne Audit: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-ping_one.audit-*')", space })}`
      );
    }

    // Workday link (custom integration)
    const workdayResult = results.find((r) => r.integrationName === 'workday');
    if (workdayResult?.success) {
      console.log(
        `  Workday People: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-workday.people-*')", space })}`
      );
    }

    // PingDirectory link (custom integration)
    const pingDirResult = results.find((r) => r.integrationName === 'ping_directory');
    if (pingDirResult?.success) {
      console.log(
        `  PingDirectory Users: ${buildKibanaUrl({ path: "/app/discover#/?_a=(index:'logs-ping_directory.users-*')", space })}`
      );
    }

    // Security dashboard
    console.log(`  Security Dashboard: ${buildKibanaUrl({ path: '/app/security', space })}`);

    if (detectionRuleResults.length > 0) {
      console.log(`  Detection Rules: ${buildKibanaUrl({ path: '/app/security/rules', space })}`);
    }
  }

  // Only show correlation notes for integrations that were actually included
  const successfulNames = new Set(results.filter((r) => r.success).map((r) => r.integrationName));

  const correlationNotes: Array<{ integrations: string[]; note: string }> = [
    {
      integrations: ['entityanalytics_okta'],
      note: 'Okta users are correlated with cloud IAM users via federated login',
    },
    {
      integrations: ['okta'],
      note: 'Okta system logs correlate with entity analytics via okta.actor.id',
    },
    {
      integrations: ['aws'],
      note: 'CloudTrail logs correlate with cloud assets via account ID and ARN',
    },
    {
      integrations: ['entityanalytics_entra_id'],
      note: 'Entra ID users correlate with Okta users via email (hybrid identity)',
    },
    {
      integrations: ['crowdstrike'],
      note: 'CrowdStrike hosts correlate with employee devices via agent ID',
    },
    {
      integrations: ['crowdstrike', 'ti_abusech'],
      note: 'CrowdStrike alert hashes cross-correlate with TI AbuseCH indicators',
    },
    {
      integrations: ['o365'],
      note: 'O365 audit logs correlate with Entra ID users via email/UserId',
    },
    {
      integrations: ['github'],
      note: 'GitHub audit logs correlate with Engineering employees via GitHub username',
    },
    {
      integrations: ['cisco_duo'],
      note: 'Cisco Duo MFA events correlate with Okta login sessions',
    },
    {
      integrations: ['1password'],
      note: '1Password usage correlates with employee UUIDs and department vaults',
    },
    {
      integrations: ['cloudflare_logpush'],
      note: 'Cloudflare logs protect org domains (WAF, bot protection)',
    },
    {
      integrations: ['zscaler_zia'],
      note: 'Zscaler web logs correlate with employee devices and departments',
    },
    {
      integrations: ['ti_abusech'],
      note: 'TI AbuseCH indicators cross-correlate with Cloudflare/Zscaler/CrowdStrike',
    },
    {
      integrations: ['o365', 'google_workspace'],
      note: 'O365 and Google Workspace are mutually exclusive (controlled by productivitySuite)',
    },
    {
      integrations: ['jamf_pro'],
      note: 'Jamf Pro inventory correlates with Mac laptop devices via UDID',
    },
    {
      integrations: ['entityanalytics_ad'],
      note: 'Active Directory users correlate with employees via UPN/email',
    },
    {
      integrations: ['servicenow'],
      note: 'ServiceNow incidents correlate with employees as callers/assignees',
    },
    {
      integrations: ['slack'],
      note: 'Slack audit events correlate with employees via email',
    },
    {
      integrations: ['sailpoint_identity_sc'],
      note: 'SailPoint identity events correlate with employee usernames',
    },
    {
      integrations: ['ping_one'],
      note: 'PingOne audit events correlate with employees via email',
    },
    {
      integrations: ['workday'],
      note: 'Workday people records correlate with employees via email and employee number',
    },
    {
      integrations: ['ping_directory'],
      note: 'PingDirectory SCIM v2 users correlate with employees via email and userName',
    },
  ];

  const applicableNotes = correlationNotes.filter((entry) =>
    entry.integrations.some((name) => successfulNames.has(name))
  );

  if (applicableNotes.length > 0) {
    console.log('\nNotes:');
    for (const entry of applicableNotes) {
      console.log(`  - ${entry.note}`);
    }
  }
  console.log('');
};

/**
 * Quick generation with defaults (for quick setup, still prompts for size)
 */
export const runOrganizationQuick = async (space: string = 'default'): Promise<void> => {
  await runOrganization({
    size: 'medium', // Will be overridden by interactive prompt
    name: 'Acme CRM',
    space,
    integrations:
      'active_directory,okta,okta_system,entra_id,jamf_pro,workday,ping_directory,sailpoint,github,slack,google_workspace,servicenow',
  });
};

/**
 * Get help text for the command
 */
export const getOrganizationHelp = (): string => {
  return `
Organization Security Integration Generator

Generates realistic security integration data for a simulated company.
The command will interactively prompt you to select an organization size.

Organization Sizes (selected via interactive prompt):
  John Doe   - 1 employee, single user entity analysis, AWS only, basic resources
  Small      - 10-50 employees, AWS only, basic resources, 1 cloud account
  Medium     - 51-200 employees, AWS only, moderate resources, 3 cloud accounts
  Enterprise - 201-1000+ employees, multi-cloud (AWS, GCP, Azure), 6+ cloud accounts

Available Integrations:
  Entity/Asset Integrations:
    okta               - Okta Entity Analytics (users and devices)
    entra_id           - Microsoft Entra ID Entity Analytics (users and devices)
    cloud_asset        - Cloud Asset Inventory (AWS, GCP, Azure resources)
    jamf_pro           - Jamf Pro (macOS computer inventory + webhook events)
    active_directory   - Active Directory Entity Analytics (LDAP users and computers)

  Log Integrations (Original):
    okta_system        - Okta System Logs (authentication, SSO, MFA events)
    cloudtrail         - AWS CloudTrail (API calls, console logins, role assumptions)

  Endpoint Security:
    crowdstrike        - CrowdStrike Falcon (host inventory + EDR alerts)

  Productivity & Code:
    o365               - Microsoft 365 (Exchange, SharePoint, OneDrive, Teams, AzureAD)
    github             - GitHub (org audit logs, repo events, code access)
    google_workspace   - Google Workspace (login, admin, drive) [alt to o365]

  Identity & Access:
    cisco_duo          - Cisco Duo (MFA authentication logs)
    1password          - 1Password (sign-in attempts, credential access)
    sailpoint          - SailPoint Identity Security Cloud (identity governance events)
    ping_one           - PingOne (IAM audit events, authentication, MFA)

  ITSM & Collaboration:
    servicenow         - ServiceNow (incidents, change requests)
    slack              - Slack (Enterprise audit logs)

  Network Security:
    cloudflare_logpush - Cloudflare (HTTP requests, WAF/firewall events)
    zscaler_zia        - Zscaler Internet Access (web proxy, firewall)

  Threat Intelligence:
    ti_abusech         - AbuseCH (malware hashes, malicious URLs)

  Custom Integrations (no Fleet package):
    workday            - Workday People API v4 (HR worker/person records)
    ping_directory     - PingDirectory SCIM v2 Users (LDAP directory user profiles)

Detection Rules:
  When --detection-rules is passed (or selected via prompt), sample detection rules
  are created for each applicable integration via the Kibana Detection Engine API.
  Rules use a 14-day lookback, execute every 5 minutes, and are created enabled.
  Matching events are also generated to ensure the rules produce alerts.

  Excluded from detection rules:
    - Entity/asset inventory integrations (okta, entra_id, active_directory, cloud_asset)
    - Custom integrations without Fleet packages (workday, ping_directory)

Correlation Features:
  - Employees are created with realistic departments and roles
  - Each employee has 2 devices (laptop + mobile) with CrowdStrike agents
  - Product & Engineering employees have AWS + GitHub access
  - All employees have Duo MFA, 1Password, and Zscaler
  - CrowdStrike alert hashes cross-correlate with TI AbuseCH indicators
  - Cloudflare WAF blocks correlate with TI AbuseCH malicious IPs
  - Zscaler blocked URLs correlate with TI AbuseCH malicious URLs
  - O365 and Google Workspace are mutually exclusive (productivitySuite config)
  - Workday people records correlate with employees via email and employee number
  - PingDirectory SCIM v2 users correlate with employees via email and userName
  - Department-based activity patterns across all integrations

Examples:
  # Generate organization with all integrations (will prompt for size)
  yarn start organization

  # Generate with specific company name
  yarn start organization --name "MegaCorp CRM"

  # Generate with only original integrations
  yarn start organization --integrations okta,entra_id,cloud_asset,okta_system,cloudtrail

  # Generate with endpoint + identity stack
  yarn start organization --integrations okta,entra_id,crowdstrike,cisco_duo,1password

  # Generate with full network security stack
  yarn start organization --integrations cloudflare_logpush,zscaler_zia,ti_abusech

  # Generate with detection rules enabled
  yarn start organization --detection-rules

  # Generate with reproducible seed
  yarn start organization --seed 12345
`.trim();
};
