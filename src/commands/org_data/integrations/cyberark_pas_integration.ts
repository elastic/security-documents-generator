/**
 * CyberArk PAS Integration
 * Generates privileged access security audit documents
 * Based on the Elastic cyberarkpas Beats module
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const AUDIT_ACTIONS: Array<{
  value: string;
  code: string;
  weight: number;
  categories: string[];
  eventType: string[];
  outcome: string;
}> = [
  {
    value: 'Logon',
    code: '7',
    weight: 25,
    categories: ['authentication', 'session'],
    eventType: ['start'],
    outcome: 'success',
  },
  {
    value: 'Logoff',
    code: '8',
    weight: 10,
    categories: ['authentication', 'session'],
    eventType: ['end'],
    outcome: 'success',
  },
  {
    value: 'Logon Failure',
    code: '9',
    weight: 8,
    categories: ['authentication'],
    eventType: ['start'],
    outcome: 'failure',
  },
  {
    value: 'Retrieve Password',
    code: '22',
    weight: 20,
    categories: ['iam'],
    eventType: ['access'],
    outcome: 'success',
  },
  {
    value: 'Store Password',
    code: '24',
    weight: 5,
    categories: ['iam'],
    eventType: ['change'],
    outcome: 'success',
  },
  {
    value: 'PSMConnect',
    code: '295',
    weight: 12,
    categories: ['session'],
    eventType: ['start'],
    outcome: 'success',
  },
  {
    value: 'PSMDisconnect',
    code: '296',
    weight: 8,
    categories: ['session'],
    eventType: ['end'],
    outcome: 'success',
  },
  {
    value: 'Window Title',
    code: '411',
    weight: 5,
    categories: ['process'],
    eventType: ['info'],
    outcome: 'success',
  },
  {
    value: 'CPM Password Change',
    code: '38',
    weight: 4,
    categories: ['iam'],
    eventType: ['change'],
    outcome: 'success',
  },
  {
    value: 'CPM Password Verify',
    code: '57',
    weight: 3,
    categories: ['iam'],
    eventType: ['access'],
    outcome: 'success',
  },
];

const SAFES = [
  'Windows',
  'Linux',
  'Databases',
  'NetworkDevices',
  'Applications',
  'PasswordSafe',
  'CloudAccounts',
  'ServiceAccounts',
];

const DEVICE_TYPES = ['Operating System', 'Database', 'Network Device', 'Application'];
const PROTOCOLS = ['RDP', 'SSH', 'HTTPS', 'SQL'];
const SEVERITIES = ['Info', 'Warning', 'Error', 'Critical'];

const MANAGED_HOSTS = [
  'webserver-01.corp.local',
  'dbserver.cyberark.local',
  'appserver-prod.corp.local',
  'dc01.corp.local',
  'fileserver.corp.local',
  'jumpbox-01.corp.local',
  'linuxsrv-01.corp.local',
  'sqlserver-01.corp.local',
];

const MANAGED_ACCOUNTS = [
  'Administrator',
  'Administrator2',
  'root',
  'sa',
  'svc_deploy',
  'dba_admin',
  'net_admin',
  'app_service',
];

const POLICY_IDS = [
  'WIN-SERVER-LOCAL',
  'LINUX-ROOT',
  'DB-ORACLE',
  'NET-CISCO',
  'WIN-DOMAIN-ADMIN',
  'CLOUD-AWS',
];

export class CyberArkPasIntegration extends BaseIntegration {
  readonly packageName = 'cyberarkpas';
  readonly displayName = 'CyberArk PAS';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'audit', index: 'logs-cyberarkpas.audit-default' },
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
        documents.push(this.createAuditDocument(employee));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  private createAuditDocument(employee: Employee): IntegrationDocument {
    const action = faker.helpers.weightedArrayElement(
      AUDIT_ACTIONS.map((a) => ({ value: a, weight: a.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const stationIp = faker.internet.ipv4();
    const gatewayIp = faker.internet.ipv4();
    const managedHost = faker.helpers.arrayElement(MANAGED_HOSTS);
    const managedAccount = faker.helpers.arrayElement(MANAGED_ACCOUNTS);
    const safe = faker.helpers.arrayElement(SAFES);
    const policyId = faker.helpers.arrayElement(POLICY_IDS);
    const severity =
      action.outcome === 'failure'
        ? faker.helpers.arrayElement(['Warning', 'Error'])
        : faker.helpers.arrayElement(SEVERITIES);

    const isPsmAction =
      action.value === 'PSMConnect' ||
      action.value === 'PSMDisconnect' ||
      action.value === 'Window Title';

    const eventAction =
      action.outcome === 'success' && action.value === 'Logon'
        ? 'authentication_success'
        : action.outcome === 'failure'
          ? 'authentication_failure'
          : action.value.toLowerCase().replace(/\s+/g, '_');

    const doc: Record<string, unknown> = {
      '@timestamp': timestamp,
      cyberarkpas: {
        audit: {
          action: action.value,
          desc: action.value,
          gateway_station: gatewayIp,
          iso_timestamp: timestamp,
          issuer: employee.userName,
          message: action.value,
          rfc5424: false,
          severity,
          station: stationIp,
          safe,
          message_id: action.code,
          ...(isPsmAction && {
            file: `Root\\${faker.helpers.arrayElement(DEVICE_TYPES)}-${policyId}-${managedHost}-${managedAccount}`,
            extra_details: {
              command:
                isPsmAction && action.value === 'Window Title'
                  ? `${faker.system.fileName()}, ${faker.lorem.words(2)}`
                  : undefined,
              dst_host: managedHost,
              src_host: stationIp,
              protocol: faker.helpers.arrayElement(PROTOCOLS),
              session_id: faker.string.uuid(),
              ...(action.value === 'Window Title' && {
                process_id: String(faker.number.int({ min: 1000, max: 9999 })),
                process_name: faker.helpers.arrayElement([
                  'mstsc.exe',
                  'putty.exe',
                  'cmd.exe',
                  'powershell.exe',
                  'shutdown.exe',
                ]),
              }),
            },
            ca_properties: {
              address: managedHost,
              user_name: managedAccount,
              device_type: faker.helpers.arrayElement(DEVICE_TYPES),
              logon_domain: managedHost.split('.')[0],
              policy_id: policyId,
            },
          }),
        },
      },
      data_stream: {
        dataset: 'cyberarkpas.audit',
        namespace: 'default',
        type: 'logs',
      },
      event: {
        action: eventAction,
        code: action.code,
        dataset: 'cyberarkpas.audit',
        kind: 'event',
        category: action.categories,
        type: action.eventType,
        outcome: action.outcome,
      },
      source: { ip: stationIp },
      destination: { ip: gatewayIp },
      user: { name: employee.userName },
      related: {
        ip: [stationIp, gatewayIp],
        user: [employee.userName],
      },
      tags: ['forwarded', 'cyberarkpas-audit'],
    };

    return doc as IntegrationDocument;
  }
}
