/**
 * BeyondInsight and Password Safe Integration
 * Generates raw pre-pipeline documents (CamelCase API JSON in event.original)
 * for PAM audit, session, managed system/account, and asset data streams.
 * Based on the Elastic beyondinsight_password_safe integration package.
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

// Session pipeline expects numeric codes: 0=rdp, 1=ssh
const SESSION_PROTOCOL_CODES = [0, 1];
// Session pipeline: 0=not_started, 1=in_progress, 2=completed, 5=locked, 7=terminated, 8=logged_off, 9=disconnected
const SESSION_STATUS_CODES = [0, 1, 2, 5, 7, 8, 9];
// Session pipeline: 1=regular, 2=isa, 3=admin
const SESSION_TYPE_CODES = [1, 2, 3];
// Session pipeline: 0=not_archived, 1=archived, 2=restoring, 3=archiving
const ARCHIVE_STATUS_CODES = [0, 1, 2, 3];

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

// Managedaccount pipeline: ChangeState 0=idle, 1=changing, 2=queued
const CHANGE_STATE_CODES = [0, 1, 2];

// Managedsystem pipeline: SshKeyEnforcementMode 0=None, 1=Auto, 2=Strict
const SSH_KEY_ENFORCEMENT_CODES = [0, 1, 2];

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
    _correlationMap: CorrelationMap,
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
      AUDIT_ACTION_TYPES.map((a) => ({ value: a, weight: a.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const auditId = faker.number.int({ min: 1, max: 99999 });
    const userId =
      parseInt(employee.employeeNumber, 10) || faker.number.int({ min: 100, max: 999 });

    const rawEvent = {
      ActionType: action.value,
      AuditID: auditId,
      CreateDate: timestamp,
      IPAddress: sourceIp,
      Section: faker.helpers.arrayElement(AUDIT_SECTIONS),
      UserID: userId,
      UserName: employee.userName,
    };

    return {
      '@timestamp': timestamp,
      event: { original: JSON.stringify(rawEvent) },
      data_stream: {
        dataset: 'beyondinsight_password_safe.useraudit',
        namespace: 'default',
        type: 'logs',
      },
    } as IntegrationDocument;
  }

  private createSessionDocument(employee: Employee): IntegrationDocument {
    const startTime = this.getRandomTimestamp(72);
    const durationSec = faker.number.int({ min: 300, max: 14400 });
    const endTime = new Date(new Date(startTime).getTime() + durationSec * 1000).toISOString();
    const systemName = faker.helpers.arrayElement(MANAGED_SYSTEM_NAMES);
    const accountName = faker.helpers.arrayElement(MANAGED_ACCOUNT_NAMES);
    const sessionId = faker.number.int({ min: 1000, max: 9999 });

    const rawEvent = {
      ApplicationID: faker.number.int({ min: 100, max: 199 }),
      ArchiveStatus: faker.helpers.arrayElement(ARCHIVE_STATUS_CODES),
      AssetName: systemName,
      Duration: durationSec,
      EndTime: endTime,
      ManagedAccountID: faker.number.int({ min: 1, max: 50 }),
      ManagedAccountName: accountName,
      ManagedSystemID: faker.number.int({ min: 1, max: 30 }),
      NodeID: `node-${faker.string.alphanumeric(3)}`,
      Protocol: faker.helpers.arrayElement(SESSION_PROTOCOL_CODES),
      RecordKey: `rec_key_${faker.string.alphanumeric(8)}`,
      RequestID: faker.number.int({ min: 100, max: 999 }),
      SessionID: sessionId,
      SessionType: faker.helpers.arrayElement(SESSION_TYPE_CODES),
      StartTime: startTime,
      Status: faker.helpers.arrayElement(SESSION_STATUS_CODES),
      Token: `token_${faker.string.alphanumeric(12)}`,
      UserID: parseInt(employee.employeeNumber, 10) || faker.number.int({ min: 100, max: 999 }),
    };

    return {
      '@timestamp': endTime,
      event: { original: JSON.stringify(rawEvent) },
      data_stream: {
        dataset: 'beyondinsight_password_safe.session',
        namespace: 'default',
        type: 'logs',
      },
    } as IntegrationDocument;
  }

  private createManagedSystemDocuments(): IntegrationDocument[] {
    return MANAGED_SYSTEM_NAMES.map((name, idx) => {
      const systemId = idx + 1;
      const ip = faker.internet.ipv4();
      const dnsName = `${name.toLowerCase()}.example.com`;

      const rawEvent = {
        AccessURL: `https://${dnsName}/manage`,
        AssetID: systemId,
        AutoManagementFlag: faker.datatype.boolean(0.7),
        ChangeFrequencyDays: faker.helpers.arrayElement([7, 14, 30, 60, 90]),
        ChangeFrequencyType: 'first',
        DNSName: dnsName,
        HostName: name,
        IPAddress: ip,
        ManagedSystemID: systemId,
        Port: faker.helpers.arrayElement([22, 443, 3389, 5985, 8080]),
        SystemName: name,
        SshKeyEnforcementMode: faker.helpers.arrayElement(SSH_KEY_ENFORCEMENT_CODES),
      };

      return {
        '@timestamp': this.getRandomTimestamp(168),
        event: { original: JSON.stringify(rawEvent) },
        data_stream: {
          dataset: 'beyondinsight_password_safe.managedsystem',
          namespace: 'default',
          type: 'logs',
        },
      } as IntegrationDocument;
    });
  }

  private createManagedAccountDocument(idx: number): IntegrationDocument {
    const accountName = faker.helpers.arrayElement(MANAGED_ACCOUNT_NAMES);
    const systemName = faker.helpers.arrayElement(MANAGED_SYSTEM_NAMES);
    const accountId = idx + 1;
    const upn = `${accountName.toLowerCase().replace(/\s+/g, '_')}@example.com`;
    const lastChange = this.getRandomTimestamp(168);
    const nextChange = new Date(
      new Date(lastChange).getTime() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const rawEvent = {
      AccountDescription: `Managed account for ${systemName}`,
      AccountId: accountId,
      AccountName: accountName,
      ApplicationDisplayName: faker.helpers.arrayElement([
        'PasswordSafe',
        'AccountingApp',
        'AdminPortal',
      ]),
      ApplicationID: faker.number.int({ min: 100, max: 200 }),
      ChangeState: faker.helpers.arrayElement(CHANGE_STATE_CODES),
      DefaultReleaseDuration: 120,
      DomainName: 'example.com',
      InstanceName: 'Primary',
      IsChanging: faker.datatype.boolean(0.1),
      IsISAAccess: faker.datatype.boolean(0.3),
      LastChangeDate: lastChange,
      MaximumReleaseDuration: 525600,
      NextChangeDate: nextChange,
      PlatformID: faker.number.int({ min: 1, max: 10 }),
      SystemId: faker.number.int({ min: 1, max: MANAGED_SYSTEM_NAMES.length }),
      SystemName: systemName,
      UserPrincipalName: upn,
    };

    return {
      '@timestamp': lastChange,
      event: { original: JSON.stringify(rawEvent) },
      data_stream: {
        dataset: 'beyondinsight_password_safe.managedaccount',
        namespace: 'default',
        type: 'logs',
      },
    } as IntegrationDocument;
  }

  private createAssetDocuments(): IntegrationDocument[] {
    return MANAGED_SYSTEM_NAMES.map((name, idx) => {
      const assetId = idx + 1;
      const ip = faker.internet.ipv4();
      const mac = faker.internet.mac({ separator: '-' }).toUpperCase();
      const os = faker.helpers.arrayElement(OPERATING_SYSTEMS);
      const dnsName = `${name.toLowerCase()}.example.com`;
      const createDate = this.getRandomTimestamp(720);
      const lastUpdateDate = this.getRandomTimestamp(72);

      const rawEvent = {
        AssetID: assetId,
        AssetName: name,
        AssetType: faker.helpers.arrayElement(ASSET_TYPES),
        CreateDate: createDate,
        DnsName: dnsName,
        DomainName: 'example.com',
        IPAddress: ip,
        LastUpdateDate: lastUpdateDate,
        MacAddress: mac,
        OperatingSystem: os,
        WorkgroupID: 1,
      };

      return {
        '@timestamp': lastUpdateDate,
        event: { original: JSON.stringify(rawEvent) },
        data_stream: {
          dataset: 'beyondinsight_password_safe.asset',
          namespace: 'default',
          type: 'logs',
        },
      } as IntegrationDocument;
    });
  }
}
