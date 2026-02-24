/**
 * Detection Rules for Organization Integrations
 * Creates sample detection rules and matching events for applicable integrations
 */

import { faker } from '@faker-js/faker';
import { createRule } from '../../utils/kibana_api';
import { ingest } from '../utils/indices';
import { IntegrationName } from './types';
import { IntegrationDocument } from './integrations/base_integration';

interface DetectionRuleDefinition {
  name: string;
  description: string;
  query: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  index: string[];
  generateMatchingEvents: (count: number) => IntegrationDocument[];
}

interface DetectionRuleResult {
  id: string;
  name: string;
  integration: string;
}

const EXCLUDED_INTEGRATIONS: IntegrationName[] = [
  'okta',
  'entra_id',
  'active_directory',
  'cloud_asset',
  'workday',
  'ping_directory',
];

function recentTimestamp(maxDaysAgo: number = 13): string {
  const now = Date.now();
  const offset = Math.random() * maxDaysAgo * 24 * 60 * 60 * 1000;
  return new Date(now - offset).toISOString();
}

function baseEvent(dataset: string, overrides: Record<string, unknown> = {}): IntegrationDocument {
  return {
    '@timestamp': recentTimestamp(),
    data_stream: { namespace: 'default', type: 'logs', dataset },
    ...overrides,
  } as IntegrationDocument;
}

