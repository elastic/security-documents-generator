/**
 * Slack Integration
 * Generates audit log documents for Slack Enterprise workspace
 * Based on the Elastic slack integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

/** Slack audit event actions with weights */
const AUDIT_ACTIONS: Array<{ value: string; weight: number; category: string }> = [
  { value: 'user_login', weight: 30, category: 'authentication' },
  { value: 'user_logout', weight: 10, category: 'authentication' },
  { value: 'user_created', weight: 5, category: 'iam' },
  { value: 'user_deactivated', weight: 2, category: 'iam' },
  { value: 'user_channel_join', weight: 15, category: 'configuration' },
  { value: 'user_channel_leave', weight: 5, category: 'configuration' },
  { value: 'channel_created', weight: 5, category: 'configuration' },
  { value: 'channel_archived', weight: 2, category: 'configuration' },
  { value: 'file_uploaded', weight: 8, category: 'file' },
  { value: 'file_downloaded', weight: 5, category: 'file' },
  { value: 'app_installed', weight: 3, category: 'configuration' },
  { value: 'app_removed', weight: 1, category: 'configuration' },
  { value: 'member_joined_channel', weight: 4, category: 'configuration' },
  { value: 'anomaly', weight: 2, category: 'intrusion_detection' },
  { value: 'pref_sso_setting_changed', weight: 1, category: 'configuration' },
  { value: 'role_change_to_admin', weight: 1, category: 'iam' },
  { value: 'role_change_to_owner', weight: 1, category: 'iam' },
];

/** Slack channel names */
const CHANNEL_NAMES = [
  'general',
  'random',
  'engineering',
  'sales',
  'marketing',
  'support',
  'devops',
  'security',
  'incidents',
  'product',
  'design',
  'announcements',
  'team-leads',
  'standup',
  'deployments',
];

/** Anomaly reasons */
const ANOMALY_REASONS = ['asn', 'ip_address', 'session_fingerprint', 'tor', 'user_agent'];

/**
 * Slack Integration
 * Generates Slack Enterprise audit log documents
 */
export class SlackIntegration extends BaseIntegration {
  readonly packageName = 'slack';
  readonly displayName = 'Slack';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'audit',
      index: 'logs-slack.audit-default',
    },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    // Generate 2-4 audit events per employee
    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 4 });
      for (let i = 0; i < eventCount; i++) {
        documents.push(this.createAuditDocument(employee, org));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  /**
   * Create a Slack audit log document
   */
  private createAuditDocument(employee: Employee, org: Organization): IntegrationDocument {
    const action = faker.helpers.weightedArrayElement(
      AUDIT_ACTIONS.map((a) => ({ value: a, weight: a.weight }))
    );
    const sourceIp = faker.internet.ipv4();
    const workspaceId = faker.string.alphanumeric(9).toUpperCase();
    const workspaceName = org.name;
    const userId = faker.string.alphanumeric(8);
    const isAnomaly = action.value === 'anomaly';

    // Pick a target entity based on the action
    const targetEmployee = faker.helpers.arrayElement(org.employees);
    const channelName = faker.helpers.arrayElement(CHANNEL_NAMES);
    const channelId = `C${faker.string.alphanumeric(8).toUpperCase()}`;

    // Build entity based on action type
    const entity = this.buildEntity(action.value, targetEmployee, channelId, channelName);

    const timestamp = this.getRandomTimestamp(72);
    const userAgent = faker.internet.userAgent();
    const rawEvent: Record<string, unknown> = {
      id: faker.string.uuid(),
      action: action.value,
      date_create: Math.floor(new Date(timestamp).getTime() / 1000),
      actor: {
        type: 'user',
        user: {
          id: userId,
          name: `${employee.firstName} ${employee.lastName}`,
          email: employee.email,
          team: `T${faker.string.alphanumeric(8).toUpperCase()}`,
        },
      },
      context: {
        ip_address: sourceIp,
        ua: userAgent,
        location: {
          domain: workspaceName,
          id: workspaceId,
          name: workspaceName,
          type: 'workspace',
        },
      },
      entity: entity,
    };

    if (isAnomaly) {
      rawEvent.details = {
        action_timestamp: new Date(timestamp).getTime(),
        location: `${faker.location.city()}, ${faker.location.countryCode()}`,
        previous_ip_address: faker.internet.ipv4(),
        previous_ua: '',
        reason: faker.helpers.arrayElements(ANOMALY_REASONS, { min: 1, max: 2 }),
      };
    }

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'slack.audit',
      },
      tags: ['forwarded', 'slack-audit', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  /**
   * Build entity object based on action type
   */
  private buildEntity(
    action: string,
    targetEmployee: Employee,
    channelId: string,
    channelName: string
  ): Record<string, unknown> {
    if (action.includes('channel') || action === 'member_joined_channel') {
      return {
        entity_type: 'channel',
        id: channelId,
        name: channelName,
        privacy: faker.helpers.arrayElement(['public', 'private']),
        is_shared: faker.datatype.boolean(0.2),
        is_org_shared: faker.datatype.boolean(0.1),
      };
    }

    if (action.includes('file')) {
      return {
        entity_type: 'file',
        id: faker.string.alphanumeric(11).toUpperCase(),
        name: `${faker.word.adjective()}-${faker.word.noun()}.${faker.helpers.arrayElement(['pdf', 'docx', 'xlsx', 'png', 'zip'])}`,
        filetype: faker.helpers.arrayElement(['pdf', 'docx', 'xlsx', 'png', 'zip']),
        title: faker.lorem.words(3),
      };
    }

    if (action.includes('app')) {
      return {
        entity_type: 'app',
        id: faker.string.alphanumeric(11).toUpperCase(),
        name: faker.helpers.arrayElement([
          'GitHub',
          'Jira',
          'PagerDuty',
          'Google Drive',
          'Zoom',
          'Asana',
          'Datadog',
          'Sentry',
        ]),
        is_distributed: faker.datatype.boolean(0.6),
        is_directory_approved: faker.datatype.boolean(0.8),
        is_workflow_app: false,
      };
    }

    // Default: user entity (login, logout, user_created, anomaly, role_change, etc.)
    return {
      entity_type: 'user',
      id: faker.string.alphanumeric(8),
      name: `${targetEmployee.firstName} ${targetEmployee.lastName}`,
      email: targetEmployee.email,
      team: `T${faker.string.alphanumeric(8).toUpperCase()}`,
    };
  }
}
