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
const _ASSIGNMENT_GROUPS = [
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
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    // Generate incidents -- roughly 1 per 5 employees
    const incidentCount = Math.max(
      5,
      Math.floor(org.employees.length / 5) +
        faker.number.int({ min: 0, max: Math.ceil(org.employees.length / 10) }),
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
   * Create a raw ServiceNow incident document (pre-pipeline format).
   * Pipeline expects: message (raw JSON), _conf, @timestamp, data_stream.
   */
  private createIncidentDocument(
    opener: Employee,
    assignee: Employee,
    org: Organization,
    seq: number,
  ): IntegrationDocument {
    const category = faker.helpers.arrayElement(INCIDENT_CATEGORIES);
    const subcategory = faker.helpers.arrayElement(INCIDENT_SUBCATEGORIES[category]);
    const state = faker.helpers.weightedArrayElement(
      INCIDENT_STATES.map((s) => ({ value: s, weight: s.weight })),
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
    const sysUpdatedOn = this.getRandomTimestamp(48);
    const shortDescription = faker.helpers.arrayElement(SHORT_DESCRIPTIONS);
    const description = `${shortDescription} - reported by ${opener.firstName} ${opener.lastName}`;

    // Raw ServiceNow API format (data_has_display_values: false → plain scalar values)
    const rawServiceNowEvent: Record<string, string | boolean> = {
      table_name: 'incident',
      sys_id: sysId,
      number,
      short_description: shortDescription,
      description,
      category,
      subcategory,
      state: state.value,
      priority,
      impact,
      urgency,
      opened_by: faker.string.uuid().replace(/-/g, ''),
      opened_at: openedAt,
      assigned_to: faker.string.uuid().replace(/-/g, ''),
      assignment_group: faker.string.uuid().replace(/-/g, ''),
      caller_id: faker.string.uuid().replace(/-/g, ''),
      company: faker.string.uuid().replace(/-/g, ''),
      contact_type: faker.helpers.arrayElement(['email', 'phone', 'self-service', 'walk-in']),
      sys_created_on: openedAt,
      sys_updated_on: sysUpdatedOn,
      active: state.value !== '7',
    };

    return {
      '@timestamp': openedAt,
      message: JSON.stringify(rawServiceNowEvent),
      _conf: {
        timestamp_field: 'sys_updated_on',
        data_has_display_values: 'false',
        table_name: 'incident',
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'servicenow.event',
      },
    } as IntegrationDocument;
  }

  /**
   * Create a raw ServiceNow change request document (pre-pipeline format).
   * Pipeline expects: message (raw JSON), _conf, @timestamp, data_stream.
   */
  private createChangeRequestDocument(
    requester: Employee,
    org: Organization,
    seq: number,
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
    const sysUpdatedOn = this.getRandomTimestamp(72);

    // Raw ServiceNow API format (data_has_display_values: false → plain scalar values)
    const rawServiceNowEvent: Record<string, string> = {
      table_name: 'change_request',
      sys_id: sysId,
      number,
      short_description: shortDescription,
      state: state.value,
      priority: '3',
      risk: '3',
      impact: '2',
      requested_by: faker.string.uuid().replace(/-/g, ''),
      assignment_group: faker.string.uuid().replace(/-/g, ''),
      company: faker.string.uuid().replace(/-/g, ''),
      opened_at: openedAt,
      sys_created_on: openedAt,
      sys_updated_on: sysUpdatedOn,
    };

    return {
      '@timestamp': openedAt,
      message: JSON.stringify(rawServiceNowEvent),
      _conf: {
        timestamp_field: 'sys_updated_on',
        data_has_display_values: 'false',
        table_name: 'change_request',
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'servicenow.event',
      },
    } as IntegrationDocument;
  }
}
