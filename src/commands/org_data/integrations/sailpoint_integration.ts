/**
 * SailPoint Identity Security Cloud Integration
 * Generates identity governance event documents
 * Based on the Elastic sailpoint_identity_sc integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

/** SailPoint event types with associated actions and weights */
const EVENT_TYPES: Array<{
  type: string;
  actions: string[];
  objects: string[];
  operation: string;
  weight: number;
}> = [
  {
    type: 'AUTH',
    actions: ['AUTH_LOGIN_PASSED', 'AUTH_LOGIN_FAILED', 'AUTH_LOGOUT'],
    objects: ['AUTH'],
    operation: 'LOGIN',
    weight: 25,
  },
  {
    type: 'SSO',
    actions: ['SSO_LOGIN_PASSED', 'SSO_LOGIN_FAILED'],
    objects: ['SSO'],
    operation: 'LOGIN',
    weight: 20,
  },
  {
    type: 'USER_MANAGEMENT',
    actions: [
      'USER_ATTRIBUTE_UPDATE_PASSED',
      'USER_CREATE_PASSED',
      'USER_DISABLE_PASSED',
      'USER_ENABLE_PASSED',
    ],
    objects: ['USER'],
    operation: 'UPDATE',
    weight: 15,
  },
  {
    type: 'PASSWORD_ACTIVITY',
    actions: [
      'USER_PASSWORD_UPDATE_PASSED',
      'USER_PASSWORD_UPDATE_FAILED',
      'USER_PASSWORD_RESET_PASSED',
    ],
    objects: ['USER', 'PASSWORD'],
    operation: 'UPDATE',
    weight: 12,
  },
  {
    type: 'PROVISIONING',
    actions: [
      'PROVISIONING_CREATE_PASSED',
      'PROVISIONING_UPDATE_PASSED',
      'PROVISIONING_DELETE_PASSED',
      'PROVISIONING_CREATE_FAILED',
    ],
    objects: ['ACCOUNT'],
    operation: 'CREATE',
    weight: 10,
  },
  {
    type: 'ACCESS_ITEM',
    actions: ['ACCESS_ITEM_GRANTED', 'ACCESS_ITEM_REVOKED', 'ACCESS_ITEM_REQUESTED'],
    objects: ['ACCESS'],
    operation: 'GRANT',
    weight: 8,
  },
  {
    type: 'ACCESS_REQUEST',
    actions: [
      'ACCESS_REQUEST_CREATED',
      'ACCESS_REQUEST_APPROVED',
      'ACCESS_REQUEST_DENIED',
      'ACCESS_REQUEST_COMPLETED',
    ],
    objects: ['ACCESS_REQUEST'],
    operation: 'CREATE',
    weight: 5,
  },
  {
    type: 'CERTIFICATION',
    actions: [
      'CERTIFICATION_CREATED',
      'CERTIFICATION_SIGNED_OFF',
      'CERTIFICATION_ITEM_APPROVED',
      'CERTIFICATION_ITEM_REVOKED',
    ],
    objects: ['CERTIFICATION'],
    operation: 'APPROVE',
    weight: 3,
  },
  {
    type: 'SOURCE_MANAGEMENT',
    actions: [
      'SOURCE_ACCOUNT_AGGREGATION_PASSED',
      'SOURCE_ACCOUNT_AGGREGATION_FAILED',
      'SOURCE_UPDATED',
    ],
    objects: ['SOURCE'],
    operation: 'AGGREGATE',
    weight: 2,
  },
];

/** Source names for provisioning events */
const SOURCE_NAMES = [
  'IdentityNow',
  'Active Directory',
  'Okta',
  'Azure AD',
  'ServiceNow',
  'Workday',
  'SAP',
  'Salesforce',
];

/**
 * SailPoint Identity Security Cloud Integration
 * Generates identity governance and administration event documents
 */
