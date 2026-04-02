/**
 * MongoDB Atlas Integration
 * Generates mongod audit logs and organization activity logs for MongoDB Atlas
 * Based on the Elastic mongodb_atlas integration package
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap } from '../types.ts';
import { faker } from '@faker-js/faker';

const AUDIT_ACTIONS: Array<{ value: string; weight: number }> = [
  { value: 'authenticate', weight: 40 },
  { value: 'createCollection', weight: 8 },
  { value: 'dropCollection', weight: 3 },
  { value: 'createIndex', weight: 5 },
  { value: 'createUser', weight: 3 },
  { value: 'dropUser', weight: 1 },
  { value: 'grantRolesToUser', weight: 4 },
  { value: 'revokeRolesFromUser', weight: 2 },
  { value: 'updateUser', weight: 3 },
  { value: 'shutdown', weight: 1 },
];

const AUDIT_RESULTS: Array<{ value: string; weight: number }> = [
  { value: 'Success', weight: 90 },
  { value: 'Failure', weight: 10 },
];

const DB_ROLES = ['dbAdmin', 'readWrite', 'read', 'clusterAdmin', 'atlasAdmin', 'backup'];

const ORG_EVENT_TYPES: Array<{ value: string; weight: number }> = [
  { value: 'GROUP_TAGS_MODIFIED', weight: 10 },
  { value: 'USER_INVITED_TO_GROUP', weight: 8 },
  { value: 'USER_REMOVED_FROM_GROUP', weight: 3 },
  { value: 'CLUSTER_CREATED', weight: 5 },
  { value: 'CLUSTER_DELETED', weight: 2 },
  { value: 'CLUSTER_SCALED', weight: 4 },
  { value: 'ALERT_CONFIG_CREATED', weight: 5 },
  { value: 'ALERT_RESOLVED', weight: 8 },
  { value: 'API_KEY_CREATED', weight: 3 },
  { value: 'API_KEY_DELETED', weight: 2 },
  { value: 'DATABASE_USER_CREATED', weight: 5 },
  { value: 'DATABASE_USER_DELETED', weight: 2 },
  { value: 'IP_WHITELIST_ENTRY_ADDED', weight: 4 },
];

const CLUSTER_NAMES = [
  'prod-cluster-0',
  'staging-cluster-0',
  'analytics-cluster',
  'dev-cluster-0',
  'reporting-cluster',
];

export class MongoDbAtlasIntegration extends BaseIntegration {
  readonly packageName = 'mongodb_atlas';
  readonly displayName = 'MongoDB Atlas';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'Mongod Audit', index: 'logs-mongodb_atlas.mongod_audit-default' },
    { name: 'Organization', index: 'logs-mongodb_atlas.organization-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const auditDocs: IntegrationDocument[] = [];
    const orgDocs: IntegrationDocument[] = [];
    const orgId = faker.string.hexadecimal({ length: 24, prefix: '' });
    const centralAgent = this.buildCentralAgent(org);

    for (const employee of org.employees) {
      const auditCount = faker.number.int({ min: 2, max: 4 });
      for (let i = 0; i < auditCount; i++) {
        auditDocs.push(this.createAuditDocument(employee, centralAgent));
      }

      if (faker.datatype.boolean(0.4)) {
        orgDocs.push(this.createOrgDocument(employee, org, orgId, centralAgent));
      }
    }

    documentsMap.set(this.dataStreams[0].index, auditDocs);
    documentsMap.set(this.dataStreams[1].index, orgDocs);
    return documentsMap;
  }

  private createAuditDocument(
    employee: Employee,
    centralAgent: { id: string; name: string; type: string; version: string },
  ): IntegrationDocument {
    const action = faker.helpers.weightedArrayElement(
      AUDIT_ACTIONS.map((a) => ({ value: a, weight: a.weight })),
    );
    const result = faker.helpers.weightedArrayElement(
      AUDIT_RESULTS.map((r) => ({ value: r, weight: r.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);
    const localIp = '127.0.0.1';
    const remoteIp = faker.internet.ipv4();
    const localPort = 27017;
    const remotePort = faker.number.int({ min: 30000, max: 65535 });
    const hostname = `atlas-${faker.string.alphanumeric(6)}-shard-00-00.mongodb.net`;
    const dbName = faker.helpers.arrayElement(['admin', 'app_db', 'analytics', 'config']);
    const role = faker.helpers.arrayElement(DB_ROLES);

    // Raw MongoDB audit JSON - pipeline parses message into event.original -> json
    const resultCode = result.value === 'Success' ? '0' : '18';
    const rawAudit: Record<string, unknown> = {
      ts: { $date: timestamp },
      atype: action.value,
      local: { ip: localIp, port: localPort },
      remote: { ip: remoteIp, port: remotePort },
      users: [{ db: dbName, user: employee.userName }],
      roles: [{ db: dbName, role }],
      param: {},
      result: resultCode,
      uuid: { $binary: faker.string.uuid(), $type: '04' },
    };

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      message: JSON.stringify(rawAudit),
      host_name: hostname,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'mongodb_atlas.mongod_audit' },
    } as IntegrationDocument;
  }

  private createOrgDocument(
    employee: Employee,
    org: Organization,
    orgId: string,
    centralAgent: { id: string; name: string; type: string; version: string },
  ): IntegrationDocument {
    const eventType = faker.helpers.weightedArrayElement(
      ORG_EVENT_TYPES.map((e) => ({ value: e, weight: e.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);
    const clusterName = faker.helpers.arrayElement(CLUSTER_NAMES);
    const groupId = faker.string.hexadecimal({ length: 24, prefix: '' });
    const clientIp = faker.internet.ipv4();
    const clusterId = faker.string.hexadecimal({ length: 24, prefix: '' });
    const eventId = faker.string.hexadecimal({ length: 24, prefix: '' });
    const userId = faker.string.hexadecimal({ length: 8, prefix: '' });

    const targetEmployee = faker.helpers.arrayElement(org.employees);

    // Pipeline expects top-level response object (NOT in message)
    const response: Record<string, unknown> = {
      created: timestamp,
      id: eventId,
      remoteAddress: clientIp,
      groupId,
      orgId,
      userId,
      username: employee.email,
      eventTypeName: eventType.value,
      clusterId,
      clusterName,
      targetUsername: targetEmployee.email,
      opType: 'update',
      publicKey: faker.string.alphanumeric(8),
      teamId: faker.string.hexadecimal({ length: 8, prefix: '' }),
      hostname: `atlas-${faker.string.alphanumeric(6)}-shard-00-00.mongodb.net`,
      raw: {
        _t: 'RESOURCE_AUDIT',
        cid: groupId,
        cre: timestamp,
        description: `Action ${eventType.value} performed`,
        gn: `${org.name.toLowerCase().replace(/\s+/g, '_')}_project`,
        orgName: org.name,
        severity: 'INFO',
        source: 'USER',
        un: employee.email,
        ut: 'LOCAL',
      },
    };

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      response,
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'mongodb_atlas.organization',
      },
    } as IntegrationDocument;
  }
}
