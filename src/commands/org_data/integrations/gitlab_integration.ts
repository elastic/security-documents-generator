/**
 * GitLab Integration
 * Generates audit, API, and auth log documents for GitLab
 * Based on the Elastic gitlab integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const AUDIT_EVENTS: Array<{
  change: string;
  entityType: string;
  targetType: string;
  from: string;
  to: string;
  weight: number;
}> = [
  {
    change: 'visibility',
    entityType: 'Project',
    targetType: 'Project',
    from: 'private',
    to: 'internal',
    weight: 5,
  },
  {
    change: 'visibility',
    entityType: 'Project',
    targetType: 'Project',
    from: 'internal',
    to: 'public',
    weight: 2,
  },
  {
    change: 'access_level',
    entityType: 'Project',
    targetType: 'User',
    from: '30',
    to: '40',
    weight: 8,
  },
  {
    change: 'access_level',
    entityType: 'Group',
    targetType: 'User',
    from: '20',
    to: '30',
    weight: 6,
  },
  {
    change: 'name',
    entityType: 'Project',
    targetType: 'Project',
    from: 'old-name',
    to: 'new-name',
    weight: 3,
  },
  {
    change: 'path',
    entityType: 'Project',
    targetType: 'Project',
    from: 'old-path',
    to: 'new-path',
    weight: 2,
  },
  {
    change: 'merge_requests_access_level',
    entityType: 'Project',
    targetType: 'Project',
    from: 'enabled',
    to: 'private',
    weight: 4,
  },
  {
    change: 'repository_access_level',
    entityType: 'Project',
    targetType: 'Project',
    from: 'enabled',
    to: 'private',
    weight: 3,
  },
  {
    change: 'deploy_key',
    entityType: 'Project',
    targetType: 'DeployKey',
    from: '',
    to: 'added',
    weight: 3,
  },
  {
    change: 'protected_branch',
    entityType: 'Project',
    targetType: 'ProtectedBranch',
    from: '',
    to: 'main',
    weight: 4,
  },
];

const API_ROUTES = [
  '/api/:version/projects',
  '/api/:version/projects/:id/repository/tree',
  '/api/:version/projects/:id/merge_requests',
  '/api/:version/projects/:id/pipelines',
  '/api/:version/projects/:id/issues',
  '/api/:version/projects/:id/members',
  '/api/:version/users',
  '/api/:version/groups',
  '/api/:version/projects/:id/repository/branches',
  '/api/:version/projects/:id/repository/commits',
  '/api/:version/projects/:id/jobs',
  '/api/:version/geo/proxy',
];

const AUTH_MESSAGES = [
  { message: 'Successful Login', env: 'production', isFailure: false, weight: 50 },
  { message: 'Failed Login', env: 'production', isFailure: true, weight: 10 },
  { message: 'Rack_Attack', env: 'blocklist', isFailure: true, weight: 3 },
  { message: 'Successful Login via LDAP', env: 'production', isFailure: false, weight: 15 },
  { message: 'Successful Login via SAML', env: 'production', isFailure: false, weight: 12 },
  { message: 'Successful Login via OAuth', env: 'production', isFailure: false, weight: 8 },
  { message: 'Two-factor authentication required', env: 'production', isFailure: true, weight: 5 },
];

const GITLAB_GROUPS = ['backend', 'frontend', 'platform', 'devops', 'security', 'data'] as const;

const GITLAB_PROJECTS = [
  'api-gateway',
  'web-frontend',
  'data-pipeline',
  'infrastructure',
  'auth-service',
  'mobile-app',
  'docs',
  'monitoring',
  'ci-templates',
  'shared-lib',
];

export class GitLabIntegration extends BaseIntegration {
  readonly packageName = 'gitlab';
  readonly displayName = 'GitLab';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'audit', index: 'logs-gitlab.audit-default' },
    { name: 'api', index: 'logs-gitlab.api-default' },
    { name: 'auth', index: 'logs-gitlab.auth-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const auditDocs: IntegrationDocument[] = [];
    const apiDocs: IntegrationDocument[] = [];
    const authDocs: IntegrationDocument[] = [];

    const gitlabEmployees = org.employees.filter((e) => e.gitlabUserId != null);

    for (const employee of gitlabEmployees) {
      const auditCount = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < auditCount; i++) {
        auditDocs.push(this.createAuditDocument(employee, org));
      }

      const apiCount = faker.number.int({
        min: 2,
        max: employee.department === 'Product & Engineering' ? 8 : 3,
      });
      for (let i = 0; i < apiCount; i++) {
        apiDocs.push(this.createApiDocument(employee, org));
      }

      const authCount = faker.number.int({ min: 1, max: 2 });
      for (let i = 0; i < authCount; i++) {
        authDocs.push(this.createAuthDocument(employee, org));
      }
    }

    documentsMap.set(this.dataStreams[0].index, auditDocs);
    documentsMap.set(this.dataStreams[1].index, apiDocs);
    documentsMap.set(this.dataStreams[2].index, authDocs);
    return documentsMap;
  }

  private createAuditDocument(employee: Employee, _org: Organization): IntegrationDocument {
    const evt = faker.helpers.weightedArrayElement(
      AUDIT_EVENTS.map((e) => ({ value: e, weight: e.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const entityId = faker.number.int({ min: 1, max: 500 });
    const targetId = faker.number.int({ min: 1, max: 500 });
    const project = faker.helpers.arrayElement(GITLAB_PROJECTS);
    const group = faker.helpers.arrayElement(GITLAB_GROUPS);
    const sourceIp = faker.internet.ipv4();

    const auditFrom = evt.change === 'name' ? `${project}-old` : evt.from;
    const auditTo = evt.change === 'name' ? project : evt.to;

    return {
      '@timestamp': timestamp,
      event: {
        action: `${evt.change}_changed`,
        category: ['configuration'],
        type: ['change'],
        dataset: 'gitlab.audit',
      },
      gitlab: {
        audit: {
          change: evt.change,
          from: auditFrom,
          to: auditTo,
          entity_id: String(entityId),
          entity_type: evt.entityType,
          target_id: String(targetId),
          target_type: evt.targetType,
          target_details: evt.targetType === 'User' ? employee.userName : `${group}/${project}`,
          meta: {
            caller_id: 'application',
            remote_ip: sourceIp,
            user: employee.userName,
            user_id: String(employee.gitlabUserId),
            project: `${group}/${project}`,
            root_namespace: group,
            client_id: `user/${employee.gitlabUserId}`,
          },
        },
      },
      user: {
        id: String(employee.gitlabUserId),
        name: `${employee.firstName} ${employee.lastName}`,
      },
      source: {
        ip: sourceIp,
      },
      related: {
        ip: [sourceIp],
        user: [employee.userName, String(employee.gitlabUserId)],
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'gitlab.audit' },
      tags: ['forwarded', 'gitlab-audit'],
    } as IntegrationDocument;
  }

  private createApiDocument(employee: Employee, org: Organization): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const route = faker.helpers.arrayElement(API_ROUTES);
    const method = faker.helpers.weightedArrayElement([
      { value: 'GET' as const, weight: 60 },
      { value: 'POST' as const, weight: 20 },
      { value: 'PUT' as const, weight: 12 },
      { value: 'DELETE' as const, weight: 8 },
    ]);
    const sourceIp = faker.internet.ipv4();
    const statusCode = faker.helpers.weightedArrayElement([
      { value: 200, weight: 70 },
      { value: 201, weight: 10 },
      { value: 304, weight: 5 },
      { value: 401, weight: 5 },
      { value: 403, weight: 3 },
      { value: 404, weight: 5 },
      { value: 500, weight: 2 },
    ]);
    const dbDuration = faker.number.float({ min: 0.5, max: 200, fractionDigits: 2 });
    const duration = faker.number.float({ min: 10, max: 2000, fractionDigits: 2 });
    const gitlabHost = `gitlab.${org.domain}`;
    const correlationId = faker.string.alphanumeric(32);
    const tokenId = faker.number.int({ min: 1, max: 999 });

    return {
      '@timestamp': timestamp,
      event: {
        action: route,
        category: ['web'],
        type: ['access'],
        outcome: statusCode < 400 ? 'success' : 'failure',
        dataset: 'gitlab.api',
      },
      gitlab: {
        api: {
          route,
          db_duration_s: dbDuration,
          duration_s: duration,
          mem_bytes: faker.number.int({ min: 100000, max: 50000000 }),
          mem_mallocs: faker.number.int({ min: 1000, max: 100000 }),
          mem_objects: faker.number.int({ min: 500, max: 50000 }),
          redis_calls: faker.number.int({ min: 0, max: 20 }),
          redis_duration_s: faker.number.float({ min: 0, max: 5, fractionDigits: 4 }),
          correlation_id: correlationId,
          token_id: tokenId,
          token_type: faker.helpers.arrayElement([
            'PersonalAccessToken',
            'OauthAccessToken',
            'DeployToken',
          ]),
          meta: {
            user: employee.userName,
            user_id: String(employee.gitlabUserId),
            remote_ip: sourceIp,
            client_id: `user/${employee.gitlabUserId}`,
          },
        },
      },
      http: {
        request: { method },
        response: { status_code: statusCode },
      },
      url: {
        path: route
          .replace(':version', 'v4')
          .replace(':id', String(faker.number.int({ min: 1, max: 500 }))),
      },
      user: {
        id: String(employee.gitlabUserId),
        name: employee.userName,
      },
      source: {
        ip: sourceIp,
      },
      user_agent: {
        original: faker.internet.userAgent(),
      },
      related: {
        ip: [sourceIp],
        user: [employee.userName],
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'gitlab.api' },
      tags: ['forwarded', 'gitlab-api'],
      host: { name: gitlabHost },
    } as IntegrationDocument;
  }

  private createAuthDocument(employee: Employee, org: Organization): IntegrationDocument {
    const evt = faker.helpers.weightedArrayElement(
      AUTH_MESSAGES.map((e) => ({ value: e, weight: e.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const gitlabHost = `gitlab.${org.domain}`;

    return {
      '@timestamp': timestamp,
      event: {
        action: evt.isFailure ? 'failed-login' : 'successful-login',
        category: ['authentication'],
        type: evt.isFailure ? ['start'] : ['start'],
        outcome: evt.isFailure ? 'failure' : 'success',
        dataset: 'gitlab.auth',
      },
      gitlab: {
        auth: {
          message: evt.message,
          env: evt.env,
          remote_ip: sourceIp,
          matched: evt.env === 'blocklist' ? 'blocklist' : undefined,
          meta: {
            user: employee.userName,
          },
        },
      },
      user: {
        id: String(employee.gitlabUserId),
        name: employee.userName,
        email: employee.email,
      },
      source: {
        ip: sourceIp,
      },
      related: {
        ip: [sourceIp],
        user: [employee.userName, employee.email],
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'gitlab.auth' },
      tags: ['forwarded', 'gitlab-auth'],
      host: { name: gitlabHost },
    } as IntegrationDocument;
  }
}
