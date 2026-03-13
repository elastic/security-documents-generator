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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
        ),
    },
    {
      name: 'Google Workspace SAML Login Failure',
      description: 'Detects failed SAML SSO authentication attempts through Google Workspace',
      query:
        'data_stream.dataset: "google_workspace.saml" AND event.action: "login_failure" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-google_workspace.saml-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('google_workspace.saml', {
            event: {
              action: 'login_failure',
              category: ['authentication', 'session'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
            },
            google_workspace: {
              saml: {
                application_name: faker.helpers.arrayElement([
                  'Salesforce',
                  'Slack',
                  'AWS Console',
                ]),
                failure_type: 'failure_app_not_configured_for_user',
              },
            },
            user: { name: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Google Workspace DLP Rule Match',
      description: 'Detects DLP rule matches indicating potential data loss',
      query:
        'data_stream.dataset: "google_workspace.rules" AND event.action: "rule_match" AND google_workspace.rules.has_alert: true',
      severity: 'high',
      riskScore: 73,
      index: ['logs-google_workspace.rules-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('google_workspace.rules', {
            event: { action: 'rule_match', kind: 'event' },
            google_workspace: {
              rules: {
                has_alert: true,
                severity: 'HIGH',
                data_source: 'DRIVE',
                name: ['PII Detection Rule'],
              },
            },
            user: { name: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Google Workspace Alert Center Phishing',
      description: 'Detects phishing alerts from Google Workspace Alert Center',
      query: 'data_stream.dataset: "google_workspace.alert" AND event.action: "Gmail phishing"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-google_workspace.alert-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('google_workspace.alert', {
            event: {
              action: 'Gmail phishing',
              category: ['email', 'threat'],
              type: ['info'],
              kind: 'alert',
            },
            google_workspace: {
              alert: {
                source: 'Gmail phishing',
                type: 'User reported phishing',
                metadata: { severity: 'HIGH' },
              },
            },
            user: { name: faker.internet.email() },
          }),
        ),
    },
    {
      name: 'Google Workspace Suspicious Chrome Extension Install',
      description: 'Detects Chrome browser extension installations from external sources',
      query:
        'data_stream.dataset: "google_workspace.chrome" AND google_workspace.chrome.extension_source: "EXTERNAL"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-google_workspace.chrome-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('google_workspace.chrome', {
            event: {
              action: 'browser-extension-install',
              kind: 'event',
              reason: 'BROWSER_EXTENSION_INSTALL',
            },
            google_workspace: {
              chrome: {
                name: 'BROWSER_EXTENSION_INSTALL',
                extension_source: 'EXTERNAL',
                extension_action: 'INSTALL',
                app_name: faker.word.sample(),
              },
            },
            user: { name: faker.internet.email() },
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
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
          }),
        ),
    },
  ],

  atlassian_bitbucket: [
    {
      name: 'Bitbucket Project Deletion Requested',
      description: 'Detects when a Bitbucket project deletion is requested',
      query:
        'data_stream.dataset: "atlassian_bitbucket.audit" AND event.action: "bitbucket.service.project.audit.action.projectdeletionrequested"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-atlassian_bitbucket.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('atlassian_bitbucket.audit', {
            event: {
              action: 'bitbucket.service.project.audit.action.projectdeletionrequested',
              category: ['configuration'],
              type: ['deletion'],
              kind: 'event',
            },
            user: { name: faker.internet.username() },
          }),
        ),
    },
    {
      name: 'Bitbucket Repository Permission Changed',
      description: 'Detects permission changes on Bitbucket repositories',
      query:
        'data_stream.dataset: "atlassian_bitbucket.audit" AND event.action: "bitbucket.service.permission.audit.action.permissiongranted"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-atlassian_bitbucket.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('atlassian_bitbucket.audit', {
            event: {
              action: 'bitbucket.service.permission.audit.action.permissiongranted',
              category: ['iam'],
              type: ['change'],
              kind: 'event',
            },
            user: { name: faker.internet.username() },
          }),
        ),
    },
  ],

  atlassian_confluence: [
    {
      name: 'Confluence Global Permission Granted',
      description: 'Detects when global permissions are granted in Confluence',
      query:
        'data_stream.dataset: "atlassian_confluence.audit" AND event.action: "atlassian.confluence.audit.action.globalpermissiongranted"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-atlassian_confluence.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('atlassian_confluence.audit', {
            event: {
              action: 'atlassian.confluence.audit.action.globalpermissiongranted',
              category: ['iam'],
              type: ['change'],
              kind: 'event',
            },
            user: { name: faker.internet.username() },
          }),
        ),
    },
    {
      name: 'Confluence Page Deleted',
      description: 'Detects when a Confluence page is deleted',
      query:
        'data_stream.dataset: "atlassian_confluence.audit" AND event.action: "atlassian.confluence.audit.action.pagedeleted"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-atlassian_confluence.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('atlassian_confluence.audit', {
            event: {
              action: 'atlassian.confluence.audit.action.pagedeleted',
              category: ['configuration'],
              type: ['deletion'],
              kind: 'event',
            },
            user: { name: faker.internet.username() },
          }),
        ),
    },
  ],

  atlassian_jira: [
    {
      name: 'Jira Global Permission Granted',
      description: 'Detects when global permissions are granted in Jira',
      query:
        'data_stream.dataset: "atlassian_jira.audit" AND event.action: "jira.auditing.global.permission.granted"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-atlassian_jira.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('atlassian_jira.audit', {
            event: {
              action: 'jira.auditing.global.permission.granted',
              category: ['iam'],
              type: ['change'],
              kind: 'event',
            },
            user: { name: faker.internet.username() },
          }),
        ),
    },
    {
      name: 'Jira Group Created',
      description: 'Detects when a new group is created in Jira',
      query:
        'data_stream.dataset: "atlassian_jira.audit" AND event.action: "jira.auditing.group.created"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-atlassian_jira.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('atlassian_jira.audit', {
            event: {
              action: 'jira.auditing.group.created',
              category: ['iam'],
              type: ['group', 'creation'],
              kind: 'event',
            },
            group: {
              name: faker.helpers.arrayElement([
                'jira-software-users',
                'developers',
                'project-managers',
              ]),
            },
          }),
        ),
    },
  ],

  auth0: [
    {
      name: 'Auth0 Failed Login Attempt',
      description: 'Detects failed login attempts in Auth0',
      query:
        'data_stream.dataset: "auth0.logs" AND event.action: "failed-login" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-auth0.logs-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('auth0.logs', {
            event: {
              action: 'failed-login',
              category: ['authentication'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Auth0 MFA Failure',
      description: 'Detects failed multi-factor authentication attempts in Auth0',
      query:
        'data_stream.dataset: "auth0.logs" AND event.action: "mfa-failure" AND event.outcome: "failure"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-auth0.logs-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('auth0.logs', {
            event: {
              action: 'mfa-failure',
              category: ['authentication'],
              outcome: 'failure',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Auth0 Rate Limit Exceeded',
      description: 'Detects API rate limiting events in Auth0',
      query: 'data_stream.dataset: "auth0.logs" AND event.action: "rate-limit"',
      severity: 'low',
      riskScore: 21,
      index: ['logs-auth0.logs-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('auth0.logs', {
            event: {
              action: 'rate-limit',
              category: ['web'],
              outcome: 'failure',
              kind: 'event',
            },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  authentik: [
    {
      name: 'authentik Login Failure',
      description: 'Detects failed login attempts in authentik',
      query: 'data_stream.dataset: "authentik.event" AND event.action: "login-failed"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-authentik.event-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('authentik.event', {
            event: {
              action: 'login-failed',
              category: ['authentication'],
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'authentik Impersonation Started',
      description: 'Detects when an admin starts impersonating another user in authentik',
      query: 'data_stream.dataset: "authentik.event" AND event.action: "impersonation-started"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-authentik.event-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('authentik.event', {
            event: {
              action: 'impersonation-started',
              category: ['iam'],
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
          }),
        ),
    },
    {
      name: 'authentik Suspicious Request',
      description: 'Detects suspicious requests flagged by authentik',
      query: 'data_stream.dataset: "authentik.event" AND event.action: "suspicious-request"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-authentik.event-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('authentik.event', {
            event: {
              action: 'suspicious-request',
              category: ['intrusion_detection'],
              kind: 'event',
            },
            source: { ip: faker.internet.ipv4() },
          }),
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
          }),
        ),
    },
  ],

  beyondinsight: [
    {
      name: 'BeyondInsight Access Denied',
      description: 'Detects access denied events in BeyondInsight PAM',
      query:
        'data_stream.dataset: "beyondinsight_password_safe.useraudit" AND beyondinsight_password_safe.useraudit.action_type: "AccessDenied"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-beyondinsight_password_safe.useraudit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('beyondinsight_password_safe.useraudit', {
            event: {
              category: ['iam'],
              type: ['denied'],
              kind: 'event',
            },
            beyondinsight_password_safe: {
              useraudit: {
                action_type: 'AccessDenied',
                section: 'Authorization',
                user_name: faker.internet.username(),
              },
            },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'BeyondInsight Suspicious Privileged Session',
      description: 'Detects privileged sessions using high-risk protocols',
      query:
        'data_stream.dataset: "beyondinsight_password_safe.session" AND beyondinsight_password_safe.session.protocol: "rdp"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-beyondinsight_password_safe.session-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('beyondinsight_password_safe.session', {
            event: {
              category: ['session'],
              type: ['info'],
              kind: 'event',
            },
            beyondinsight_password_safe: {
              session: {
                protocol: 'rdp',
                status: 'in_progress',
                managed_account_name: 'Administrator',
                asset_name: 'ProdDB-01',
              },
            },
            network: { protocol: 'rdp' },
            user: { name: faker.internet.username() },
          }),
        ),
    },
    {
      name: 'BeyondInsight Password Retrieval Spike',
      description: 'Detects password retrieval activity in BeyondInsight',
      query:
        'data_stream.dataset: "beyondinsight_password_safe.useraudit" AND beyondinsight_password_safe.useraudit.action_type: "PasswordRetrieval"',
      severity: 'medium',
      riskScore: 50,
      index: ['logs-beyondinsight_password_safe.useraudit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('beyondinsight_password_safe.useraudit', {
            event: {
              category: ['iam'],
              type: ['access'],
              kind: 'event',
            },
            beyondinsight_password_safe: {
              useraudit: {
                action_type: 'PasswordRetrieval',
                section: 'PasswordSafe',
                user_name: faker.internet.username(),
              },
            },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  bitwarden: [
    {
      name: 'Bitwarden Failed Login Attempt',
      description: 'Detects failed login attempts to Bitwarden',
      query:
        'data_stream.dataset: "bitwarden.event" AND bitwarden.event.type.name: "User_FailedLogIn"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-bitwarden.event-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('bitwarden.event', {
            event: {
              category: ['authentication'],
              type: ['info'],
              outcome: 'failure',
              kind: 'event',
            },
            bitwarden: {
              object: 'event',
              event: {
                type: { name: 'User_FailedLogIn', value: '1005' },
                ip_address: faker.internet.ipv4(),
                device: { name: 'WebVault', value: '15' },
              },
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Bitwarden Vault Export',
      description: 'Detects vault export events which may indicate data exfiltration',
      query:
        'data_stream.dataset: "bitwarden.event" AND bitwarden.event.type.name: "User_ExportedVault"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-bitwarden.event-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('bitwarden.event', {
            event: {
              category: ['iam'],
              type: ['info'],
              outcome: 'success',
              kind: 'event',
            },
            bitwarden: {
              object: 'event',
              event: {
                type: { name: 'User_ExportedVault', value: '1007' },
                ip_address: faker.internet.ipv4(),
                device: { name: 'WebVault', value: '15' },
              },
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Bitwarden 2FA Disabled',
      description: 'Detects users disabling two-factor authentication',
      query:
        'data_stream.dataset: "bitwarden.event" AND bitwarden.event.type.name: "User_Disabled2fa"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-bitwarden.event-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('bitwarden.event', {
            event: {
              category: ['iam'],
              type: ['info'],
              outcome: 'success',
              kind: 'event',
            },
            bitwarden: {
              object: 'event',
              event: {
                type: { name: 'User_Disabled2fa', value: '1003' },
                ip_address: faker.internet.ipv4(),
                device: { name: 'WebVault', value: '15' },
              },
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  box: [
    {
      name: 'Box Shield Anomalous Download Alert',
      description: 'Detects Box Shield alerts for anomalous download activity',
      query: 'data_stream.dataset: "box_events.events" AND event.action: "SHIELD_ALERT"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-box_events.events-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('box_events.events', {
            event: {
              action: 'SHIELD_ALERT',
              kind: 'alert',
              category: ['threat', 'file'],
              type: ['indicator', 'access'],
              risk_score: faker.number.int({ min: 50, max: 99 }),
            },
            box: {
              additional_details: {
                shield_alert: {
                  alert_id: faker.number.int({ min: 100, max: 999 }),
                  alert_summary: {
                    description: 'Significant increase in download content',
                    download_delta_percent: faker.number.int({ min: 500, max: 10000 }),
                  },
                },
              },
            },
            user: { full_name: faker.person.fullName() },
            client: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Box Failed Login',
      description: 'Detects failed login attempts to Box',
      query: 'data_stream.dataset: "box_events.events" AND event.action: "FAILED_LOGIN"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-box_events.events-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('box_events.events', {
            event: {
              action: 'FAILED_LOGIN',
              kind: 'event',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
            },
            user: {
              full_name: faker.person.fullName(),
              effective: { email: faker.internet.email() },
            },
            client: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Box Suspicious File Share',
      description: 'Detects file sharing activity in Box that may indicate data leakage',
      query: 'data_stream.dataset: "box_events.events" AND event.action: "SHARE"',
      severity: 'low',
      riskScore: 30,
      index: ['logs-box_events.events-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('box_events.events', {
            event: {
              action: 'SHARE',
              kind: 'event',
              category: ['file'],
              type: ['access'],
              outcome: 'success',
            },
            box: {
              source: {
                name: `${faker.word.noun()}.${faker.helpers.arrayElement(['pdf', 'xlsx', 'docx'])}`,
                type: 'file',
              },
            },
            user: { full_name: faker.person.fullName() },
            client: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  canva: [
    {
      name: 'Canva Team Removed from Organization',
      description: 'Detects removal of a team from the Canva organization',
      query: 'data_stream.dataset: "canva.audit" AND event.action: "remove_team_from_organization"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-canva.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('canva.audit', {
            event: {
              action: 'remove_team_from_organization',
              kind: 'event',
              category: ['iam'],
              type: ['deletion'],
            },
            canva: {
              audit: {
                action: { type: 'REMOVE_TEAM_FROM_ORGANIZATION' },
                actor: { type: 'ADMIN' },
              },
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
          }),
        ),
    },
    {
      name: 'Canva SSO Setting Changed',
      description: 'Detects changes to SSO configuration in Canva',
      query: 'data_stream.dataset: "canva.audit" AND event.action: "sso_setting_changed"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-canva.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('canva.audit', {
            event: {
              action: 'sso_setting_changed',
              kind: 'event',
              category: ['configuration'],
              type: ['change'],
            },
            canva: {
              audit: {
                action: { type: 'SSO_SETTING_CHANGED' },
                actor: { type: 'ADMIN' },
              },
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
          }),
        ),
    },
    {
      name: 'Canva Design Export',
      description: 'Detects design export activity which could indicate IP theft',
      query: 'data_stream.dataset: "canva.audit" AND event.action: "export_design"',
      severity: 'low',
      riskScore: 25,
      index: ['logs-canva.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('canva.audit', {
            event: {
              action: 'export_design',
              kind: 'event',
              category: ['file'],
              type: ['access'],
            },
            canva: {
              audit: {
                action: { type: 'EXPORT_DESIGN' },
                actor: { type: 'USER' },
              },
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
          }),
        ),
    },
  ],

  cyberark_pas: [
    {
      name: 'CyberArk PAS Logon Failure',
      description: 'Detects failed logon attempts to CyberArk PAS vault',
      query: 'data_stream.dataset: "cyberarkpas.audit" AND event.action: "authentication_failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-cyberarkpas.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('cyberarkpas.audit', {
            event: {
              action: 'authentication_failure',
              code: '9',
              kind: 'event',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
            },
            cyberarkpas: {
              audit: {
                action: 'Logon Failure',
                severity: 'Warning',
                issuer: faker.internet.username(),
              },
            },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'CyberArk PAS Password Retrieval',
      description: 'Detects password retrieval from CyberArk vault',
      query:
        'data_stream.dataset: "cyberarkpas.audit" AND cyberarkpas.audit.action: "Retrieve Password"',
      severity: 'medium',
      riskScore: 50,
      index: ['logs-cyberarkpas.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('cyberarkpas.audit', {
            event: {
              action: 'retrieve_password',
              code: '22',
              kind: 'event',
              category: ['iam'],
              type: ['access'],
              outcome: 'success',
            },
            cyberarkpas: {
              audit: {
                action: 'Retrieve Password',
                severity: 'Info',
                issuer: faker.internet.username(),
                safe: faker.helpers.arrayElement(['Windows', 'Linux', 'Databases']),
              },
            },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'CyberArk PAS Suspicious PSM Session',
      description: 'Detects PSM privileged session connections which may require review',
      query: 'data_stream.dataset: "cyberarkpas.audit" AND cyberarkpas.audit.action: "PSMConnect"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-cyberarkpas.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('cyberarkpas.audit', {
            event: {
              action: 'psmconnect',
              code: '295',
              kind: 'event',
              category: ['session'],
              type: ['start'],
              outcome: 'success',
            },
            cyberarkpas: {
              audit: {
                action: 'PSMConnect',
                severity: 'Info',
                issuer: faker.internet.username(),
                safe: 'Windows',
                extra_details: {
                  dst_host: 'prodserver.corp.local',
                  protocol: 'RDP',
                  session_id: faker.string.uuid(),
                },
                ca_properties: {
                  address: 'prodserver.corp.local',
                  user_name: 'Administrator',
                  device_type: 'Operating System',
                  policy_id: 'WIN-SERVER-LOCAL',
                },
              },
            },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
            destination: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  forgerock: [
    {
      name: 'ForgeRock Failed AM Authentication',
      description: 'Detects failed authentication attempts in ForgeRock Access Management',
      query: 'data_stream.dataset: "forgerock.am_authentication" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-forgerock.am_authentication-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('forgerock.am_authentication', {
            event: {
              action: 'login',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
            },
            forgerock: {
              eventName: 'AM-LOGIN-COMPLETED',
              level: 'INFO',
              realm: '/alpha',
              topic: 'authentication',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'ForgeRock IDM Access Failure',
      description: 'Detects failed IDM access attempts that may indicate unauthorized API usage',
      query: 'data_stream.dataset: "forgerock.idm_access" AND forgerock.response.status: "FAILED"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-forgerock.idm_access-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('forgerock.idm_access', {
            event: {
              action: 'access',
              category: ['network'],
              type: ['access'],
              outcome: 'failure',
            },
            forgerock: {
              eventName: 'access',
              level: 'INFO',
              request: { operation: 'READ', protocol: 'CREST' },
              response: { status: 'FAILED', elapsedTime: 12, elapsedTimeUnits: 'MILLISECONDS' },
              topic: 'access',
            },
            user: { id: faker.internet.username() },
          }),
        ),
    },
    {
      name: 'ForgeRock IDM Authentication Failure',
      description: 'Detects failed IDM authentication indicating credential compromise attempts',
      query: 'data_stream.dataset: "forgerock.idm_authentication" AND forgerock.result: "FAILED"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-forgerock.idm_authentication-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('forgerock.idm_authentication', {
            event: {
              action: 'authentication',
              category: ['authentication'],
              type: ['info'],
              outcome: 'failure',
            },
            forgerock: {
              eventName: 'authentication',
              method: 'MANAGED_USER',
              principal: [faker.internet.username()],
              result: 'FAILED',
              topic: 'authentication',
            },
            user: { name: faker.internet.username() },
          }),
        ),
    },
  ],

  gcp: [
    {
      name: 'GCP Permission Denied',
      description:
        'Detects permission-denied events in GCP audit logs indicating unauthorized access attempts',
      query: 'data_stream.dataset: "gcp.audit" AND gcp.audit.status.code: 7',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-gcp.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('gcp.audit', {
            event: {
              action: 'v1.compute.instances.list',
              category: ['network'],
              type: ['access'],
              outcome: 'failure',
            },
            gcp: {
              audit: {
                authentication_info: { principal_email: faker.internet.email() },
                method_name: 'v1.compute.instances.list',
                service_name: 'compute.googleapis.com',
                status: { code: 7, message: 'PERMISSION_DENIED' },
              },
            },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'GCP IAM Policy Change',
      description: 'Detects IAM policy modifications in GCP that could escalate privileges',
      query: 'data_stream.dataset: "gcp.audit" AND gcp.audit.method_name: "SetIamPolicy"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-gcp.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('gcp.audit', {
            event: {
              action: 'SetIamPolicy',
              category: ['network'],
              type: ['access'],
              outcome: 'success',
            },
            gcp: {
              audit: {
                authentication_info: { principal_email: faker.internet.email() },
                method_name: 'SetIamPolicy',
                service_name: 'cloudresourcemanager.googleapis.com',
                status: { code: 0 },
              },
            },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  gitlab: [
    {
      name: 'GitLab Failed Authentication',
      description: 'Detects failed authentication attempts to GitLab',
      query: 'data_stream.dataset: "gitlab.auth" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-gitlab.auth-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('gitlab.auth', {
            event: {
              action: 'failed-login',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
            },
            gitlab: {
              auth: {
                message: 'Failed Login',
                env: 'production',
              },
            },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'GitLab Repository Visibility Change',
      description: 'Detects project visibility changes that could expose private code',
      query: 'data_stream.dataset: "gitlab.audit" AND gitlab.audit.change: "visibility"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-gitlab.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('gitlab.audit', {
            event: {
              action: 'visibility_changed',
              category: ['configuration'],
              type: ['change'],
            },
            gitlab: {
              audit: {
                change: 'visibility',
                from: 'private',
                to: 'public',
                entity_type: 'Project',
                target_type: 'Project',
              },
            },
            user: { name: faker.internet.username() },
          }),
        ),
    },
    {
      name: 'GitLab API Unauthorized Access',
      description: 'Detects unauthorized API access attempts to GitLab',
      query:
        'data_stream.dataset: "gitlab.api" AND http.response.status_code >= 401 AND http.response.status_code <= 403',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-gitlab.api-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('gitlab.api', {
            event: {
              action: '/api/:version/projects',
              category: ['web'],
              type: ['access'],
              outcome: 'failure',
            },
            gitlab: {
              api: {
                route: '/api/:version/projects',
                meta: { user: faker.internet.username() },
              },
            },
            http: { response: { status_code: 403 } },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  hashicorp_vault: [
    {
      name: 'HashiCorp Vault Access Denied',
      description: 'Detects permission-denied events when accessing Vault secrets',
      query: 'data_stream.dataset: "hashicorp_vault.audit" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-hashicorp_vault.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('hashicorp_vault.audit', {
            event: {
              action: 'read',
              category: ['authentication', 'database'],
              type: ['access'],
              outcome: 'failure',
            },
            hashicorp_vault: {
              audit: {
                type: 'request',
                auth: {
                  display_name: `ldap-${faker.internet.username()}`,
                  policies: ['default'],
                  policy_results: { allowed: false },
                  token_type: 'service',
                },
                request: {
                  operation: 'read',
                  path: 'secret/data/production-credentials',
                  remote_address: faker.internet.ipv4(),
                },
                response: { data: { error: 'permission denied' } },
              },
            },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'HashiCorp Vault Policy Change',
      description: 'Detects policy modifications in Vault that could alter access controls',
      query:
        'data_stream.dataset: "hashicorp_vault.audit" AND hashicorp_vault.audit.request.path: "sys/policy/*"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-hashicorp_vault.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('hashicorp_vault.audit', {
            event: {
              action: 'update',
              category: ['authentication', 'database'],
              type: ['access'],
              outcome: 'success',
            },
            hashicorp_vault: {
              audit: {
                type: 'request',
                auth: {
                  display_name: `ldap-${faker.internet.username()}`,
                  policies: ['default', 'admin'],
                  policy_results: { allowed: true },
                  token_type: 'service',
                },
                request: {
                  operation: 'update',
                  path: 'sys/policy/default',
                  remote_address: faker.internet.ipv4(),
                },
              },
            },
            user: { name: faker.internet.username() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  azure: [
    {
      name: 'Azure Failed Sign-In Attempt',
      description: 'Detects failed sign-in attempts to Azure / Entra ID',
      query: 'data_stream.dataset: "azure.signinlogs" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-azure.signinlogs-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('azure.signinlogs', {
            event: {
              action: 'Sign-in activity',
              category: ['authentication'],
              kind: 'event',
              outcome: 'failure',
              type: ['info'],
            },
            azure: {
              signinlogs: {
                properties: {
                  user_id: faker.string.uuid(),
                  user_principal_name: faker.internet.email(),
                  risk_level_aggregated: 'none',
                  status: { error_code: 50126 },
                },
                result_type: '50126',
              },
            },
            user: {
              email: faker.internet.email(),
              name: faker.internet.email(),
              id: faker.string.uuid(),
            },
            source: { ip: faker.internet.ipv4() },
            cloud: { provider: 'azure' },
          }),
        ),
    },
    {
      name: 'Azure High-Risk Sign-In Detected',
      description: 'Detects high-risk sign-in events flagged by Azure Identity Protection',
      query:
        'data_stream.dataset: "azure.identity_protection" AND azure.identityprotection.properties.risk_level: "high"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-azure.identity_protection-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('azure.identity_protection', {
            event: { action: 'User Risk Detection', kind: 'event' },
            azure: {
              identityprotection: {
                properties: {
                  risk_level: 'high',
                  risk_state: 'atRisk',
                  risk_event_type: 'anonymizedIPAddress',
                  user_id: faker.string.uuid(),
                  user_principal_name: faker.internet.email(),
                  user_display_name: faker.person.fullName(),
                  activity: 'signin',
                },
              },
            },
            user: {
              email: faker.internet.email(),
              id: faker.string.uuid(),
              full_name: faker.person.fullName(),
            },
            source: { ip: faker.internet.ipv4() },
            cloud: { provider: 'azure' },
          }),
        ),
    },
    {
      name: 'Azure Firewall Connection Denied',
      description: 'Detects denied connections through Azure Firewall',
      query: 'data_stream.dataset: "azure.firewall_logs" AND azure.firewall.action: "Deny"',
      severity: 'low',
      riskScore: 21,
      index: ['logs-azure.firewall_logs-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('azure.firewall_logs', {
            event: {
              category: ['network'],
              kind: 'event',
              type: ['connection', 'denied'],
            },
            azure: {
              firewall: {
                action: 'Deny',
                category: 'AzureFirewallNetworkRule',
                operation_name: 'AzureFirewallNetworkRuleLog',
              },
            },
            source: { ip: faker.internet.ipv4() },
            destination: { ip: faker.internet.ipv4() },
            network: { transport: 'tcp' },
            cloud: { provider: 'azure' },
          }),
        ),
    },
    {
      name: 'Suspicious Azure Resource Deletion',
      description: 'Detects successful deletion of Azure resources',
      query:
        'data_stream.dataset: "azure.activitylogs" AND azure.activitylogs.operation_name: *DELETE* AND event.outcome: "success"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-azure.activitylogs-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('azure.activitylogs', {
            event: {
              action: 'MICROSOFT.COMPUTE/VIRTUALMACHINES/DELETE',
              dataset: 'azure.activitylogs',
              kind: 'event',
              outcome: 'success',
            },
            azure: {
              activitylogs: {
                operation_name: 'MICROSOFT.COMPUTE/VIRTUALMACHINES/DELETE',
                result_type: 'Success',
                category: 'Administrative',
              },
            },
            cloud: { provider: 'azure' },
          }),
        ),
    },
  ],

  island_browser: [
    {
      name: 'Island Browser Navigation Blocked',
      description: 'Detects blocked navigation events in Island Browser',
      query:
        'data_stream.dataset: "island_browser.audit" AND island_browser.audit.verdict: "Blocked"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-island_browser.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('island_browser.audit', {
            event: { dataset: 'island_browser.audit', kind: 'event' },
            island_browser: {
              audit: {
                type: 'Navigation',
                verdict: 'Blocked',
                verdict_reason: 'Blocked by DLP policy',
                email: faker.internet.email(),
                top_level_url: `https://${faker.internet.domainName()}`,
              },
            },
            user: { email: faker.internet.email() },
          }),
        ),
    },
    {
      name: 'Island Browser DLP Policy Violation',
      description: 'Detects data loss prevention policy violations in Island Browser',
      query:
        'data_stream.dataset: "island_browser.audit" AND island_browser.audit.verdict_reason: "Blocked by DLP policy"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-island_browser.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('island_browser.audit', {
            event: { dataset: 'island_browser.audit', kind: 'event' },
            island_browser: {
              audit: {
                type: faker.helpers.arrayElement(['Upload', 'Download', 'Copy', 'Paste']),
                verdict: 'Blocked',
                verdict_reason: 'Blocked by DLP policy',
                email: faker.internet.email(),
              },
            },
            user: { email: faker.internet.email() },
          }),
        ),
    },
    {
      name: 'Island Browser Admin Configuration Change',
      description: 'Detects administrative configuration changes in Island Browser',
      query:
        'data_stream.dataset: "island_browser.admin_actions" AND event.action: ("Create" OR "Delete")',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-island_browser.admin_actions-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('island_browser.admin_actions', {
            event: {
              action: faker.helpers.arrayElement(['Create', 'Delete']),
              dataset: 'island_browser.admin_actions',
              kind: 'event',
            },
            island_browser: {
              admin_actions: {
                action_domain: 'SecuritySettings',
                action_type: faker.helpers.arrayElement(['Create', 'Delete']),
                entity_type: faker.helpers.arrayElement(['Policy', 'DLPRule', 'AccessRule']),
                email: faker.internet.email(),
              },
            },
            user: { email: faker.internet.email() },
          }),
        ),
    },
  ],

  jumpcloud: [
    {
      name: 'JumpCloud Failed Admin Login',
      description: 'Detects failed admin login attempts in JumpCloud',
      query:
        'data_stream.dataset: "jumpcloud.events" AND jumpcloud.event.event_type: "admin_login_attempt" AND jumpcloud.event.success: false',
      severity: 'high',
      riskScore: 63,
      index: ['logs-jumpcloud.events-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('jumpcloud.events', {
            event: {
              action: 'admin_login_attempt',
              category: ['authentication'],
              kind: 'event',
              outcome: 'failure',
              type: ['info'],
            },
            jumpcloud: {
              event: {
                event_type: 'admin_login_attempt',
                success: false,
                service: 'directory',
                client_ip: faker.internet.ipv4(),
                initiated_by: { email: faker.internet.email(), type: 'admin' },
              },
            },
            source: { user: { email: faker.internet.email() } },
          }),
        ),
    },
    {
      name: 'JumpCloud Failed User Authentication',
      description: 'Detects failed user login attempts in JumpCloud',
      query:
        'data_stream.dataset: "jumpcloud.events" AND jumpcloud.event.event_type: "user_login_attempt" AND jumpcloud.event.success: false',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-jumpcloud.events-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('jumpcloud.events', {
            event: {
              action: 'user_login_attempt',
              category: ['authentication'],
              kind: 'event',
              outcome: 'failure',
              type: ['info'],
            },
            jumpcloud: {
              event: {
                event_type: 'user_login_attempt',
                success: false,
                service: 'directory',
                client_ip: faker.internet.ipv4(),
                initiated_by: { email: faker.internet.email(), type: 'user' },
              },
            },
            source: { user: { email: faker.internet.email() } },
          }),
        ),
    },
    {
      name: 'JumpCloud User Locked Out',
      description: 'Detects user lockout events in JumpCloud',
      query:
        'data_stream.dataset: "jumpcloud.events" AND jumpcloud.event.event_type: "user_locked_out"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-jumpcloud.events-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('jumpcloud.events', {
            event: {
              action: 'user_locked_out',
              category: ['authentication'],
              kind: 'event',
              outcome: 'failure',
              type: ['info'],
            },
            jumpcloud: {
              event: {
                event_type: 'user_locked_out',
                success: false,
                service: 'directory',
                client_ip: faker.internet.ipv4(),
                initiated_by: { email: faker.internet.email(), type: 'user' },
              },
            },
          }),
        ),
    },
  ],

  keeper: [
    {
      name: 'Keeper Vault Export',
      description: 'Detects vault export events in Keeper Security',
      query: 'data_stream.dataset: "keeper.audit" AND audit_event: "vault_export"',
      severity: 'critical',
      riskScore: 87,
      index: ['logs-keeper.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('keeper.audit', {
            audit_event: 'vault_export',
            category: 'security',
            event: {
              action: 'vault_export',
              category: ['database'],
              kind: 'event',
              module: 'keeper',
              outcome: 'success',
              type: ['access'],
            },
            username: faker.internet.email(),
            user: { email: faker.internet.email(), name: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Keeper Failed Login',
      description: 'Detects failed login attempts to Keeper Security',
      query: 'data_stream.dataset: "keeper.audit" AND audit_event: "failed_login"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-keeper.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('keeper.audit', {
            audit_event: 'failed_login',
            category: 'security',
            event: {
              action: 'failed_login',
              category: ['authentication'],
              kind: 'event',
              module: 'keeper',
              outcome: 'failure',
              type: ['start'],
            },
            username: faker.internet.email(),
            user: { email: faker.internet.email(), name: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Keeper Master Password Changed',
      description: 'Detects master password changes in Keeper Security',
      query: 'data_stream.dataset: "keeper.audit" AND audit_event: "change_master_password"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-keeper.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('keeper.audit', {
            audit_event: 'change_master_password',
            category: 'security',
            event: {
              action: 'change_master_password',
              category: ['authentication', 'web'],
              kind: 'event',
              module: 'keeper',
              outcome: 'success',
              type: ['access', 'info'],
            },
            username: faker.internet.email(),
            user: { email: faker.internet.email(), name: faker.internet.email() },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  keycloak: [
    {
      name: 'Keycloak Login Error',
      description: 'Detects failed login attempts in Keycloak',
      query: 'data_stream.dataset: "keycloak.log" AND keycloak.event_type: "LOGIN_ERROR"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-keycloak.log-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('keycloak.log', {
            event: { dataset: 'keycloak.log' },
            keycloak: {
              event_type: 'LOGIN_ERROR',
              client: { id: 'account-console' },
              realm: { id: 'corp' },
            },
            log: { level: 'WARN', logger: 'org.keycloak.events' },
            message:
              'type=LOGIN_ERROR, realmId=corp, clientId=account-console, error=invalid_credentials',
          }),
        ),
    },
    {
      name: 'Keycloak User Impersonation',
      description: 'Detects user impersonation events in Keycloak',
      query: 'data_stream.dataset: "keycloak.log" AND keycloak.event_type: "IMPERSONATE"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-keycloak.log-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('keycloak.log', {
            event: { dataset: 'keycloak.log' },
            keycloak: {
              event_type: 'IMPERSONATE',
              client: { id: 'admin-cli' },
              realm: { id: 'master' },
            },
            log: { level: 'WARN', logger: 'org.keycloak.events' },
            message: 'type=IMPERSONATE, realmId=master, clientId=admin-cli',
          }),
        ),
    },
    {
      name: 'Keycloak Admin Resource Deletion',
      description: 'Detects administrative resource deletions in Keycloak',
      query: 'data_stream.dataset: "keycloak.log" AND keycloak.admin.operation: "DELETE"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-keycloak.log-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('keycloak.log', {
            event: { dataset: 'keycloak.log' },
            keycloak: {
              event_type: 'DELETE',
              admin: {
                operation: 'DELETE',
                resource: {
                  type: faker.helpers.arrayElement(['User', 'Group', 'Client']),
                  path: `users/${faker.string.uuid()}`,
                },
              },
              realm: { id: 'corp' },
            },
            log: { level: 'WARN', logger: 'org.keycloak.events.admin' },
            message: 'type=DELETE, realmId=corp, operationType=DELETE, resourceType=User',
          }),
        ),
    },
  ],

  lyve_cloud: [
    {
      name: 'Lyve Cloud S3 Access Denied',
      description: 'Detects access denied errors on Lyve Cloud S3 API operations',
      query:
        'data_stream.dataset: "lyve_cloud.audit" AND lyve_cloud.audit.auditEntry.api.status: "AccessDenied"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-lyve_cloud.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('lyve_cloud.audit', {
            event: { kind: 'event' },
            lyve_cloud: {
              audit: {
                auditEntry: {
                  api: { name: 'GetObject', bucket: 'prod-backups', status: 'AccessDenied' },
                },
              },
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
          }),
        ),
    },
    {
      name: 'Lyve Cloud Bucket Deletion',
      description: 'Detects S3 bucket deletion operations on Lyve Cloud',
      query:
        'data_stream.dataset: "lyve_cloud.audit" AND lyve_cloud.audit.auditEntry.api.name: "DeleteBucket"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-lyve_cloud.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('lyve_cloud.audit', {
            event: { kind: 'event' },
            lyve_cloud: {
              audit: {
                auditEntry: {
                  api: { name: 'DeleteBucket', bucket: 'staging-data', status: 'OK' },
                },
              },
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
          }),
        ),
    },
  ],

  mattermost: [
    {
      name: 'Mattermost Configuration Change',
      description:
        'Detects configuration changes in Mattermost which may indicate admin compromise',
      query: 'data_stream.dataset: "mattermost.audit" AND event.action: "updateConfig"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-mattermost.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('mattermost.audit', {
            event: {
              action: 'updateConfig',
              category: ['configuration'],
              type: ['change'],
              outcome: 'success',
              kind: 'event',
            },
            user: { id: faker.string.alphanumeric(26) },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Mattermost User Deactivation',
      description: 'Detects user deactivation events in Mattermost',
      query: 'data_stream.dataset: "mattermost.audit" AND event.action: "deactivateUser"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-mattermost.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('mattermost.audit', {
            event: {
              action: 'deactivateUser',
              category: ['iam'],
              type: ['deletion'],
              outcome: 'success',
              kind: 'event',
            },
            user: { id: faker.string.alphanumeric(26) },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  mongodb_atlas: [
    {
      name: 'MongoDB Atlas Failed Authentication',
      description: 'Detects failed authentication attempts in MongoDB Atlas',
      query:
        'data_stream.dataset: "mongodb_atlas.mongod_audit" AND event.action: "authenticate" AND mongodb_atlas.mongod_audit.result: "Failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-mongodb_atlas.mongod_audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('mongodb_atlas.mongod_audit', {
            event: {
              action: 'authenticate',
              category: ['network', 'authentication'],
              type: ['access', 'info'],
              kind: 'event',
            },
            mongodb_atlas: {
              mongod_audit: {
                result: 'Failure',
                user: { names: [{ db: 'admin', user: faker.internet.username() }] },
              },
            },
          }),
        ),
    },
    {
      name: 'MongoDB Atlas User Dropped',
      description: 'Detects user deletion events in MongoDB Atlas',
      query: 'data_stream.dataset: "mongodb_atlas.mongod_audit" AND event.action: "dropUser"',
      severity: 'high',
      riskScore: 73,
      index: ['logs-mongodb_atlas.mongod_audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('mongodb_atlas.mongod_audit', {
            event: {
              action: 'dropUser',
              category: ['database'],
              type: ['info', 'change'],
              kind: 'event',
            },
            mongodb_atlas: {
              mongod_audit: {
                result: 'Success',
                user: { names: [{ db: 'admin', user: faker.internet.username() }] },
              },
            },
          }),
        ),
    },
    {
      name: 'MongoDB Atlas API Key Created',
      description: 'Detects API key creation events in MongoDB Atlas organization',
      query:
        'data_stream.dataset: "mongodb_atlas.organization" AND mongodb_atlas.organization.event_type.name: "API_KEY_CREATED"',
      severity: 'medium',
      riskScore: 50,
      index: ['logs-mongodb_atlas.organization-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('mongodb_atlas.organization', {
            event: {
              category: ['configuration', 'database'],
              type: ['info', 'access', 'change'],
              kind: 'event',
            },
            mongodb_atlas: {
              organization: {
                event_type: { name: 'API_KEY_CREATED' },
                is_global_admin: false,
              },
            },
            user: { name: faker.internet.email() },
          }),
        ),
    },
  ],

  teleport: [
    {
      name: 'Teleport Failed Login',
      description: 'Detects failed login attempts in Teleport',
      query:
        'data_stream.dataset: "teleport.audit" AND event.action: "user.login" AND event.outcome: "failure"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-teleport.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('teleport.audit', {
            event: {
              action: 'user.login',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
              code: 'T1000W',
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
          }),
        ),
    },
    {
      name: 'Teleport Suspicious Command Execution',
      description:
        'Detects execution of sensitive commands (passwd, shadow, sudoers) via Teleport sessions',
      query:
        'data_stream.dataset: "teleport.audit" AND event.action: "exec" AND (message: *passwd* OR message: *shadow* OR message: *sudoers*)',
      severity: 'high',
      riskScore: 73,
      index: ['logs-teleport.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('teleport.audit', {
            event: {
              action: 'exec',
              category: ['process'],
              type: ['start'],
              kind: 'event',
            },
            message: JSON.stringify({
              event: 'exec',
              command: 'cat /etc/passwd',
              login: faker.internet.username(),
            }),
            user: { name: faker.internet.username(), email: faker.internet.email() },
          }),
        ),
    },
    {
      name: 'Teleport User Password Change',
      description: 'Detects password change events in Teleport',
      query: 'data_stream.dataset: "teleport.audit" AND event.action: "user.password_change"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-teleport.audit-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('teleport.audit', {
            event: {
              action: 'user.password_change',
              category: ['iam'],
              type: ['change'],
              kind: 'event',
            },
            user: { name: faker.internet.username(), email: faker.internet.email() },
          }),
        ),
    },
  ],

  thycotic_ss: [
    {
      name: 'Thycotic Secret Server Failed Login',
      description: 'Detects failed login attempts to Thycotic Secret Server',
      query: 'data_stream.dataset: "thycotic_ss.logs" AND event.action: "login_failed"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-thycotic_ss.logs-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('thycotic_ss.logs', {
            event: {
              action: 'login_failed',
              category: ['authentication'],
              type: ['start'],
              outcome: 'failure',
              kind: 'event',
              provider: 'system',
            },
            user: { full_name: faker.person.fullName(), domain: 'CORP' },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Thycotic Secret Server Password Displayed',
      description: 'Detects password display events which may indicate credential harvesting',
      query: 'data_stream.dataset: "thycotic_ss.logs" AND event.action: "password_displayed"',
      severity: 'high',
      riskScore: 63,
      index: ['logs-thycotic_ss.logs-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('thycotic_ss.logs', {
            event: {
              action: 'password_displayed',
              category: ['iam'],
              type: ['info'],
              kind: 'event',
              provider: 'secret',
            },
            thycotic_ss: {
              event: {
                secret: {
                  name: 'Production Database Credentials',
                  id: String(faker.number.int({ min: 1000, max: 9999 })),
                },
              },
            },
            user: { full_name: faker.person.fullName(), domain: 'CORP' },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'Thycotic Secret Server Secret Checked Out',
      description: 'Detects secret checkout events from Thycotic Secret Server',
      query: 'data_stream.dataset: "thycotic_ss.logs" AND event.action: "secret_checked_out"',
      severity: 'medium',
      riskScore: 50,
      index: ['logs-thycotic_ss.logs-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('thycotic_ss.logs', {
            event: {
              action: 'secret_checked_out',
              category: ['iam'],
              type: ['access'],
              kind: 'event',
              provider: 'secret',
            },
            thycotic_ss: {
              event: {
                secret: {
                  name: faker.helpers.arrayElement([
                    'AWS Root Access Key',
                    'VPN Admin Password',
                    'SSH Key - Production Bastion',
                  ]),
                  id: String(faker.number.int({ min: 1000, max: 9999 })),
                },
              },
            },
            user: { full_name: faker.person.fullName(), domain: 'CORP' },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],

  zoom: [
    {
      name: 'Zoom User Deactivated',
      description: 'Detects user deactivation events in Zoom',
      query: 'data_stream.dataset: "zoom.webhook" AND event.action: "user.deactivated"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-zoom.webhook-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('zoom.webhook', {
            event: {
              action: 'user.deactivated',
              category: ['iam'],
              type: ['user', 'deletion'],
              kind: 'event',
            },
            user: { email: faker.internet.email(), id: faker.string.alphanumeric(22) },
            zoom: { operator: faker.internet.email() },
          }),
        ),
    },
    {
      name: 'Zoom Account Settings Changed',
      description: 'Detects account-level settings changes in Zoom',
      query: 'data_stream.dataset: "zoom.webhook" AND event.action: "account.updated"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-zoom.webhook-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('zoom.webhook', {
            event: {
              action: 'account.updated',
              category: ['iam'],
              type: ['user', 'change'],
              kind: 'event',
            },
            user: { email: faker.internet.email(), id: faker.string.alphanumeric(22) },
            zoom: { operator: faker.internet.email(), account: { account_name: 'Corp' } },
          }),
        ),
    },
    {
      name: 'Zoom Recording Deleted',
      description: 'Detects deletion of meeting recordings in Zoom',
      query: 'data_stream.dataset: "zoom.webhook" AND event.action: "recording.deleted"',
      severity: 'low',
      riskScore: 30,
      index: ['logs-zoom.webhook-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('zoom.webhook', {
            event: {
              action: 'recording.deleted',
              category: ['file'],
              type: ['deletion'],
              kind: 'event',
            },
            user: { email: faker.internet.email(), id: faker.string.alphanumeric(22) },
            zoom: { operator: faker.internet.email() },
          }),
        ),
    },
  ],

  lastpass: [
    {
      name: 'LastPass Failed Login Attempt',
      description: 'Detects failed login attempts to LastPass',
      query:
        'data_stream.dataset: "lastpass.event_report" AND lastpass.event_report.action: "Failed Login Attempt"',
      severity: 'medium',
      riskScore: 47,
      index: ['logs-lastpass.event_report-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('lastpass.event_report', {
            event: {
              action: 'failed login attempt',
              category: ['authentication'],
              kind: 'event',
              outcome: 'failure',
              type: ['start'],
            },
            lastpass: {
              event_report: {
                action: 'Failed Login Attempt',
                ip: faker.internet.ipv4(),
                user_name: faker.internet.email(),
              },
            },
            user: { email: [faker.internet.email()] },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'LastPass Vault Export',
      description: 'Detects vault export events from LastPass',
      query:
        'data_stream.dataset: "lastpass.event_report" AND lastpass.event_report.action: "Vault Export"',
      severity: 'critical',
      riskScore: 87,
      index: ['logs-lastpass.event_report-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('lastpass.event_report', {
            event: {
              action: 'vault export',
              category: ['database'],
              kind: 'event',
              outcome: 'success',
              type: ['info'],
            },
            lastpass: {
              event_report: {
                action: 'Vault Export',
                ip: faker.internet.ipv4(),
                user_name: faker.internet.email(),
              },
            },
            user: { email: [faker.internet.email()] },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
    {
      name: 'LastPass Master Password Reenter',
      description: 'Detects master password re-entry events in LastPass',
      query:
        'data_stream.dataset: "lastpass.event_report" AND lastpass.event_report.action: "Master Password Reenter"',
      severity: 'low',
      riskScore: 21,
      index: ['logs-lastpass.event_report-*'],
      generateMatchingEvents: (count) =>
        Array.from({ length: count }, () =>
          baseEvent('lastpass.event_report', {
            event: {
              action: 'master password reenter',
              category: ['authentication'],
              kind: 'event',
              outcome: 'success',
              type: ['info'],
            },
            lastpass: {
              event_report: {
                action: 'Master Password Reenter',
                ip: faker.internet.ipv4(),
                user_name: faker.internet.email(),
              },
            },
            user: { email: [faker.internet.email()] },
            source: { ip: faker.internet.ipv4() },
          }),
        ),
    },
  ],
};

function getApplicableIntegrations(enabledIntegrations: IntegrationName[]): IntegrationName[] {
  return enabledIntegrations.filter(
    (name) =>
      !EXCLUDED_INTEGRATIONS.includes(name) && INTEGRATION_DETECTION_RULES[name] !== undefined,
  );
}

export async function createIntegrationDetectionRules(
  enabledIntegrations: IntegrationName[],
  space: string,
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
  enabledIntegrations: IntegrationName[],
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
