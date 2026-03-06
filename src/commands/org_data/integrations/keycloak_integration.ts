/**
 * Keycloak Integration
 * Generates Keycloak identity provider log documents
 * Based on the Elastic keycloak integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const EVENT_TYPES: Array<{
  eventType: string;
  logLevel: string;
  loggerBase: string;
  category: 'login' | 'admin' | 'system';
  weight: number;
}> = [
  {
    eventType: 'LOGIN',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events',
    category: 'login',
    weight: 25,
  },
  {
    eventType: 'LOGIN_ERROR',
    logLevel: 'WARN',
    loggerBase: 'org.keycloak.events',
    category: 'login',
    weight: 8,
  },
  {
    eventType: 'LOGOUT',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events',
    category: 'login',
    weight: 15,
  },
  {
    eventType: 'CODE_TO_TOKEN',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events',
    category: 'login',
    weight: 12,
  },
  {
    eventType: 'CODE_TO_TOKEN_ERROR',
    logLevel: 'WARN',
    loggerBase: 'org.keycloak.events',
    category: 'login',
    weight: 3,
  },
  {
    eventType: 'REGISTER',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events',
    category: 'login',
    weight: 4,
  },
  {
    eventType: 'UPDATE_PASSWORD',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events',
    category: 'login',
    weight: 5,
  },
  {
    eventType: 'TOKEN_EXCHANGE',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events',
    category: 'login',
    weight: 8,
  },
  {
    eventType: 'REFRESH_TOKEN',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events',
    category: 'login',
    weight: 10,
  },
  {
    eventType: 'IMPERSONATE',
    logLevel: 'WARN',
    loggerBase: 'org.keycloak.events',
    category: 'login',
    weight: 1,
  },
  {
    eventType: 'CREATE',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events.admin',
    category: 'admin',
    weight: 3,
  },
  {
    eventType: 'UPDATE',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events.admin',
    category: 'admin',
    weight: 4,
  },
  {
    eventType: 'DELETE',
    logLevel: 'WARN',
    loggerBase: 'org.keycloak.events.admin',
    category: 'admin',
    weight: 1,
  },
  {
    eventType: 'ACTION',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events.admin',
    category: 'admin',
    weight: 2,
  },
];

const REALMS = ['master', 'corp', 'external', 'internal'];
const CLIENT_IDS = [
  'account-console',
  'admin-cli',
  'grafana',
  'argocd',
  'gitlab',
  'vault',
  'nextcloud',
  'security-admin-console',
];
const AUTH_METHODS = ['openid-connect', 'saml', 'client-secret'];
const RESOURCE_TYPES = ['User', 'Group', 'Client', 'Role', 'RealmRole', 'ClientScope'];
const ADMIN_OPERATIONS = ['CREATE', 'UPDATE', 'DELETE', 'ACTION'];
const THREAD_NAMES = [
  'ServerService Thread Pool -- 64',
  'ServerService Thread Pool -- 32',
  'default task-1',
  'default task-2',
  'default task-5',
  'executor-thread-1',
];

const REDIRECT_URIS = [
  'https://grafana.internal/login/generic_oauth',
  'https://argocd.internal/auth/callback',
  'https://gitlab.internal/users/auth/openid_connect/callback',
  'https://vault.internal/ui/vault/auth/oidc/oidc/callback',
  'https://nextcloud.internal/apps/sociallogin/custom_oidc/keycloak',
];

export class KeycloakIntegration extends BaseIntegration {
  readonly packageName = 'keycloak';
  readonly displayName = 'Keycloak';

  readonly dataStreams: DataStreamConfig[] = [{ name: 'log', index: 'logs-keycloak.log-default' }];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const logDocs: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < eventCount; i++) {
        logDocs.push(this.createLogDocument(employee, org));
      }
    }

    documentsMap.set(this.dataStreams[0].index, logDocs);
    return documentsMap;
  }

  private createLogDocument(employee: Employee, org: Organization): IntegrationDocument {
    const eventDef = faker.helpers.weightedArrayElement(
      EVENT_TYPES.map((e) => ({ value: e, weight: e.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const realm = faker.helpers.arrayElement(REALMS);
    const clientId = faker.helpers.arrayElement(CLIENT_IDS);
    const sessionId = faker.string.uuid();
    const threadName = faker.helpers.arrayElement(THREAD_NAMES);

    const doc: Record<string, unknown> = {
      '@timestamp': timestamp,
      keycloak: this.buildKeycloakFields(eventDef, employee, realm, clientId, sessionId, org),
      event: {
        dataset: 'keycloak.log',
      },
      log: {
        level: eventDef.logLevel,
        logger: eventDef.loggerBase,
      },
      message: this.buildMessage(eventDef, employee, realm, clientId),
      process: {
        thread: { name: threadName },
      },
      related: {
        user: [employee.userName, employee.email],
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'keycloak.log' },
      tags: ['keycloak-log'],
    };

    return doc as IntegrationDocument;
  }

  private buildKeycloakFields(
    eventDef: (typeof EVENT_TYPES)[number],
    employee: Employee,
    realm: string,
    clientId: string,
    sessionId: string,
    org: Organization
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      client: { id: clientId },
      realm: { id: realm },
      event_type: eventDef.eventType,
      session: { id: sessionId },
    };

    if (eventDef.category === 'login') {
      base.login = {
        auth_method: faker.helpers.arrayElement(AUTH_METHODS),
        auth_type: 'code',
        redirect_uri: faker.helpers.arrayElement(REDIRECT_URIS),
        username: employee.userName,
        identity_provider: org.domain,
      };
    }

    if (eventDef.category === 'admin') {
      const resourceType = faker.helpers.arrayElement(RESOURCE_TYPES);
      base.admin = {
        operation: faker.helpers.arrayElement(ADMIN_OPERATIONS),
        resource: {
          type: resourceType,
          path: `${resourceType.toLowerCase()}s/${faker.string.uuid()}`,
        },
      };
    }

    if (eventDef.eventType === 'IMPERSONATE') {
      const target = org.employees[faker.number.int({ min: 0, max: org.employees.length - 1 })];
      base.impersonator = `${employee.userName} impersonating ${target.userName}`;
    }

    return base;
  }

  private buildMessage(
    eventDef: (typeof EVENT_TYPES)[number],
    employee: Employee,
    realm: string,
    clientId: string
  ): string {
    if (eventDef.category === 'admin') {
      return `type=${eventDef.eventType}, realmId=${realm}, clientId=${clientId}, operationType=${eventDef.eventType}, resourceType=${faker.helpers.arrayElement(RESOURCE_TYPES)}`;
    }
    if (eventDef.eventType.includes('ERROR')) {
      return `type=${eventDef.eventType}, realmId=${realm}, clientId=${clientId}, userId=${employee.userName}, error=invalid_credentials`;
    }
    return `type=${eventDef.eventType}, realmId=${realm}, clientId=${clientId}, userId=${employee.userName}`;
  }
}
