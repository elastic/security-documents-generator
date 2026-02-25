/**
 * ServiceNow Integration
 * Generates ITSM incident and change request event documents
 * Based on the Elastic servicenow integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

/** ServiceNow incident categories */
const INCIDENT_CATEGORIES = ['software', 'hardware', 'network', 'database', 'inquiry', 'request'];

/** ServiceNow incident subcategories by category */
const INCIDENT_SUBCATEGORIES: Record<string, string[]> = {
  software: ['os', 'email', 'application', 'operating_system'],
  hardware: ['cpu', 'disk', 'memory', 'monitor', 'keyboard'],
  network: ['dns', 'dhcp', 'vpn', 'wireless', 'connectivity'],
  database: ['db2', 'oracle', 'sql_server', 'performance'],
  inquiry: ['general', 'pricing', 'availability', 'reset_password'],
  request: ['new_account', 'new_hardware', 'access_request', 'software_install'],
};

/** ServiceNow incident states */
const INCIDENT_STATES: Array<{ value: string; display: string; weight: number }> = [
  { value: '1', display: 'New', weight: 15 },
  { value: '2', display: 'In Progress', weight: 30 },
  { value: '3', display: 'On Hold', weight: 10 },
  { value: '6', display: 'Resolved', weight: 35 },
  { value: '7', display: 'Closed', weight: 10 },
];

/** Short description templates */
const SHORT_DESCRIPTIONS = [
  'Unable to access email',
  'VPN connection drops intermittently',
  'Laptop running slow after update',
  'Cannot connect to wireless network',
  'Application crashes on startup',
  'Password reset required',
  'Request for new software license',
  'Printer not responding',
  'MFA token not working',
  'Permission denied on shared drive',
  'Cannot access internal wiki',
  'Monitor flickering',
  'Slack notifications not working',
  'Need access to production database',
  'SSL certificate expiring soon',
  'Disk space running low on server',
  'Two-factor authentication setup',
  'New employee onboarding - IT setup',
  'Software update causing errors',
  'Network latency issues in building',
];

/** Assignment groups */
const ASSIGNMENT_GROUPS = [
  'IT Service Desk',
  'Network Operations',
  'Database Administration',
  'Application Support',
  'Security Operations',
  'Desktop Support',
  'Cloud Infrastructure',
];

/**
 * ServiceNow Integration
 * Generates IT incident and change request documents
 */
