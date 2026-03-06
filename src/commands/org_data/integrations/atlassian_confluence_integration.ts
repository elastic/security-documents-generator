/**
 * Atlassian Confluence Integration
 * Generates audit log documents for Confluence Server/Cloud
 * Based on the Elastic atlassian_confluence integration package
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
    value: 'Page created',
    actionI18nKey: 'atlassian.confluence.audit.action.pagecreated',
    area: 'CONTENT',
    category: 'Content',
    categoryI18nKey: 'atlassian.confluence.audit.category.content',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 20,
  },
  {
    value: 'Page updated',
    actionI18nKey: 'atlassian.confluence.audit.action.pageupdated',
    area: 'CONTENT',
    category: 'Content',
    categoryI18nKey: 'atlassian.confluence.audit.category.content',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['change'],
    weight: 25,
  },
  {
    value: 'Page viewed',
    actionI18nKey: 'atlassian.confluence.audit.action.pageviewed',
    area: 'CONTENT',
    category: 'Content',
    categoryI18nKey: 'atlassian.confluence.audit.category.content',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['access'],
    weight: 30,
  },
  {
    value: 'Page deleted',
    actionI18nKey: 'atlassian.confluence.audit.action.pagedeleted',
    area: 'CONTENT',
    category: 'Content',
    categoryI18nKey: 'atlassian.confluence.audit.category.content',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['deletion'],
    weight: 3,
  },
  {
    value: 'Space created',
    actionI18nKey: 'atlassian.confluence.audit.action.spacecreated',
    area: 'LOCAL_CONFIG_AND_ADMINISTRATION',
    category: 'Spaces',
    categoryI18nKey: 'atlassian.confluence.audit.category.spaces',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 3,
  },
  {
    value: 'Space permission granted',
    actionI18nKey: 'atlassian.confluence.audit.action.spacepermissiongranted',
    area: 'PERMISSIONS',
    category: 'Permissions',
    categoryI18nKey: 'atlassian.confluence.audit.category.permissions',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 5,
  },
  {
    value: 'Attachment added',
    actionI18nKey: 'atlassian.confluence.audit.action.attachmentadded',
    area: 'CONTENT',
    category: 'Content',
    categoryI18nKey: 'atlassian.confluence.audit.category.content',
    level: 'BASE',
    eventCategory: ['file'],
    eventType: ['creation'],
    weight: 8,
  },
  {
    value: 'Comment added',
    actionI18nKey: 'atlassian.confluence.audit.action.commentadded',
    area: 'CONTENT',
    category: 'Content',
    categoryI18nKey: 'atlassian.confluence.audit.category.content',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 10,
  },
  {
    value: 'Audit Log search performed',
    actionI18nKey: 'atlassian.audit.event.action.audit.search',
    area: 'AUDIT_LOG',
    category: 'Auditing',
    categoryI18nKey: 'atlassian.audit.event.category.audit',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['info'],
    weight: 2,
  },
  {
    value: 'Global permission granted',
    actionI18nKey: 'atlassian.confluence.audit.action.globalpermissiongranted',
    area: 'PERMISSIONS',
    category: 'Permissions',
    categoryI18nKey: 'atlassian.confluence.audit.category.permissions',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 2,
  },
  {
    value: 'User added to group',
    actionI18nKey: 'atlassian.confluence.audit.action.useraddedtogroup',
    area: 'USER_MANAGEMENT',
    category: 'Users and groups',
    categoryI18nKey: 'atlassian.confluence.audit.category.usersandgroups',
    level: 'BASE',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 4,
  },
  {
    value: 'Blueprint created',
    actionI18nKey: 'atlassian.confluence.audit.action.blueprintcreated',
    area: 'CONTENT',
    category: 'Content',
    categoryI18nKey: 'atlassian.confluence.audit.category.content',
    level: 'BASE',
    eventCategory: ['configuration'],
    eventType: ['creation'],
    weight: 2,
  },
];

const SPACE_NAMES = [
  'Engineering',
  'Product',
  'Marketing',
  'Sales',
  'Operations',
  'Security',
  'Design',
  'HR',
  'Architecture',
  'DevOps',
];

const SPACE_KEYS = ['ENG', 'PROD', 'MKT', 'SALES', 'OPS', 'SEC', 'DES', 'HR', 'ARCH', 'DEVOPS'];

const PAGE_TITLES = [
  'Architecture Decision Record',
  'Sprint Retrospective',
  'Onboarding Guide',
  'API Documentation',
  'Incident Postmortem',
  'Security Policy',
  'Release Notes',
  'Meeting Notes',
  'Technical Design',
  'Runbook',
  'Team Goals Q1',
  'Product Roadmap',
];

export class AtlassianConfluenceIntegration extends BaseIntegration {
  readonly packageName = 'atlassian_confluence';
  readonly displayName = 'Atlassian Confluence';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'audit', index: 'logs-atlassian_confluence.audit-default' },
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
    const spaceIdx = faker.number.int({ min: 0, max: SPACE_NAMES.length - 1 });
    const spaceName = SPACE_NAMES[spaceIdx];
    const spaceKey = SPACE_KEYS[spaceIdx];
    const pageTitle = faker.helpers.arrayElement(PAGE_TITLES);

    const affectedObjects = this.buildAffectedObjects(action.value, spaceName, spaceKey, pageTitle);
    const extraAttributes = this.buildExtraAttributes(action.value);

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
        id: faker.string.hexadecimal({ length: 32, prefix: '' }),
        name: employee.userName,
        type: 'user',
      },
      changedValues: [],
      extraAttributes,
      method: 'Browser',
      source: sourceIp,
      system: `http://confluence.${org.domain}:8090`,
      timestamp: timestamp,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      event: {
        action: action.actionI18nKey,
        category: action.eventCategory,
        kind: 'event',
        type: action.eventType,
        dataset: 'atlassian_confluence.audit',
      },
      confluence: {
        audit: {
          type: {
            action: action.value,
            actionI18nKey: action.actionI18nKey,
            area: action.area,
            category: action.category,
            categoryI18nKey: action.categoryI18nKey,
            level: action.level,
          },
          method: 'Browser',
          affected_objects: affectedObjects,
          extra_attributes: extraAttributes,
          changed_values: [],
        },
      },
      user: {
        full_name: employee.userName,
        id: String(rawEvent.author && (rawEvent.author as Record<string, unknown>).id),
      },
      source: { ip: sourceIp, address: sourceIp },
      related: {
        hosts: [`confluence.${org.domain}`],
        ip: [sourceIp],
        user: [employee.userName],
      },
      service: { address: `http://confluence.${org.domain}:8090` },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'atlassian_confluence.audit' },
      tags: ['forwarded', 'confluence-audit', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private buildAffectedObjects(
    action: string,
    spaceName: string,
    spaceKey: string,
    pageTitle: string
  ): Array<Record<string, string>> {
    if (
      action.includes('Page') ||
      action.includes('Comment') ||
      action.includes('Attachment') ||
      action.includes('Blueprint')
    ) {
      return [
        { id: faker.string.numeric(6), name: pageTitle, type: 'PAGE' },
        { id: faker.string.numeric(4), name: `${spaceName} (${spaceKey})`, type: 'SPACE' },
      ];
    }
    if (action.includes('Space')) {
      return [{ id: faker.string.numeric(4), name: `${spaceName} (${spaceKey})`, type: 'SPACE' }];
    }
    if (action.includes('permission')) {
      return [{ id: faker.string.numeric(4), name: `${spaceName} (${spaceKey})`, type: 'SPACE' }];
    }
    return [];
  }

  private buildExtraAttributes(action: string): Array<Record<string, string>> {
    if (action === 'Audit Log search performed') {
      const resultCount = faker.number.int({ min: 5, max: 200 });
      return [
        { name: 'Query', nameI18nKey: 'atlassian.audit.event.attribute.query' },
        {
          name: 'Results returned',
          nameI18nKey: 'atlassian.audit.event.attribute.results',
          value: String(resultCount),
        },
      ];
    }
    return [];
  }
}