const INTEGRATION_DETECTION_RULES: Partial<Record<IntegrationName, DetectionRuleDefinition[]>> = {
  okta_system: [
    {
      name: 'Okta Failed Login Attempt',
      description: 'Detects failed login attempts to Okta',
      query:
        'data_stream.dataset: "okta.system" AND event.action: "user.session.start" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-okta.system-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('okta.system', {
            event: {
              action: 'user.session.start',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
    {
      name: 'Okta MFA Verification Failure',
      description: 'Detects failed MFA verification attempts in Okta',
      query:
        'data_stream.dataset: "okta.system" AND event.action: "user.authentication.auth_via_mfa" AND event.outcome: "failure"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-okta.system-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('okta.system', {
            event: {
              action: 'user.authentication.auth_via_mfa',
              category: ['authentication'],
              type: ['info'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
  ],

  cloudtrail: [
    {
      name: 'AWS Console Login Failure',
      description: 'Detects failed AWS Management Console login attempts',
      query:
        'data_stream.dataset: "aws.cloudtrail" AND event.action: "ConsoleLogin" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-aws.cloudtrail-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('aws.cloudtrail', {
            event: {
              action: 'ConsoleLogin',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
            },
            cloud: { provider: 'aws', region: 'us-east-1' },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
    {
      name: 'AWS Unauthorized API Call',
      description: 'Detects unauthorized AWS API calls (AccessDenied)',
      query:
        'data_stream.dataset: "aws.cloudtrail" AND event.outcome: "failure" AND aws.cloudtrail.error_code: "AccessDenied"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-aws.cloudtrail-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('aws.cloudtrail', {
            event: {
              action: faker.helpers.arrayElement(['GetObject', 'ListBuckets', 'DescribeInstances']),
              category: ['api'],
              type: ['access'],
              outcome: 'failure',
              kind: 'event',
            },
            aws: {
              cloudtrail: {
                error_code: 'AccessDenied',
                error_message: 'Access Denied',
              },
            },
            cloud: { provider: 'aws', region: 'us-east-1' },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
  ],

  crowdstrike: [
    {
      name: 'CrowdStrike High Severity Alert',
      description: 'Detects CrowdStrike alerts with high severity',
      query: 'data_stream.dataset: "crowdstrike.alert" AND event.severity >= 7',
      severity: 'high',
      riskScore: 73,
      index: ['logs-crowdstrike.alert-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('crowdstrike.alert', {
            event: {
              action: 'detection',
              category: ['malware'],
              type: ['info'],
              outcome: 'success',
              kind: 'alert',
              severity: faker.number.int({ min: 7, max: 10 }),
            },
            host: { name: faker.internet.domainWord(), os: { family: 'windows' } },
            process: { name: faker.system.fileName() },
          })
        ),
    },
    {
      name: 'CrowdStrike Malware Detection',
      description: 'Detects malware identified by CrowdStrike Falcon',
      query: 'data_stream.dataset: "crowdstrike.alert" AND event.category: "malware"',
      severity: 'critical',
      riskScore: 90,
      index: ['logs-crowdstrike.alert-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('crowdstrike.alert', {
            event: {
              action: 'detection',
              category: ['malware'],
              type: ['info'],
              outcome: 'success',
              kind: 'alert',
              severity: faker.number.int({ min: 8, max: 10 }),
            },
            host: { name: faker.internet.domainWord(), os: { family: 'windows' } },
            file: { hash: { sha256: faker.string.hexadecimal({ length: 64, prefix: '' }) } },
          })
        ),
    },
  ],

  o365: [
    {
      name: 'Microsoft 365 Failed Login',
      description: 'Detects failed sign-in attempts to Microsoft 365',
      query:
        'data_stream.dataset: "o365.audit" AND event.action: "UserLoginFailed" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-o365.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('o365.audit', {
            event: {
              action: 'UserLoginFailed',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
              provider: 'AzureActiveDirectory',
            },
            user: { name: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
    {
      name: 'Microsoft 365 Mail Forwarding Rule Created',
      description:
        'Detects creation of mail forwarding rules which could indicate compromised mailbox',
      query:
        'data_stream.dataset: "o365.audit" AND event.action: "Set-Mailbox" AND event.category: "email"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-o365.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('o365.audit', {
            event: {
              action: 'Set-Mailbox',
              category: ['email'],
              type: ['change'],
              outcome: 'success',
              kind: 'event',
              provider: 'Exchange',
            },
            user: { name: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
  ],

  github: [
    {
      name: 'GitHub Repository Visibility Changed',
      description:
        'Detects when a GitHub repository visibility is changed (e.g., private to public)',
      query: 'data_stream.dataset: "github.audit" AND event.action: "repo.access"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-github.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('github.audit', {
            event: {
              action: 'repo.access',
              category: ['configuration'],
              type: ['change'],
              outcome: 'success',
              kind: 'event',
            },
            user: { name: faker.internet.username() },
          })
        ),
    },
    {
      name: 'GitHub Organization Member Removed',
      description: 'Detects when a member is removed from a GitHub organization',
      query: 'data_stream.dataset: "github.audit" AND event.action: "org.remove_member"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-github.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('github.audit', {
            event: {
              action: 'org.remove_member',
              category: ['iam'],
              type: ['deletion'],
              outcome: 'success',
              kind: 'event',
            },
            user: { name: faker.internet.username() },
          })
        ),
    },
  ],

  cisco_duo: [
    {
      name: 'Duo MFA Authentication Denied',
      description: 'Detects denied MFA authentication attempts via Cisco Duo',
      query: 'data_stream.dataset: "cisco_duo.auth" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-cisco_duo.auth-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('cisco_duo.auth', {
            event: {
              action: 'denied',
              category: ['authentication'],
              type: ['info'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
    {
      name: 'Duo MFA Fraud Attempt',
      description: 'Detects potential fraud attempts reported via Cisco Duo',
      query: 'data_stream.dataset: "cisco_duo.auth" AND event.action: "fraud"',
      severity: 'critical',
      riskScore: 90,
      index: ['logs-cisco_duo.auth-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('cisco_duo.auth', {
            event: {
              action: 'fraud',
              category: ['authentication'],
              type: ['info'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
  ],

  '1password': [
    {
      name: '1Password Failed Sign-in Attempt',
      description: 'Detects failed sign-in attempts to 1Password',
      query: 'data_stream.dataset: "1password.signin_attempts" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-1password.signin_attempts-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('1password.signin_attempts', {
            event: {
              action: 'signin_attempt',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
  ],

  google_workspace: [
    {
      name: 'Google Workspace Failed Login',
      description: 'Detects failed login attempts to Google Workspace',
      query:
        'data_stream.dataset: "google_workspace.login" AND event.action: "login_failure" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-google_workspace.login-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('google_workspace.login', {
            event: {
              action: 'login_failure',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
    {
      name: 'Google Workspace Suspicious Login',
      description: 'Detects login events flagged as suspicious by Google',
      query:
        'data_stream.dataset: "google_workspace.login" AND google_workspace.login.is_suspicious: true',
      severity: 'high',
      riskScore: 73,
      index: ['logs-google_workspace.login-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('google_workspace.login', {
            event: {
              action: 'login_success',
              category: ['authentication'],
              type: ['start'],
              outcome: 'success',
              kind: 'event',
            },
            google_workspace: { login: { is_suspicious: true } },
            user: { name: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
  ],

  cloudflare_logpush: [
    {
      name: 'Cloudflare WAF Block',
      description: 'Detects requests blocked by Cloudflare WAF firewall rules',
      query: 'data_stream.dataset: "cloudflare_logpush.firewall_event" AND event.action: "block"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-cloudflare_logpush.firewall_event-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('cloudflare_logpush.firewall_event', {
            event: {
              action: 'block',
              category: ['network'],
              type: ['denied'],
              outcome: 'failure',
              kind: 'event',
            },
            source: { ip: faker.internet.ipv4() },
            url: { domain: faker.internet.domainName() },
          })
        ),
    },
  ],

  zscaler_zia: [
    {
      name: 'Zscaler Web Traffic Blocked',
      description: 'Detects web traffic blocked by Zscaler Internet Access policy',
      query: 'data_stream.dataset: "zscaler_zia.web" AND event.action: "Blocked"',
      severity: 'low',
      riskScore: 21,
      index: ['logs-zscaler_zia.web-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('zscaler_zia.web', {
            event: {
              action: 'Blocked',
              category: ['web'],
              type: ['denied'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username() },
            url: { domain: faker.internet.domainName(), full: faker.internet.url() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
    {
      name: 'Zscaler Firewall Connection Dropped',
      description: 'Detects network connections dropped by Zscaler ZIA firewall',
      query: 'data_stream.dataset: "zscaler_zia.firewall" AND event.action: "Drop"',
      severity: 'low',
      riskScore: 21,
      index: ['logs-zscaler_zia.firewall-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('zscaler_zia.firewall', {
            event: {
              action: 'Drop',
              category: ['network'],
              type: ['denied'],
              outcome: 'failure',
              kind: 'event',
            },
            source: {
              ip: faker.internet.ipv4(),
              port: faker.number.int({ min: 1024, max: 65535 }),
            },
            destination: {
              ip: faker.internet.ipv4(),
              port: faker.helpers.arrayElement([80, 443, 8080]),
            },
          })
        ),
    },
  ],

  ti_abusech: [
    {
      name: 'Threat Intel - New Malware Hash Indicator',
      description: 'Detects new malware hash indicators from AbuseCH threat intelligence',
      query: 'data_stream.dataset: "ti_abusech.malware" AND threat.indicator.type: "file"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-ti_abusech.malware-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('ti_abusech.malware', {
            event: {
              action: 'indicator_match',
              category: ['threat'],
              type: ['indicator'],
              kind: 'enrichment',
            },
            threat: {
              indicator: {
                type: 'file',
                file: { hash: { sha256: faker.string.hexadecimal({ length: 64, prefix: '' }) } },
              },
            },
          })
        ),
    },
  ],

  jamf_pro: [
    {
      name: 'Jamf Pro Computer Policy Finished',
      description: 'Detects Jamf Pro computer policy execution events',
      query: 'data_stream.dataset: "jamf_pro.events" AND event.action: "ComputerPolicyFinished"',
      severity: 'low',
      riskScore: 21,
      index: ['logs-jamf_pro.events-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('jamf_pro.events', {
            event: {
              action: 'ComputerPolicyFinished',
              category: ['configuration'],
              type: ['info'],
              outcome: 'success',
              kind: 'event',
            },
            host: { name: faker.internet.domainWord() },
          })
        ),
    },
  ],

  servicenow: [
    {
      name: 'ServiceNow Critical Priority Incident Created',
      description: 'Detects creation of critical priority incidents in ServiceNow',
      query:
        'data_stream.dataset: "servicenow.event" AND event.action: "incident_created" AND servicenow.event.priority: "1"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-servicenow.event-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('servicenow.event', {
            event: {
              action: 'incident_created',
              category: ['configuration'],
              type: ['creation'],
              outcome: 'success',
              kind: 'event',
            },
            servicenow: {
              event: {
                table_name: 'incident',
                priority: '1',
                short_description: faker.lorem.sentence(),
                state: 'New',
              },
            },
            user: { name: faker.internet.username() },
          })
        ),
    },
  ],

  slack: [
    {
      name: 'Slack User Anomaly Detected',
      description: 'Detects anomalous user behavior flagged by Slack Enterprise audit',
      query: 'data_stream.dataset: "slack.audit" AND event.action: "anomaly"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-slack.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('slack.audit', {
            event: {
              action: 'anomaly',
              category: ['intrusion_detection'],
              type: ['info'],
              outcome: 'success',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
    {
      name: 'Slack Admin Role Escalation',
      description: 'Detects when a user is promoted to admin role in Slack workspace',
      query: 'data_stream.dataset: "slack.audit" AND event.action: "role_change_to_admin"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-slack.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('slack.audit', {
            event: {
              action: 'role_change_to_admin',
              category: ['iam'],
              type: ['change'],
              outcome: 'success',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
          })
        ),
    },
  ],

  sailpoint: [
    {
      name: 'SailPoint Authentication Failure',
      description: 'Detects failed authentication attempts in SailPoint Identity Security Cloud',
      query:
        'data_stream.dataset: "sailpoint_identity_sc.events" AND event.action: "AUTH_LOGIN_FAILED" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-sailpoint_identity_sc.events-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('sailpoint_identity_sc.events', {
            event: {
              action: 'AUTH_LOGIN_FAILED',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
  ],

  ping_one: [
    {
      name: 'PingOne Authentication Failure',
      description: 'Detects failed authentication attempts in PingOne',
      query:
        'data_stream.dataset: "ping_one.audit" AND event.action: "USER.AUTHENTICATION_FAILED" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-ping_one.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('ping_one.audit', {
            event: {
              action: 'USER.AUTHENTICATION_FAILED',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
    {
      name: 'PingOne MFA Rejected',
      description: 'Detects MFA challenges rejected in PingOne',
      query:
        'data_stream.dataset: "ping_one.audit" AND event.action: "USER.MFA_REJECTED" AND event.outcome: "failure"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-ping_one.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('ping_one.audit', {
            event: {
              action: 'USER.MFA_REJECTED',
              category: ['authentication'],
              type: ['info'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          })
        ),
    },
  ],

  system: [
    {
      name: 'Failed SSH Login Attempt',
      description: 'Detects failed SSH login attempts on system hosts',
      query:
        'data_stream.dataset: "system.auth" AND event.action: "ssh_login" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-system.auth-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('system.auth', {
            event: {
              action: 'ssh_login',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
            },
            user: {
              name: faker.helpers.arrayElement([
                'root',
                'admin',
                'ubuntu',
                faker.internet.username(),
              ]),
            },
            source: { ip: faker.internet.ipv4() },
            host: { hostname: faker.internet.domainWord() },
          })
        ),
    },
  ],
};

function getApplicableIntegrations(enabledIntegrations: IntegrationName[]): IntegrationName[] {
  return enabledIntegrations.filter(
    (name) =>
      !EXCLUDED_INTEGRATIONS.includes(name) && INTEGRATION_DETECTION_RULES[name] !== undefined
  );
}

export async function createIntegrationDetectionRules(
  enabledIntegrations: IntegrationName[],
  space: string
): Promise<DetectionRuleResult[]> {
  const applicable = getApplicableIntegrations(enabledIntegrations);
  if (applicable.length === 0) {
    console.log('No applicable integrations for detection rules.');
    return [];
  }

  console.log('\n--- Detection Rules ---');
  console.log(`Creating detection rules for: ${applicable.join(', ')}`);

  const results: DetectionRuleResult[] = [];

  for (const integrationName of applicable) {
    const rules = INTEGRATION_DETECTION_RULES[integrationName];
    if (!rules) continue;

    for (const ruleDef of rules) {
      try {
        const result = await createRule({
          space,
          name: ruleDef.name,
          description: ruleDef.description,
          enabled: true,
          risk_score: ruleDef.riskScore,
          severity: ruleDef.severity,
          index: ruleDef.index,
          type: 'query',
          query: ruleDef.query,
          from: 'now-14d',
          interval: '5m',
        });

        results.push({
          id: result.id,
          name: result.name,
          integration: integrationName,
        });
        console.log(`  ✓ Created rule: ${ruleDef.name}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`  ✗ Failed to create rule "${ruleDef.name}": ${msg}`);
      }
    }
  }

  console.log(`  Total rules created: ${results.length}`);
  return results;
}

export async function generateAndIndexMatchingEvents(
  enabledIntegrations: IntegrationName[]
): Promise<number> {
  const applicable = getApplicableIntegrations(enabledIntegrations);
  if (applicable.length === 0) return 0;

  console.log('Generating matching events for detection rules...');
  const eventsPerRule = 5;
  let totalEvents = 0;

  const eventsByIndex = new Map<string, IntegrationDocument[]>();

  for (const integrationName of applicable) {
    const rules = INTEGRATION_DETECTION_RULES[integrationName];
    if (!rules) continue;

    for (const ruleDef of rules) {
      const events = ruleDef.generateMatchingEvents(eventsPerRule);
      const targetIndex = ruleDef.index[0].replace('*', 'default');

      const existing = eventsByIndex.get(targetIndex) || [];
      existing.push(...events);
      eventsByIndex.set(targetIndex, existing);
      totalEvents += events.length;
    }
  }

  for (const [index, events] of eventsByIndex) {
    try {
      await ingest(index, events);
      console.log(`  ✓ Indexed ${events.length} matching events to ${index}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`  ✗ Failed to index events to ${index}: ${msg}`);
    }
  }

  console.log(`  Total matching events indexed: ${totalEvents}`);
  return totalEvents;
}

export { EXCLUDED_INTEGRATIONS, INTEGRATION_DETECTION_RULES };
export type { DetectionRuleDefinition, DetectionRuleResult };
