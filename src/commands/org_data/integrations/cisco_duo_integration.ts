/**
 * Cisco Duo Integration
 * Generates MFA authentication log documents for the cisco_duo.auth data stream
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap, Employee } from '../types';
import { faker } from '@faker-js/faker';

/**
 * Duo authentication factors
 */
const DUO_FACTORS = [
  { name: 'Duo Push', weight: 60 },
  { name: 'Phone Call', weight: 10 },
  { name: 'Passcode', weight: 10 },
  { name: 'WebAuthn Credential', weight: 15 },
  { name: 'Remembered Device', weight: 5 },
];

/**
 * Duo authentication results
 */
const DUO_RESULTS = [
  { value: 'SUCCESS', weight: 90 },
  { value: 'DENIED', weight: 7 },
  { value: 'FRAUD', weight: 1 },
  { value: 'TIMEOUT', weight: 2 },
];

/**
 * Duo denial reasons
 */
const DUO_DENIAL_REASONS: Record<string, string> = {
  DENIED: 'User denied this request',
  FRAUD: 'User reported fraud',
  TIMEOUT: 'Push notification timed out',
};

/**
 * Applications protected by Duo
 */
const DUO_APPLICATIONS = [
  { name: 'Okta SSO', key: 'DIXXXXXXXXXXXXXXXX01' },
  { name: 'AWS Console', key: 'DIXXXXXXXXXXXXXXXX02' },
  { name: 'GitHub Enterprise', key: 'DIXXXXXXXXXXXXXXXX03' },
  { name: 'VPN Gateway', key: 'DIXXXXXXXXXXXXXXXX04' },
  { name: 'Salesforce', key: 'DIXXXXXXXXXXXXXXXX05' },
  { name: 'Microsoft 365', key: 'DIXXXXXXXXXXXXXXXX06' },
  { name: '1Password', key: 'DIXXXXXXXXXXXXXXXX07' },
  { name: 'Jira', key: 'DIXXXXXXXXXXXXXXXX08' },
];

/**
 * Cisco Duo Integration
 */
export class CiscoDuoIntegration extends BaseIntegration {
  readonly packageName = 'cisco_duo';
  readonly displayName = 'Cisco Duo';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'auth', index: 'logs-cisco_duo.auth-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const authDocs: IntegrationDocument[] = [];
    const eventsPerEmployee = this.getEventsPerEmployee(org.size);

    for (const employee of org.employees) {
      const eventCount = faker.number.int({
        min: eventsPerEmployee.min,
        max: eventsPerEmployee.max,
      });
      for (let i = 0; i < eventCount; i++) {
        authDocs.push(this.generateAuthDocument(employee, org));
      }
    }

    documentsMap.set('logs-cisco_duo.auth-default', authDocs);
    return documentsMap;
  }

  private generateAuthDocument(employee: Employee, _org: Organization): IntegrationDocument {
    const factor = faker.helpers.weightedArrayElement(
      DUO_FACTORS.map((f) => ({ value: f.name, weight: f.weight }))
    );
    const result = faker.helpers.weightedArrayElement(
      DUO_RESULTS.map((r) => ({ value: r.value, weight: r.weight }))
    );
    const application = faker.helpers.arrayElement(DUO_APPLICATIONS);
    const accessIp = faker.internet.ipv4();
    const timestamp = this.getRandomTimestamp(72);
    const laptop = employee.devices.find((d) => d.type === 'laptop');
    const mobile = employee.devices.find((d) => d.type === 'mobile');

    const osName = this.mapDeviceOs(laptop?.platform || 'windows');

    const rawEvent = {
      timestamp: Math.floor(new Date(timestamp).getTime() / 1000),
      isotimestamp: timestamp,
      event_type: 'authentication',
      result: result.toLowerCase(),
      factor: factor.toLowerCase().replace(/\s+/g, '_'),
      reason: result !== 'SUCCESS' ? DUO_DENIAL_REASONS[result] || 'Unknown' : 'user_approved',
      txid: faker.string.uuid(),
      email: employee.email,
      alias: employee.userName,
      user: {
        key: employee.duoUserId,
        name: employee.email,
        groups: [employee.department, 'Duo Users'],
      },
      application: {
        name: application.name,
        key: application.key,
      },
      access_device: {
        ip: accessIp,
        hostname: laptop ? `${employee.userName}-${laptop.platform}` : null,
        browser: faker.helpers.arrayElement(['Chrome', 'Firefox', 'Safari', 'Edge']),
        browser_version: '120.0.0.0',
        os: osName,
        os_version: this.mapOsVersion(laptop?.platform || 'windows'),
        is_encryption_enabled: laptop?.diskEncryptionEnabled ?? true,
        is_firewall_enabled: true,
        is_password_set: true,
        flash_version: 'uninstalled',
        java_version: 'uninstalled',
        location: {
          city: employee.city,
          state: employee.country,
          country: employee.country,
        },
      },
      auth_device: {
        ip: faker.internet.ipv4(),
        name: mobile ? mobile.displayName : 'Unknown',
        location: {
          city: employee.city,
          state: employee.country,
          country: employee.country,
        },
      },
      trusted_endpoint_status: faker.helpers.arrayElement(['trusted', 'not trusted', 'unknown']),
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'cisco_duo.auth' },
      tags: ['forwarded', 'cisco_duo-auth', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private mapDeviceOs(platform: string): string {
    const map: Record<string, string> = { mac: 'Mac OS X', windows: 'Windows', linux: 'Linux' };
    return map[platform] || platform;
  }

  private mapOsVersion(platform: string): string {
    const map: Record<string, string> = {
      mac: '14.2.1',
      windows: '10.0.22621',
      linux: '6.5.0-ubuntu',
    };
    return map[platform] || '1.0';
  }

  private getEventsPerEmployee(size: string): { min: number; max: number } {
    switch (size) {
      case 'small':
        return { min: 1, max: 5 };
      case 'medium':
        return { min: 1, max: 5 };
      case 'enterprise':
        return { min: 1, max: 5 };
      default:
        return { min: 1, max: 5 };
    }
  }
}
