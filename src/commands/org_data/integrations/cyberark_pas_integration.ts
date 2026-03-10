/**
 * CyberArk PAS Integration
 * Generates privileged access security audit documents in raw/pre-pipeline format.
 * Pipeline expects message with JSON: {"format":"elastic","version":"1.0","syslog":{"audit_record":{...}}}
 * Audit record fields use CamelCase; pipeline converts to snake_case.
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

/** CamelCase audit record as expected by the ingest pipeline (JSON-only format). */
interface AuditRecord {
  IsoTimestamp: string;
  Timestamp?: string;
  Station: string;
  GatewayStation: string;
  Safe: string;
  Message: string;
  MessageID: string;
  Severity: string;
  Issuer: string;
  Action: string;
  Desc: string;
  SourceUser: string;
  TargetUser: string;
  File: string;
  Location: string;
  Category: string;
  RequestId: string;
  Reason: string;
  ExtraDetails: string;
  Vendor: string;
  Product: string;
  Version: string;
  Rfc5424: string;
  CAProperties?: { CAProperty: Array<{ Name: string; Value: string }> };
}

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

    const needsFileAndCaProps = isPsmAction || action.value === 'Retrieve Password';

    const timestampLegacy = this.toLegacyTimestamp(timestamp);

    const auditRecord: AuditRecord = {
      IsoTimestamp: timestamp.replace(/\.\d{3}Z$/, 'Z'),
      Timestamp: timestampLegacy,
      Station: stationIp,
      GatewayStation: gatewayIp,
      Safe: safe,
      Message: action.value,
      MessageID: action.code,
      Severity: severity,
      Issuer: employee.userName,
      Action: action.value,
      Desc: action.value,
      SourceUser: '',
      TargetUser: '',
      File: '',
      Location: '',
      Category: '',
      RequestId: '',
      Reason: '',
      ExtraDetails: '',
      Vendor: 'Cyber-Ark',
      Product: 'Vault',
      Version: '11.7.0000',
      Rfc5424: 'no',
    };

    if (needsFileAndCaProps) {
      const deviceType = faker.helpers.arrayElement(DEVICE_TYPES);
      auditRecord.File = `Root\\${deviceType}-${policyId}-${managedHost}-${managedAccount}`;
      auditRecord.CAProperties = {
        CAProperty: [
          { Name: 'PolicyID', Value: policyId },
          { Name: 'UserName', Value: managedAccount },
          { Name: 'Address', Value: managedHost },
          { Name: 'DeviceType', Value: deviceType },
          { Name: 'LogonDomain', Value: managedHost.split('.')[0] },
        ],
      };

      if (action.value === 'Window Title') {
        auditRecord.ExtraDetails = JSON.stringify({
          dst_host: managedHost,
          src_host: stationIp,
          protocol: faker.helpers.arrayElement(PROTOCOLS),
          session_id: faker.string.uuid(),
          process_id: String(faker.number.int({ min: 1000, max: 9999 })),
          process_name: faker.helpers.arrayElement([
            'mstsc.exe',
            'putty.exe',
            'cmd.exe',
            'powershell.exe',
            'shutdown.exe',
          ]),
        });
      }
    }

    const payload = {
      format: 'elastic',
      version: '1.0',
      syslog: { audit_record: auditRecord },
    };
    const message = JSON.stringify(payload);

    const doc: IntegrationDocument = {
      '@timestamp': timestamp,
      message,
      data_stream: {
        dataset: 'cyberarkpas.audit',
        namespace: 'default',
        type: 'logs',
      },
    };

    return doc;
  }

  /** Converts ISO timestamp to legacy syslog format "Mar 05 14:32:00" */
  private toLegacyTimestamp(iso: string): string {
    const d = new Date(iso);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${months[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
}
