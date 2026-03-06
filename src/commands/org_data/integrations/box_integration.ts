/**
 * Box Events Integration
 * Generates file sharing and security audit documents
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
        documents.push(this.createEventDocument(employee));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  private createEventDocument(employee: Employee): IntegrationDocument {
    const action = faker.helpers.weightedArrayElement(
      EVENT_ACTIONS.map((a) => ({ value: a, weight: a.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const clientIp = faker.internet.ipv4();
    const userId = faker.string.numeric(6);
    const isShieldAlert = action.value === 'SHIELD_ALERT';
    const isFailedLogin = action.value === 'FAILED_LOGIN';

    const fileName = `${faker.word.adjective()}-${faker.word.noun()}.${faker.helpers.arrayElement(FILE_EXTENSIONS)}`;
    const folderName = faker.helpers.arrayElement(FOLDER_NAMES);
    const fileId = faker.string.numeric(12);
    const folderId = faker.string.numeric(10);

    const doc: Record<string, unknown> = {
      '@timestamp': timestamp,
      box: {
        created_at: timestamp,
        created_by: {
          id: userId,
          name: `${employee.firstName} ${employee.lastName}`,
          type: 'user',
        },
        source: {
          id: fileId,
          name: fileName,
          type: action.value.includes('COLLABORATION') ? 'collaboration' : 'file',
          parent: {
            id: folderId,
            name: folderName,
            type: 'folder',
          },
          item_status: 'active',
          path_collection: {
            total_count: 2,
            entries: [
              { id: '0', name: 'All Files', type: 'folder' },
              { id: folderId, name: folderName, type: 'folder' },
            ],
          },
        },
        session: { id: faker.string.alphanumeric(24) },
        type: 'event',
      },
      client: { ip: clientIp },
      data_stream: {
        dataset: 'box_events.events',
        namespace: 'default',
        type: 'logs',
      },
      event: {
        action: action.value,
        dataset: 'box_events.events',
        id: faker.string.uuid(),
        kind: action.kind,
        category: action.categories,
        type: isFailedLogin ? ['start'] : ['access'],
        outcome: isFailedLogin ? 'failure' : 'success',
      },
      user: {
        effective: {
          email: employee.email,
          id: userId,
          name: `${employee.firstName} ${employee.lastName}`,
        },
        full_name: `${employee.firstName} ${employee.lastName}`,
      },
      related: {
        ip: [clientIp],
        user: [`${employee.firstName} ${employee.lastName}`, employee.email, userId],
      },
      tags: ['forwarded', 'box_events-events'],
    };

    if (isShieldAlert) {
      const ruleCategory = faker.helpers.arrayElement(SHIELD_RULE_CATEGORIES);
      const alertIps = [faker.internet.ipv4(), faker.internet.ipv4()];
      doc.box = {
        ...(doc.box as Record<string, unknown>),
        additional_details: {
          shield_alert: {
            alert_id: faker.number.int({ min: 100, max: 999 }),
            alert_summary: {
              anomaly_period: {
                date_range: {
                  start_date: this.getRandomTimestamp(168),
                  end_date: timestamp,
                },
                download_size: `${faker.number.int({ min: 1, max: 100 })} Mb`,
                downloaded_files_count: faker.number.int({ min: 1, max: 50 }),
              },
              description: `Significant increase in download content: ${ruleCategory}`,
              download_delta_percent: faker.number.int({ min: 100, max: 10000 }),
              download_delta_size: `${faker.number.int({ min: 1, max: 100 })} Mb`,
              download_ips: alertIps.map((ip) => ({ ip })),
            },
          },
        },
      };
      doc.event = {
        ...(doc.event as Record<string, unknown>),
        risk_score: faker.number.int({ min: 50, max: 99 }),
        type: ['indicator', 'access'],
      };
      doc.rule = {
        category: ruleCategory,
        id: String(faker.number.int({ min: 100, max: 999 })),
        name: `${ruleCategory} Rule`,
      };
      (doc.related as Record<string, unknown[]>).ip = [clientIp, ...alertIps];
    }

    return doc as IntegrationDocument;
  }
}
