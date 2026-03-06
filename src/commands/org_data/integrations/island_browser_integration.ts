/**
 * Island Browser Integration
 * Generates user, device, audit, and admin action documents
 * Based on the Elastic island_browser integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap, Device } from '../types';
import { faker } from '@faker-js/faker';

const AUDIT_TYPES: Array<{ type: string; weight: number }> = [
  { type: 'Navigation', weight: 40 },
  { type: 'Download', weight: 15 },
  { type: 'Upload', weight: 10 },
  { type: 'Copy', weight: 8 },
  { type: 'Paste', weight: 8 },
  { type: 'Print', weight: 5 },
  { type: 'Screenshot', weight: 3 },
  { type: 'FileAccess', weight: 6 },
  { type: 'Extension', weight: 5 },
];

const VERDICTS: Array<{ verdict: string; reason: string; weight: number }> = [
  { verdict: 'Allowed', reason: 'Navigation allowed by policy', weight: 70 },
  { verdict: 'Blocked', reason: 'Blocked by DLP policy', weight: 10 },
  { verdict: 'Warned', reason: 'User warned about policy', weight: 10 },
  { verdict: 'Monitored', reason: 'Activity monitored per policy', weight: 10 },
];

const SAAS_APPS = [
  'Microsoft 365',
  'Google Workspace',
  'Salesforce',
  'Slack',
  'GitHub',
  'Jira',
  'Confluence',
  'Figma',
  'Notion',
  'Zoom',
];

const SAAS_CATEGORIES = [
  'Productivity',
  'Communication',
  'Development',
  'Design',
  'Project Management',
  'Cloud Storage',
];

const WEB_CATEGORIES = [
  'Business',
  'Technology',
  'Social Media',
  'News',
  'Finance',
  'Education',
  'Entertainment',
  'Shopping',
];

const ADMIN_ACTION_DOMAINS = [
  'UserManagement',
  'PolicyManagement',
  'SystemSettings',
  'DeviceManagement',
  'SecuritySettings',
  'NetworkConfiguration',
];

const ADMIN_ENTITY_TYPES = [
  'User',
  'Group',
  'Policy',
  'SIEMConnector',
  'AccessRule',
  'DLPRule',
  'BrowserProfile',
];

const ADMIN_ACTION_TYPES = ['Create', 'Update', 'Delete'];

const CONNECTION_NAMES = ['AzureAD', 'Okta', 'Google', 'SAML', 'Email'];

const USER_TYPES = ['Management', 'Standard', 'Admin', 'ReadOnly'];
const USER_SOURCES = ['Email', 'SSO', 'SCIM', 'Manual'];

const BROWSER_VERSIONS = ['1.72.30', '1.71.25', '1.70.18', '1.69.12', '1.68.8'];
const CHROMIUM_VERSIONS = ['139.0.7258.128', '138.0.7204.92', '137.0.7151.68', '136.0.7103.45'];

export class IslandBrowserIntegration extends BaseIntegration {
  readonly packageName = 'island_browser';
  readonly displayName = 'Island Browser';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'user', index: 'logs-island_browser.user-default' },
    { name: 'device', index: 'logs-island_browser.device-default' },
    { name: 'audit', index: 'logs-island_browser.audit-default' },
    { name: 'admin_actions', index: 'logs-island_browser.admin_actions-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const tenantId = `${org.name.toLowerCase().replace(/\s+/g, '-')}-tenant`;

    const userDocs: IntegrationDocument[] = [];
    const deviceDocs: IntegrationDocument[] = [];
    const auditDocs: IntegrationDocument[] = [];
    const adminDocs: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      userDocs.push(this.createUserDocument(employee, org, tenantId));

      for (const device of employee.devices.filter((d) => d.type === 'laptop')) {
        deviceDocs.push(this.createDeviceDocument(employee, device, org, tenantId));
      }

      const auditCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < auditCount; i++) {
        const device = faker.helpers.arrayElement(
          employee.devices.filter((d) => d.type === 'laptop')
        );
        if (device) {
          auditDocs.push(this.createAuditDocument(employee, device, org, tenantId));
        }
      }
    }

    const admins = org.employees.filter(
      (e) => e.department === 'Operations' || e.department === 'Executive'
    );
    for (const admin of admins.slice(0, 3)) {
      const actionCount = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < actionCount; i++) {
        adminDocs.push(this.createAdminActionDocument(admin, tenantId));
      }
    }

    documentsMap.set(this.dataStreams[0].index, userDocs);
    documentsMap.set(this.dataStreams[1].index, deviceDocs);
    documentsMap.set(this.dataStreams[2].index, auditDocs);
    documentsMap.set(this.dataStreams[3].index, adminDocs);

    return documentsMap;
  }

  private createUserDocument(
    employee: Employee,
    org: Organization,
    tenantId: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const userId = `user-${faker.string.alphanumeric(8)}`;
    const groups: string[] = [employee.department];
    if (employee.department === 'Operations' || employee.department === 'Executive') {
      groups.push('Admins');
    }
    groups.push('AllUsers');

    return {
      '@timestamp': timestamp,
      island_browser: {
        user: {
          allowed_tenants_ids: [tenantId],
          connection_name: faker.helpers.arrayElement(CONNECTION_NAMES),
          created_date: this.getRandomTimestamp(720),
          email: employee.email,
          email_verified: true,
          first_name: employee.firstName,
          groups,
          id: faker.string.uuid(),
          invitation_date: this.getRandomTimestamp(740),
          last_login: this.getRandomTimestamp(48),
          last_name: employee.lastName,
          last_seen: this.getRandomTimestamp(24),
          tenant_id: tenantId,
          updated_date: timestamp,
          user_id: userId,
          user_source: faker.helpers.arrayElement(USER_SOURCES),
          user_status: 'Active',
          user_type: faker.helpers.arrayElement(USER_TYPES),
        },
      },
      event: {
        category: ['iam'],
        dataset: 'island_browser.user',
        kind: 'event',
        type: ['user'],
      },
      organization: { id: tenantId },
      related: {
        user: [employee.email, employee.firstName, userId],
      },
      user: {
        domain: org.domain,
        email: employee.email,
        full_name: `${employee.firstName} ${employee.lastName}`,
        group: { name: groups },
        id: userId,
        name: employee.firstName,
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'island_browser.user' },
      tags: ['forwarded', 'island_browser-user'],
    } as IntegrationDocument;
  }

  private createDeviceDocument(
    employee: Employee,
    device: Device,
    org: Organization,
    tenantId: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const userId = `auth0|${faker.string.alphanumeric(32)}`;
    const browserVersion = faker.helpers.arrayElement(BROWSER_VERSIONS);
    const chromiumVersion = faker.helpers.arrayElement(CHROMIUM_VERSIONS);
    const osPlatform =
      device.platform === 'mac' ? 'macOS' : device.platform === 'windows' ? 'Windows' : 'Linux';

    return {
      '@timestamp': timestamp,
      island_browser: {
        device: {
          architecture: 'x86_64',
          auth_method: 'TenantToken',
          browser_name: 'Island',
          browser_update_status: 'UpToDate',
          browser_version: browserVersion,
          chassis_type: 'Laptop',
          chromium_version: chromiumVersion,
          country: employee.country,
          country_code: employee.countryCode,
          created_date: this.getRandomTimestamp(720),
          device_type: 'Laptop',
          disk_encrypted: device.diskEncryptionEnabled,
          email: employee.email,
          external_ip_address: faker.internet.ipv4(),
          id: device.id,
          internal_ip_address: device.ipAddress,
          is_archived: false,
          is_default_browser: faker.datatype.boolean(0.6),
          is_virtual_machine: false,
          island_platform: 'Browser',
          last_seen: this.getRandomTimestamp(24),
          machine_id: faker.string.alphanumeric(28),
          machine_name: `${employee.userName}-${device.platform}`,
          manufacturer: device.platform === 'mac' ? 'Apple Inc.' : 'Dell Inc.',
          os_firewall_enabled: true,
          os_platform: osPlatform,
          os_screen_lock_enabled: true,
          os_user_name: employee.userName,
          policy_update_time: this.getRandomTimestamp(168),
          status: 'Active',
          sync_enabled: true,
          tenant_id: tenantId,
          updated_date: timestamp,
          user_id: userId,
          user_name: `${employee.firstName} ${employee.lastName}`,
        },
      },
      device: {
        manufacturer: device.platform === 'mac' ? 'Apple Inc.' : 'Dell Inc.',
        model: { name: device.platform === 'mac' ? 'MacBookPro18,1' : 'Latitude 5520' },
      },
      event: {
        category: ['host'],
        dataset: 'island_browser.device',
        kind: 'asset',
        type: ['info'],
      },
      host: {
        architecture: 'x86_64',
        id: device.id,
        ip: [device.ipAddress],
        mac: [device.macAddress],
        name: `${employee.userName}-${device.platform}`,
        os: { platform: osPlatform },
        type: 'Laptop',
      },
      organization: { id: tenantId },
      related: {
        hosts: [device.id, `${employee.userName}-${device.platform}`],
        ip: [device.ipAddress],
        user: [employee.email, employee.userName, userId],
      },
      user: {
        domain: org.domain,
        email: employee.email,
        id: userId,
        name: `${employee.firstName} ${employee.lastName}`,
      },
      user_agent: { name: 'Island' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'island_browser.device' },
      tags: ['forwarded', 'island_browser-device'],
    } as IntegrationDocument;
  }

  private createAuditDocument(
    employee: Employee,
    device: Device,
    org: Organization,
    tenantId: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const auditType = faker.helpers.weightedArrayElement(
      AUDIT_TYPES.map((a) => ({ value: a, weight: a.weight }))
    );
    const verdictInfo = faker.helpers.weightedArrayElement(
      VERDICTS.map((v) => ({ value: v, weight: v.weight }))
    );
    const saasApp = faker.helpers.arrayElement(SAAS_APPS);
    const sourceIp = device.ipAddress;
    const publicIp = faker.internet.ipv4();
    const userId = `auth0|${faker.string.alphanumeric(32)}`;
    const domain = faker.internet.domainName();

    return {
      '@timestamp': timestamp,
      island_browser: {
        audit: {
          client_event_id: faker.string.uuid(),
          compatibility_mode: 'None',
          country: employee.country,
          country_code: employee.countryCode,
          created_date: timestamp,
          device_id: device.id,
          device_posture_matching_details: 'Device meets all security requirements',
          domain_or_tenant: org.domain,
          email: employee.email,
          id: faker.string.uuid(),
          incognito: false,
          is_island_private_access: false,
          machine_id: faker.string.alphanumeric(28),
          machine_name: `${employee.userName}-${device.platform}`,
          matched_device_posture: 'Compliant',
          matched_user_group: employee.department,
          origin: 'Island',
          os_platform:
            device.platform === 'mac'
              ? 'macOS'
              : device.platform === 'windows'
                ? 'Windows'
                : 'Linux',
          os_user_name: employee.userName,
          public_ip: publicIp,
          region: employee.country,
          saas_application_category: faker.helpers.arrayElement(SAAS_CATEGORIES),
          saas_application_name: saasApp,
          short_top_level_url: domain,
          source_ip: sourceIp,
          submitted_url: `https://${domain}/page`,
          tenant_id: tenantId,
          timestamp,
          top_level_url: `https://${domain}`,
          type: auditType.type,
          updated_date: timestamp,
          url_web_categories: faker.helpers.arrayElements(WEB_CATEGORIES, { min: 1, max: 2 }),
          url_web_reputation: faker.number.int({ min: 20, max: 100 }),
          user_id: userId,
          user_name: `${employee.firstName} ${employee.lastName}`,
          verdict: verdictInfo.verdict,
          verdict_reason: verdictInfo.reason,
          website_top_level_url: `https://${domain}`,
        },
      },
      device: { id: device.id },
      event: {
        dataset: 'island_browser.audit',
        kind: 'event',
      },
      host: {
        id: device.id,
        name: `${employee.userName}-${device.platform}`,
        os: {
          platform:
            device.platform === 'mac'
              ? 'macOS'
              : device.platform === 'windows'
                ? 'Windows'
                : 'Linux',
        },
      },
      organization: { id: tenantId },
      rule: {
        id: `rule-${faker.string.alphanumeric(5)}`,
        name: `${employee.department} ${auditType.type} Policy`,
      },
      service: { name: saasApp },
      source: {
        ip: sourceIp,
        nat: { ip: publicIp },
      },
      url: {
        domain,
        original: `https://${domain}`,
        scheme: 'https',
      },
      related: {
        hosts: [device.id, `${employee.userName}-${device.platform}`],
        ip: [publicIp, sourceIp],
        user: [employee.email, employee.userName, userId],
      },
      user: {
        domain: org.domain,
        email: employee.email,
        id: userId,
        name: `${employee.firstName} ${employee.lastName}`,
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'island_browser.audit' },
      tags: ['forwarded', 'island_browser-audit'],
    } as IntegrationDocument;
  }

  private createAdminActionDocument(admin: Employee, tenantId: string): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const actionDomain = faker.helpers.arrayElement(ADMIN_ACTION_DOMAINS);
    const entityType = faker.helpers.arrayElement(ADMIN_ENTITY_TYPES);
    const actionType = faker.helpers.arrayElement(ADMIN_ACTION_TYPES);
    const sourceIp = faker.internet.ipv4();
    const userId = `auth0|${faker.string.alphanumeric(32)}`;

    return {
      '@timestamp': timestamp,
      island_browser: {
        admin_actions: {
          action_domain: actionDomain,
          action_type: actionType,
          created_date: timestamp,
          email: admin.email,
          entity_id: faker.string.uuid(),
          entity_name: `${entityType}-${faker.string.alphanumeric(6)}`,
          entity_type: entityType,
          id: faker.string.uuid(),
          source_ip: sourceIp,
          tenant_id: tenantId,
          timestamp,
          updated_date: timestamp,
          user_id: userId,
        },
      },
      event: {
        action: actionType,
        dataset: 'island_browser.admin_actions',
        kind: 'event',
      },
      organization: { id: tenantId },
      related: {
        ip: [sourceIp],
        user: [admin.email, userId],
      },
      source: { ip: sourceIp },
      user: {
        domain: admin.email.split('@')[1],
        email: admin.email,
        id: userId,
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'island_browser.admin_actions',
      },
      tags: ['forwarded', 'island_browser-admin_actions'],
    } as IntegrationDocument;
  }
}