export class SailPointIntegration extends BaseIntegration {
  readonly packageName = 'sailpoint_identity_sc';
  readonly displayName = 'SailPoint Identity Security Cloud';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'events',
      index: 'logs-sailpoint_identity_sc.events-default',
    },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    const orgSlug = org.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // Generate 2-3 events per employee
    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 3 });
      for (let i = 0; i < eventCount; i++) {
        const targetEmployee = faker.helpers.arrayElement(org.employees);
        documents.push(this.createEventDocument(employee, targetEmployee, orgSlug));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  /**
   * Create a SailPoint events document
   */
  private createEventDocument(
    actor: Employee,
    target: Employee,
    orgSlug: string
  ): IntegrationDocument {
    const eventType = faker.helpers.weightedArrayElement(
      EVENT_TYPES.map((et) => ({ value: et, weight: et.weight }))
    );
    const action = faker.helpers.arrayElement(eventType.actions);
    const status = action.includes('FAILED') ? 'FAILED' : 'PASSED';
    const sourceIp = faker.internet.ipv4();
    const created = this.getRandomTimestamp(72);
    const eventId = faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase();

    // For AUTH/SSO the actor and target are the same person
    const isAuthEvent = eventType.type === 'AUTH' || eventType.type === 'SSO';
    const effectiveTarget = isAuthEvent ? actor : target;

    const rawEvent = {
      _type: 'event',
      _version: 'v2',
      id: eventId,
      name: this.actionToDisplayName(action),
      action: action,
      type: eventType.type,
      actor: {
        name: isAuthEvent
          ? actor.userName
          : eventType.type === 'SOURCE_MANAGEMENT'
            ? 'System'
            : actor.userName,
      },
      target: {
        name: effectiveTarget.userName,
      },
      operation: eventType.operation,
      status: status,
      objects: eventType.objects,
      technical_name: action,
      tracking_number: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
      created: created,
      synced: new Date(
        new Date(created).getTime() + faker.number.int({ min: 1000, max: 60000 })
      ).toISOString(),
      org: orgSlug,
      pod: `se01-useast1`,
      stack: faker.helpers.arrayElement(['pigs', 'oar', 'fedramp']),
      ip_address: sourceIp,
      details: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
      attributes: {
        account_id: isAuthEvent ? actor.userName : effectiveTarget.userName,
        source_name: faker.helpers.arrayElement(SOURCE_NAMES),
        org: orgSlug,
        pod: 'se01-useast1',
        scope: ['sp:scopes:all'],
        ...(sourceIp ? { host_name: sourceIp } : {}),
        ...(eventType.type === 'PASSWORD_ACTIVITY'
          ? {
              info: `Password workflow invoked successfully. Request Id :${faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()}`,
            }
          : {}),
      },
    };

    return {
      '@timestamp': created,
      message: JSON.stringify(rawEvent),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'sailpoint_identity_sc.events',
      },
      tags: ['forwarded', 'sailpoint_identity_sc.events', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  /**
   * Convert a technical action name to a human-readable display name
   */
  private actionToDisplayName(action: string): string {
    const map: Record<string, string> = {
      AUTH_LOGIN_PASSED: 'Authentication Passed',
      AUTH_LOGIN_FAILED: 'Authentication Failed',
      AUTH_LOGOUT: 'Logout',
      SSO_LOGIN_PASSED: 'SSO Authentication Passed',
      SSO_LOGIN_FAILED: 'SSO Authentication Failed',
      USER_ATTRIBUTE_UPDATE_PASSED: 'Update User Attribute Passed',
      USER_CREATE_PASSED: 'Create User Passed',
      USER_DISABLE_PASSED: 'Disable User Passed',
      USER_ENABLE_PASSED: 'Enable User Passed',
      USER_PASSWORD_UPDATE_PASSED: 'Update User Password Passed',
      USER_PASSWORD_UPDATE_FAILED: 'Update User Password Failed',
      USER_PASSWORD_RESET_PASSED: 'Reset User Password Passed',
      PROVISIONING_CREATE_PASSED: 'Create Account Passed',
      PROVISIONING_UPDATE_PASSED: 'Update Account Passed',
      PROVISIONING_DELETE_PASSED: 'Delete Account Passed',
      PROVISIONING_CREATE_FAILED: 'Create Account Failed',
      ACCESS_ITEM_GRANTED: 'Access Item Granted',
      ACCESS_ITEM_REVOKED: 'Access Item Revoked',
      ACCESS_ITEM_REQUESTED: 'Access Item Requested',
      ACCESS_REQUEST_CREATED: 'Access Request Created',
      ACCESS_REQUEST_APPROVED: 'Access Request Approved',
      ACCESS_REQUEST_DENIED: 'Access Request Denied',
      ACCESS_REQUEST_COMPLETED: 'Access Request Completed',
      CERTIFICATION_CREATED: 'Certification Created',
      CERTIFICATION_SIGNED_OFF: 'Certification Signed Off',
      CERTIFICATION_ITEM_APPROVED: 'Certification Item Approved',
      CERTIFICATION_ITEM_REVOKED: 'Certification Item Revoked',
      SOURCE_ACCOUNT_AGGREGATION_PASSED: 'Source Account Aggregation Passed',
      SOURCE_ACCOUNT_AGGREGATION_FAILED: 'Source Account Aggregation Failed',
      SOURCE_UPDATED: 'Source Updated',
    };
    return map[action] || action.replace(/_/g, ' ').toLowerCase();
  }
}
