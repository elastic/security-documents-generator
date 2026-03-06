/**
 * Bitwarden Integration
 * Generates credential management audit and organizational documents
 * Based on the Elastic bitwarden integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const EVENT_TYPES: Array<{ value: string; code: number; weight: number }> = [
  { value: 'User_LoggedIn', code: 1000, weight: 30 },
  { value: 'User_ChangedPassword', code: 1001, weight: 5 },
  { value: 'User_Updated2fa', code: 1002, weight: 3 },
  { value: 'User_Disabled2fa', code: 1003, weight: 1 },
  { value: 'User_Recovered2fa', code: 1004, weight: 1 },
  { value: 'User_FailedLogIn', code: 1005, weight: 10 },
  { value: 'User_FailedLogIn2fa', code: 1006, weight: 5 },
  { value: 'User_ExportedVault', code: 1007, weight: 2 },
  { value: 'Cipher_Created', code: 1100, weight: 15 },
  { value: 'Cipher_Updated', code: 1101, weight: 10 },
  { value: 'Cipher_Deleted', code: 1102, weight: 3 },
  { value: 'Cipher_Shared', code: 1103, weight: 5 },
  { value: 'Collection_Created', code: 1300, weight: 3 },
  { value: 'Group_Created', code: 1400, weight: 2 },
  { value: 'OrganizationUser_Invited', code: 1500, weight: 3 },
  { value: 'OrganizationUser_Confirmed', code: 1501, weight: 2 },
];

const DEVICE_TYPES: Array<{ name: string; value: number }> = [
  { name: 'Android', value: 0 },
  { name: 'iOS', value: 1 },
  { name: 'ChromeExtension', value: 2 },
  { name: 'FirefoxExtension', value: 3 },
  { name: 'WindowsDesktop', value: 6 },
  { name: 'MacOsDesktop', value: 7 },
  { name: 'LinuxDesktop', value: 8 },
  { name: 'ChromeBrowser', value: 9 },
  { name: 'FirefoxBrowser', value: 10 },
  { name: 'WebVault', value: 15 },
  { name: 'CLI', value: 14 },
];

const MEMBER_STATUSES: Array<{ name: string; value: number }> = [
  { name: 'Invited', value: 0 },
  { name: 'Accepted', value: 1 },
  { name: 'Confirmed', value: 2 },
];

const MEMBER_TYPES: Array<{ name: string; value: number }> = [
  { name: 'Owner', value: 0 },
  { name: 'Admin', value: 1 },
  { name: 'User', value: 2 },
  { name: 'Manager', value: 3 },
];

const POLICY_TYPES: Array<{ name: string; value: number }> = [
  { name: 'TwoFactorAuthentication', value: 0 },
  { name: 'MasterPassword', value: 1 },
  { name: 'PasswordGenerator', value: 2 },
  { name: 'SingleOrg', value: 3 },
  { name: 'RequireSso', value: 4 },
  { name: 'PersonalOwnership', value: 5 },
];

const GROUP_NAMES = [
  'Development Team',
  'Security Team',
  'IT Operations',
  'Engineering Leads',
  'DevOps',
  'QA Team',
  'Product Management',
  'Executive Team',
];

export class BitwardenIntegration extends BaseIntegration {
  readonly packageName = 'bitwarden';
  readonly displayName = 'Bitwarden';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'event', index: 'logs-bitwarden.event-default' },
    { name: 'member', index: 'logs-bitwarden.member-default' },
    { name: 'group', index: 'logs-bitwarden.group-default' },
    { name: 'policy', index: 'logs-bitwarden.policy-default' },
    { name: 'collection', index: 'logs-bitwarden.collection-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();

    const eventDocs: IntegrationDocument[] = [];
    const memberDocs: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < eventCount; i++) {
        eventDocs.push(this.createEventDocument(employee));
      }
      memberDocs.push(this.createMemberDocument(employee));
    }

    const groupDocs = this.createGroupDocuments();
    const policyDocs = this.createPolicyDocuments();
    const collectionDocs = this.createCollectionDocuments();

    documentsMap.set(this.dataStreams[0].index, eventDocs);
    documentsMap.set(this.dataStreams[1].index, memberDocs);
    documentsMap.set(this.dataStreams[2].index, groupDocs);
    documentsMap.set(this.dataStreams[3].index, policyDocs);
    documentsMap.set(this.dataStreams[4].index, collectionDocs);

    return documentsMap;
  }

  private createEventDocument(employee: Employee): IntegrationDocument {
    const eventType = faker.helpers.weightedArrayElement(
      EVENT_TYPES.map((e) => ({ value: e, weight: e.weight }))
    );
    const device = faker.helpers.arrayElement(DEVICE_TYPES);
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const actingUserId = faker.string.uuid();
    const memberId = faker.string.uuid();

    const isFailure =
      eventType.value === 'User_FailedLogIn' || eventType.value === 'User_FailedLogIn2fa';

    return {
      '@timestamp': timestamp,
      bitwarden: {
        object: 'event',
        event: {
          acting_user: { id: actingUserId },
          collection: { id: faker.string.uuid() },
          date: timestamp,
          device: { name: device.name, value: String(device.value) },
          group: { id: faker.string.uuid() },
          ip_address: sourceIp,
          item: { id: faker.string.uuid() },
          member: { id: memberId },
          policy: { id: faker.string.uuid() },
          type: { name: eventType.value, value: String(eventType.code) },
        },
      },
      data_stream: {
        dataset: 'bitwarden.event',
        namespace: 'default',
        type: 'logs',
      },
      event: {
        dataset: 'bitwarden.event',
        kind: 'event',
        category:
          eventType.value.startsWith('User_LoggedIn') || eventType.value.includes('FailedLogIn')
            ? ['authentication']
            : ['iam'],
        type: ['info'],
        outcome: isFailure ? 'failure' : 'success',
      },
      source: { ip: sourceIp },
      user: {
        id: memberId,
        name: employee.userName,
        email: employee.email,
      },
      related: {
        ip: [sourceIp],
        user: [employee.userName],
      },
      tags: ['forwarded', 'bitwarden-event'],
    } as IntegrationDocument;
  }

  private createMemberDocument(employee: Employee): IntegrationDocument {
    const memberId = faker.string.alphanumeric(8);
    const memberUserId = faker.string.uuid();
    const status = faker.helpers.arrayElement(MEMBER_STATUSES);
    const memberType = faker.helpers.arrayElement(MEMBER_TYPES);

    return {
      '@timestamp': this.getRandomTimestamp(168),
      bitwarden: {
        object: 'member',
        member: {
          access_all: faker.datatype.boolean(0.3),
          email: employee.email,
          external: { id: `ext_${faker.string.alphanumeric(12)}` },
          id: memberId,
          name: `${employee.firstName} ${employee.lastName}`,
          reset_password_enrolled: faker.datatype.boolean(0.6),
          status: { name: status.name, value: String(status.value) },
          two_factor_enabled: faker.datatype.boolean(0.7),
          type: { name: memberType.name, value: String(memberType.value) },
          user: { id: memberUserId },
        },
      },
      data_stream: {
        dataset: 'bitwarden.member',
        namespace: 'default',
        type: 'logs',
      },
      event: {
        dataset: 'bitwarden.member',
        kind: 'event',
        type: ['info'],
      },
      user: {
        email: employee.email,
        id: memberId,
        name: `${employee.firstName} ${employee.lastName}`,
      },
      tags: ['forwarded', 'bitwarden-member'],
    } as IntegrationDocument;
  }

  private createGroupDocuments(): IntegrationDocument[] {
    return GROUP_NAMES.map((name) => {
      const groupId = faker.string.uuid();
      const collectionCount = faker.number.int({ min: 1, max: 3 });
      const collections = Array.from({ length: collectionCount }, () => ({
        id: faker.string.uuid(),
        read_only: faker.datatype.boolean(0.4),
      }));

      return {
        '@timestamp': this.getRandomTimestamp(168),
        bitwarden: {
          object: 'group',
          group: {
            access_all: faker.datatype.boolean(0.2),
            collection: collections,
            external: { id: `ext_${faker.string.alphanumeric(12)}` },
            id: groupId,
            name,
          },
        },
        data_stream: {
          dataset: 'bitwarden.group',
          namespace: 'default',
          type: 'logs',
        },
        event: {
          dataset: 'bitwarden.group',
          kind: 'event',
          type: ['info'],
        },
        group: {
          id: groupId,
          name,
        },
        tags: ['forwarded', 'bitwarden-group'],
      } as IntegrationDocument;
    });
  }

  private createPolicyDocuments(): IntegrationDocument[] {
    return POLICY_TYPES.map((policy) => {
      const policyId = faker.string.uuid();

      return {
        '@timestamp': this.getRandomTimestamp(168),
        bitwarden: {
          object: 'policy',
          policy: {
            data: {
              capitalize: 'true',
              default_type: 'password',
              include_number: 'true',
              min: {
                length: String(faker.number.int({ min: 8, max: 16 })),
                number_words: '3',
                numbers: '1',
                special: '1',
              },
              use: {
                lower: 'true',
                numbers: 'true',
                special: 'true',
                upper: 'true',
              },
            },
            enabled: faker.datatype.boolean(0.8),
            id: policyId,
            type: { name: policy.name, value: String(policy.value) },
          },
        },
        data_stream: {
          dataset: 'bitwarden.policy',
          namespace: 'default',
          type: 'logs',
        },
        event: {
          dataset: 'bitwarden.policy',
          kind: 'event',
          type: ['info'],
        },
        tags: ['forwarded', 'bitwarden-policy'],
      } as IntegrationDocument;
    });
  }

  private createCollectionDocuments(): IntegrationDocument[] {
    const collectionNames = [
      'Engineering Secrets',
      'Production Credentials',
      'Shared Logins',
      'DevOps Tools',
      'API Keys',
    ];

    return collectionNames.map((name) => {
      const collectionId = faker.string.uuid();

      return {
        '@timestamp': this.getRandomTimestamp(168),
        bitwarden: {
          object: 'collection',
          collection: {
            external: { id: `ext_${faker.string.alphanumeric(12)}` },
            id: collectionId,
            name,
          },
        },
        data_stream: {
          dataset: 'bitwarden.collection',
          namespace: 'default',
          type: 'logs',
        },
        event: {
          dataset: 'bitwarden.collection',
          kind: 'event',
          type: ['info'],
        },
        tags: ['forwarded', 'bitwarden-collection'],
      } as IntegrationDocument;
    });
  }
}
