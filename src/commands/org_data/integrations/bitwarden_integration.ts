/**
 * Bitwarden Integration
 * Generates credential management audit and organizational documents
 * Based on the Elastic bitwarden integration package
 * Produces raw Bitwarden API JSON in message for ingest pipeline processing
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

/** Stable Bitwarden member ID from employee (short alphanumeric) */
function getStableMemberId(employee: Employee): string {
  return employee.id.replace(/-/g, '').slice(0, 8);
}

/** Stable Bitwarden user UUID from employee (for correlation with SSO) */
function getStableUserId(employee: Employee): string {
  return employee.entraIdUserId ?? employee.oktaUserId ?? employee.id;
}

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
    _correlationMap: CorrelationMap,
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
      EVENT_TYPES.map((e) => ({ value: e, weight: e.weight })),
    );
    const device = faker.helpers.arrayElement(DEVICE_TYPES);
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();

    const memberId = getStableMemberId(employee);
    const actingUserId = getStableUserId(employee);

    const rawEvent = {
      object: 'event',
      type: eventType.code,
      date: timestamp,
      actingUserId,
      memberId,
      itemId: faker.string.uuid(),
      collectionId: faker.datatype.boolean(0.3) ? faker.string.uuid() : null,
      groupId: faker.datatype.boolean(0.2) ? faker.string.uuid() : null,
      policyId: faker.datatype.boolean(0.2) ? faker.string.uuid() : null,
      installationId: null,
      device: device.value,
      ipAddress: sourceIp,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: {
        dataset: 'bitwarden.event',
        namespace: 'default',
        type: 'logs',
      },
    } as IntegrationDocument;
  }

  private createMemberDocument(employee: Employee): IntegrationDocument {
    const memberId = getStableMemberId(employee);
    const userId = getStableUserId(employee);
    const status = faker.helpers.arrayElement(MEMBER_STATUSES);
    const memberType = faker.helpers.arrayElement(MEMBER_TYPES);
    const timestamp = this.getRandomTimestamp(168);

    const rawMember = {
      type: memberType.value,
      accessAll: faker.datatype.boolean(0.3),
      externalId: `ext-${faker.string.alphanumeric(12)}`,
      resetPasswordEnrolled: faker.datatype.boolean(0.6),
      userId,
      id: memberId,
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
      twoFactorEnabled: faker.datatype.boolean(0.7),
      status: status.value,
      collections: [],
      object: 'member',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawMember),
      data_stream: {
        dataset: 'bitwarden.member',
        namespace: 'default',
        type: 'logs',
      },
    } as IntegrationDocument;
  }

  private createGroupDocuments(): IntegrationDocument[] {
    return GROUP_NAMES.map((name) => {
      const groupId = faker.string.uuid();
      const collectionCount = faker.number.int({ min: 1, max: 3 });
      const collections = Array.from({ length: collectionCount }, () => ({
        id: faker.string.uuid(),
        readOnly: faker.datatype.boolean(0.4),
      }));
      const timestamp = this.getRandomTimestamp(168);

      const rawGroup = {
        object: 'group',
        id: groupId,
        name,
        accessAll: faker.datatype.boolean(0.2),
        externalId: `ext-${faker.string.alphanumeric(12)}`,
        collections,
      };

      return {
        '@timestamp': timestamp,
        message: JSON.stringify(rawGroup),
        data_stream: {
          dataset: 'bitwarden.group',
          namespace: 'default',
          type: 'logs',
        },
      } as IntegrationDocument;
    });
  }

  private createPolicyDocuments(): IntegrationDocument[] {
    return POLICY_TYPES.map((policy) => {
      const policyId = faker.string.uuid();
      const timestamp = this.getRandomTimestamp(168);

      const rawPolicy = {
        object: 'policy',
        id: policyId,
        type: policy.value,
        enabled: faker.datatype.boolean(0.8),
        data: {
          capitalize: true,
          defaultType: 'password',
          includeNumber: true,
          minLength: faker.number.int({ min: 8, max: 16 }),
          minNumberWords: 3,
          minNumbers: 1,
          minSpecial: 1,
          useLower: true,
          useNumbers: true,
          useSpecial: true,
          useUpper: true,
        },
      };

      return {
        '@timestamp': timestamp,
        message: JSON.stringify(rawPolicy),
        data_stream: {
          dataset: 'bitwarden.policy',
          namespace: 'default',
          type: 'logs',
        },
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

    return collectionNames.map((_name) => {
      const collectionId = faker.string.uuid();
      const timestamp = this.getRandomTimestamp(168);

      const rawCollection = {
        object: 'collection',
        id: collectionId,
        externalId: `ext-${faker.string.alphanumeric(12)}`,
        groups: null,
      };

      return {
        '@timestamp': timestamp,
        message: JSON.stringify(rawCollection),
        data_stream: {
          dataset: 'bitwarden.collection',
          namespace: 'default',
          type: 'logs',
        },
      } as IntegrationDocument;
    });
  }
}
