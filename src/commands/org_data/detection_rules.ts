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
    {
      name: 'CrowdStrike Falcon High Severity Detection',
      description: 'Detects high-severity DetectionSummaryEvent from the Falcon Event Stream',
      query:
        'data_stream.dataset: "crowdstrike.falcon" AND crowdstrike.metadata.eventType: "DetectionSummaryEvent" AND crowdstrike.event.Severity >= 4',
      severity: 'high',
      riskScore: 75,
      index: ['logs-crowdstrike.falcon-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('crowdstrike.falcon', {
            event: {
              action: 'detection_summary_event',
              category: ['malware'],
              type: ['info'],
              severity: faker.helpers.arrayElement([4, 5]),
            },
            crowdstrike: {
              metadata: { eventType: 'DetectionSummaryEvent' },
              event: {
                Severity: faker.helpers.arrayElement([4, 5]),
                DetectName: 'Suspicious PowerShell Execution',
              },
            },
            host: { name: faker.internet.domainWord() },
            process: { name: 'powershell.exe' },
          })
        ),
    },
    {
      name: 'CrowdStrike Falcon Remote Response Session',
      description: 'Detects remote response sessions initiated via the Falcon console',
      query:
        'data_stream.dataset: "crowdstrike.falcon" AND crowdstrike.metadata.eventType: "RemoteResponseSessionStartEvent"',
      severity: 'medium',
      riskScore: 50,
      index: ['logs-crowdstrike.falcon-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('crowdstrike.falcon', {
            event: {
              action: 'remote_response_session_start_event',
              category: ['network', 'session'],
              type: ['start'],
            },
            crowdstrike: {
              metadata: { eventType: 'RemoteResponseSessionStartEvent' },
              event: {
                SessionId: faker.string.uuid(),
              },
            },
            host: { name: faker.internet.domainWord() },
            user: { email: faker.internet.email() },
          })
        ),
    },
    {
      name: 'CrowdStrike Falcon Firewall Block',
      description: 'Detects network connections blocked by the CrowdStrike Falcon firewall',
      query:
        'data_stream.dataset: "crowdstrike.falcon" AND crowdstrike.metadata.eventType: "FirewallMatchEvent" AND crowdstrike.event.RuleAction: "block"',
      severity: 'low',
      riskScore: 30,
      index: ['logs-crowdstrike.falcon-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('crowdstrike.falcon', {
            event: {
              action: 'firewall_match_event',
              category: ['network'],
              type: ['connection'],
            },
            crowdstrike: {
              metadata: { eventType: 'FirewallMatchEvent' },
              event: {
                RuleAction: 'block',
                Protocol: 'TCP',
              },
            },
            host: { name: faker.internet.domainWord() },
            source: { ip: faker.internet.ipv4(), port: faker.internet.port() },
            destination: { ip: faker.internet.ipv4(), port: 443 },
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

  endpoint: [
    {
      name: 'Endpoint Malware Alert Detected',
      description: 'Detects malware prevention alerts from Elastic Defend',
      query:
        'data_stream.dataset: "endpoint.alerts" AND event.kind: "alert" AND event.code: "malicious_file"',
      severity: 'critical',
      riskScore: 90,
      index: ['logs-endpoint.alerts-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('endpoint.alerts', {
            event: {
              kind: 'alert',
              module: 'endpoint',
              code: 'malicious_file',
              action: 'execution',
              category: ['malware', 'intrusion_detection', 'file'],
              type: ['info', 'denied'],
              dataset: 'endpoint.alerts',
              severity: faker.helpers.arrayElement([73, 85, 99]),
              risk_score: faker.helpers.arrayElement([73, 85, 99]),
            },
            agent: { type: 'endpoint' },
            file: {
              name: `${faker.string.alphanumeric(8)}.dll`,
              hash: {
                sha256: faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' }),
              },
            },
            host: { name: faker.internet.domainWord(), os: { family: 'windows' } },
            user: { name: faker.internet.username() },
          })
        ),
    },
    {
      name: 'Suspicious Process Execution on Endpoint',
      description:
        'Detects execution of commonly abused system utilities (powershell, cmd, certutil, mshta) via Elastic Defend',
      query:
        'data_stream.dataset: "endpoint.events.process" AND event.action: "start" AND process.name: (powershell.exe OR cmd.exe OR certutil.exe OR mshta.exe OR cscript.exe OR wscript.exe)',
      severity: 'high',
      riskScore: 73,
      index: ['logs-endpoint.events.process-*'],
      generateMatchingEvents: (count) => {
        const suspiciousProcs = [
          {
            name: 'powershell.exe',
            exe: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
          },
          { name: 'cmd.exe', exe: 'C:\\Windows\\System32\\cmd.exe' },
          { name: 'certutil.exe', exe: 'C:\\Windows\\System32\\certutil.exe' },
          { name: 'mshta.exe', exe: 'C:\\Windows\\System32\\mshta.exe' },
          { name: 'cscript.exe', exe: 'C:\\Windows\\System32\\cscript.exe' },
          { name: 'wscript.exe', exe: 'C:\\Windows\\System32\\wscript.exe' },
        ];
        return Array.from({ length: count }, () => {
          const proc = faker.helpers.arrayElement(suspiciousProcs);
          return baseEvent('endpoint.events.process', {
            event: {
              action: 'start',
              category: ['process'],
              type: ['start'],
              kind: 'event',
              module: 'endpoint',
              dataset: 'endpoint.events.process',
            },
            agent: { type: 'endpoint' },
            process: {
              name: proc.name,
              executable: proc.exe,
              pid: faker.number.int({ min: 100, max: 65535 }),
            },
            host: { name: faker.internet.domainWord(), os: { family: 'windows' } },
            user: { name: faker.internet.username() },
          });
        });
      },
    },
    {
      name: 'Endpoint Failed Logon Attempt',
      description: 'Detects failed logon attempts reported by Elastic Defend',
      query:
        'data_stream.dataset: "endpoint.events.security" AND event.action: "log_on" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-endpoint.events.security-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('endpoint.events.security', {
            event: {
              action: 'log_on',
              category: ['authentication', 'session'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
              module: 'endpoint',
              dataset: 'endpoint.events.security',
            },
            agent: { type: 'endpoint' },
            user: { name: faker.internet.username() },
            source: {
              ip: faker.internet.ipv4(),
              port: faker.number.int({ min: 49152, max: 65535 }),
            },
            host: { name: faker.internet.domainWord(), os: { family: 'windows' } },
          })
        ),
    },
    {
      name: 'Suspicious Network Connection from Endpoint',
      description: 'Detects outbound network connections to uncommon ports from endpoint hosts',
      query:
        'data_stream.dataset: "endpoint.events.network" AND network.direction: "egress" AND NOT destination.port: (80 OR 443 OR 53)',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-endpoint.events.network-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('endpoint.events.network', {
            event: {
              action: 'connection_attempted',
              category: ['network'],
              type: ['start'],
              kind: 'event',
              module: 'endpoint',
              dataset: 'endpoint.events.network',
            },
            agent: { type: 'endpoint' },
            network: { direction: 'egress', transport: 'tcp', type: 'ipv4' },
            destination: {
              ip: faker.internet.ipv4(),
              port: faker.helpers.arrayElement([4444, 8443, 8888, 9001, 1337, 6667]),
            },
            source: {
              ip: faker.internet.ipv4(),
              port: faker.number.int({ min: 49152, max: 65535 }),
            },
            process: {
              name: faker.helpers.arrayElement(['cmd.exe', 'powershell.exe', 'python3', 'nc']),
            },
            host: { name: faker.internet.domainWord(), os: { family: 'windows' } },
          })
        ),
    },
    {
      name: 'Endpoint Registry Run Key Modification',
      description:
        'Detects modifications to Windows registry Run keys commonly used for persistence',
      query:
        'data_stream.dataset: "endpoint.events.registry" AND event.action: "modification" AND registry.path: *CurrentVersion\\\\Run*',
      severity: 'high',
      riskScore: 73,
      index: ['logs-endpoint.events.registry-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('endpoint.events.registry', {
            event: {
              action: 'modification',
              category: ['registry'],
              type: ['change'],
              kind: 'event',
              module: 'endpoint',
              dataset: 'endpoint.events.registry',
            },
            agent: { type: 'endpoint' },
            registry: {
              hive: 'HKLM',
              path: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\Updater',
              key: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
              value: 'Updater',
              data: { strings: ['C:\\Users\\Public\\updater.exe'], type: 'REG_SZ' },
            },
            process: { name: 'reg.exe', executable: 'C:\\Windows\\System32\\reg.exe' },
            host: { name: faker.internet.domainWord(), os: { family: 'windows' } },
            user: { name: faker.internet.username() },
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
