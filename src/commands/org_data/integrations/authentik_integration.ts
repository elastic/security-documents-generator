/**
 * authentik Integration
 * Generates user, group, and event documents for authentik identity provider
 * Based on the Elastic authentik integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const EVENT_ACTIONS: Array<{
  action: string;
  eventAction: string;
  app: string;
  eventCategory: string[];
  weight: number;
}> = [
  {
    action: 'login',
    eventAction: 'login',
    app: 'authentik.events.signals',
    eventCategory: ['authentication'],
    weight: 25,
  },
  {
    action: 'login_failed',
    eventAction: 'login-failed',
    app: 'authentik.events.signals',
    eventCategory: ['authentication'],
    weight: 5,
  },
  {
    action: 'logout',
    eventAction: 'logout',
    app: 'authentik.events.signals',
    eventCategory: ['authentication'],
    weight: 10,
  },
  {
    action: 'user_write',
    eventAction: 'user-write',
    app: 'authentik.events.signals',
    eventCategory: ['iam'],
    weight: 8,
  },
  {
    action: 'authorize_application',
    eventAction: 'authorize-application',
    app: 'authentik.providers.oauth2.views.authorize',
    eventCategory: ['authentication'],
    weight: 15,
  },
  {
    action: 'token_view',
    eventAction: 'token-view',
    app: 'authentik.providers.oauth2.views.token',
    eventCategory: ['authentication'],
    weight: 12,
  },
  {
    action: 'model_created',
    eventAction: 'model-created',
    app: 'authentik.events.signals',
    eventCategory: ['configuration'],
    weight: 5,
  },
  {
    action: 'model_updated',
    eventAction: 'model-updated',
    app: 'authentik.events.signals',
    eventCategory: ['configuration'],
    weight: 8,
  },
  {
    action: 'model_deleted',
    eventAction: 'model-deleted',
    app: 'authentik.events.signals',
    eventCategory: ['configuration'],
    weight: 2,
  },
  {
    action: 'policy_execution',
    eventAction: 'policy-execution',
    app: 'authentik.policies.engine',
    eventCategory: ['configuration'],
    weight: 10,
  },
  {
    action: 'impersonation_started',
    eventAction: 'impersonation-started',
    app: 'authentik.events.signals',
    eventCategory: ['iam'],
    weight: 1,
  },
  {
    action: 'suspicious_request',
    eventAction: 'suspicious-request',
    app: 'authentik.events.signals',
    eventCategory: ['intrusion_detection'],
    weight: 2,
  },
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

    // One user entity document per employee
    for (const employee of org.employees) {
      userDocs.push(this.createUserDocument(employee, org));
    }

    // One group document per department
    const departmentGroups = [...new Set(org.employees.map((e) => e.department))];
    for (const dept of departmentGroups) {
      const members = org.employees.filter((e) => e.department === dept);
      groupDocs.push(this.createGroupDocument(dept, members));
    }
    groupDocs.push(this.createGroupDocument('AllUsers', org.employees));

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

  private createUserDocument(employee: Employee, org: Organization): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const pk = faker.string.numeric(3);
    const uid = faker.string.hexadecimal({ length: 64, prefix: '' });
    const uuid = faker.string.uuid();

    return {
      '@timestamp': timestamp,
      authentik: {
        user: {
          avatar: `data:image/svg+xml;base64,${faker.string.alphanumeric(20)}`,
          email: employee.email,
          groups: [],
          is_active: true,
          is_superuser: employee.department === 'Operations' && employee.role.includes('Admin'),
          last_login: this.getRandomTimestamp(48),
          name: `${employee.firstName} ${employee.lastName}`,
          path: 'users',
          pk: pk,
          type: 'internal',
          uid: uid,
          username: employee.userName,
          uuid: uuid,
        },
      },
      user: {
        domain: org.domain,
        email: employee.email,
        full_name: `${employee.firstName} ${employee.lastName}`,
        id: pk,
        name: employee.userName,
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'authentik.user' },
      tags: ['forwarded', 'authentik-user'],
    } as IntegrationDocument;
  }

  private createGroupDocument(name: string, members: Employee[]): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const pk = faker.string.uuid();
    const numPk = faker.number.int({ min: 50000, max: 59999 });

    return {
      '@timestamp': timestamp,
      authentik: {
        group: {
          is_superuser: false,
          name: name,
          num_pk: numPk,
          pk: pk,
          users: members.map((_, idx) => String(idx + 1)),
        },
      },
      group: {
        id: pk,
        name: name,
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'authentik.group' },
      tags: ['forwarded', 'authentik-group'],
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
    const expires = new Date(new Date(timestamp).getTime() + 24 * 60 * 60 * 1000).toISOString();

    const context = this.buildEventContext(eventType.action, employee, org);

    return {
      '@timestamp': timestamp,
      authentik: {
        event: {
          action: eventType.action,
          app: eventType.app,
          brand: {
            app: 'authentik_brands',
            model_name: 'brand',
            name: 'Default brand',
            pk: faker.string.hexadecimal({ length: 32, prefix: '' }),
          },
          client_ip: clientIp,
          context: context,
          created: created,
          expires: expires,
          pk: pk,
          user: {
            email: employee.email,
            pk: faker.string.numeric(3),
            username: employee.userName,
          },
        },
      },
      event: {
        action: eventType.eventAction,
        category: eventType.eventCategory,
        kind: 'event',
      },
      source: {
        ip: clientIp,
        geo: {
          city_name: faker.location.city(),
          country_iso_code: faker.location.countryCode(),
        },
      },
      url: {
        path: faker.helpers.arrayElement(FLOW_PATHS),
      },
      user: {
        domain: org.domain,
        email: employee.email,
        id: String(faker.number.int({ min: 1, max: 999 })),
        name: employee.userName,
      },
      related: {
        ip: [clientIp],
        user: [employee.userName, employee.email],
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'authentik.event' },
      tags: ['forwarded', 'authentik-event', 'preserve_original_event'],
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
            path: faker.helpers.arrayElement(['/api/v3/admin/', '/api/v3/core/users/', '/.env']),
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
