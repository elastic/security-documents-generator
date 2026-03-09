/**
 * authentik Integration
 * Generates raw/pre-pipeline user, group, and event documents for authentik identity provider.
 * Documents have `message` containing JSON that the ingest pipeline parses into authentik.event,
 * authentik.user, or authentik.group respectively.
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const EVENT_ACTIONS: Array<{
  action: string;
  app: string;
  weight: number;
}> = [
  { action: 'login', app: 'authentik.events.signals', weight: 25 },
  { action: 'login_failed', app: 'authentik.events.signals', weight: 5 },
  { action: 'logout', app: 'authentik.events.signals', weight: 10 },
  { action: 'user_write', app: 'authentik.events.signals', weight: 8 },
  { action: 'authorize_application', app: 'authentik.providers.oauth2.views.authorize', weight: 15 },
  { action: 'token_view', app: 'authentik.providers.oauth2.views.token', weight: 12 },
  { action: 'model_created', app: 'authentik.events.signals', weight: 5 },
  { action: 'model_updated', app: 'authentik.events.signals', weight: 8 },
  { action: 'model_deleted', app: 'authentik.events.signals', weight: 2 },
  { action: 'policy_execution', app: 'authentik.policies.engine', weight: 10 },
  { action: 'impersonation_started', app: 'authentik.events.signals', weight: 1 },
  { action: 'suspicious_request', app: 'authentik.events.signals', weight: 2 },
];

const AUTHENTIK_APPS = [
  'Grafana',
  'ArgoCD',
  'GitLab',
  'Nextcloud',
  'Portainer',
  'Vault',
  'Minio',
  'Wiki.js',
];

const FLOW_PATHS = [
  '/api/v3/flows/executor/default-authentication-flow/',
  '/api/v3/flows/executor/default-user-settings-flow/',
  '/api/v3/flows/executor/default-provider-authorization-implicit-consent/',
  '/api/v3/flows/executor/default-invalidation-flow/',
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

export class AuthentikIntegration extends BaseIntegration {
  readonly packageName = 'authentik';
  readonly displayName = 'authentik';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'event', index: 'logs-authentik.event-default' },
    { name: 'user', index: 'logs-authentik.user-default' },
    { name: 'group', index: 'logs-authentik.group-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();

    const eventDocs: IntegrationDocument[] = [];
    const userDocs: IntegrationDocument[] = [];
    const groupDocs: IntegrationDocument[] = [];

    // Build stable group pk map (department -> uuid)
    const departmentToGroupPk = new Map<string, string>();
    const getGroupPk = (name: string): string => {
      let pk = departmentToGroupPk.get(name);
      if (!pk) {
        pk = faker.string.uuid();
        departmentToGroupPk.set(name, pk);
      }
      return pk;
    };

    // One user entity document per employee
    for (const employee of org.employees) {
      const groupPks = [getGroupPk(employee.department)];
      userDocs.push(this.createUserDocument(employee, groupPks));
    }

    // One group document per department + AllUsers
    const departmentGroups = [...new Set(org.employees.map((e) => e.department))];
    for (const dept of departmentGroups) {
      const members = org.employees.filter((e) => e.department === dept);
      groupDocs.push(this.createGroupDocument(dept, members, getGroupPk(dept)));
    }
    groupDocs.push(this.createGroupDocument('AllUsers', org.employees, getGroupPk('AllUsers')));

    // 2-4 event documents per employee
    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 4 });
      for (let i = 0; i < eventCount; i++) {
        eventDocs.push(this.createEventDocument(employee, org));
      }
    }

    documentsMap.set('logs-authentik.event-default', eventDocs);
    documentsMap.set('logs-authentik.user-default', userDocs);
    documentsMap.set('logs-authentik.group-default', groupDocs);
    return documentsMap;
  }

  /** Stable user pk from Employee (for correlation across event/user/group docs) */
  private getStableUserPk(employee: Employee): string {
    return String(stableHash(employee.userName) % 100000);
  }

  private createUserDocument(
    employee: Employee,
    groupPks: string[]
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const pk = this.getStableUserPk(employee);
    const uid = faker.string.hexadecimal({ length: 64, prefix: '' });
    const uuid = faker.string.uuid();

    const rawUser: Record<string, unknown> = {
      pk: parseInt(pk, 10),
      username: employee.userName,
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
      groups: groupPks,
      is_active: true,
      is_superuser:
        employee.department === 'Operations' && employee.role.includes('Admin'),
      last_login: this.getRandomTimestamp(48),
      date_joined: this.getRandomTimestamp(365 * 24),
      path: 'users',
      type: 'internal',
      uid,
      uuid,
      avatar: `data:image/svg+xml;base64,${faker.string.alphanumeric(20)}`,
      attributes: {},
      groups_obj: null,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawUser),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'authentik.user' },
    } as IntegrationDocument;
  }

  private createGroupDocument(
    name: string,
    members: Employee[],
    pk: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const numPk = faker.number.int({ min: 50000, max: 59999 });

    const rawGroup: Record<string, unknown> = {
      pk,
      name,
      num_pk: numPk,
      users: members.map((e) => parseInt(this.getStableUserPk(e), 10)),
      parent_name: name === 'AllUsers' ? null : 'AllUsers',
      is_superuser: false,
      attributes: {},
      parent: null,
      roles: [],
      roles_obj: [],
      users_obj: null,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawGroup),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'authentik.group' },
    } as IntegrationDocument;
  }

  private createEventDocument(employee: Employee, org: Organization): IntegrationDocument {
    const eventType = faker.helpers.weightedArrayElement(
      EVENT_ACTIONS.map((e) => ({ value: e, weight: e.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const clientIp = faker.internet.ipv4();
    const pk = faker.string.uuid();
    const created = timestamp;
    const expires = new Date(
      new Date(timestamp).getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

    const context = this.buildEventContext(eventType.action, employee, org);
    const userPk = this.getStableUserPk(employee);

    const rawEvent: Record<string, unknown> = {
      action: eventType.action,
      app: eventType.app,
      brand: {
        app: 'authentik_brands',
        model_name: 'brand',
        name: 'Default brand',
        pk: faker.string.hexadecimal({ length: 32, prefix: '' }),
      },
      client_ip: clientIp,
      context,
      created,
      expires,
      pk,
      user: {
        email: employee.email,
        pk: parseInt(userPk, 10),
        username: employee.userName,
      },
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'authentik.event' },
    } as IntegrationDocument;
  }

  private buildEventContext(
    action: string,
    employee: Employee,
    org: Organization
  ): Record<string, unknown> {
    switch (action) {
      case 'login':
      case 'login_failed':
        return {
          http_request: {
            method: 'POST',
            path: '/api/v3/flows/executor/default-authentication-flow/',
          },
          username: employee.userName,
        };
      case 'logout':
        return {
          http_request: {
            method: 'GET',
            path: '/api/v3/flows/executor/default-invalidation-flow/',
          },
          username: employee.userName,
        };
      case 'authorize_application':
        return {
          authorized_application: {
            app: faker.helpers.arrayElement(AUTHENTIK_APPS),
            model_name: 'application',
            pk: faker.string.uuid(),
          },
          scopes: 'openid profile email',
        };
      case 'user_write':
        return {
          created: false,
          email: employee.email,
          http_request: {
            method: 'GET',
            path: '/api/v3/flows/executor/default-user-settings-flow/',
          },
          name: `${employee.firstName} ${employee.lastName}`,
          username: employee.userName,
        };
      case 'impersonation_started':
        return {
          impersonated_user: {
            email: faker.helpers.arrayElement(org.employees).email,
            pk: faker.string.numeric(3),
            username: faker.helpers.arrayElement(org.employees).userName,
          },
        };
      case 'suspicious_request':
        return {
          http_request: {
            method: faker.helpers.arrayElement(['GET', 'POST']),
            path: faker.helpers.arrayElement([
              '/api/v3/admin/',
              '/api/v3/core/users/',
              '/.env',
            ]),
          },
          reason: 'Suspicious path access',
        };
      default:
        return {
          http_request: {
            method: 'GET',
            path: faker.helpers.arrayElement(FLOW_PATHS),
          },
        };
    }
  }
}
