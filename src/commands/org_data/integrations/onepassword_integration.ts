/**
 * 1Password Integration
 * Generates sign-in attempt and item usage documents
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap, Employee, DepartmentName, OnePasswordVault } from '../types';
import { faker } from '@faker-js/faker';

/**
 * 1Password item categories by department
 */
const ITEM_CATEGORIES_BY_DEPT: Record<
  DepartmentName,
  Array<{ category: string; title: string; weight: number }>
> = {
  'Product & Engineering': [
    { category: 'Login', title: 'GitHub - Personal Access Token', weight: 20 },
    { category: 'Login', title: 'AWS Console', weight: 15 },
    { category: 'Login', title: 'Docker Hub', weight: 10 },
    { category: 'Login', title: 'npm Registry', weight: 10 },
    { category: 'Server', title: 'Production Database', weight: 10 },
    { category: 'Server', title: 'Staging SSH Key', weight: 10 },
    { category: 'API Credential', title: 'Datadog API Key', weight: 10 },
    { category: 'API Credential', title: 'Sentry Auth Token', weight: 5 },
    { category: 'Login', title: 'Jira', weight: 5 },
    { category: 'Secure Note', title: 'On-call Runbook Secrets', weight: 5 },
  ],
  'Sales & Marketing': [
    { category: 'Login', title: 'Salesforce CRM', weight: 30 },
    { category: 'Login', title: 'HubSpot', weight: 20 },
    { category: 'Login', title: 'LinkedIn Sales Navigator', weight: 15 },
    { category: 'Login', title: 'Mailchimp', weight: 10 },
    { category: 'Login', title: 'Google Analytics', weight: 10 },
    { category: 'Login', title: 'Zoom', weight: 10 },
    { category: 'Credit Card', title: 'Marketing Budget Card', weight: 5 },
  ],
  'Customer Success': [
    { category: 'Login', title: 'Zendesk', weight: 30 },
    { category: 'Login', title: 'Intercom', weight: 20 },
    { category: 'Login', title: 'Salesforce CRM', weight: 20 },
    { category: 'Login', title: 'Calendly', weight: 10 },
    { category: 'Login', title: 'Notion', weight: 10 },
    { category: 'Login', title: 'Zoom', weight: 10 },
  ],
  Operations: [
    { category: 'Login', title: 'Workday HR', weight: 20 },
    { category: 'Login', title: 'NetSuite', weight: 15 },
    { category: 'Login', title: 'ADP Payroll', weight: 15 },
    { category: 'Login', title: 'DocuSign', weight: 10 },
    { category: 'Login', title: 'BambooHR', weight: 10 },
    { category: 'Server', title: 'IT Admin Console', weight: 10 },
    { category: 'API Credential', title: 'SSO Admin Key', weight: 5 },
    { category: 'Secure Note', title: 'Vendor Agreements', weight: 5 },
  ],
  Executive: [
    { category: 'Login', title: 'Board Management Portal', weight: 25 },
    { category: 'Login', title: 'Bloomberg Terminal', weight: 15 },
    { category: 'Login', title: 'Salesforce CRM', weight: 15 },
    { category: 'Login', title: 'DocuSign', weight: 15 },
    { category: 'Credit Card', title: 'Corporate Amex', weight: 10 },
    { category: 'Secure Note', title: 'M&A Documents Access', weight: 10 },
    { category: 'Login', title: 'Investor Portal', weight: 10 },
  ],
};

/**
 * 1Password sign-in types
 */
const SIGNIN_TYPES = ['sso', 'credentials', 'biometrics'];

/**
 * 1Password client app names
 */
const CLIENT_APPS = [
  '1Password for Mac',
  '1Password for Windows',
  '1Password for Linux',
  '1Password Browser Extension - Chrome',
  '1Password Browser Extension - Firefox',
  '1Password Browser Extension - Safari',
  '1Password for iOS',
  '1Password for Android',
];

/**
 * 1Password Integration
 */
