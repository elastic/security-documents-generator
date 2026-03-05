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

const AM_ACCESS_PROTOCOLS = ['CREST', 'HTTP'] as const;

const IDM_AUTH_METHODS = [
  'MANAGED_USER',
  'INTERNAL_USER',
  'OAUTH',
  'OPENID_CONNECT',
  'PASSTHROUGH',
] as const;

const FORGEROCK_REALMS = ['/', '/alpha', '/bravo', '/employees', '/partners'] as const;

const IDM_ROLES = [
  'internal/role/openidm-admin',
  'internal/role/openidm-authorized',
  'internal/role/openidm-reg',
  'internal/role/openidm-cert',
] as const;

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
    const tenantHost = `${org.name.toLowerCase().replace(/\s+/g, '-')}.forgeblocks.com`;
    const trackingId = faker.string.uuid();
    const transactionId = faker.string.uuid();

    const principal =
      evt.outcome === 'failure'
        ? `id=${employee.userName},ou=user,${realm === '/' ? '' : `o=${realm.slice(1)},`}ou=services,dc=openam,dc=forgerock,dc=org`
        : `id=${employee.userName},ou=user,${realm === '/' ? '' : `o=${realm.slice(1)},`}ou=services,dc=openam,dc=forgerock,dc=org`;

    return {
      '@timestamp': timestamp,
      event: {
        action: evt.eventAction,
        category: ['authentication'],
        type: evt.outcome === 'success' ? ['start'] : ['start'],
        outcome: evt.outcome,
        dataset: 'forgerock.am_authentication',
      },
      forgerock: {
        eventName: evt.eventName,
        entries: [
          {
            moduleId: 'DataStore',
            info: {
              authIndex: 'AuthTree',
              ipAddress: sourceIp,
            },
          },
        ],
        level: 'INFO',
        principal: [principal],
        realm,
        source: 'audit',
        topic: 'authentication',
        trackingIds: [trackingId],
      },
      user: {
        id: principal,
        name: employee.userName,
        email: employee.email,
      },
      source: {
        ip: sourceIp,
      },
      observer: {
        vendor: 'ForgeRock Identity Platform',
      },
      related: {
        ip: [sourceIp],
        user: [employee.userName, employee.email],
      },
      transaction: { id: transactionId },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'forgerock.am_authentication' },
      tags: ['forwarded', 'forgerock-audit', 'forgerock-am-authentication'],
      host: { name: tenantHost },
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
    const path = `https://${tenantHost}/am/json${realm === '/' ? '' : realm}/users/${employee.userName}`;

    return {
      '@timestamp': timestamp,
      event: {
        action: 'AM-ACCESS-ATTEMPT',
        category: ['network'],
        type: ['access'],
        dataset: 'forgerock.am_access',
      },
      forgerock: {
        eventName: 'AM-ACCESS-ATTEMPT',
        http: {
          request: {
            headers: {
              host: [tenantHost],
              'user-agent': [faker.internet.userAgent()],
              'x-forwarded-for': [sourceIp],
              'x-forwarded-proto': ['https'],
            },
            secure: true,
          },
        },
        level: 'INFO',
        realm,
        request: { operation, protocol },
        response: {
          elapsedTime,
          elapsedTimeUnits: 'MILLISECONDS',
          status,
        },
        roles: [`internal/role/openidm-authorized`],
        source: 'audit',
        topic: 'access',
        trackingIds: [trackingId],
      },
      http: {
        request: { Path: path, method: httpMethod },
      },
      client: { ip: sourceIp },
      user: {
        name: employee.userName,
        email: employee.email,
      },
      observer: {
        vendor: 'ForgeRock Identity Platform',
      },
      related: {
        ip: [sourceIp],
        user: [employee.userName],
      },
      transaction: { id: transactionId },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'forgerock.am_access' },
      tags: ['forwarded', 'forgerock-audit', 'forgerock-am-access'],
    } as IntegrationDocument;
  }

  private createIdmAuthDocument(employee: Employee, org: Organization): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const method = faker.helpers.arrayElement(IDM_AUTH_METHODS);
    const result = faker.helpers.weightedArrayElement([
      { value: 'SUCCESSFUL', weight: 85 },
      { value: 'FAILED', weight: 15 },
    ]);
    const outcome = result === 'SUCCESSFUL' ? 'success' : 'failure';
    const trackingId = faker.string.uuid();
    const transactionId = faker.string.uuid();
    const tenantHost = `${org.name.toLowerCase().replace(/\s+/g, '-')}.forgeblocks.com`;

    return {
      '@timestamp': timestamp,
      event: {
        action: 'authentication',
        category: ['authentication'],
        type: ['info'],
        outcome: outcome as 'success' | 'failure',
        dataset: 'forgerock.idm_authentication',
      },
      forgerock: {
        eventName: 'authentication',
        entries: [
          {
            moduleId: method,
            info: {
              authIndex: method,
            },
          },
        ],
        level: 'INFO',
        method,
        principal: [employee.userName],
        result,
        topic: 'authentication',
        trackingIds: [trackingId],
      },
      user: {
        id: employee.userName,
        name: employee.userName,
        email: employee.email,
      },
      observer: {
        vendor: 'ForgeRock Identity Platform',
      },
      related: {
        user: [employee.userName, employee.email],
      },
      transaction: { id: transactionId },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'forgerock.idm_authentication',
      },
      tags: ['forwarded', 'forgerock-audit', 'forgerock-idm-authentication'],
      host: { name: tenantHost },
    } as IntegrationDocument;
  }

  private createIdmAccessDocument(employee: Employee): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const operation = faker.helpers.weightedArrayElement([
      { value: 'READ', weight: 50 },
      { value: 'CREATE', weight: 15 },
      { value: 'UPDATE', weight: 20 },
      { value: 'PATCH', weight: 10 },
      { value: 'DELETE', weight: 5 },
    ]);
    const status = faker.helpers.weightedArrayElement([
      { value: 'SUCCESSFUL', weight: 92 },
      { value: 'FAILED', weight: 8 },
    ]);
    const elapsedTime = faker.number.int({ min: 1, max: 200 });
    const role = faker.helpers.arrayElement(IDM_ROLES);
    const transactionId = faker.string.uuid();
    const path = faker.helpers.arrayElement([
      'http://idm/openidm/info/ping',
      `http://idm/openidm/managed/alpha_user/${employee.userName}`,
      'http://idm/openidm/managed/alpha_user?_queryFilter=true',
      'http://idm/openidm/config/ui/configuration',
      'http://idm/openidm/endpoint/userNotifications',
    ]);

    return {
      '@timestamp': timestamp,
      event: {
        action: 'access',
        category: ['network'],
        type: ['access'],
        outcome: status === 'SUCCESSFUL' ? 'success' : 'failure',
        dataset: 'forgerock.idm_access',
      },
      forgerock: {
        eventName: 'access',
        http: {
          request: {
            headers: {
              host: ['idm'],
            },
            secure: false,
          },
        },
        level: 'INFO',
        request: { operation, protocol: 'CREST' },
        response: {
          elapsedTime,
          elapsedTimeUnits: 'MILLISECONDS',
          status,
        },
        roles: [role],
        source: 'audit',
        topic: 'access',
      },
      http: {
        request: { Path: path },
      },
      user: {
        id: employee.userName,
        name: employee.userName,
      },
      observer: {
        vendor: 'ForgeRock Identity Platform',
      },
      related: {
        user: [employee.userName],
      },
      transaction: { id: transactionId },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'forgerock.idm_access' },
      tags: ['forwarded', 'forgerock-audit', 'forgerock-idm-access'],
    } as IntegrationDocument;
  }
}
