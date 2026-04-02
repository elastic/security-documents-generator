/**
 * Island Browser Integration
 * Generates user, device, audit, and admin action documents in raw/pre-pipeline format.
 * Documents have `message` containing Island API JSON (camelCase) for the ingest pipeline.
 * Based on the Elastic island_browser integration package.
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
  type AgentData,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap, type Device } from '../types.ts';
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

/** Derive stable Island userId from employee for correlation */
function islandUserId(employee: Employee): string {
  return `island-${employee.oktaUserId}`;
}

/** Derive stable machineId from device for correlation between device and audit */
function islandMachineId(device: Device): string {
  return device.id.replace(/-/g, '').slice(0, 28) || `machine-${device.id}`;
}

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
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const tenantId = `${org.name.toLowerCase().replace(/\s+/g, '-')}-tenant`;

    const userDocs: IntegrationDocument[] = [];
    const deviceDocs: IntegrationDocument[] = [];
    const auditDocs: IntegrationDocument[] = [];
    const adminDocs: IntegrationDocument[] = [];

    const centralAgent = this.buildCentralAgent(org);
    for (const employee of org.employees) {
      userDocs.push(this.createUserDocument(employee, org, tenantId, centralAgent));

      for (const device of employee.devices.filter((d) => d.type === 'laptop')) {
        const hostname = `${employee.userName}-${device.platform}`;
        const localAgent = this.buildLocalAgent(device, hostname);
        deviceDocs.push(this.createDeviceDocument(employee, device, org, tenantId, localAgent));
      }

      const auditCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < auditCount; i++) {
        const device = faker.helpers.arrayElement(
          employee.devices.filter((d) => d.type === 'laptop'),
        );
        if (device) {
          const hostname = `${employee.userName}-${device.platform}`;
          const localAgent = this.buildLocalAgent(device, hostname);
          auditDocs.push(this.createAuditDocument(employee, device, org, tenantId, localAgent));
        }
      }
    }

    const admins = org.employees.filter(
      (e) => e.department === 'Operations' || e.department === 'Executive',
    );
    for (const admin of admins.slice(0, 3)) {
      const actionCount = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < actionCount; i++) {
        adminDocs.push(this.createAdminActionDocument(admin, tenantId, centralAgent));
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
    tenantId: string,
    agentData: AgentData,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const groups: string[] = [employee.department];
    if (employee.department === 'Operations' || employee.department === 'Executive') {
      groups.push('Admins');
    }
    groups.push('AllUsers');

    const raw: Record<string, unknown> = {
      allowedTenantsIds: [tenantId],
      claims: {},
      connectionName: faker.helpers.arrayElement(CONNECTION_NAMES),
      createdDate: this.getRandomTimestamp(720),
      email: employee.email,
      emailVerified: true,
      expirationDate: null,
      firstName: employee.firstName,
      groups,
      id: faker.string.uuid(),
      invitationDate: this.getRandomTimestamp(740),
      lastName: employee.lastName,
      lastLogin: this.getRandomTimestamp(48),
      lastSeen: this.getRandomTimestamp(24),
      scimId: null,
      tenantId,
      updatedDate: timestamp,
      userId: islandUserId(employee),
      userSource: faker.helpers.arrayElement(USER_SOURCES),
      userStatus: 'Active',
      userType: faker.helpers.arrayElement(USER_TYPES),
    };

    return {
      '@timestamp': timestamp,
      agent: agentData,
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'island_browser.user' },
    } as IntegrationDocument;
  }

  private createDeviceDocument(
    employee: Employee,
    device: Device,
    org: Organization,
    tenantId: string,
    agentData: AgentData,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const browserVersion = faker.helpers.arrayElement(BROWSER_VERSIONS);
    const chromiumVersion = faker.helpers.arrayElement(CHROMIUM_VERSIONS);
    const osPlatform =
      device.platform === 'mac' ? 'macOS' : device.platform === 'windows' ? 'Windows' : 'Linux';

    const raw: Record<string, unknown> = {
      architecture: 'x86_64',
      authMethod: 'TenantToken',
      browserName: 'Island',
      browserUpdateStatus: 'UpToDate',
      browserVersion,
      chassisType: 'Laptop',
      chromiumVersion,
      country: employee.country,
      countryCode: employee.countryCode,
      createdDate: this.getRandomTimestamp(720),
      deviceType: 'Laptop',
      diskEncrypted: device.diskEncryptionEnabled,
      email: employee.email,
      externalIpAddress: faker.internet.ipv4(),
      id: device.id,
      internalIpAddress: device.ipAddress,
      isArchived: false,
      isDefaultBrowser: faker.datatype.boolean(0.6),
      isVirtualMachine: false,
      islandPlatform: 'Browser',
      lastSeen: this.getRandomTimestamp(24),
      machineId: islandMachineId(device),
      machineName: `${employee.userName}-${device.platform}`,
      manufacturer: device.platform === 'mac' ? 'Apple Inc.' : 'Dell Inc.',
      osFirewallEnabled: true,
      osPlatform,
      osScreenLockEnabled: true,
      osUserName: employee.userName,
      policyUpdateTime: this.getRandomTimestamp(168),
      status: 'Active',
      syncEnabled: true,
      tenantId,
      updatedDate: timestamp,
      userId: islandUserId(employee),
      userName: `${employee.firstName} ${employee.lastName}`,
    };

    return {
      '@timestamp': timestamp,
      agent: agentData,
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'island_browser.device' },
    } as IntegrationDocument;
  }

  private createAuditDocument(
    employee: Employee,
    device: Device,
    org: Organization,
    tenantId: string,
    agentData: AgentData,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const auditType = faker.helpers.weightedArrayElement(
      AUDIT_TYPES.map((a) => ({ value: a, weight: a.weight })),
    );
    const verdictInfo = faker.helpers.weightedArrayElement(
      VERDICTS.map((v) => ({ value: v, weight: v.weight })),
    );
    const saasApp = faker.helpers.arrayElement(SAAS_APPS);
    const sourceIp = device.ipAddress;
    const publicIp = faker.internet.ipv4();
    const domain = faker.internet.domainName();
    const osPlatform =
      device.platform === 'mac' ? 'macOS' : device.platform === 'windows' ? 'Windows' : 'Linux';

    const raw: Record<string, unknown> = {
      clientEventId: faker.string.uuid(),
      compatibilityMode: 'None',
      country: employee.country,
      countryCode: employee.countryCode,
      createdDate: timestamp,
      deviceId: device.id,
      devicePostureMatchingDetails: 'Device meets all security requirements',
      domainOrTenant: org.domain,
      email: employee.email,
      id: faker.string.uuid(),
      incognito: false,
      isIslandPrivateAccess: false,
      machineId: islandMachineId(device),
      machineName: `${employee.userName}-${device.platform}`,
      matchedDevicePosture: 'Compliant',
      matchedUserGroup: employee.department,
      origin: 'Island',
      osPlatform,
      osUserName: employee.userName,
      publicIp,
      region: employee.country,
      saasApplicationCategory: faker.helpers.arrayElement(SAAS_CATEGORIES),
      saasApplicationName: saasApp,
      shortTopLevelUrl: domain,
      sourceIp,
      submittedUrl: `https://${domain}/page`,
      tenantId,
      timestamp,
      topLevelUrl: `https://${domain}`,
      type: auditType.type,
      updatedDate: timestamp,
      urlWebCategories: faker.helpers.arrayElements(WEB_CATEGORIES, { min: 1, max: 2 }),
      urlWebReputation: faker.number.int({ min: 20, max: 100 }),
      userId: islandUserId(employee),
      userName: `${employee.firstName} ${employee.lastName}`,
      verdict: verdictInfo.verdict,
      verdictReason: verdictInfo.reason,
      websiteTopLevelUrl: `https://${domain}`,
    };

    return {
      '@timestamp': timestamp,
      agent: agentData,
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'island_browser.audit' },
    } as IntegrationDocument;
  }

  private createAdminActionDocument(
    admin: Employee,
    tenantId: string,
    agentData: AgentData,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const actionDomain = faker.helpers.arrayElement(ADMIN_ACTION_DOMAINS);
    const entityType = faker.helpers.arrayElement(ADMIN_ENTITY_TYPES);
    const actionType = faker.helpers.arrayElement(ADMIN_ACTION_TYPES);
    const sourceIp = faker.internet.ipv4();

    const raw: Record<string, unknown> = {
      actionDomain,
      actionType,
      createdDate: timestamp,
      email: admin.email,
      entityId: faker.string.uuid(),
      entityName: `${entityType}-${faker.string.alphanumeric(6)}`,
      entityType,
      id: faker.string.uuid(),
      sourceIp,
      tenantId,
      timestamp,
      updatedDate: timestamp,
      userId: islandUserId(admin),
    };

    return {
      '@timestamp': timestamp,
      agent: agentData,
      message: JSON.stringify(raw),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'island_browser.admin_actions',
      },
    } as IntegrationDocument;
  }
}
