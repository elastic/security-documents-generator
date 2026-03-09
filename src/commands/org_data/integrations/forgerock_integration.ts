/**
 * ForgeRock Integration
 * Generates audit log documents for ForgeRock Identity Platform
 * Based on the Elastic forgerock integration package (AM and IDM data streams)
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const AM_AUTH_EVENTS: Array<{
  eventName: string;
  eventAction: string;
  outcome: 'success' | 'failure';
  weight: number;
}> = [
  { eventName: 'AM-LOGIN-COMPLETED', eventAction: 'login', outcome: 'success', weight: 40 },
  { eventName: 'AM-LOGIN-COMPLETED', eventAction: 'login', outcome: 'failure', weight: 10 },
  { eventName: 'AM-LOGOUT', eventAction: 'logout', outcome: 'success', weight: 15 },
  {
    eventName: 'AM-SESSION-CREATED',
    eventAction: 'session-created',
    outcome: 'success',
    weight: 20,
  },
  {
    eventName: 'AM-SESSION-EXPIRED',
    eventAction: 'session-expired',
    outcome: 'success',
    weight: 10,
  },
  {
    eventName: 'AM-MFA-COMPLETED',
    eventAction: 'mfa-verification',
    outcome: 'success',
    weight: 8,
  },
  {
    eventName: 'AM-MFA-COMPLETED',
    eventAction: 'mfa-verification',
    outcome: 'failure',
    weight: 3,
  },
];

const IDM_AUTH_METHODS = [
  'MANAGED_USER',
  'INTERNAL_USER',
  'OAUTH',
  'OPENID_CONNECT',
  'PASSTHROUGH',
] as const;

const FORGEROCK_REALMS = ['/', '/alpha', '/bravo', '/employees', '/partners'] as const;

const AM_ACCESS_PROTOCOLS = ['CREST', 'HTTP', 'OAuth2', 'OIDC', 'SAML'] as const;

export class ForgeRockIntegration extends BaseIntegration {
  readonly packageName = 'forgerock';
  readonly displayName = 'ForgeRock';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'AM Authentication', index: 'logs-forgerock.am_authentication-default' },
    { name: 'AM Access', index: 'logs-forgerock.am_access-default' },
    { name: 'IDM Authentication', index: 'logs-forgerock.idm_authentication-default' },
    { name: 'IDM Access', index: 'logs-forgerock.idm_access-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const amAuthDocs: IntegrationDocument[] = [];
    const amAccessDocs: IntegrationDocument[] = [];
    const idmAuthDocs: IntegrationDocument[] = [];
    const idmAccessDocs: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      const amAuthCount = faker.number.int({ min: 1, max: 4 });
      for (let i = 0; i < amAuthCount; i++) {
        amAuthDocs.push(this.createAmAuthDocument(employee, org));
      }

      const amAccessCount = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < amAccessCount; i++) {
        amAccessDocs.push(this.createAmAccessDocument(employee, org));
      }

      const idmAuthCount = faker.number.int({ min: 1, max: 2 });
      for (let i = 0; i < idmAuthCount; i++) {
        idmAuthDocs.push(this.createIdmAuthDocument(employee, org));
      }

      const idmAccessCount = faker.number.int({ min: 1, max: 2 });
      for (let i = 0; i < idmAccessCount; i++) {
        idmAccessDocs.push(this.createIdmAccessDocument(employee));
      }
    }

    documentsMap.set(this.dataStreams[0].index, amAuthDocs);
    documentsMap.set(this.dataStreams[1].index, amAccessDocs);
    documentsMap.set(this.dataStreams[2].index, idmAuthDocs);
    documentsMap.set(this.dataStreams[3].index, idmAccessDocs);
    return documentsMap;
  }

  private createAmAuthDocument(employee: Employee, org: Organization): IntegrationDocument {
    const evt = faker.helpers.weightedArrayElement(
      AM_AUTH_EVENTS.map((e) => ({ value: e, weight: e.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const realm = faker.helpers.arrayElement(FORGEROCK_REALMS);
    const transactionId = faker.string.uuid();
    const eventId = faker.string.uuid();

    const payload = {
      _id: eventId,
      transactionId,
      timestamp,
      eventName: evt.eventName,
      result: evt.outcome === 'success' ? 'SUCCESSFUL' : 'FAILED',
      userId: employee.userName,
      component: 'DataStore',
      entries: [
        {
          moduleId: 'DataStore',
          info: { authIndex: 'AuthTree', ipAddress: sourceIp },
        },
      ],
      level: 'INFO',
      principal: [
        `id=${employee.userName},ou=user,${realm === '/' ? '' : `o=${realm.slice(1)},`}ou=services,dc=openam,dc=forgerock,dc=org`,
      ],
      realm,
      source: 'audit',
      topic: 'authentication',
      trackingIds: [faker.string.uuid()],
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify({ payload }),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'forgerock.am_authentication' },
    } as IntegrationDocument;
  }

  private createAmAccessDocument(employee: Employee, org: Organization): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const realm = faker.helpers.arrayElement(FORGEROCK_REALMS);
    const operation = faker.helpers.weightedArrayElement([
      { value: 'READ' as const, weight: 50 },
      { value: 'CREATE' as const, weight: 15 },
      { value: 'UPDATE' as const, weight: 15 },
      { value: 'DELETE' as const, weight: 5 },
      { value: 'ACTION' as const, weight: 15 },
    ]);
    const protocol = faker.helpers.arrayElement(AM_ACCESS_PROTOCOLS);
    const tenantHost = `${org.name.toLowerCase().replace(/\s+/g, '-')}.forgeblocks.com`;
    const trackingId = faker.string.uuid();
    const transactionId = faker.string.uuid();
    const elapsedTime = faker.number.int({ min: 1, max: 500 });
    const status = faker.helpers.weightedArrayElement([
      { value: 'SUCCESSFUL', weight: 90 },
      { value: 'FAILED', weight: 10 },
    ]);
    const httpMethod = operation === 'READ' ? 'GET' : operation === 'CREATE' ? 'POST' : 'PUT';
    const path = `/am/json${realm === '/' ? '' : realm}/users/${employee.userName}`;
    const serverIp = faker.internet.ipv4();

    const payload = {
      _id: faker.string.uuid(),
      transactionId,
      timestamp,
      eventName: 'AM-ACCESS-ATTEMPT',
      userId: employee.userName,
      client: { ip: sourceIp, port: faker.number.int({ min: 1024, max: 65535 }) },
      server: { ip: serverIp, port: 443 },
      http: { request: { method: httpMethod, path } },
      request: { operation, protocol },
      response: {
        statusCode: status === 'SUCCESSFUL' ? 200 : 403,
        status,
        elapsedTime,
        elapsedTimeUnits: 'MILLISECONDS',
      },
      roles: ['internal/role/openidm-authorized'],
      source: 'audit',
      topic: 'access',
      trackingIds: [trackingId],
      realm,
      level: 'INFO',
      component: 'Policy',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify({ payload }),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'forgerock.am_access' },
    } as IntegrationDocument;
  }

  private createIdmAuthDocument(employee: Employee, _org: Organization): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const method = faker.helpers.arrayElement(IDM_AUTH_METHODS);
    const result = faker.helpers.weightedArrayElement([
      { value: 'SUCCESSFUL', weight: 85 },
      { value: 'FAILED', weight: 15 },
    ]);
    const transactionId = faker.string.uuid();

    const payload = {
      _id: faker.string.uuid(),
      transactionId,
      timestamp,
      eventName: 'authentication',
      result,
      userId: employee.userName,
      entries: [{ moduleId: method, info: { authIndex: method } }],
      level: 'INFO',
      method,
      principal: [employee.userName],
      topic: 'authentication',
      trackingIds: [faker.string.uuid()],
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify({ payload }),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'forgerock.idm_authentication',
      },
    } as IntegrationDocument;
  }

  private createIdmAccessDocument(employee: Employee): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const status = faker.helpers.weightedArrayElement([
      { value: 'SUCCESSFUL', weight: 92 },
      { value: 'FAILED', weight: 8 },
    ]);
    const elapsedTime = faker.number.int({ min: 1, max: 200 });
    const transactionId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();
    const path = faker.helpers.arrayElement([
      '/openidm/info/ping',
      `/openidm/managed/alpha_user/${employee.userName}`,
      '/openidm/managed/alpha_user?_queryFilter=true',
      '/openidm/config/ui/configuration',
      '/openidm/endpoint/userNotifications',
    ]);
    const httpMethod = faker.helpers.arrayElement(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

    const payload = {
      _id: faker.string.uuid(),
      transactionId,
      timestamp,
      eventName: 'access',
      userId: employee.userName,
      client: { port: 443, ip: sourceIp },
      server: { host: 'idm', ip: faker.internet.ipv4() },
      http: { request: { method: httpMethod, path } },
      response: {
        statusCode: status === 'SUCCESSFUL' ? 200 : 403,
        status,
        elapsedTime,
        elapsedTimeUnits: 'MILLISECONDS',
      },
      level: 'INFO',
      source: 'audit',
      topic: 'access',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify({ payload }),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'forgerock.idm_access' },
    } as IntegrationDocument;
  }
}
