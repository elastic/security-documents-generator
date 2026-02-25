/**
 * PingOne Integration
 * Generates IAM audit event documents for PingOne
 * Based on the Elastic ping_one integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

/** PingOne audit action types with weights */
const AUDIT_ACTIONS: Array<{
  type: string;
  resourceType: string;
  weight: number;
  resultStatus: 'SUCCESS' | 'FAILURE' | 'WEIGHTED';
}> = [
  { type: 'USER.ACCESS_ALLOWED', resourceType: 'USER', weight: 25, resultStatus: 'SUCCESS' },
  { type: 'USER.ACCESS_DENIED', resourceType: 'USER', weight: 5, resultStatus: 'FAILURE' },
  {
    type: 'USER.AUTHENTICATION_SUCCEEDED',
    resourceType: 'USER',
    weight: 20,
    resultStatus: 'SUCCESS',
  },
  { type: 'USER.AUTHENTICATION_FAILED', resourceType: 'USER', weight: 8, resultStatus: 'FAILURE' },
  {
    type: 'USER.PASSWORD_RESET_COMPLETED',
    resourceType: 'USER',
    weight: 3,
    resultStatus: 'SUCCESS',
  },
  {
    type: 'USER.PASSWORD_CHECK_SUCCEEDED',
    resourceType: 'USER',
    weight: 5,
    resultStatus: 'SUCCESS',
  },
  { type: 'USER.PASSWORD_CHECK_FAILED', resourceType: 'USER', weight: 2, resultStatus: 'FAILURE' },
  { type: 'USER.MFA_VERIFIED', resourceType: 'USER', weight: 10, resultStatus: 'SUCCESS' },
  { type: 'USER.MFA_REJECTED', resourceType: 'USER', weight: 2, resultStatus: 'FAILURE' },
  { type: 'USER.CREATED', resourceType: 'USER', weight: 3, resultStatus: 'SUCCESS' },
  { type: 'USER.UPDATED', resourceType: 'USER', weight: 5, resultStatus: 'SUCCESS' },
  { type: 'USER.DELETED', resourceType: 'USER', weight: 1, resultStatus: 'SUCCESS' },
  { type: 'USER.ENABLED', resourceType: 'USER', weight: 2, resultStatus: 'SUCCESS' },
  { type: 'USER.DISABLED', resourceType: 'USER', weight: 1, resultStatus: 'SUCCESS' },
  { type: 'POLICY.EVALUATED', resourceType: 'POLICY', weight: 4, resultStatus: 'WEIGHTED' },
  {
    type: 'APPLICATION.ACCESS_GRANTED',
    resourceType: 'APPLICATION',
    weight: 3,
    resultStatus: 'SUCCESS',
  },
  { type: 'FLOW.COMPLETED', resourceType: 'FLOW', weight: 1, resultStatus: 'SUCCESS' },
];

/** PingOne client application names */
const CLIENT_APPS = [
  'PingOne Admin Console',
  'PingOne Self-Service',
  'PingOne DaVinci',
  'PingOne MFA',
  'PingOne Authorize',
  'Custom SAML App',
  'Custom OIDC App',
];

/** Result descriptions */
const SUCCESS_DESCRIPTIONS = [
  'Passed role access control',
  'Authentication succeeded',
  'Access allowed by policy',
  'MFA verification succeeded',
  'Password check passed',
  'User action completed successfully',
];

const FAILURE_DESCRIPTIONS = [
  'Failed role access control',
  'Authentication failed - invalid credentials',
  'Access denied by policy',
  'MFA verification failed',
  'Password check failed - does not meet requirements',
  'Account locked due to too many failed attempts',
];

/**
 * PingOne Integration
 * Generates PingOne IAM audit event documents
 */
export class PingOneIntegration extends BaseIntegration {
  readonly packageName = 'ping_one';
  readonly displayName = 'PingOne';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'audit',
      index: 'logs-ping_one.audit-default',
    },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    const environmentId = faker.string.uuid();

    // Generate 2-3 audit events per employee
    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 3 });
      for (let i = 0; i < eventCount; i++) {
        documents.push(this.createAuditDocument(employee, org, environmentId));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  /**
   * Create a PingOne audit event document
   */
  private createAuditDocument(
    employee: Employee,
    org: Organization,
    environmentId: string
  ): IntegrationDocument {
    const action = faker.helpers.weightedArrayElement(
      AUDIT_ACTIONS.map((a) => ({ value: a, weight: a.weight }))
    );

    let resultStatus: 'SUCCESS' | 'FAILURE';
    if (action.resultStatus === 'WEIGHTED') {
      resultStatus = faker.helpers.weightedArrayElement([
        { value: 'SUCCESS' as const, weight: 85 },
        { value: 'FAILURE' as const, weight: 15 },
      ]);
    } else {
      resultStatus = action.resultStatus;
    }

    const isSuccess = resultStatus === 'SUCCESS';
    const eventId = faker.string.uuid();
    const clientId = faker.string.uuid();
    const clientApp = faker.helpers.arrayElement(CLIENT_APPS);
    const userId = faker.string.uuid();
    const populationId = faker.string.uuid();
    const recordedAt = this.getRandomTimestamp(72);
    const apiBaseUrl = 'https://api.pingone.com';

    const resultDescription = isSuccess
      ? faker.helpers.arrayElement(SUCCESS_DESCRIPTIONS)
      : faker.helpers.arrayElement(FAILURE_DESCRIPTIONS);

    // Build event categories based on action type
    const eventCategories: string[] = ['iam'];
    const eventTypes: string[] = [];
    if (
      action.type.includes('ACCESS') ||
      action.type.includes('AUTHENTICATION') ||
      action.type.includes('MFA')
    ) {
      eventCategories.push('authentication');
      eventTypes.push('access');
    }
    if (
      action.type.includes('CREATED') ||
      action.type.includes('UPDATED') ||
      action.type.includes('DELETED')
    ) {
      eventCategories.push('configuration');
      eventTypes.push('user');
    }
    if (action.type.includes('PASSWORD')) {
      eventTypes.push('user');
    }
    eventTypes.push('info');

    const rawEvent = {
      _embedded: {},
      id: eventId,
      recordedAt: recordedAt,
      action: {
        type: action.type,
      },
      actors: {
        client: {
          environment: { id: environmentId },
          href: `${apiBaseUrl}/v1/environments/${environmentId}/applications/${clientId}`,
          id: clientId,
          name: clientApp,
          type: 'CLIENT',
        },
        user: {
          environment: { id: environmentId },
          href: `${apiBaseUrl}/v1/environments/${environmentId}/users/${userId}`,
          id: userId,
          name: employee.email,
          population: { id: populationId },
          type: 'USER',
        },
      },
      resources: [
        {
          environment: { id: environmentId },
          href: `${apiBaseUrl}/v1/environments/${environmentId}/users/${userId}`,
          id: userId,
          name: employee.email,
          population: { id: populationId },
          type: action.resourceType,
        },
      ],
      result: {
        description: resultDescription,
        status: resultStatus,
      },
    };

    return {
      '@timestamp': recordedAt,
      message: JSON.stringify(rawEvent),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'ping_one.audit',
      },
      tags: ['forwarded', 'ping_one-audit', 'preserve_original_event'],
    } as IntegrationDocument;
  }
}
