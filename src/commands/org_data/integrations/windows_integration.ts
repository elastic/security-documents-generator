/**
 * Windows Integration (windows.forwarded)
 * Generates Windows Security event log documents forwarded via WEF/WEC.
 * Events are post-pipeline (already parsed by the winlogbeat/filebeat pipeline).
 * Index: logs-windows.forwarded-default
 *
 * Key event codes generated:
 *   4624 - Successful logon (interactive, RDP, network)
 *   4625 - Failed logon (brute-force from external IPs)
 *   4634 - Logoff
 *   4648 - Explicit credential logon (RunAs / network share)
 *   4688 - Process created
 *   4689 - Process exited
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
  ELASTIC_AGENT_VERSION,
} from './base_integration.ts';
import { type Organization, type Employee, type Device, type CorrelationMap } from '../types.ts';
import { ATTACKER_IPS } from '../data/network_data.ts';
import { faker } from '@faker-js/faker';

const WINDOWS_BRUTE_FORCE_USERNAMES = [
  'Administrator',
  'ADMINISTRATOR',
  'ADMIN',
  'admin',
  'USER',
  'user',
  'administrator',
  'Administrateur',
  'administrador',
  'HP',
  'PC',
  'TEST',
  'ADMIN1',
  'guest',
  'LOGMEINREMOTEUSER',
];

const WINDOWS_FAILURE_REASONS = [
  { reason: 'Unknown user name or bad password.', status: '0xc000006d', subStatus: '0xc0000064' },
  { reason: 'Unknown user name or bad password.', status: '0xc000006d', subStatus: '0xc000006a' },
  { reason: 'Account locked out.', status: '0xc0000234', subStatus: '0x0' },
];

const WINDOWS_LOGON_FAILURE_STATUS_DESCRIPTIONS: Record<string, string> = {
  '0xc000006d': 'This is either due to a bad username or authentication information',
  '0xc0000234': 'User logon with account locked',
};

const WINDOWS_LOGON_FAILURE_SUBSTATUS_DESCRIPTIONS: Record<string, string> = {
  '0xc0000064': 'User logon with misspelled or bad user account',
  '0xc000006a': 'User logon with misspelled or bad password',
  '0x0': 'Status OK.',
};

const WINDOWS_AUTH_PACKAGES = ['NTLM', 'Negotiate', 'Kerberos'];
const WINDOWS_LOGON_PROCESSES = ['NtLmSsp ', 'Advapi  ', 'Kerberos'];

const WINDOWS_LOGON_TYPES: Record<string, string> = {
  '2': 'Interactive',
  '3': 'Network',
  '5': 'Service',
  '7': 'Unlock',
  '10': 'RemoteInteractive',
};

const WINDOWS_SERVICE_USERS = [
  { name: 'SYSTEM', domain: 'NT AUTHORITY', sid: 'S-1-5-18' },
  { name: 'NETWORK SERVICE', domain: 'NT AUTHORITY', sid: 'S-1-5-20' },
  { name: 'LOCAL SERVICE', domain: 'NT AUTHORITY', sid: 'S-1-5-19' },
];

const WINDOWS_SYSTEM_PROCESSES: Array<{ executable: string; name: string }> = [
  { executable: String.raw`C:\Windows\System32\services.exe`, name: 'services.exe' },
  { executable: String.raw`C:\Windows\System32\lsass.exe`, name: 'lsass.exe' },
  { executable: String.raw`C:\Windows\System32\svchost.exe`, name: 'svchost.exe' },
];

const WINDOWS_USER_PROCESSES: Array<{ executable: string; name: string }> = [
  { executable: String.raw`C:\Windows\System32\cmd.exe`, name: 'cmd.exe' },
  {
    executable: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
    name: 'powershell.exe',
  },
  { executable: String.raw`C:\Program Files\Git\bin\bash.exe`, name: 'bash.exe' },
  { executable: String.raw`C:\Windows\System32\mmc.exe`, name: 'mmc.exe' },
  { executable: String.raw`C:\Windows\explorer.exe`, name: 'explorer.exe' },
];

interface WindowsHostContext {
  agentId: string;
  hostname: string;
  host: Record<string, unknown>;
}

export class WindowsIntegration extends BaseIntegration {
  readonly packageName = 'windows';
  readonly displayName = 'Windows Event Logs (Forwarded)';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'forwarded',
      index: 'logs-windows.forwarded-default',
    },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documents: IntegrationDocument[] = [];

    // Generate events for each employee Windows device
    for (const employee of org.employees) {
      for (const device of employee.devices) {
        if (device.platform !== 'windows') continue;
        const ctx = this.buildWindowsHostContext(employee, device);

        // 4624: successful interactive/RDP logons from the employee
        const interactiveCount = faker.number.int({ min: 1, max: 3 });
        for (let i = 0; i < interactiveCount; i++) {
          documents.push(this.createLogonDocument(ctx, 'employee', employee));
        }

        // 4624: service logons (SYSTEM, NETWORK SERVICE)
        const serviceCount = faker.number.int({ min: 2, max: 5 });
        for (let i = 0; i < serviceCount; i++) {
          documents.push(this.createLogonDocument(ctx, 'service'));
        }

        // 4625: failed network logons (brute-force)
        const failedCount = faker.number.int({ min: 3, max: 10 });
        for (let i = 0; i < failedCount; i++) {
          documents.push(this.createFailedLogonDocument(ctx));
        }

        // 4634: logoff events
        const logoffCount = faker.number.int({ min: 1, max: 3 });
        for (let i = 0; i < logoffCount; i++) {
          documents.push(this.createLogoffDocument(ctx, employee));
        }

        // 4648: explicit credential logon (~40% of devices)
        if (faker.number.float() < 0.4) {
          documents.push(this.createExplicitLogonDocument(ctx, employee));
        }

        // 4688 / 4689: process create/exit pairs
        const processCount = faker.number.int({ min: 2, max: 5 });
        for (let i = 0; i < processCount; i++) {
          documents.push(this.createProcessCreatedDocument(ctx, employee));
        }
      }
    }

    documents.sort(
      (a, b) => new Date(a['@timestamp']).getTime() - new Date(b['@timestamp']).getTime(),
    );

    const documentsMap = new Map<string, IntegrationDocument[]>();
    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  // ---------------------------------------------------------------------------
  // Event 4624 — Successful logon
  // ---------------------------------------------------------------------------

  private createLogonDocument(
    ctx: WindowsHostContext,
    type: 'service' | 'employee',
    employee?: Employee,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);

    let user: { name: string; domain: string; sid: string };
    let logonTypeKey: string;
    let subjectUser: { name: string; domain: string; sid: string };

    if (type === 'service') {
      user = faker.helpers.arrayElement(WINDOWS_SERVICE_USERS);
      logonTypeKey = '5';
      subjectUser = {
        name: `${ctx.hostname.toUpperCase()}$`,
        domain: 'WORKGROUP',
        sid: 'S-1-5-18',
      };
    } else {
      logonTypeKey = faker.helpers.arrayElement(['2', '10']);
      user = {
        name: employee!.userName,
        domain: employee!.userName.split('.')[0].toUpperCase(),
        sid: employee!.windowsSid,
      };
      subjectUser = {
        name: `${ctx.hostname.toUpperCase()}$`,
        domain: 'WORKGROUP',
        sid: 'S-1-5-18',
      };
    }

    const logonType = WINDOWS_LOGON_TYPES[logonTypeKey] ?? 'Service';
    const proc = faker.helpers.arrayElement(WINDOWS_SYSTEM_PROCESSES);
    const authPackage = faker.helpers.arrayElement(WINDOWS_AUTH_PACKAGES);
    const logonProcess = faker.helpers.arrayElement(WINDOWS_LOGON_PROCESSES);
    const logonId = `0x${faker.string.hexadecimal({ length: 5, casing: 'lower', prefix: '' })}`;
    const relatedUsers = Array.from(new Set([user.name, subjectUser.name]));

    return {
      '@timestamp': timestamp,
      agent: this.buildForwardedAgent(ctx),
      data_stream: { dataset: 'windows.forwarded', namespace: 'default', type: 'logs' },
      ecs: { version: '8.17.0' },
      event: {
        action: 'logged-in',
        category: ['authentication'],
        code: '4624',
        kind: 'event',
        outcome: 'success',
        provider: 'Microsoft-Windows-Security-Auditing',
        type: ['start'],
      },
      host: ctx.host,
      log: { level: 'information' },
      process: {
        executable: proc.executable,
        name: proc.name,
        pid: faker.number.int({ min: 400, max: 8000 }),
      },
      related: { user: relatedUsers },
      user: { domain: user.domain, id: user.sid, name: user.name },
      winlog: {
        channel: 'Security',
        computer_name: ctx.hostname,
        event_data: {
          AuthenticationPackageName: authPackage,
          ImpersonationLevel: '%%1833',
          KeyLength: '0',
          LogonProcessName: logonProcess,
          LogonType: logonTypeKey,
          SubjectDomainName: subjectUser.domain,
          SubjectLogonId: '0x3e7',
          SubjectUserName: subjectUser.name,
          SubjectUserSid: subjectUser.sid,
          TargetDomainName: user.domain,
          TargetLogonId: logonId,
          TargetUserName: user.name,
          TargetUserSid: user.sid,
        },
        event_id: '4624',
        keywords: ['Audit Success'],
        level: 'information',
        logon: { id: logonId, type: logonType },
        opcode: 'Info',
        outcome: 'success',
        process: {
          pid: faker.number.int({ min: 600, max: 900 }),
          thread: { id: faker.number.int({ min: 1000, max: 9999 }) },
        },
        provider_guid: '{54849625-5478-4994-a5ba-3e3b0328c30d}',
        provider_name: 'Microsoft-Windows-Security-Auditing',
        record_id: faker.string.numeric(7),
        task: 'Logon',
        time_created: timestamp,
        version: 1,
      },
    } as IntegrationDocument;
  }

  // ---------------------------------------------------------------------------
  // Event 4625 — Failed logon
  // ---------------------------------------------------------------------------

  private createFailedLogonDocument(ctx: WindowsHostContext): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const attackerIp = faker.helpers.arrayElement(ATTACKER_IPS);
    const bruteForceUser = faker.helpers.arrayElement(WINDOWS_BRUTE_FORCE_USERNAMES);
    const failureInfo = faker.helpers.arrayElement(WINDOWS_FAILURE_REASONS);
    const sourcePort = faker.number.int({ min: 30000, max: 65535 });

    return {
      '@timestamp': timestamp,
      agent: this.buildForwardedAgent(ctx),
      data_stream: { dataset: 'windows.forwarded', namespace: 'default', type: 'logs' },
      ecs: { version: '8.17.0' },
      event: {
        action: 'logon-failed',
        category: ['authentication'],
        code: '4625',
        kind: 'event',
        outcome: 'failure',
        provider: 'Microsoft-Windows-Security-Auditing',
        type: ['start'],
      },
      host: ctx.host,
      log: { level: 'information' },
      process: { pid: 0 },
      related: { ip: [attackerIp], user: [bruteForceUser] },
      source: { ip: attackerIp, port: sourcePort },
      user: { id: 'S-1-0-0', name: bruteForceUser },
      winlog: {
        channel: 'Security',
        computer_name: ctx.hostname,
        event_data: {
          AuthenticationPackageName: 'NTLM',
          FailureReason: failureInfo.reason,
          KeyLength: '0',
          LogonProcessName: 'NtLmSsp ',
          LogonType: '3',
          Status: failureInfo.status,
          SubStatus: failureInfo.subStatus,
          SubjectLogonId: '0x0',
          SubjectUserSid: 'S-1-0-0',
          TargetUserName: bruteForceUser,
          TargetUserSid: 'S-1-0-0',
        },
        event_id: '4625',
        keywords: ['Audit Failure'],
        level: 'information',
        logon: {
          failure: {
            reason: failureInfo.reason,
            status:
              WINDOWS_LOGON_FAILURE_STATUS_DESCRIPTIONS[failureInfo.status] ?? failureInfo.reason,
            sub_status:
              WINDOWS_LOGON_FAILURE_SUBSTATUS_DESCRIPTIONS[failureInfo.subStatus] ??
              failureInfo.subStatus,
          },
          id: '0x0',
          type: 'Network',
        },
        opcode: 'Info',
        outcome: 'failure',
        process: {
          pid: faker.number.int({ min: 600, max: 900 }),
          thread: { id: faker.number.int({ min: 1000, max: 9999 }) },
        },
        provider_guid: '{54849625-5478-4994-a5ba-3e3b0328c30d}',
        provider_name: 'Microsoft-Windows-Security-Auditing',
        record_id: faker.string.numeric(7),
        task: 'Logon',
        time_created: timestamp,
      },
    } as IntegrationDocument;
  }

  // ---------------------------------------------------------------------------
  // Event 4634 — Logoff
  // ---------------------------------------------------------------------------

  private createLogoffDocument(ctx: WindowsHostContext, employee: Employee): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const isServiceLogoff = faker.number.float() < 0.5;
    const user = isServiceLogoff
      ? faker.helpers.arrayElement(WINDOWS_SERVICE_USERS)
      : {
          name: employee.userName,
          domain: employee.userName.split('.')[0].toUpperCase(),
          sid: employee.windowsSid,
        };
    const logonTypeKey = isServiceLogoff ? '5' : faker.helpers.arrayElement(['2', '3', '10']);
    const logonType = WINDOWS_LOGON_TYPES[logonTypeKey] ?? 'Interactive';
    const logonId = `0x${faker.string.hexadecimal({ length: 5, casing: 'lower', prefix: '' })}`;

    return {
      '@timestamp': timestamp,
      agent: this.buildForwardedAgent(ctx),
      data_stream: { dataset: 'windows.forwarded', namespace: 'default', type: 'logs' },
      ecs: { version: '8.17.0' },
      event: {
        action: 'logged-out',
        category: ['authentication'],
        code: '4634',
        kind: 'event',
        outcome: 'success',
        provider: 'Microsoft-Windows-Security-Auditing',
        type: ['end'],
      },
      host: ctx.host,
      log: { level: 'information' },
      related: { user: [user.name] },
      user: { domain: user.domain, id: user.sid, name: user.name },
      winlog: {
        channel: 'Security',
        computer_name: ctx.hostname,
        event_data: {
          LogonType: logonTypeKey,
          TargetDomainName: user.domain,
          TargetLogonId: logonId,
          TargetUserName: user.name,
          TargetUserSid: user.sid,
        },
        event_id: '4634',
        keywords: ['Audit Success'],
        level: 'information',
        logon: { id: logonId, type: logonType },
        opcode: 'Info',
        outcome: 'success',
        process: {
          pid: faker.number.int({ min: 600, max: 900 }),
          thread: { id: faker.number.int({ min: 1000, max: 9999 }) },
        },
        provider_guid: '{54849625-5478-4994-a5ba-3e3b0328c30d}',
        provider_name: 'Microsoft-Windows-Security-Auditing',
        record_id: faker.string.numeric(7),
        task: 'Logoff',
        time_created: timestamp,
      },
    } as IntegrationDocument;
  }

  // ---------------------------------------------------------------------------
  // Event 4648 — Explicit credential logon (RunAs / network share)
  // ---------------------------------------------------------------------------

  private createExplicitLogonDocument(
    ctx: WindowsHostContext,
    employee: Employee,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const subjectUser = {
      name: employee.userName,
      domain: employee.userName.split('.')[0].toUpperCase(),
      sid: employee.windowsSid,
    };
    const targetUser = faker.helpers.weightedArrayElement([
      {
        value: {
          name: 'Administrator',
          domain: ctx.hostname.toUpperCase(),
          sid: 'S-1-5-21-0-0-0-500',
        },
        weight: 3,
      },
      { value: faker.helpers.arrayElement(WINDOWS_SERVICE_USERS), weight: 2 },
    ]);
    const subjectLogonId = `0x${faker.string.hexadecimal({ length: 5, casing: 'lower', prefix: '' })}`;
    const targetServer = faker.helpers.arrayElement([ctx.hostname, 'localhost']);
    const proc = faker.helpers.arrayElement(WINDOWS_SYSTEM_PROCESSES);
    const relatedUsers = Array.from(new Set([subjectUser.name, targetUser.name]));

    return {
      '@timestamp': timestamp,
      agent: this.buildForwardedAgent(ctx),
      data_stream: { dataset: 'windows.forwarded', namespace: 'default', type: 'logs' },
      ecs: { version: '8.17.0' },
      event: {
        action: 'logged-in-explicit',
        category: ['authentication'],
        code: '4648',
        kind: 'event',
        outcome: 'success',
        provider: 'Microsoft-Windows-Security-Auditing',
        type: ['start'],
      },
      host: ctx.host,
      log: { level: 'information' },
      process: {
        executable: proc.executable,
        name: proc.name,
        pid: faker.number.int({ min: 400, max: 8000 }),
      },
      related: { user: relatedUsers },
      user: {
        domain: subjectUser.domain,
        id: subjectUser.sid,
        name: subjectUser.name,
        target: { domain: targetUser.domain, id: targetUser.sid, name: targetUser.name },
      },
      winlog: {
        channel: 'Security',
        computer_name: ctx.hostname,
        event_data: {
          LogonGuid: `{${faker.string.uuid().toUpperCase()}}`,
          ProcessName: proc.executable,
          SubjectDomainName: subjectUser.domain,
          SubjectLogonId: subjectLogonId,
          SubjectUserName: subjectUser.name,
          SubjectUserSid: subjectUser.sid,
          TargetDomainName: targetUser.domain,
          TargetServerName: targetServer,
          TargetUserName: targetUser.name,
        },
        event_id: '4648',
        keywords: ['Audit Success'],
        level: 'information',
        opcode: 'Info',
        outcome: 'success',
        process: {
          pid: faker.number.int({ min: 600, max: 900 }),
          thread: { id: faker.number.int({ min: 1000, max: 9999 }) },
        },
        provider_guid: '{54849625-5478-4994-a5ba-3e3b0328c30d}',
        provider_name: 'Microsoft-Windows-Security-Auditing',
        record_id: faker.string.numeric(7),
        task: 'Logon',
        version: 0,
      },
    } as IntegrationDocument;
  }

  // ---------------------------------------------------------------------------
  // Event 4688 — Process created
  // ---------------------------------------------------------------------------

  private createProcessCreatedDocument(
    ctx: WindowsHostContext,
    employee: Employee,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const proc = faker.helpers.arrayElement(WINDOWS_USER_PROCESSES);
    const parentProc = faker.helpers.arrayElement(WINDOWS_SYSTEM_PROCESSES);
    const userDomain = employee.userName.split('.')[0].toUpperCase();
    const logonId = `0x${faker.string.hexadecimal({ length: 5, casing: 'lower', prefix: '' })}`;

    return {
      '@timestamp': timestamp,
      agent: this.buildForwardedAgent(ctx),
      data_stream: { dataset: 'windows.forwarded', namespace: 'default', type: 'logs' },
      ecs: { version: '8.17.0' },
      event: {
        action: 'created-process',
        category: ['process'],
        code: '4688',
        kind: 'event',
        outcome: 'success',
        provider: 'Microsoft-Windows-Security-Auditing',
        type: ['start'],
      },
      host: ctx.host,
      log: { level: 'information' },
      process: {
        args: [proc.executable],
        command_line: proc.executable,
        executable: proc.executable,
        name: proc.name,
        parent: {
          executable: parentProc.executable,
          name: parentProc.name,
          pid: faker.number.int({ min: 400, max: 1000 }),
        },
        pid: faker.number.int({ min: 1000, max: 65535 }),
      },
      related: { user: [employee.userName] },
      user: {
        domain: userDomain,
        effective: { id: 'S-1-0-0' },
        id: employee.windowsSid,
        name: employee.userName,
      },
      winlog: {
        channel: 'Security',
        computer_name: ctx.hostname,
        event_data: {
          CommandLine: proc.executable,
          MandatoryLabel: 'S-1-16-12288',
          ProcessId: `0x${faker.number.int({ min: 256, max: 65535 }).toString(16)}`,
          SubjectDomainName: userDomain,
          SubjectLogonId: logonId,
          SubjectUserName: employee.userName,
          SubjectUserSid: employee.windowsSid,
          TargetLogonId: '0x0',
          TargetUserSid: 'S-1-0-0',
          TokenElevationType: '%%1937',
        },
        event_id: '4688',
        keywords: ['Audit Success'],
        level: 'information',
        logon: { id: logonId },
        opcode: 'Info',
        outcome: 'success',
        process: {
          pid: faker.number.int({ min: 600, max: 900 }),
          thread: { id: faker.number.int({ min: 1000, max: 9999 }) },
        },
        provider_guid: '{54849625-5478-4994-a5ba-3e3b0328c30d}',
        provider_name: 'Microsoft-Windows-Security-Auditing',
        record_id: faker.string.numeric(7),
        task: 'Process Creation',
        time_created: timestamp,
        version: 2,
      },
    } as IntegrationDocument;
  }

  // ---------------------------------------------------------------------------
  // Helper: build host context from employee + device
  // ---------------------------------------------------------------------------

  private buildWindowsHostContext(employee: Employee, device: Device): WindowsHostContext {
    const hostname = `${employee.userName}-windows`;

    return {
      agentId: device.elasticAgentId,
      hostname,
      host: {
        name: hostname,
        os: {
          family: 'windows',
          type: 'windows',
        },
      },
    };
  }

  private buildForwardedAgent(ctx: WindowsHostContext): Record<string, unknown> {
    return {
      ephemeral_id: faker.string.uuid(),
      id: ctx.agentId,
      name: ctx.hostname,
      type: 'filebeat',
      version: ELASTIC_AGENT_VERSION,
    };
  }
}
