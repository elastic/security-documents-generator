/**
 * Box Events Integration
 * Generates raw Box API format documents for the ingest pipeline to parse.
 * Based on the Elastic box_events integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const EVENT_ACTIONS: Array<{ value: string; weight: number; kind: string; categories: string[] }> =
  [
    { value: 'LOGIN', weight: 20, kind: 'event', categories: ['authentication'] },
    { value: 'FAILED_LOGIN', weight: 5, kind: 'event', categories: ['authentication'] },
    { value: 'UPLOAD', weight: 15, kind: 'event', categories: ['file'] },
    { value: 'DOWNLOAD', weight: 15, kind: 'event', categories: ['file'] },
    { value: 'PREVIEW', weight: 10, kind: 'event', categories: ['file'] },
    { value: 'DELETE', weight: 5, kind: 'event', categories: ['file'] },
    { value: 'COPY', weight: 5, kind: 'event', categories: ['file'] },
    { value: 'SHARE', weight: 8, kind: 'event', categories: ['file'] },
    { value: 'COLLABORATION_INVITE', weight: 5, kind: 'event', categories: ['iam'] },
    { value: 'COLLABORATION_ACCEPT', weight: 3, kind: 'event', categories: ['iam'] },
    { value: 'COLLABORATION_REMOVE', weight: 2, kind: 'event', categories: ['iam'] },
    {
      value: 'ADD_LOGIN_ACTIVITY_DEVICE',
      weight: 2,
      kind: 'event',
      categories: ['authentication'],
    },
    { value: 'ADMIN_LOGIN', weight: 2, kind: 'event', categories: ['authentication'] },
    {
      value: 'SHIELD_ALERT',
      weight: 3,
      kind: 'alert',
      categories: ['threat', 'file'],
    },
  ];

const FILE_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'zip', 'csv', 'txt', 'json'];

const FOLDER_NAMES = [
  'Documents',
  'Shared',
  'Projects',
  'Reports',
  'Marketing',
  'Engineering',
  'Legal',
  'Finance',
  'HR',
  'Product',
];

const SHIELD_RULE_CATEGORIES = [
  'Anomalous Download',
  'Suspicious Locations',
  'Suspicious Sessions',
  'Malicious Content',
];

/** Raw Box API event format - matches what the ingest pipeline expects in message */
interface RawBoxEvent {
  event_id: string;
  event_type: string;
  created_at: string;
  recorded_at: string;
  created_by: {
    id: string;
    name: string;
    login: string;
    type: string;
  };
  source: RawBoxSource | null;
  session_id: string | null;
  type: 'event';
  ip_address?: string;
  accessible_by?: RawBoxAccessibleBy;
  action_by?: unknown;
  additional_details?: RawBoxAdditionalDetails;
}

interface RawBoxSource {
  id?: string;
  name?: string;
  type?: 'file' | 'folder' | 'collaboration';
  parent?: { id: string; name: string; type: string };
  item_status?: string;
  path_collection?: { total_count: number; entries: Array<{ id: string; name: string; type: string }> };
  created_at?: string;
  content_created_at?: string;
  content_modified_at?: string;
  modified_at?: string;
  size?: number;
  file_version?: { id: string; sha1: string; type: string };
  // Collaboration source format
  folder_id?: string;
  folder_name?: string;
  user_id?: string;
  user_name?: string;
  owned_by?: { id: string; login: string; name: string; type: string };
}

interface RawBoxAccessibleBy {
  id: string;
  login: string;
  name: string;
  type: string;
}

interface RawBoxAdditionalDetails {
  shield_alert?: RawBoxShieldAlert;
  collab_id?: string;
  role?: string;
  is_performed_by_admin?: boolean;
}

interface RawBoxShieldAlert {
  alert_id: number;
  rule_category: string;
  rule_id: number;
  rule_name: string;
  risk_score: number;
  alert_summary: {
    description: string;
    anomaly_period?: {
      date_range: { start_date: string; end_date: string };
      download_size: string;
      downloaded_files_count: number;
    };
    download_delta_percent?: number;
    download_delta_size?: string;
    historical_period?: {
      date_range: { start_date: string; end_date: string };
      download_size: string;
      downloaded_files_count: number;
    };
    download_ips?: Array<{ ip: string }>;
  };
  user?: { id: number; name: string; email: string };
}

