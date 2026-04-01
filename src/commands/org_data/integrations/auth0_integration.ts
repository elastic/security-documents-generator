/**
 * Auth0 Integration
 * Generates authentication log documents for Auth0
 * Based on the Elastic auth0 integration package
 */

import {
  BaseIntegration,
  IntegrationDocument,
  DataStreamConfig,
  AgentData,
} from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const AUTH0_EVENT_TYPES: Array<{
  type: string;
  typeId: string;
  classification: string;
  eventAction: string;
  eventCategory: string[];
  eventOutcome: 'success' | 'failure';
  weight: number;
}> = [
  {
    type: 'Successful login',
    typeId: 's',
    classification: 'Login - Success',
    eventAction: 'successful-login',
    eventCategory: ['authentication'],
    eventOutcome: 'success',
    weight: 40,
  },
  {
    type: 'Failed login',
    typeId: 'f',
    classification: 'Login - Failure',
    eventAction: 'failed-login',
    eventCategory: ['authentication'],
    eventOutcome: 'failure',
    weight: 10,
  },
  {
    type: 'Successful exchange',
    typeId: 'seacft',
    classification: 'Login - Success',
    eventAction: 'successful-exchange',
    eventCategory: ['authentication'],
    eventOutcome: 'success',
    weight: 15,
  },
  {
    type: 'Success API Operation',
    typeId: 'sapi',
    classification: 'API - Success',
    eventAction: 'success-api-operation',
    eventCategory: ['web'],
    eventOutcome: 'success',
    weight: 10,
  },
  {
    type: 'Success Logout',
    typeId: 'slo',
    classification: 'Logout - Success',
    eventAction: 'success-logout',
    eventCategory: ['authentication'],
    eventOutcome: 'success',
    weight: 8,
  },
  {
    type: 'Failed login (wrong password)',
    typeId: 'fp',
    classification: 'Login - Failure',
    eventAction: 'failed-login',
    eventCategory: ['authentication'],
    eventOutcome: 'failure',
    weight: 8,
  },
  {
    type: 'Successful signup',
    typeId: 'ss',
    classification: 'Signup - Success',
    eventAction: 'successful-signup',
    eventCategory: ['iam'],
    eventOutcome: 'success',
    weight: 3,
  },
  {
    type: 'Failed change password request',
    typeId: 'fcp',
    classification: 'Change Password - Failure',
    eventAction: 'failed-change-password',
    eventCategory: ['iam'],
    eventOutcome: 'failure',
    weight: 2,
  },
  {
    type: 'Multi-factor authentication success',
    typeId: 'gd_auth_succeed',
    classification: 'Login - MFA Success',
    eventAction: 'mfa-success',
    eventCategory: ['authentication'],
    eventOutcome: 'success',
    weight: 12,
  },
  {
    type: 'Multi-factor authentication failure',
    typeId: 'gd_auth_failed',
    classification: 'Login - MFA Failure',
    eventAction: 'mfa-failure',
    eventCategory: ['authentication'],
    eventOutcome: 'failure',
    weight: 3,
  },
  {
    type: 'Rate limit on API',
    typeId: 'limit_wc',
    classification: 'API - Rate Limit',
    eventAction: 'rate-limit',
    eventCategory: ['web'],
    eventOutcome: 'failure',
    weight: 1,
  },
];

const AUTH0_CONNECTIONS = [
  'Username-Password-Authentication',
  'google-oauth2',
  'github',
  'samlp',
  'waad',
];

const AUTH0_CLIENT_NAMES = [
  'Default App',
  'Dashboard',
  'Web Application',
  'Mobile App',
  'CLI Tool',
  'API Explorer',
];

export class Auth0Integration extends BaseIntegration {
  readonly packageName = 'auth0';
  readonly displayName = 'Auth0';

  readonly dataStreams: DataStreamConfig[] = [{ name: 'logs', index: 'logs-auth0.logs-default' }];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];
    const centralAgent = this.buildCentralAgent(org);

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < eventCount; i++) {
        documents.push(this.createLogDocument(employee, org, centralAgent));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  private createLogDocument(
    employee: Employee,
    org: Organization,
    centralAgent: AgentData,
  ): IntegrationDocument {
    const eventType = faker.helpers.weightedArrayElement(
      AUTH0_EVENT_TYPES.map((e) => ({ value: e, weight: e.weight })),
    );
    const sourceIp = faker.internet.ipv4();
    const timestamp = this.getRandomTimestamp(72);
    const connection = faker.helpers.arrayElement(AUTH0_CONNECTIONS);
    const clientId = faker.string.alphanumeric(32);
    const clientName = faker.helpers.arrayElement(AUTH0_CLIENT_NAMES);
    const hostname = `${org.name.toLowerCase().replace(/\s+/g, '-')}.auth0.com`;
    const logId = faker.string.alphanumeric(24);
    const eventId = faker.string.alphanumeric(24);

    // Raw Auth0 log format for json.data - pipeline copies this to auth0.logs.data
    const rawAuth0Data: Record<string, unknown> = {
      date: timestamp,
      type: eventType.typeId,
      description: this.getDescription(eventType.typeId, employee),
      client_id: clientId,
      client_name: clientName,
      connection,
      connection_id: `con_${faker.string.alphanumeric(16)}`,
      hostname,
      ip: sourceIp,
      user_id: `auth0|${faker.string.hexadecimal({ length: 24, prefix: '' })}`,
      user_name: employee.email,
      user_agent: faker.internet.userAgent(),
      details: this.getDetails(eventType.typeId),
      log_id: logId,
      strategy: 'auth0',
      strategy_type: 'database',
      _id: eventId,
      isMobile: false,
    };

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      json: { data: rawAuth0Data },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'auth0.logs' },
    } as IntegrationDocument;
  }

  private getDescription(typeId: string, employee: Employee): string {
    switch (typeId) {
      case 's':
        return `Successful login for ${employee.email}`;
      case 'f':
        return `Failed login attempt for ${employee.email}`;
      case 'fp':
        return `Wrong credentials for ${employee.email}`;
      case 'seacft':
        return 'Successful exchange of authorization code for access token';
      case 'sapi':
        return 'Successful API operation';
      case 'slo':
        return `Successful logout for ${employee.email}`;
      case 'ss':
        return `Successful signup for ${employee.email}`;
      case 'fcp':
        return `Failed change password request for ${employee.email}`;
      case 'gd_auth_succeed':
        return `Multi-factor authentication success for ${employee.email}`;
      case 'gd_auth_failed':
        return `Multi-factor authentication failure for ${employee.email}`;
      case 'limit_wc':
        return 'Rate limit reached for API calls';
      default:
        return `Auth0 event for ${employee.email}`;
    }
  }

  private getDetails(typeId: string): Record<string, unknown> {
    if (typeId === 'f' || typeId === 'fp') {
      return {
        error: {
          message: typeId === 'fp' ? 'Wrong email or password.' : 'Unauthorized',
          payload: {
            code: 'invalid_user_password',
            name: 'CredentialError',
            status: 403,
          },
          type: typeId === 'fp' ? 'invalid-user-password' : 'unauthorized',
        },
      };
    }
    if (typeId === 'limit_wc') {
      return {
        error: {
          message: 'Rate limit exceeded',
          payload: { code: 'too_many_requests', status: 429 },
          type: 'rate-limit',
        },
      };
    }
    return {};
  }
}
