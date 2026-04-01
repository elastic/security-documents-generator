/**
 * Thycotic Secret Server Integration
 * Generates secret management audit log documents for Thycotic Secret Server
 * Based on the Elastic thycotic_ss integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const SECRET_EVENTS: Array<{
  action: string;
  code: string;
  category: string[];
  type: string[];
  provider: string;
  weight: number;
}> = [
  {
    action: 'password_displayed',
    code: '10039',
    category: ['iam'],
    type: ['info'],
    provider: 'secret',
    weight: 20,
  },
  {
    action: 'secret_viewed',
    code: '10001',
    category: ['iam'],
    type: ['access'],
    provider: 'secret',
    weight: 25,
  },
  {
    action: 'secret_created',
    code: '10002',
    category: ['iam'],
    type: ['creation'],
    provider: 'secret',
    weight: 8,
  },
  {
    action: 'secret_edited',
    code: '10003',
    category: ['iam'],
    type: ['change'],
    provider: 'secret',
    weight: 10,
  },
  {
    action: 'secret_checked_out',
    code: '10060',
    category: ['iam'],
    type: ['access'],
    provider: 'secret',
    weight: 12,
  },
  {
    action: 'secret_checked_in',
    code: '10061',
    category: ['iam'],
    type: ['info'],
    provider: 'secret',
    weight: 10,
  },
  {
    action: 'login_success',
    code: '11001',
    category: ['authentication'],
    type: ['start'],
    provider: 'system',
    weight: 8,
  },
  {
    action: 'login_failed',
    code: '11002',
    category: ['authentication'],
    type: ['start'],
    provider: 'system',
    weight: 4,
  },
  {
    action: 'folder_permission_changed',
    code: '10070',
    category: ['iam'],
    type: ['change'],
    provider: 'folder',
    weight: 3,
  },
];

const SECRET_NAMES = [
  'Production Database Credentials',
  'AWS Root Access Key',
  'VPN Admin Password',
  'CI/CD Service Account',
  'SSL Certificate Key',
  'LDAP Bind Account',
  'Firewall Admin Credentials',
  'Backup Encryption Key',
  'API Gateway Token',
  'SSH Key - Production Bastion',
];

const FOLDER_NAMES = [
  'Infrastructure',
  'Databases',
  'Cloud Accounts',
  'Application Secrets',
  'Network Devices',
  'Service Accounts',
  'Certificates',
];

export class ThycoticSsIntegration extends BaseIntegration {
  readonly packageName = 'thycotic_ss';
  readonly displayName = 'Thycotic Secret Server';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'Logs', index: 'logs-thycotic_ss.logs-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];
    const centralAgent = this.buildCentralAgent(org);

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 1, max: 4 });
      for (let i = 0; i < eventCount; i++) {
        documents.push(this.createLogDocument(employee, org, centralAgent));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  private createLogDocument(
    employee: Employee,
    org: Organization,
    centralAgent: { id: string; name: string; type: string; version: string },
  ): IntegrationDocument {
    const eventDef = faker.helpers.weightedArrayElement(
      SECRET_EVENTS.map((e) => ({ value: e, weight: e.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);
    const secretName = faker.helpers.arrayElement(SECRET_NAMES);
    const secretId = String(faker.number.int({ min: 1000, max: 9999 }));
    const _folderName = faker.helpers.arrayElement(FOLDER_NAMES);
    const containerId = String(faker.number.int({ min: 100, max: 9999 }));
    const _userId = String(faker.number.int({ min: 100, max: 9999 }));
    const _sourceIp = faker.internet.ipv4();
    const _serverHostname = 'THYCOTICSS01';
    const _serverIp = '172.24.0.3';
    const isFailure = eventDef.action === 'login_failed';
    const _outcome = isFailure ? 'failure' : 'success';

    const fullName = `${employee.firstName} ${employee.lastName}`;
    const userDomain = org.domain.split('.')[0];

    const actionLabel = eventDef.action
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Raw pre-pipeline format: pipeline parses from message (Thycotic native format)
    const message =
      eventDef.provider === 'system'
        ? `[[SecretServer]] Event: [System] Action: [${actionLabel}] By User: ${userDomain}\\${employee.userName}`
        : `[[SecretServer]] Event: [Secret] Action: [${actionLabel}] By User: ${userDomain}\\${employee.userName} Item name: ${secretName} (Item Id: ${secretId}) Container name: ${fullName} (Container Id: ${containerId})`;

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      message,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'thycotic_ss.logs' },
    } as IntegrationDocument;
  }
}