export class BoxIntegration extends BaseIntegration {
  readonly packageName = 'box_events';
  readonly displayName = 'Box Events';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'events', index: 'logs-box_events.events-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < eventCount; i++) {
        documents.push(this.createEventDocument(org, employee));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  private createEventDocument(org: Organization, employee: Employee): IntegrationDocument {
    const action = faker.helpers.weightedArrayElement(
      EVENT_ACTIONS.map((a) => ({ value: a, weight: a.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const clientIp = faker.internet.ipv4();
    const isShieldAlert = action.value === 'SHIELD_ALERT';
    const isCollaboration = action.value.startsWith('COLLABORATION');

    const fileName = `${faker.word.adjective()}-${faker.word.noun()}.${faker.helpers.arrayElement(FILE_EXTENSIONS)}`;
    const folderName = faker.helpers.arrayElement(FOLDER_NAMES);
    const fileId = faker.string.numeric(12);
    const folderId = faker.string.numeric(10);

    // Build raw Box API event - pipeline will parse message and derive ECS from this
    const rawBoxEvent: RawBoxEvent = {
      event_id: faker.string.uuid(),
      event_type: action.value,
      created_at: timestamp,
      recorded_at: timestamp,
      created_by: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        login: employee.email,
        type: 'user',
      },
      source: null,
      session_id: isCollaboration ? null : faker.string.alphanumeric(16),
      type: 'event',
    };

    // ip_address - pipeline maps to client.ip
    if (clientIp) {
      rawBoxEvent.ip_address = clientIp;
    }

    // Source object for file/folder events (pipeline expects source for file.*, uses recorded_at for @timestamp)
    if (!isShieldAlert) {
      if (isCollaboration) {
        const targetEmployee =
          org.employees.length > 1
            ? faker.helpers.arrayElement(org.employees.filter((e) => e.id !== employee.id))
            : employee;
        rawBoxEvent.source = {
          folder_id: folderId,
          folder_name: folderName,
          user_id: targetEmployee.id,
          user_name: `${targetEmployee.firstName} ${targetEmployee.lastName}`,
          parent: { id: faker.string.numeric(10), name: `Parent of ${folderName}`, type: 'folder' },
          owned_by: {
            id: employee.id,
            login: employee.email,
            name: `${employee.firstName} ${employee.lastName}`,
            type: 'user',
          },
        };
      } else {
        rawBoxEvent.source = {
          id: fileId,
          name: fileName,
          type: 'file',
          parent: { id: folderId, name: folderName, type: 'folder' },
          item_status: 'active',
          path_collection: {
            total_count: 2,
            entries: [
              { id: '0', name: 'All Files', type: 'folder' },
              { id: folderId, name: folderName, type: 'folder' },
            ],
          },
          created_at: timestamp,
          modified_at: timestamp,
        };
      }
    }

    // accessible_by for collaboration events
    if (isCollaboration && org.employees.length > 1) {
      const otherEmployee = faker.helpers.arrayElement(
        org.employees.filter((e) => e.id !== employee.id)
      );
      rawBoxEvent.accessible_by = {
        id: otherEmployee.id,
        login: otherEmployee.email,
        name: `${otherEmployee.firstName} ${otherEmployee.lastName}`,
        type: 'user',
      };
    } else if (isCollaboration && org.employees.length === 1) {
      // Single employee org: use self as accessible_by (invite to self)
      rawBoxEvent.accessible_by = {
        id: employee.id,
        login: employee.email,
        name: `${employee.firstName} ${employee.lastName}`,
        type: 'user',
      };
    }

    // additional_details for collaboration events
    if (isCollaboration) {
      rawBoxEvent.additional_details = {
        collab_id: faker.string.numeric(10),
        role: faker.helpers.arrayElement(['Editor', 'Viewer', 'Previewer']),
        is_performed_by_admin: false,
      };
    }

    // additional_details.shield_alert for SHIELD_ALERT
    if (isShieldAlert) {
      const ruleCategory = faker.helpers.arrayElement(SHIELD_RULE_CATEGORIES);
      const alertIps = [faker.internet.ipv4(), faker.internet.ipv4()];
      const startDate = this.getRandomTimestamp(168);
      rawBoxEvent.additional_details = {
        shield_alert: {
          alert_id: faker.number.int({ min: 100, max: 999 }),
          rule_category: ruleCategory,
          rule_id: faker.number.int({ min: 100, max: 999 }),
          rule_name: `${ruleCategory} Rule`,
          risk_score: faker.number.int({ min: 50, max: 99 }),
          user: {
            id: parseInt(employee.employeeNumber, 10) || faker.number.int({ min: 1000, max: 99999 }),
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
          },
          alert_summary: {
            description: `Significant increase in download content: ${ruleCategory}`,
            anomaly_period: {
              date_range: {
                start_date: startDate,
                end_date: timestamp,
              },
              download_size: `${faker.number.int({ min: 1, max: 100 })} Mb`,
              downloaded_files_count: faker.number.int({ min: 1, max: 50 }),
            },
            download_delta_percent: faker.number.int({ min: 100, max: 10000 }),
            download_delta_size: `${faker.number.int({ min: 1, max: 100 })} Mb`,
            historical_period: {
              date_range: {
                start_date: this.getRandomTimestamp(336),
                end_date: startDate,
              },
              download_size: '0 Mb',
              downloaded_files_count: 1,
            },
            download_ips: alertIps.map((ip) => ({ ip })),
          },
        },
      };
    }

    // Output: raw format with message = JSON.stringify(rawBoxEvent)
    const doc: IntegrationDocument = {
      '@timestamp': timestamp,
      message: JSON.stringify(rawBoxEvent),
      data_stream: {
        dataset: 'box_events.events',
        namespace: 'default',
        type: 'logs',
      },
    };

    return doc;
  }
}
