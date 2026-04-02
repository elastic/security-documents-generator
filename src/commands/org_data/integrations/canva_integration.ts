/**
 * Canva Integration
 * Generates design platform audit log documents
 * Based on the Elastic canva integration package
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
  type AgentData,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap } from '../types.ts';
import { faker } from '@faker-js/faker';

const AUDIT_ACTIONS: Array<{
  value: string;
  weight: number;
  categories: string[];
  type: string[];
}> = [
  {
    value: 'LOGIN',
    weight: 20,
    categories: ['authentication'],
    type: ['start'],
  },
  {
    value: 'LOGOUT',
    weight: 8,
    categories: ['authentication'],
    type: ['end'],
  },
  {
    value: 'CREATE_DESIGN',
    weight: 15,
    categories: ['file'],
    type: ['creation'],
  },
  {
    value: 'UPDATE_DESIGN',
    weight: 12,
    categories: ['file'],
    type: ['change'],
  },
  {
    value: 'SHARE_DESIGN',
    weight: 10,
    categories: ['file'],
    type: ['access'],
  },
  {
    value: 'EXPORT_DESIGN',
    weight: 8,
    categories: ['file'],
    type: ['access'],
  },
  {
    value: 'DELETE_DESIGN',
    weight: 3,
    categories: ['file'],
    type: ['deletion'],
  },
  {
    value: 'ADD_TEAM_MEMBER',
    weight: 4,
    categories: ['iam'],
    type: ['user'],
  },
  {
    value: 'REMOVE_TEAM_MEMBER',
    weight: 2,
    categories: ['iam'],
    type: ['user'],
  },
  {
    value: 'CHANGE_TEAM_ROLE',
    weight: 3,
    categories: ['iam'],
    type: ['change'],
  },
  {
    value: 'ADD_TEAM_TO_ORGANIZATION',
    weight: 2,
    categories: ['iam'],
    type: ['creation'],
  },
  {
    value: 'REMOVE_TEAM_FROM_ORGANIZATION',
    weight: 1,
    categories: ['iam'],
    type: ['deletion'],
  },
  {
    value: 'UPDATE_BRAND_TEMPLATE',
    weight: 3,
    categories: ['configuration'],
    type: ['change'],
  },
  {
    value: 'SSO_SETTING_CHANGED',
    weight: 1,
    categories: ['configuration'],
    type: ['change'],
  },
  {
    value: 'ENABLE_SCIM_PROVISIONING',
    weight: 1,
    categories: ['configuration'],
    type: ['change'],
  },
];

const ACTOR_TYPES = ['USER', 'ADMIN', 'SCIM', 'SYSTEM'];
const RESOURCE_TYPES = ['DESIGN', 'FOLDER', 'BRAND_TEMPLATE', 'TEAM', 'IMAGE'];
const TARGET_TYPES = ['USER', 'TEAM', 'DESIGN', 'FOLDER', 'ORGANIZATION'];
const DESIGN_TYPES = ['Presentation', 'Social Media', 'Document', 'Whiteboard', 'Video', 'Print'];
const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

const TEAM_NAMES = [
  'Marketing',
  'Design',
  'Product',
  'Brand',
  'Social Media',
  'Sales Enablement',
  'Communications',
  'Creative Studio',
];

export class CanvaIntegration extends BaseIntegration {
  readonly packageName = 'canva';
  readonly displayName = 'Canva';

  readonly dataStreams: DataStreamConfig[] = [{ name: 'audit', index: 'logs-canva.audit-default' }];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];
    const centralAgent = this.buildCentralAgent(org);

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 4 });
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
    const timestamp = this.getRandomTimestamp(72);
    const actorUserId = `UX${faker.string.alphanumeric(9)}`;
    const teamId = `BX${faker.string.alphanumeric(9)}`;
    const teamName = faker.helpers.arrayElement(TEAM_NAMES);
    const orgId = `OX${faker.string.alphanumeric(9)}`;
    const targetId = faker.string.alphanumeric(8);

    const targetEmployee = faker.helpers.arrayElement(org.employees);
    const isDesignAction = action.categories.includes('file');

    const rawAudit = {
      action: {
        type: action.value,
        ...(isDesignAction && {
          approval_status: faker.helpers.arrayElement(APPROVAL_STATUSES),
          create_type: faker.helpers.arrayElement(DESIGN_TYPES),
        }),
        display_name: isDesignAction
          ? `${faker.word.adjective()} ${faker.word.noun()} design`
          : teamName,
        email: targetEmployee.email,
        team: {
          id: teamId,
          display_name: teamName,
        },
      },
      actor: {
        type: faker.helpers.arrayElement(ACTOR_TYPES),
        user: {
          id: actorUserId,
          display_name: `${employee.firstName} ${employee.lastName}`,
          email: employee.email,
        },
        organization: { id: orgId },
        team: { id: teamId, display_name: teamName },
        details: { type: 'USER' },
      },
      target: {
        id: targetId,
        target_type: faker.helpers.arrayElement(TARGET_TYPES),
        resource_type: faker.helpers.arrayElement(RESOURCE_TYPES),
        owner: {
          type: 'USER',
          user: {
            id: actorUserId,
            display_name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
          },
        },
      },
      outcome: {
        result: 'success',
        details: {
          type: 'RESOURCE_CREATED',
          resource: {
            id: `DX${faker.string.alphanumeric(9)}`,
            type: 'DESIGN',
          },
        },
      },
      context: {
        request_id: faker.string.uuid(),
        device_id: faker.string.uuid(),
        ip_address: faker.internet.ipv4(),
      },
      timestamp,
      id: faker.string.uuid(),
    };

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      message: JSON.stringify(rawAudit),
      data_stream: {
        dataset: 'canva.audit',
        namespace: 'default',
        type: 'logs',
      },
    } as IntegrationDocument;
  }
}