export class OnePasswordIntegration extends BaseIntegration {
  readonly packageName = '1password';
  readonly displayName = '1Password';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'signin_attempts', index: 'logs-1password.signin_attempts-default' },
    { name: 'item_usages', index: 'logs-1password.item_usages-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const signinDocs: IntegrationDocument[] = [];
    const itemDocs: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      // Sign-in attempts (1-3 per employee)
      const signinCount = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < signinCount; i++) {
        signinDocs.push(this.generateSigninDocument(employee, org));
      }

      // Item usages (2-6 per employee)
      const itemCount = faker.number.int({ min: 2, max: 6 });
      for (let i = 0; i < itemCount; i++) {
        itemDocs.push(this.generateItemUsageDocument(employee, org));
      }
    }

    documentsMap.set('logs-1password.signin_attempts-default', signinDocs);
    documentsMap.set('logs-1password.item_usages-default', itemDocs);
    return documentsMap;
  }

  private generateSigninDocument(employee: Employee, _org: Organization): IntegrationDocument {
    const sourceIp = faker.internet.ipv4();
    const success = faker.datatype.boolean(0.95);
    const timestamp = this.getRandomTimestamp(72);
    const sessionUuid = faker.string.uuid();
    const rawEvent = {
      uuid: faker.string.uuid(),
      timestamp,
      category: success ? 'success' : 'failure',
      type: faker.helpers.arrayElement(SIGNIN_TYPES),
      session_uuid: sessionUuid,
      country: employee.countryCode,
      client: {
        ip_address: sourceIp,
        app_name: faker.helpers.arrayElement(CLIENT_APPS),
        app_version: '8.10.24',
        platform_name: this.mapPlatformName(employee),
        platform_version: this.mapPlatformVersion(employee),
        os_name: this.mapOsName(employee),
        os_version: this.mapOsVersion(employee),
      },
      target_user: {
        uuid: employee.onePasswordUuid,
        email: employee.email,
        name: `${employee.firstName} ${employee.lastName}`,
      },
      details: null,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: '1password.signin_attempts' },
      tags: ['forwarded', '1password-signin_attempts', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private generateItemUsageDocument(employee: Employee, org: Organization): IntegrationDocument {
    const items =
      ITEM_CATEGORIES_BY_DEPT[employee.department] || ITEM_CATEGORIES_BY_DEPT['Operations'];
    const item = faker.helpers.weightedArrayElement(
      items.map((i) => ({ value: i, weight: i.weight }))
    );
    const vault = this.pickVault(employee, org);
    const sourceIp = faker.internet.ipv4();
    const timestamp = this.getRandomTimestamp(72);

    const rawEvent = {
      uuid: faker.string.uuid(),
      timestamp,
      action: faker.helpers.arrayElement(['fill', 'reveal', 'copy', 'secure-copy']),
      used_version: faker.number.int({ min: 1, max: 5 }),
      vault_uuid: vault.id,
      item_uuid: faker.string.uuid(),
      item: {
        title: item.title,
        category: item.category,
      },
      client: {
        ip_address: sourceIp,
        app_name: faker.helpers.arrayElement(CLIENT_APPS),
        app_version: '8.10.24',
        platform_name: this.mapPlatformName(employee),
        platform_version: this.mapPlatformVersion(employee),
        os_name: this.mapOsName(employee),
        os_version: this.mapOsVersion(employee),
      },
      user: {
        uuid: employee.onePasswordUuid,
        email: employee.email,
        name: `${employee.firstName} ${employee.lastName}`,
      },
      location: {
        city: employee.city,
        country: employee.country,
        latitude: Number(faker.location.latitude()),
        longitude: Number(faker.location.longitude()),
        region: employee.country,
      },
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: '1password.item_usages' },
      tags: ['forwarded', '1password-item_usages', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private pickVault(employee: Employee, org: Organization): OnePasswordVault {
    const vaults = org.onePasswordVaults;
    // Pick vault based on department
    const deptVaultName = this.mapDeptToVault(employee.department);
    const deptVault = vaults.find((v) => v.name === deptVaultName);
    const sharedVault = vaults.find((v) => v.name === 'Shared')!;

    // 60% department vault, 30% shared, 10% infrastructure
    const roll = faker.number.float({ min: 0, max: 1 });
    if (roll < 0.6 && deptVault) return deptVault;
    if (roll < 0.9) return sharedVault;
    return vaults.find((v) => v.name === 'Infrastructure') || sharedVault;
  }

  private mapDeptToVault(dept: DepartmentName): string {
    const map: Record<DepartmentName, string> = {
      'Product & Engineering': 'Engineering',
      'Sales & Marketing': 'Sales & Marketing',
      'Customer Success': 'Shared',
      Operations: 'Operations',
      Executive: 'Executive',
    };
    return map[dept] || 'Shared';
  }

  private mapPlatformName(employee: Employee): string {
    const laptop = employee.devices.find((d) => d.type === 'laptop');
    if (!laptop) return 'Unknown';
    const map: Record<string, string> = { mac: 'macOS', windows: 'Windows', linux: 'Linux' };
    return map[laptop.platform] || 'Unknown';
  }

  private mapPlatformVersion(employee: Employee): string {
    const laptop = employee.devices.find((d) => d.type === 'laptop');
    if (!laptop) return '1.0';
    const map: Record<string, string> = { mac: '14.2.1', windows: '10.0.22621', linux: '6.5.0' };
    return map[laptop.platform] || '1.0';
  }

  private mapOsName(employee: Employee): string {
    return this.mapPlatformName(employee);
  }

  private mapOsVersion(employee: Employee): string {
    return this.mapPlatformVersion(employee);
  }
}
