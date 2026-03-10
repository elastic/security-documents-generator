/**
 * Keycloak Integration
 * Generates raw/pre-pipeline Keycloak event log documents for the keycloak.log data stream.
 * Documents have `message` containing JSON that the ingest pipeline parses: default pipeline
 * renames message→event.original, parses JSON into `json`, dot_expander runs, then routes to
 * events sub-pipeline when log.logger=='org.keycloak.events'. The events pipeline expects
 * json.type, json.realmId, json.clientId, json.userId, json.ipAddress, json.username,
 * json.operationType, json.resourceType, json.resourcePath, json.error, etc.
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const EVENT_TYPES: Array<{
  eventType: string;
  logLevel: string;
  loggerBase: string;
  category: 'login' | 'admin';
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
    loggerBase: 'org.keycloak.events',
    category: 'admin',
    weight: 3,
  },
  {
    eventType: 'UPDATE',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events',
    category: 'admin',
    weight: 4,
  },
  {
    eventType: 'DELETE',
    logLevel: 'WARN',
    loggerBase: 'org.keycloak.events',
    category: 'admin',
    weight: 1,
  },
  {
    eventType: 'ACTION',
    logLevel: 'INFO',
    loggerBase: 'org.keycloak.events',
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
const RESOURCE_TYPES = ['USER', 'GROUP', 'CLIENT', 'ROLE', 'REALM_ROLE', 'CLIENT_SCOPE'];
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

/** Deterministic hash for stable identifiers from Employee fields */
function stableHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h = h | 0;
  }
  return Math.abs(h);
}

/** Generate stable UUID for Keycloak userId from Employee (for correlation) */
function getStableKeycloakUserId(employee: Employee): string {
  const str = employee.userName + employee.email;
  const h1 = stableHash(str);
  const h2 = stableHash(str + '1');
  const h3 = stableHash(str + '2');
  const h4 = stableHash(str + '3');
  const hex8 = (n: number) => ((n >>> 0) & 0xffffffff).toString(16).padStart(8, '0');
  const hex4 = (n: number) => ((n >>> 0) & 0xffff).toString(16).padStart(4, '0');
  return `${hex8(h1)}-${hex4(h2)}-4${hex4(h3).slice(0, 3)}-8${hex4(h4)}-${hex8(h2)}${hex4(h3)}`;
}

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
    const ipAddress = employee.devices[0]?.ipAddress ?? faker.internet.ipv4();
    const userId = getStableKeycloakUserId(employee);

    const rawKeycloakJson = this.buildRawKeycloakEvent(
      eventDef,
      employee,
      realm,
      clientId,
      sessionId,
      userId,
      ipAddress,
      threadName,
      org
    );

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawKeycloakJson),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'keycloak.log' },
    } as IntegrationDocument;
  }

  /**
   * Build raw Keycloak event JSON.
   * Pipeline: default parses message as JSON into `json`, dot_expander runs, then routes to
   * events sub-pipeline when log.logger=='org.keycloak.events'. Events pipeline expects
   * json.type, json.realmId, json.clientId, json.userId, json.ipAddress, json.username,
   * json.operationType, json.resourceType, json.resourcePath, json.error, etc.
   */
  private buildRawKeycloakEvent(
    eventDef: (typeof EVENT_TYPES)[number],
    employee: Employee,
    realm: string,
    clientId: string,
    sessionId: string,
    userId: string,
    ipAddress: string,
    threadName: string,
    org: Organization
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      type: eventDef.eventType,
      realmId: realm,
      clientId: eventDef.category === 'admin' ? faker.string.uuid() : clientId,
      userId,
      ipAddress,
      username: employee.userName,
      sessionId,
      'log.logger': eventDef.loggerBase,
      'log.level': eventDef.logLevel,
      'process.thread.name': threadName,
    };

    if (eventDef.category === 'login') {
      base.auth_method = faker.helpers.arrayElement(AUTH_METHODS);
      base.auth_type = 'code';
      base.redirect_uri = faker.helpers.arrayElement(REDIRECT_URIS);
    }

    if (eventDef.eventType.includes('ERROR')) {
      base.error = 'invalid_user_credentials';
    }

    if (eventDef.category === 'admin') {
      base.operationType = eventDef.eventType;
      const resourceType = faker.helpers.arrayElement(RESOURCE_TYPES);
      base.resourceType = resourceType;
      const pathMap: Record<string, string> = {
        USER: 'users',
        GROUP: 'groups',
        CLIENT: 'clients',
        ROLE: 'roles',
        REALM_ROLE: 'realm-roles',
        CLIENT_SCOPE: 'client-scopes',
      };
      base.resourcePath = `${pathMap[resourceType]}/${faker.string.uuid()}`;
    }

    if (eventDef.eventType === 'IMPERSONATE') {
      const target = org.employees[faker.number.int({ min: 0, max: org.employees.length - 1 })];
      base.impersonator = target.userName;
      base.impersonator_realm = realm;
    }

    return base;
  }
}
