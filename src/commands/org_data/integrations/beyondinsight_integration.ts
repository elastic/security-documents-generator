/**
 * BeyondInsight and Password Safe Integration
 * Generates PAM audit, session, managed system/account, and asset documents
 * Based on the Elastic beyondinsight_password_safe integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const AUDIT_ACTION_TYPES: Array<{ value: string; weight: number }> = [
  { value: 'AccessDenied', weight: 5 },
  { value: 'PasswordChange', weight: 15 },
  { value: 'PasswordRetrieval', weight: 20 },
  { value: 'Login', weight: 25 },
  { value: 'Logout', weight: 10 },
  { value: 'AccountLock', weight: 3 },
  { value: 'AccountUnlock', weight: 3 },
  { value: 'RoleAssignment', weight: 5 },
  { value: 'PolicyChange', weight: 4 },
  { value: 'SessionStart', weight: 10 },
];

const AUDIT_SECTIONS = [
  'Authorization',
  'Authentication',
  'PasswordSafe',
  'UserManagement',
  'SystemManagement',
  'PolicyManagement',
];

const SESSION_PROTOCOLS = ['rdp', 'ssh', 'telnet', 'vnc'];
const SESSION_STATUSES = ['completed', 'in_progress', 'terminated', 'expired'];
const SESSION_TYPES = ['regular', 'isa', 'admin'];
const ARCHIVE_STATUSES = ['archived', 'not_archived', 'pending'];

const MANAGED_SYSTEM_NAMES = [
  'ProdDB-01',
  'WebServer-Prod',
  'AppServer-01',
  'FileServer-Corp',
  'DomainController-01',
  'CIServer-Build',
  'MonitoringHub',
  'BackupServer-01',
  'MailGateway',
  'VPNGateway-01',
];

const MANAGED_ACCOUNT_NAMES = [
  'Administrator',
  'svc_backup',
  'svc_deploy',
  'dba_admin',
  'root',
  'svc_monitoring',
  'app_service',
  'net_admin',
];

const ASSET_TYPES = ['Server', 'Workstation', 'NetworkDevice', 'Database', 'Application'];
const OPERATING_SYSTEMS = [
  'Windows Server 2022',
  'Windows Server 2019',
  'Ubuntu 22.04 LTS',
  'RHEL 9',
  'CentOS 8',
  'Debian 12',
];

export class BeyondInsightIntegration extends BaseIntegration {
  readonly packageName = 'beyondinsight_password_safe';
  readonly displayName = 'BeyondInsight and Password Safe';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'useraudit', index: 'logs-beyondinsight_password_safe.useraudit-default' },
    { name: 'session', index: 'logs-beyondinsight_password_safe.session-default' },
    { name: 'managedsystem', index: 'logs-beyondinsight_password_safe.managedsystem-default' },
    { name: 'managedaccount', index: 'logs-beyondinsight_password_safe.managedaccount-default' },
    { name: 'asset', index: 'logs-beyondinsight_password_safe.asset-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();

    const userAuditDocs: IntegrationDocument[] = [];
    const sessionDocs: IntegrationDocument[] = [];
    const managedAccountDocs: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      const auditCount = faker.number.int({ min: 2, max: 4 });
      for (let i = 0; i < auditCount; i++) {
        userAuditDocs.push(this.createUserAuditDocument(employee));
      }
      if (faker.datatype.boolean(0.3)) {
        sessionDocs.push(this.createSessionDocument(employee));
      }
    }

    const accountCount = faker.number.int({ min: 5, max: 15 });
    for (let i = 0; i < accountCount; i++) {
      managedAccountDocs.push(this.createManagedAccountDocument(i));
    }

    const systemDocs = this.createManagedSystemDocuments();
    const assetDocs = this.createAssetDocuments();

    documentsMap.set(this.dataStreams[0].index, userAuditDocs);
    documentsMap.set(this.dataStreams[1].index, sessionDocs);
    documentsMap.set(this.dataStreams[2].index, systemDocs);
    documentsMap.set(this.dataStreams[3].index, managedAccountDocs);
    documentsMap.set(this.dataStreams[4].index, assetDocs);

    return documentsMap;
  }

  private createUserAuditDocument(employee: Employee): IntegrationDocument {
    const action = faker.helpers.weightedArrayElement(
      AUDIT_ACTION_TYPES.map((a) => ({ value: a, weight: a.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const auditId = String(faker.number.int({ min: 1, max: 99999 }));
    const userId = String(faker.number.int({ min: 100, max: 999 }));

    const eventCategory =
      action.value === 'Login' || action.value === 'Logout' ? ['authentication'] : ['iam'];
    const eventType = action.value === 'AccessDenied' ? ['denied'] : ['info'];

    return {
      '@timestamp': timestamp,
      beyondinsight_password_safe: {
        useraudit: {
          action_type: action.value,
          audit_id: auditId,
          create_date: timestamp,
          ip_address: sourceIp,
          section: faker.helpers.arrayElement(AUDIT_SECTIONS),
          user_id: userId,
          user_name: employee.userName,
        },
      },
      data_stream: {
        dataset: 'beyondinsight_password_safe.useraudit',
        namespace: 'default',
        type: 'logs',
      },
      event: {
        dataset: 'beyondinsight_password_safe.useraudit',
        kind: 'event',
        category: eventCategory,
        type: eventType,
      },
      related: {
        ip: [sourceIp],
        user: [employee.userName],
      },
      user: {
        id: userId,
        name: employee.userName,
      },
      source: { ip: sourceIp },
      tags: ['forwarded', 'beyondinsight_password_safe-useraudit'],
    } as IntegrationDocument;
  }

  private createSessionDocument(employee: Employee): IntegrationDocument {
    const startTime = this.getRandomTimestamp(72);
    const durationSec = faker.number.int({ min: 300, max: 14400 });
    const endTime = new Date(new Date(startTime).getTime() + durationSec * 1000).toISOString();
    const protocol = faker.helpers.arrayElement(SESSION_PROTOCOLS);
    const systemName = faker.helpers.arrayElement(MANAGED_SYSTEM_NAMES);
    const accountName = faker.helpers.arrayElement(MANAGED_ACCOUNT_NAMES);
    const sessionId = String(faker.number.int({ min: 1000, max: 9999 }));

    return {
      '@timestamp': endTime,
      beyondinsight_password_safe: {
        session: {
          application_id: String(faker.number.int({ min: 100, max: 199 })),
          archive_status: faker.helpers.arrayElement(ARCHIVE_STATUSES),
          asset_name: systemName,
          duration: durationSec,
          end_time: endTime,
          managed_account_id: String(faker.number.int({ min: 1, max: 50 })),
          managed_account_name: accountName,
          managed_system_id: String(faker.number.int({ min: 1, max: 30 })),
          node_id: `node-${faker.string.alphanumeric(3)}`,
          protocol,
          record_key: `rec_key_${faker.string.alphanumeric(8)}`,
          request_id: String(faker.number.int({ min: 100, max: 999 })),
          session_id: sessionId,
          session_type: faker.helpers.arrayElement(SESSION_TYPES),
          start_time: startTime,
          status: faker.helpers.arrayElement(SESSION_STATUSES),
          token: `token_${faker.string.alphanumeric(12)}`,
          user_id: String(faker.number.int({ min: 100, max: 999 })),
        },
      },
      data_stream: {
        dataset: 'beyondinsight_password_safe.session',
        namespace: 'default',
        type: 'logs',
      },
      event: {
        category: ['session'],
        duration: durationSec * 1_000_000_000,
        end: endTime,
        id: sessionId,
        start: startTime,
        type: ['info'],
      },
      network: { protocol },
      user: {
        id: String(faker.number.int({ min: 100, max: 999 })),
        name: employee.userName,
      },
      tags: ['forwarded', 'beyondinsight_password_safe-session'],
    } as IntegrationDocument;
  }

  private createManagedSystemDocuments(): IntegrationDocument[] {
    return MANAGED_SYSTEM_NAMES.map((name, idx) => {
      const systemId = String(idx + 1);
      const ip = faker.internet.ipv4();
      const dnsName = `${name.toLowerCase()}.example.com`;

      return {
        '@timestamp': this.getRandomTimestamp(168),
        beyondinsight_password_safe: {
          managedsystem: {
            access_url: `https://${dnsName}/manage`,
            asset_id: systemId,
            auto_management_flag: faker.datatype.boolean(0.7),
            change_frequency_days: faker.helpers.arrayElement([7, 14, 30, 60, 90]),
            change_frequency_type: 'first',
            dns_name: dnsName,
            host_name: name,
            ip_address: ip,
            managed_system_id: systemId,
            port: faker.helpers.arrayElement([22, 443, 3389, 5985, 8080]),
            system_name: name,
          },
        },
        data_stream: {
          dataset: 'beyondinsight_password_safe.managedsystem',
          namespace: 'default',
          type: 'logs',
        },
        event: {
          dataset: 'beyondinsight_password_safe.managedsystem',
          kind: 'event',
          category: ['host'],
          type: ['info'],
        },
        host: {
          domain: 'example.com',
          hostname: name,
          ip: [ip],
          name: dnsName,
        },
        tags: ['forwarded', 'beyondinsight_password_safe-managedsystem'],
      } as IntegrationDocument;
    });
  }

  private createManagedAccountDocument(idx: number): IntegrationDocument {
    const accountName = faker.helpers.arrayElement(MANAGED_ACCOUNT_NAMES);
    const systemName = faker.helpers.arrayElement(MANAGED_SYSTEM_NAMES);
    const accountId = String(idx + 1);
    const upn = `${accountName.toLowerCase()}@example.com`;
    const lastChange = this.getRandomTimestamp(168);

    return {
      '@timestamp': lastChange,
      beyondinsight_password_safe: {
        managedaccount: {
          account_description: `Managed account for ${systemName}`,
          account_id: accountId,
          account_name: accountName,
          application_display_name: faker.helpers.arrayElement([
            'PasswordSafe',
            'AccountingApp',
            'AdminPortal',
          ]),
          application_id: String(faker.number.int({ min: 100, max: 200 })),
          change_state: faker.helpers.arrayElement(['queued', 'completed', 'pending', 'failed']),
          default_release_duration: 120,
          domain_name: 'example.com',
          instance_name: 'Primary',
          is_changing: faker.datatype.boolean(0.1),
          is_isa_access: faker.datatype.boolean(0.3),
          last_change_date: lastChange,
          maximum_release_duration: 525600,
          next_change_date: new Date(
            new Date(lastChange).getTime() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
          platform_id: String(faker.number.int({ min: 1, max: 10 })),
          system_id: String(faker.number.int({ min: 1, max: MANAGED_SYSTEM_NAMES.length })),
          system_name: systemName,
          user_principal_name: upn,
        },
      },
      data_stream: {
        dataset: 'beyondinsight_password_safe.managedaccount',
        namespace: 'default',
        type: 'logs',
      },
      event: {
        dataset: 'beyondinsight_password_safe.managedaccount',
        kind: 'event',
        category: ['iam'],
        type: ['info'],
      },
      user: {
        email: upn,
        id: accountId,
        name: accountName,
      },
      tags: ['forwarded', 'beyondinsight_password_safe-managedaccount'],
    } as IntegrationDocument;
  }

  private createAssetDocuments(): IntegrationDocument[] {
    return MANAGED_SYSTEM_NAMES.map((name, idx) => {
      const assetId = String(idx + 1);
      const ip = faker.internet.ipv4();
      const mac = faker.internet.mac({ separator: '-' }).toUpperCase();
      const os = faker.helpers.arrayElement(OPERATING_SYSTEMS);
      const dnsName = `${name.toLowerCase()}.example.com`;
      const createDate = this.getRandomTimestamp(720);

      return {
        '@timestamp': this.getRandomTimestamp(168),
        beyondinsight_password_safe: {
          asset: {
            asset_id: assetId,
            asset_name: name,
            asset_type: faker.helpers.arrayElement(ASSET_TYPES),
            create_date: createDate,
            dns_name: dnsName,
            domain_name: 'example.com',
            ip_address: ip,
            last_update_date: this.getRandomTimestamp(72),
            mac_address: mac,
            operating_system: os,
            workgroup_id: '1',
          },
        },
        data_stream: {
          dataset: 'beyondinsight_password_safe.asset',
          namespace: 'default',
          type: 'logs',
        },
        event: {
          dataset: 'beyondinsight_password_safe.asset',
          kind: 'asset',
          category: ['host'],
        },
        host: {
          domain: 'example.com',
          ip: [ip],
          mac: [mac],
          name,
          os: { full: os },
        },
        tags: ['forwarded', 'beyondinsight_password_safe-asset'],
      } as IntegrationDocument;
    });
  }
}
