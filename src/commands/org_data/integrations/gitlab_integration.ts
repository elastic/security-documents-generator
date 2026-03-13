/**
 * GitLab Integration
 * Generates raw/pre-pipeline audit, API, and auth log documents for GitLab.
 * Documents have `message` containing JSON that the ingest pipeline parses:
 * message → event.original → json parse → gitlab.auth | gitlab.audit | gitlab.api
 * Pipelines: integrations/packages/gitlab/data_stream/{auth,audit,api}/elasticsearch/ingest_pipeline/default.yml
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap } from '../types.ts';
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
    _correlationMap: CorrelationMap,
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
      AUDIT_EVENTS.map((e) => ({ value: e, weight: e.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);
    const entityId = faker.number.int({ min: 1, max: 500 });
    const targetId = faker.number.int({ min: 1, max: 500 });
    const project = faker.helpers.arrayElement(GITLAB_PROJECTS);
    const group = faker.helpers.arrayElement(GITLAB_GROUPS);
    const sourceIp = faker.internet.ipv4();

    const auditFrom = evt.change === 'name' ? `${project}-old` : evt.from;
    const auditTo = evt.change === 'name' ? project : evt.to;
    const targetDetails = evt.targetType === 'User' ? employee.userName : `${group}/${project}`;

    const raw: Record<string, unknown> = {
      severity: 'INFO',
      time: timestamp,
      author_id: employee.gitlabUserId,
      author_name: `${employee.firstName} ${employee.lastName}`,
      entity_id: entityId,
      entity_type: evt.entityType,
      change: evt.change,
      from: auditFrom,
      to: auditTo,
      target_id: targetId,
      target_type: evt.targetType,
      target_details: targetDetails,
      'meta.remote_ip': sourceIp,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'gitlab.audit' },
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
    const dbDuration = faker.number.float({ min: 0.001, max: 0.2, fractionDigits: 5 });
    const duration = faker.number.float({ min: 0.01, max: 2, fractionDigits: 5 });
    const path = route
      .replace(':version', 'v4')
      .replace(':id', String(faker.number.int({ min: 1, max: 500 })));
    const gitlabHost = `gitlab.${org.domain}`;
    const correlationId = faker.string.uuid();
    const params = faker.datatype.boolean(0.3)
      ? [{ key: 'private_token', value: '[FILTERED]' }]
      : [];

    const raw: Record<string, unknown> = {
      time: timestamp,
      severity: 'INFO',
      duration_s: duration,
      db_duration_s: dbDuration,
      view_duration_s: duration,
      status: statusCode,
      method,
      path,
      params,
      host: gitlabHost,
      remote_ip: sourceIp,
      ua: faker.internet.userAgent(),
      route,
      correlation_id: correlationId,
      user_id: employee.gitlabUserId,
      username: employee.userName,
      'meta.caller_id': `${method} ${route}`,
      'meta.remote_ip': sourceIp,
      'meta.feature_category': faker.helpers.arrayElement([
        'geo_replication',
        'groups_and_projects',
        'user_profile',
        'devops_reports',
      ]),
      'meta.client_id': `user/${employee.gitlabUserId}`,
      'meta.user': employee.userName,
      'meta.user_id': employee.gitlabUserId,
      pid: faker.number.int({ min: 1000, max: 9999 }),
      mem_objects: faker.number.int({ min: 5000, max: 100000 }),
      mem_bytes: faker.number.int({ min: 500000, max: 50000000 }),
      mem_mallocs: faker.number.int({ min: 5000, max: 100000 }),
      db_count: faker.number.int({ min: 0, max: 20 }),
      db_write_count: 0,
      db_cached_count: 0,
      db_txn_count: 0,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'gitlab.api' },
    } as IntegrationDocument;
  }

  private createAuthDocument(employee: Employee, _org: Organization): IntegrationDocument {
    const evt = faker.helpers.weightedArrayElement(
      AUTH_MESSAGES.map((e) => ({ value: e, weight: e.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const correlationId = faker.string.uuid();

    const raw: Record<string, unknown> = {
      severity: evt.isFailure ? 'ERROR' : 'INFO',
      time: timestamp,
      correlation_id: correlationId,
      message: evt.message,
      env: evt.env,
      remote_ip: sourceIp,
      user_id: String(employee.gitlabUserId),
      'meta.user': employee.userName,
    };

    if (evt.env === 'blocklist') {
      raw.matched = 'blocklist';
    }
    if (faker.datatype.boolean(0.5)) {
      raw.request_method = faker.helpers.arrayElement(['GET', 'POST']);
      raw.path = faker.helpers.arrayElement([
        '/users/sign_in',
        '/users/saml/auth',
        '/oauth/token',
        `/group/project.git/info/refs?service=git-upload-pack`,
      ]);
    }
    if (evt.isFailure && faker.datatype.boolean(0.5)) {
      raw.status = faker.helpers.arrayElement([401, 403]);
    }
    if (faker.datatype.boolean(0.3)) {
      raw.pid = faker.number.int({ min: 1000, max: 9999 });
    }

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'gitlab.auth' },
    } as IntegrationDocument;
  }
}
