/**
 * Atlassian Jira Integration
 * Generates audit log documents for Jira Server/Cloud
 * Based on the Elastic atlassian_jira integration package
 */

import {
  BaseIntegration,
  IntegrationDocument,
  DataStreamConfig,
  AgentData,
} from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const AUDIT_ACTIONS: Array<{
  value: string;
  actionI18nKey: string;
  area: string;
  category: string;
  categoryI18nKey: string;
  level: string;
  eventCategory: string[];
  eventType: string[];
  weight: number;
}> = [
  {
    value: 'Issue created',
    actionI18nKey: 'jira.auditing.issue.created',
    area: 'PROJECT_MANAGEMENT',
    category: 'issues',
    categoryI18nKey: 'jira.auditing.category.issues',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 25,
  },
  {
    value: 'Issue updated',
    actionI18nKey: 'jira.auditing.issue.updated',
    area: 'PROJECT_MANAGEMENT',
    category: 'issues',
    categoryI18nKey: 'jira.auditing.category.issues',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['change'],
    weight: 30,
  },
  {
    value: 'Issue deleted',
    actionI18nKey: 'jira.auditing.issue.deleted',
    area: 'PROJECT_MANAGEMENT',
    category: 'issues',
    categoryI18nKey: 'jira.auditing.category.issues',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['deletion'],
    weight: 2,
  },
  {
    value: 'Issue transitioned',
    actionI18nKey: 'jira.auditing.issue.transitioned',
    area: 'PROJECT_MANAGEMENT',
    category: 'issues',
    categoryI18nKey: 'jira.auditing.category.issues',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['change'],
    weight: 20,
  },
  {
    value: 'Group created',
    actionI18nKey: 'jira.auditing.group.created',
    area: 'USER_MANAGEMENT',
    category: 'group management',
    categoryI18nKey: 'jira.auditing.category.groupmanagement',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['group', 'creation'],
    weight: 2,
  },
  {
    value: 'User added to group',
    actionI18nKey: 'jira.auditing.group.user.added',
    area: 'USER_MANAGEMENT',
    category: 'group management',
    categoryI18nKey: 'jira.auditing.category.groupmanagement',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 5,
  },
  {
    value: 'User removed from group',
    actionI18nKey: 'jira.auditing.group.user.removed',
    area: 'USER_MANAGEMENT',
    category: 'group management',
    categoryI18nKey: 'jira.auditing.category.groupmanagement',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 2,
  },
  {
    value: 'Permission scheme updated',
    actionI18nKey: 'jira.auditing.permission.scheme.updated',
    area: 'PERMISSIONS',
    category: 'permissions',
    categoryI18nKey: 'jira.auditing.category.permissions',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 3,
  },
  {
    value: 'Project created',
    actionI18nKey: 'jira.auditing.project.created',
    area: 'PROJECT_MANAGEMENT',
    category: 'projects',
    categoryI18nKey: 'jira.auditing.category.projects',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 2,
  },
  {
    value: 'Workflow scheme updated',
    actionI18nKey: 'jira.auditing.workflow.scheme.updated',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'workflows',
    categoryI18nKey: 'jira.auditing.category.workflows',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['change'],
    weight: 3,
  },
  {
    value: 'Filter shared',
    actionI18nKey: 'jira.auditing.filter.shared',
    area: 'PROJECT_MANAGEMENT',
    category: 'filters',
    categoryI18nKey: 'jira.auditing.category.filters',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['change'],
    weight: 4,
  },
  {
    value: 'Global permission granted',
    actionI18nKey: 'jira.auditing.global.permission.granted',
    area: 'PERMISSIONS',
    category: 'permissions',
    categoryI18nKey: 'jira.auditing.category.permissions',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 1,
  },
];

const PROJECT_KEYS = ['PROJ', 'ENG', 'OPS', 'SEC', 'INFRA', 'DATA', 'FE', 'BE', 'MOB', 'SRE'];

const ISSUE_TYPES = ['Bug', 'Task', 'Story', 'Epic', 'Sub-task', 'Improvement'];

const ISSUE_STATUSES = ['To Do', 'In Progress', 'In Review', 'Done', 'Closed', 'Blocked'];

const JIRA_GROUPS = [
  'jira-software-users',
  'jira-administrators',
  'jira-core-users',
  'confluence-users',
  'developers',
  'project-managers',
];

export class AtlassianJiraIntegration extends BaseIntegration {
  readonly packageName = 'atlassian_jira';
  readonly displayName = 'Atlassian Jira';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'audit', index: 'logs-atlassian_jira.audit-default' },
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
    centralAgent: AgentData,
  ): IntegrationDocument {
    const action = faker.helpers.weightedArrayElement(
      AUDIT_ACTIONS.map((a) => ({ value: a, weight: a.weight })),
    );
    const sourceIp = faker.internet.ipv4();
    const timestamp = this.getRandomTimestamp(72);
    const projectKey = faker.helpers.arrayElement(PROJECT_KEYS);

    const affectedObjects = this.buildAffectedObjects(action.value, projectKey);

    const rawEvent: Record<string, unknown> = {
      affectedObjects,
      auditType: {
        action: action.value,
        actionI18nKey: action.actionI18nKey,
        area: action.area,
        category: action.category,
        categoryI18nKey: action.categoryI18nKey,
        level: action.level,
      },
      author: {
        id: faker.string.numeric(4),
        name: employee.userName,
        type: 'user',
      },
      changedValues: this.buildChangedValues(action.value),
      extraAttributes: [],
      method: 'Browser',
      source: sourceIp,
      system: `http://jira.${org.domain}:8088`,
      timestamp: timestamp,
    };

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      message: JSON.stringify(rawEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'atlassian_jira.audit' },
    } as IntegrationDocument;
  }

  private buildAffectedObjects(action: string, projectKey: string): Array<Record<string, string>> {
    if (action.includes('Issue')) {
      const issueNum = faker.number.int({ min: 1, max: 9999 });
      return [{ id: String(issueNum), name: `${projectKey}-${issueNum}`, type: 'ISSUE' }];
    }
    if (action.includes('Group') || action.includes('group')) {
      return [{ name: faker.helpers.arrayElement(JIRA_GROUPS), type: 'GROUP' }];
    }
    if (action.includes('Project')) {
      return [{ id: faker.string.numeric(5), name: projectKey, type: 'PROJECT' }];
    }
    if (action.includes('Permission') || action.includes('permission')) {
      return [
        { id: faker.string.numeric(5), name: `${projectKey} Permission Scheme`, type: 'SCHEME' },
      ];
    }
    if (action.includes('Workflow')) {
      return [{ id: faker.string.numeric(5), name: `${projectKey} Workflow`, type: 'WORKFLOW' }];
    }
    if (action.includes('Filter')) {
      return [{ id: faker.string.numeric(5), name: `My ${projectKey} Filter`, type: 'FILTER' }];
    }
    return [];
  }

  private buildChangedValues(action: string): Array<Record<string, string>> {
    if (action === 'Issue transitioned') {
      const fromStatus = faker.helpers.arrayElement(ISSUE_STATUSES);
      const toStatus = faker.helpers.arrayElement(ISSUE_STATUSES.filter((s) => s !== fromStatus));
      return [{ fieldName: 'status', from: fromStatus, to: toStatus }];
    }
    if (action === 'Issue updated') {
      const issueType = faker.helpers.arrayElement(ISSUE_TYPES);
      return [
        {
          fieldName: 'type',
          from: issueType,
          to: faker.helpers.arrayElement(ISSUE_TYPES.filter((t) => t !== issueType)),
        },
      ];
    }
    return [];
  }
}
