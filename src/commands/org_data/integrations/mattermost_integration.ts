/**
 * Mattermost Integration
 * Generates audit log documents for Mattermost collaboration platform
 * Based on the Elastic mattermost integration package
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap } from '../types.ts';
import { faker } from '@faker-js/faker';

const AUDIT_ACTIONS: Array<{ value: string; weight: number; category: string }> = [
  { value: 'updateConfig', weight: 3, category: 'configuration' },
  { value: 'login', weight: 25, category: 'authentication' },
  { value: 'logout', weight: 10, category: 'authentication' },
  { value: 'createPost', weight: 20, category: 'creation' },
  { value: 'createChannel', weight: 5, category: 'configuration' },
  { value: 'addMembers', weight: 8, category: 'configuration' },
  { value: 'removeMembers', weight: 3, category: 'configuration' },
  { value: 'deleteChannel', weight: 2, category: 'configuration' },
  { value: 'deactivateUser', weight: 1, category: 'iam' },
  { value: 'updateUser', weight: 5, category: 'iam' },
  { value: 'createTeam', weight: 2, category: 'configuration' },
  { value: 'joinTeam', weight: 5, category: 'configuration' },
  { value: 'uploadFile', weight: 5, category: 'file' },
  { value: 'revokeSession', weight: 3, category: 'authentication' },
  { value: 'updateRoles', weight: 2, category: 'iam' },
  { value: 'createOAuthApp', weight: 1, category: 'configuration' },
];

const OUTCOME_MAP: Record<string, string> = {
  login: 'success',
  logout: 'success',
  deactivateUser: 'success',
  revokeSession: 'success',
};

const CHANNEL_NAMES = [
  'town-square',
  'off-topic',
  'engineering',
  'devops',
  'security-alerts',
  'incidents',
  'product-updates',
  'marketing',
  'sales',
  'support',
];

export class MattermostIntegration extends BaseIntegration {
  readonly packageName = 'mattermost';
  readonly displayName = 'Mattermost';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'Audit Logs', index: 'logs-mattermost.audit-default' },
  ];

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
        documents.push(this.createAuditDocument(employee, org, centralAgent));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  private createAuditDocument(
    employee: Employee,
    org: Organization,
    centralAgent: { id: string; name: string; type: string; version: string },
  ): IntegrationDocument {
    const action = faker.helpers.weightedArrayElement(
      AUDIT_ACTIONS.map((a) => ({ value: a, weight: a.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const userId = faker.string.alphanumeric(26);
    const sessionId = faker.string.alphanumeric(26);
    const clusterId = faker.string.alphanumeric(26);
    const channelName = faker.helpers.arrayElement(CHANNEL_NAMES);

    const outcome = OUTCOME_MAP[action.value] ?? 'success';
    const apiPath = this.getApiPath(action.value);
    const client = faker.internet.userAgent();

    // Timestamp format: yyyy-MM-dd HH:mm:ss.SSS 'Z' (space before Z)
    const rawTimestamp = timestamp.replace('T', ' ').replace('Z', ' Z');

    const rawEvent: Record<string, unknown> = {
      timestamp: rawTimestamp,
      event: action.value,
      status: outcome,
      user_id: userId,
      session_id: sessionId,
      ip_address: sourceIp,
      api_path: apiPath,
      cluster_id: clusterId,
      client,
      user: {
        id: userId,
        name: employee.userName,
        roles: 'system_admin system_user',
      },
    };

    if (action.value.includes('Channel')) {
      rawEvent.channel = { name: channelName, type: 'O' };
    }
    if (action.value.includes('Team')) {
      rawEvent.team = { name: org.name.toLowerCase().replace(/\s+/g, '-') };
    }

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      message: JSON.stringify(rawEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'mattermost.audit' },
    } as IntegrationDocument;
  }

  private getApiPath(action: string): string {
    const paths: Record<string, string> = {
      login: '/api/v4/users/login',
      logout: '/api/v4/users/logout',
      updateConfig: '/api/v4/config',
      createPost: '/api/v4/posts',
      createChannel: '/api/v4/channels',
      addMembers: '/api/v4/channels/members',
      removeMembers: '/api/v4/channels/members',
      deleteChannel: '/api/v4/channels',
      deactivateUser: '/api/v4/users',
      updateUser: '/api/v4/users',
      createTeam: '/api/v4/teams',
      joinTeam: '/api/v4/teams/members',
      uploadFile: '/api/v4/files',
      revokeSession: '/api/v4/users/sessions/revoke',
      updateRoles: '/api/v4/users/roles',
      createOAuthApp: '/api/v4/oauth/apps',
    };
    return paths[action] ?? `/api/v4/${action}`;
  }
}
