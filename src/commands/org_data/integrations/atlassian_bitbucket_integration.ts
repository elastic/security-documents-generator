/**
 * Atlassian Bitbucket Integration
 * Generates audit log documents for Bitbucket Server/Cloud
 * Based on the Elastic atlassian_bitbucket integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
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
    value: 'Repository created',
    actionI18nKey: 'bitbucket.service.repository.audit.action.repositorycreated',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Repositories',
    categoryI18nKey: 'bitbucket.service.audit.category.repositories',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 10,
  },
  {
    value: 'Repository forked',
    actionI18nKey: 'bitbucket.service.repository.audit.action.repositoryforked',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Repositories',
    categoryI18nKey: 'bitbucket.service.audit.category.repositories',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 5,
  },
  {
    value: 'Repository deleted',
    actionI18nKey: 'bitbucket.service.repository.audit.action.repositorydeleted',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Repositories',
    categoryI18nKey: 'bitbucket.service.audit.category.repositories',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['deletion'],
    weight: 2,
  },
  {
    value: 'Project created',
    actionI18nKey: 'bitbucket.service.project.audit.action.projectcreated',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Projects',
    categoryI18nKey: 'bitbucket.service.audit.category.projects',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 5,
  },
  {
    value: 'Project deletion requested',
    actionI18nKey: 'bitbucket.service.project.audit.action.projectdeletionrequested',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Projects',
    categoryI18nKey: 'bitbucket.service.audit.category.projects',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['deletion'],
    weight: 1,
  },
  {
    value: 'Permission granted',
    actionI18nKey: 'bitbucket.service.permission.audit.action.permissiongranted',
    area: 'PERMISSIONS',
    category: 'Permissions',
    categoryI18nKey: 'bitbucket.service.audit.category.permissions',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 8,
  },
  {
    value: 'Permission revoked',
    actionI18nKey: 'bitbucket.service.permission.audit.action.permissionrevoked',
    area: 'PERMISSIONS',
    category: 'Permissions',
    categoryI18nKey: 'bitbucket.service.audit.category.permissions',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 3,
  },
  {
    value: 'Pull request opened',
    actionI18nKey: 'bitbucket.service.pullrequest.audit.action.pullrequestopened',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Repositories',
    categoryI18nKey: 'bitbucket.service.audit.category.repositories',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 20,
  },
  {
    value: 'Pull request merged',
    actionI18nKey: 'bitbucket.service.pullrequest.audit.action.pullrequestmerged',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Repositories',
    categoryI18nKey: 'bitbucket.service.audit.category.repositories',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['change'],
    weight: 15,
  },
  {
    value: 'Pull request declined',
    actionI18nKey: 'bitbucket.service.pullrequest.audit.action.pullrequestdeclined',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Repositories',
    categoryI18nKey: 'bitbucket.service.audit.category.repositories',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['change'],
    weight: 5,
  },
  {
    value: 'Branch created',
    actionI18nKey: 'bitbucket.service.ref.audit.action.branchcreated',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Repositories',
    categoryI18nKey: 'bitbucket.service.audit.category.repositories',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 12,
  },
  {
    value: 'Branch deleted',
    actionI18nKey: 'bitbucket.service.ref.audit.action.branchdeleted',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Repositories',
    categoryI18nKey: 'bitbucket.service.audit.category.repositories',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['deletion'],
    weight: 6,
  },
  {
    value: 'User added to group',
    actionI18nKey: 'bitbucket.service.user.audit.action.useraddedtogroup',
    area: 'USER_MANAGEMENT',
    category: 'Users and groups',
    categoryI18nKey: 'bitbucket.service.audit.category.usersandgroups',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 4,
  },
  {
    value: 'SSH key added',
    actionI18nKey: 'bitbucket.service.ssh.audit.action.sshkeyadded',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'SSH',
    categoryI18nKey: 'bitbucket.service.audit.category.ssh',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 3,
  },
];

const REPO_NAMES = [
  'backend-api',
  'frontend-app',
  'infrastructure',
  'data-pipeline',
  'mobile-app',
  'shared-libs',
  'docs',
  'ci-cd-configs',
  'monitoring',
  'auth-service',
];

const PROJECT_KEYS = [
  'BACK',
  'FRONT',
  'INFRA',
  'DATA',
  'MOB',
  'LIBS',
  'DOCS',
  'CICD',
  'MON',
  'AUTH',
];

const BRANCH_NAMES = [
  'main',
  'develop',
  'feature/user-auth',
  'feature/api-v2',
  'bugfix/login-issue',
  'release/1.0',
  'hotfix/security-patch',
];

const PERMISSION_NAMES = [
  'REPO_READ',
  'REPO_WRITE',
  'REPO_ADMIN',
  'PROJECT_READ',
  'PROJECT_WRITE',
  'PROJECT_ADMIN',
];

export class AtlassianBitbucketIntegration extends BaseIntegration {
  readonly packageName = 'atlassian_bitbucket';
  readonly displayName = 'Atlassian Bitbucket';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'audit', index: 'logs-atlassian_bitbucket.audit-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 4 });
      for (let i = 0; i < eventCount; i++) {
        documents.push(this.createAuditDocument(employee, org));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  private createAuditDocument(employee: Employee, org: Organization): IntegrationDocument {
    const action = faker.helpers.weightedArrayElement(
      AUDIT_ACTIONS.map((a) => ({ value: a, weight: a.weight }))
    );
    const sourceIp = faker.internet.ipv4();
    const timestamp = this.getRandomTimestamp(72);
    const repoName = faker.helpers.arrayElement(REPO_NAMES);
    const projectKey = faker.helpers.arrayElement(PROJECT_KEYS);

    const affectedObjects = this.buildAffectedObjects(action.value, repoName, projectKey);

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
        type: 'NORMAL',
      },
      changedValues: [],
      extraAttributes: this.buildExtraAttributes(action.value, repoName),
      method: faker.helpers.arrayElement(['Browser', 'HTTP']),
      node: `bitbucket-${faker.string.alphanumeric(6)}`,
      source: sourceIp,
      system: `http://bitbucket.${org.domain}:7990`,
      timestamp: timestamp,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'atlassian_bitbucket.audit' },
    } as IntegrationDocument;
  }

  private buildAffectedObjects(
    action: string,
    repoName: string,
    projectKey: string
  ): Array<Record<string, string>> {
    if (
      action.includes('Repository') ||
      action.includes('Pull request') ||
      action.includes('Branch')
    ) {
      return [{ id: faker.string.numeric(3), name: repoName, type: 'REPOSITORY' }];
    }
    if (action.includes('Project')) {
      return [{ id: faker.string.numeric(3), name: projectKey, type: 'PROJECT' }];
    }
    if (action.includes('Permission')) {
      return [
        { id: faker.string.numeric(3), name: repoName, type: 'REPOSITORY' },
        { name: faker.helpers.arrayElement(PERMISSION_NAMES), type: 'PERMISSION' },
      ];
    }
    if (action.includes('SSH key')) {
      return [
        {
          id: faker.string.numeric(3),
          name: `ssh-rsa ...${faker.string.alphanumeric(8)}`,
          type: 'SSH_KEY',
        },
      ];
    }
    return [{ id: faker.string.numeric(3), name: repoName, type: 'REPOSITORY' }];
  }

  private buildExtraAttributes(action: string, repoName: string): Array<Record<string, string>> {
    if (action.includes('Pull request')) {
      return [
        {
          name: 'source_branch',
          nameI18nKey: 'bitbucket.audit.attribute.source_branch',
          value: faker.helpers.arrayElement(BRANCH_NAMES.filter((b) => b !== 'main')),
        },
        {
          name: 'target_branch',
          nameI18nKey: 'bitbucket.audit.attribute.target_branch',
          value: 'main',
        },
      ];
    }
    if (action.includes('Branch')) {
      return [
        {
          name: 'branch',
          nameI18nKey: 'bitbucket.audit.attribute.branch',
          value: faker.helpers.arrayElement(BRANCH_NAMES),
        },
      ];
    }
    return [
      { name: 'target', nameI18nKey: 'bitbucket.audit.attribute.legacy.target', value: repoName },
    ];
  }
}