export class ServiceNowIntegration extends BaseIntegration {
  readonly packageName = 'servicenow';
  readonly displayName = 'ServiceNow';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'event',
      index: 'logs-servicenow.event-default',
    },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    // Generate incidents -- roughly 1 per 5 employees
    const incidentCount = Math.max(
      5,
      Math.floor(org.employees.length / 5) +
        faker.number.int({ min: 0, max: Math.ceil(org.employees.length / 10) })
    );

    const opsEmployees = org.employees.filter((e) => e.department === 'Operations');

    for (let i = 0; i < incidentCount; i++) {
      const opener = faker.helpers.arrayElement(org.employees);
      const assignee =
        opsEmployees.length > 0
          ? faker.helpers.arrayElement(opsEmployees)
          : faker.helpers.arrayElement(org.employees);

      documents.push(this.createIncidentDocument(opener, assignee, org, i + 1));
    }

    // Generate a few change requests from Operations staff
    const changeCount = Math.max(2, Math.floor(org.employees.length / 20));
    for (let i = 0; i < changeCount; i++) {
      const requester =
        opsEmployees.length > 0
          ? faker.helpers.arrayElement(opsEmployees)
          : faker.helpers.arrayElement(org.employees);
      documents.push(this.createChangeRequestDocument(requester, org, incidentCount + i + 1));
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  /**
   * Create a ServiceNow incident document
   */
  private createIncidentDocument(
    opener: Employee,
    assignee: Employee,
    org: Organization,
    seq: number
  ): IntegrationDocument {
    const category = faker.helpers.arrayElement(INCIDENT_CATEGORIES);
    const subcategory = faker.helpers.arrayElement(INCIDENT_SUBCATEGORIES[category]);
    const state = faker.helpers.weightedArrayElement(
      INCIDENT_STATES.map((s) => ({ value: s, weight: s.weight }))
    );
    const priority = faker.helpers.weightedArrayElement([
      { value: '1', weight: 5 },
      { value: '2', weight: 20 },
      { value: '3', weight: 50 },
      { value: '4', weight: 25 },
    ]);
    const impact = faker.helpers.weightedArrayElement([
      { value: '1', weight: 10 },
      { value: '2', weight: 40 },
      { value: '3', weight: 50 },
    ]);
    const urgency = faker.helpers.weightedArrayElement([
      { value: '1', weight: 10 },
      { value: '2', weight: 40 },
      { value: '3', weight: 50 },
    ]);

    const sysId = faker.string.uuid().replace(/-/g, '');
    const number = `INC${String(seq).padStart(7, '0')}`;
    const openedAt = faker.date.recent({ days: 14 }).toISOString();
    const assignmentGroup = faker.helpers.arrayElement(ASSIGNMENT_GROUPS);
    const shortDescription = faker.helpers.arrayElement(SHORT_DESCRIPTIONS);

    return {
      '@timestamp': openedAt,
      event: {
        dataset: 'servicenow.event',
        kind: 'event',
        category: ['configuration'],
        type: ['info'],
      },
      servicenow: {
        event: {
          table_name: 'incident',
          sys_id: { value: sysId },
          number: { value: number, display_value: number },
          short_description: { value: shortDescription, display_value: shortDescription },
          description: {
            value: `${shortDescription} - reported by ${opener.firstName} ${opener.lastName}`,
            display_value: `${shortDescription} - reported by ${opener.firstName} ${opener.lastName}`,
          },
          category: { value: category, display_value: category },
          subcategory: { value: subcategory, display_value: subcategory },
          state: { value: state.value, display_value: state.display },
          priority: {
            value: priority,
            display_value: ['Critical', 'High', 'Moderate', 'Low'][parseInt(priority) - 1],
          },
          impact: {
            value: impact,
            display_value: ['High', 'Medium', 'Low'][parseInt(impact) - 1],
          },
          urgency: {
            value: urgency,
            display_value: ['High', 'Medium', 'Low'][parseInt(urgency) - 1],
          },
          opened_by: {
            value: faker.string.uuid().replace(/-/g, ''),
            display_value: `${opener.firstName} ${opener.lastName}`,
          },
          opened_at: { value: openedAt, display_value: openedAt },
          assigned_to: {
            value: faker.string.uuid().replace(/-/g, ''),
            display_value: `${assignee.firstName} ${assignee.lastName}`,
          },
          assignment_group: {
            value: faker.string.uuid().replace(/-/g, ''),
            display_value: assignmentGroup,
          },
          caller_id: {
            value: faker.string.uuid().replace(/-/g, ''),
            display_value: `${opener.firstName} ${opener.lastName}`,
          },
          company: { value: faker.string.uuid().replace(/-/g, ''), display_value: org.name },
          contact_type: {
            value: faker.helpers.arrayElement(['email', 'phone', 'self-service', 'walk-in']),
          },
          sys_created_on: { value: openedAt, display_value: openedAt },
          sys_updated_on: {
            value: this.getRandomTimestamp(48),
            display_value: this.getRandomTimestamp(48),
          },
          active: { value: state.value !== '7', display_value: state.value !== '7' },
        },
      },
      user: {
        name: `${opener.firstName} ${opener.lastName}`,
        email: opener.email,
      },
      related: {
        user: [
          `${opener.firstName} ${opener.lastName}`,
          `${assignee.firstName} ${assignee.lastName}`,
          opener.email,
        ],
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'servicenow.event',
      },
      tags: ['forwarded', 'servicenow-event', 'incident'],
    } as IntegrationDocument;
  }

  /**
   * Create a ServiceNow change request document
   */
  private createChangeRequestDocument(
    requester: Employee,
    org: Organization,
    seq: number
  ): IntegrationDocument {
    const sysId = faker.string.uuid().replace(/-/g, '');
    const number = `CHG${String(seq).padStart(7, '0')}`;
    const state = faker.helpers.arrayElement([
      { value: '-5', display: 'New' },
      { value: '-4', display: 'Assess' },
      { value: '-3', display: 'Authorize' },
      { value: '-2', display: 'Scheduled' },
      { value: '-1', display: 'Implement' },
      { value: '0', display: 'Review' },
      { value: '3', display: 'Closed' },
    ]);

    const descriptions = [
      'Upgrade production database to latest version',
      'Deploy new firewall rules for VPN segment',
      'Migrate application servers to new cluster',
      'Update SSL certificates for public endpoints',
      'Implement new backup strategy for critical systems',
      'Patch operating systems on all servers',
      'Deploy monitoring agent update across fleet',
      'Reconfigure load balancer for new microservice',
    ];

    const shortDescription = faker.helpers.arrayElement(descriptions);
    const openedAt = faker.date.recent({ days: 30 }).toISOString();

    return {
      '@timestamp': openedAt,
      event: {
        dataset: 'servicenow.event',
        kind: 'event',
        category: ['configuration'],
        type: ['change'],
      },
      servicenow: {
        event: {
          table_name: 'change_request',
          sys_id: { value: sysId },
          number: { value: number, display_value: number },
          short_description: { value: shortDescription, display_value: shortDescription },
          state: { value: state.value, display_value: state.display },
          priority: { value: '3', display_value: 'Moderate' },
          risk: { value: '3', display_value: 'Moderate' },
          impact: { value: '2', display_value: 'Medium' },
          requested_by: {
            value: faker.string.uuid().replace(/-/g, ''),
            display_value: `${requester.firstName} ${requester.lastName}`,
          },
          assignment_group: {
            value: faker.string.uuid().replace(/-/g, ''),
            display_value: faker.helpers.arrayElement(ASSIGNMENT_GROUPS),
          },
          company: { value: faker.string.uuid().replace(/-/g, ''), display_value: org.name },
          opened_at: { value: openedAt, display_value: openedAt },
          sys_created_on: { value: openedAt, display_value: openedAt },
          sys_updated_on: {
            value: this.getRandomTimestamp(72),
            display_value: this.getRandomTimestamp(72),
          },
        },
      },
      user: {
        name: `${requester.firstName} ${requester.lastName}`,
        email: requester.email,
      },
      related: {
        user: [`${requester.firstName} ${requester.lastName}`, requester.email],
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'servicenow.event',
      },
      tags: ['forwarded', 'servicenow-event', 'change_request'],
    } as IntegrationDocument;
  }
}
