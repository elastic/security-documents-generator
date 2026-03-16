/**
 * System Integration (system.auth + system.syslog + system.security)
 * Generates authentication, session, process, and syslog documents for Linux hosts
 * and Windows Security event log documents for Windows hosts/devices
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import { type Organization, type Host, type Employee, type CorrelationMap } from '../types.ts';
import { ATTACKER_IPS } from '../data/network_data.ts';
import { faker } from '@faker-js/faker';

/** Common brute-force usernames used in failed SSH attempts */
const BRUTE_FORCE_USERNAMES = [
  'root',
  'admin',
  'deploy',
  'ubuntu',
  'test',
  'user',
  'oracle',
  'postgres',
  'mysql',
  'git',
  'ftpuser',
  'www-data',
  'guest',
  'pi',
  'nagios',
  'jenkins',
];

/** SSH key signature prefixes for successful logins */
const SSH_SIGNATURES = [
  'ECDSA SHA256:JqQKu6jCADkagPRwUPupkZOlIVqtYwik1/gsNVMajZA',
  'ECDSA SHA256:Xk3bT9GqPnOBjKrm2h4F5a7Zw8dR1eQ6Y0mC9vL3uI',
  'RSA SHA256:pB8wR4tZ1mK7jY3hF6dN0qX9sV2cA5eG8uL4iO7nW',
  'ED25519 SHA256:aM3nR7wK1pB9tZ4xF6dN0qX8sV2cA5eG7uL3iO6jY',
  'ECDSA SHA256:vH5kT2mR8wB4jY1pF9dN3qX7sV0cA6eG2uL5iO8nW',
];

/** SSH authentication methods for successful logins */
const SSH_AUTH_METHODS = ['publickey', 'publickey', 'publickey', 'password'];

/** Sudo commands for process events */
const SUDO_COMMANDS = [
  '/usr/bin/systemctl restart nginx',
  '/usr/bin/apt update',
  '/usr/bin/apt upgrade -y',
  '/usr/bin/journalctl -u sshd',
  '/usr/bin/tail -f /var/log/syslog',
  '/usr/bin/docker ps',
  '/usr/bin/docker logs',
  '/usr/sbin/service cron restart',
  '/usr/bin/cat /etc/shadow',
  '/usr/bin/netstat -tlnp',
  '/usr/bin/ss -tlnp',
  '/usr/bin/systemctl status',
  '/usr/bin/vim /etc/hosts',
  '/usr/bin/chmod 600 /etc/ssh/sshd_config',
];

/** Cron commands for process events */
const CRON_COMMANDS = [
  '/usr/bin/find /tmp -type f -mtime +7 -delete',
  '/usr/local/bin/backup.sh',
  '/usr/bin/logrotate /etc/logrotate.conf',
  '/opt/monitoring/check_health.sh',
  '/usr/bin/certbot renew --quiet',
  '/usr/local/bin/cleanup-docker.sh',
];

/** Syslog process names and their typical messages */
const SYSLOG_EVENTS: Array<{ process: string; messages: string[] }> = [
  {
    process: 'kernel',
    messages: [
      '[UFW BLOCK] IN=eth0 OUT= MAC=00:00:00:00:00:00 SRC={ip} DST={host_ip} LEN=40 TOS=0x00 PREC=0x00 TTL=244 ID=54321 PROTO=TCP SPT=45678 DPT=22 WINDOW=65535 RES=0x00 SYN URGP=0',
      'audit: type=1400 audit(1234567890.123:456): apparmor="ALLOWED" operation="open" profile="/usr/sbin/sshd" name="/proc/sys/kernel/ngroups_max"',
      'TCP: request_sock_TCP: Possible SYN flooding on port 22. Sending cookies.',
      '[UFW ALLOW] IN=eth0 OUT= MAC=00:00:00:00:00:00 SRC={ip} DST={host_ip} LEN=60 TOS=0x00 PREC=0x00 TTL=64 ID=12345 DF PROTO=TCP SPT=22 DPT=34567 WINDOW=65535 RES=0x00 ACK SYN URGP=0',
    ],
  },
  {
    process: 'systemd',
    messages: [
      'Started Session {session_id} of User {user}.',
      'Stopped Session {session_id} of User {user}.',
      'Created slice User Slice of UID {uid}.',
      'Starting Cleanup of Temporary Directories...',
      'Started Cleanup of Temporary Directories.',
      'Starting Daily apt download activities...',
      'Started Daily apt download activities.',
      'Reloading.',
    ],
  },
  {
    process: 'systemd-logind',
    messages: [
      'New session {session_id} of user {user}.',
      'Removed session {session_id}.',
      'Session {session_id} logged out. Waiting for processes to exit.',
    ],
  },
  {
    process: 'dhclient',
    messages: [
      'DHCPREQUEST for {host_ip} on eth0 to 169.254.169.254 port 67',
      'DHCPACK of {host_ip} from 169.254.169.254 (xid=0x{xid})',
      'bound to {host_ip} -- renewal in 1800 seconds.',
    ],
  },
  {
    process: 'apt-daily',
    messages: ['Checking for package updates...', 'Package lists updated successfully.'],
  },
  {
    process: 'cron',
    messages: [
      '(root) CMD (/usr/local/bin/backup.sh)',
      '(root) CMD (test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily ))',
      '({user}) CMD (/opt/monitoring/check_health.sh)',
    ],
  },
];

// ---------------------------------------------------------------------------
// Windows Security event log constants
// ---------------------------------------------------------------------------

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
  'Elastic2',
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

const WINDOWS_OS_VARIANTS = [
  {
    name: 'Windows Server 2022 Datacenter',
    version: '10.0',
    build: '20348.4052',
    kernel: '10.0.20348.4050 (WinBuild.160101.0800)',
  },
  {
    name: 'Windows Server 2019 Standard',
    version: '10.0',
    build: '17763.5329',
    kernel: '10.0.17763.5329 (WinBuild.160101.0800)',
  },
];

const WINDOWS_SYSTEM_PROCESSES: Array<{ executable: string; name: string }> = [
  { executable: String.raw`C:\Windows\System32\services.exe`, name: 'services.exe' },
  { executable: String.raw`C:\Windows\System32\lsass.exe`, name: 'lsass.exe' },
  { executable: String.raw`C:\Windows\System32\svchost.exe`, name: 'svchost.exe' },
];

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

/** Cloud service names by provider */
const CLOUD_SERVICES: Record<string, string> = {
  aws: 'EC2',
  gcp: 'GCE',
  azure: 'Virtual Machines',
};

/** Cloud machine types by provider */
const CLOUD_MACHINE_TYPES: Record<string, string[]> = {
  aws: ['t3.micro', 't3.small', 't3.medium', 'm5.large', 'm5.xlarge', 'c5.large'],
  gcp: ['e2-micro', 'e2-small', 'e2-medium', 'n2-standard-2', 'n2-standard-4'],
  azure: ['Standard_B1s', 'Standard_B2s', 'Standard_D2s_v3', 'Standard_D4s_v3'],
};

/** OS kernel versions */
const KERNEL_VERSIONS: Record<string, string[]> = {
  debian: ['5.15.0-1075-gcp', '5.15.0-1060-aws', '6.1.0-18-amd64', '6.8.0-1021-azure'],
  rhel: ['5.14.0-362.el9.x86_64', '5.14.0-284.el9.x86_64'],
  alpine: ['6.6.8-0-lts', '6.1.68-0-lts'],
};

/**
 * System Integration
 * Generates system.auth and system.syslog log documents for organization hosts
 */
export class SystemIntegration extends BaseIntegration {
  readonly packageName = 'system';
  readonly displayName = 'System Logs';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'auth',
      index: 'logs-system.auth-default',
    },
    {
      name: 'syslog',
      index: 'logs-system.syslog-default',
    },
    {
      name: 'security',
      index: 'logs-system.security-default',
    },
  ];

  /**
   * Generate all system log documents
   */
  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const authDocuments: IntegrationDocument[] = [];
    const syslogDocuments: IntegrationDocument[] = [];
    const securityDocuments: IntegrationDocument[] = [];

    // Use all hosts (they are all Linux-based)
    const hosts = org.hosts;

    // Get employees with SSH access (Product & Engineering + Operations)
    const sshEmployees = org.employees.filter(
      (e) =>
        e.department === 'Product & Engineering' ||
        e.department === 'Operations' ||
        e.department === 'Executive',
    );

    for (const host of hosts) {
      const hostContext = this.buildHostContext(host, org);

      // Generate auth documents
      authDocuments.push(...this.generateAuthDocuments(host, hostContext, sshEmployees));

      // Generate syslog documents
      syslogDocuments.push(...this.generateSyslogDocuments(host, hostContext, sshEmployees));
    }

    // Generate Windows security events from employee Windows devices
    const windowsDevices: Array<{ employee: Employee; device: Device }> = [];
    for (const employee of org.employees) {
      for (const device of employee.devices) {
        if (device.type === 'laptop' && device.platform === 'windows') {
          windowsDevices.push({ employee, device });
        }
      }
    }

    for (const { employee, device } of windowsDevices) {
      securityDocuments.push(
        ...this.generateWindowsSecurityDocuments(employee, device, org),
      );
    }

    const sortByTimestamp = (a: IntegrationDocument, b: IntegrationDocument) =>
      new Date(a['@timestamp']).getTime() - new Date(b['@timestamp']).getTime();

    authDocuments.sort(sortByTimestamp);
    syslogDocuments.sort(sortByTimestamp);
    securityDocuments.sort(sortByTimestamp);

    documentsMap.set(this.dataStreams[0].index, authDocuments);
    documentsMap.set(this.dataStreams[1].index, syslogDocuments);
    documentsMap.set(this.dataStreams[2].index, securityDocuments);

    return documentsMap;
  }

  // ---------------------------------------------------------------------------
  // Auth document generation
  // ---------------------------------------------------------------------------

  /**
   * Generate auth documents for a single host
   */
  private generateAuthDocuments(
    host: Host,
    hostContext: HostContext,
    sshEmployees: Employee[],
  ): IntegrationDocument[] {
    const documents: IntegrationDocument[] = [];

    // Failed SSH login attempts (brute force from attackers) - ~70% of auth events
    const failedCount = faker.number.int({ min: 3, max: 10 });
    for (let i = 0; i < failedCount; i++) {
      documents.push(this.createFailedSshLoginDocument(host, hostContext));
    }

    // Successful SSH logins from employees - ~30% of auth events
    const successCount = faker.number.int({ min: 1, max: 4 });
    for (let i = 0; i < successCount; i++) {
      const employee = faker.helpers.arrayElement(sshEmployees);
      documents.push(this.createSuccessfulSshLoginDocument(host, hostContext, employee));
    }

    // Session events (opened/closed)
    const sessionCount = faker.number.int({ min: 1, max: 3 });
    for (let i = 0; i < sessionCount; i++) {
      const employee = faker.helpers.arrayElement(sshEmployees);
      documents.push(this.createSessionEvent(host, hostContext, employee, 'opened'));
      // Most sessions also close
      if (faker.number.float() < 0.8) {
        documents.push(this.createSessionEvent(host, hostContext, employee, 'closed'));
      }
    }

    // Process events (sudo, cron)
    const processCount = faker.number.int({ min: 1, max: 3 });
    for (let i = 0; i < processCount; i++) {
      const employee = faker.helpers.arrayElement(sshEmployees);
      if (faker.number.float() < 0.6) {
        documents.push(this.createSudoEvent(host, hostContext, employee));
      } else {
        documents.push(this.createCronEvent(host, hostContext));
      }
    }

    return documents;
  }

  /**
   * Create a failed SSH login document (brute force attempt) - raw pre-pipeline format
   */
  private createFailedSshLoginDocument(host: Host, _ctx: HostContext): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const attackerIp = faker.helpers.arrayElement(ATTACKER_IPS);
    const bruteForceUser = faker.helpers.arrayElement(BRUTE_FORCE_USERNAMES);
    const procId = faker.number.int({ min: 1000, max: 9999999 });
    const port = faker.number.int({ min: 30000, max: 65535 });
    const logLine = `Invalid user ${bruteForceUser} from ${attackerIp} port ${port}`;
    const message = `${this.formatSyslogTimestamp(timestamp)} ${host.name} sshd[${procId}]: ${logLine}`;

    return {
      '@timestamp': timestamp,
      message,
      input: { type: 'log' },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.auth',
      },
    };
  }

  /**
   * Create a successful SSH login document (legitimate employee) - raw pre-pipeline format
   */
  private createSuccessfulSshLoginDocument(
    host: Host,
    _ctx: HostContext,
    employee: Employee,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const sourceIp = faker.internet.ipv4();
    const sourcePort = faker.number.int({ min: 30000, max: 65535 });
    const procId = faker.number.int({ min: 1000, max: 9999999 });
    const method = faker.helpers.arrayElement(SSH_AUTH_METHODS);
    const signature =
      method === 'publickey' ? faker.helpers.arrayElement(SSH_SIGNATURES) : undefined;
    const logLine = signature
      ? `Accepted ${method} for ${employee.userName} from ${sourceIp} port ${sourcePort} ssh2: ${signature}`
      : `Accepted ${method} for ${employee.userName} from ${sourceIp} port ${sourcePort}`;
    const message = `${this.formatSyslogTimestamp(timestamp)} ${host.name} sshd[${procId}]: ${logLine}`;

    return {
      '@timestamp': timestamp,
      message,
      input: { type: 'log' },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.auth',
      },
    };
  }

  /**
   * Create a session opened/closed event - raw pre-pipeline format
   */
  private createSessionEvent(
    host: Host,
    _ctx: HostContext,
    employee: Employee,
    action: 'opened' | 'closed',
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const processName = faker.helpers.arrayElement(['sshd', 'systemd-logind']);
    const procId = faker.number.int({ min: 1000, max: 9999999 });
    const sessionId = faker.number.int({ min: 1, max: 9999 });
    const logLine =
      action === 'opened'
        ? `New session ${sessionId} of user ${employee.userName}.`
        : `Removed session ${sessionId}.`;
    const message = `${this.formatSyslogTimestamp(timestamp)} ${host.name} ${processName}[${procId}]: ${logLine}`;

    return {
      '@timestamp': timestamp,
      message,
      input: { type: 'log' },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.auth',
      },
    };
  }

  /**
   * Create a sudo command event - raw pre-pipeline format
   */
  private createSudoEvent(host: Host, _ctx: HostContext, employee: Employee): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const command = faker.helpers.arrayElement(SUDO_COMMANDS);
    const procId = faker.number.int({ min: 1000, max: 9999999 });
    const logLine = `${employee.userName} : TTY=pts/0 ; PWD=/home/${employee.userName} ; USER=root ; COMMAND=${command}`;
    const message = `${this.formatSyslogTimestamp(timestamp)} ${host.name} sudo[${procId}]: ${logLine}`;

    return {
      '@timestamp': timestamp,
      message,
      input: { type: 'log' },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.auth',
      },
    };
  }

  /**
   * Create a cron job event - raw pre-pipeline format
   */
  private createCronEvent(host: Host, _ctx: HostContext): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const command = faker.helpers.arrayElement(CRON_COMMANDS);
    const procId = faker.number.int({ min: 1000, max: 9999999 });
    const cronUser = faker.helpers.arrayElement(['root', 'root', 'root', 'www-data']);
    const logLine = `(${cronUser}) CMD (${command})`;
    const message = `${this.formatSyslogTimestamp(timestamp)} ${host.name} CRON[${procId}]: ${logLine}`;

    return {
      '@timestamp': timestamp,
      message,
      input: { type: 'log' },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.auth',
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Windows Security event log generation (system.security)
  // ---------------------------------------------------------------------------

  private generateWindowsSecurityDocuments(
    employee: Employee,
    device: Device,
    org: Organization,
  ): IntegrationDocument[] {
    const documents: IntegrationDocument[] = [];
    const windowsHost = this.buildWindowsHostContext(employee, device, org);

    // Successful service logons (SYSTEM, NETWORK SERVICE, LOCAL SERVICE) — 4624
    const serviceLogonCount = faker.number.int({ min: 2, max: 5 });
    for (let i = 0; i < serviceLogonCount; i++) {
      documents.push(this.createWindowsSuccessLogonDocument(windowsHost, 'service'));
    }

    // Successful interactive / RDP logons from the employee — 4624
    const interactiveLogonCount = faker.number.int({ min: 1, max: 3 });
    for (let i = 0; i < interactiveLogonCount; i++) {
      documents.push(
        this.createWindowsSuccessLogonDocument(windowsHost, 'employee', employee),
      );
    }

    // Failed network logons (brute-force from external IPs) — 4625
    const failedLogonCount = faker.number.int({ min: 3, max: 12 });
    for (let i = 0; i < failedLogonCount; i++) {
      documents.push(this.createWindowsFailedLogonDocument(windowsHost));
    }

    // Logoff events — 4634
    const logoffCount = faker.number.int({ min: 1, max: 3 });
    for (let i = 0; i < logoffCount; i++) {
      documents.push(this.createWindowsLogoffDocument(windowsHost, employee));
    }

    // Explicit credential logons (RunAs / network share) — 4648
    if (faker.number.float() < 0.4) {
      const explicitCount = faker.number.int({ min: 1, max: 2 });
      for (let i = 0; i < explicitCount; i++) {
        documents.push(this.createWindowsExplicitLogonDocument(windowsHost, employee));
      }
    }

    // Credential validation (NTLM authentication at DC) — 4776
    const credValidateCount = faker.number.int({ min: 1, max: 3 });
    for (let i = 0; i < credValidateCount; i++) {
      documents.push(this.createWindowsCredentialValidatedDocument(windowsHost, employee));
    }

    return documents;
  }

  private createWindowsSuccessLogonDocument(
    ctx: WindowsHostContext,
    type: 'service' | 'employee',
    employee?: Employee,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const created = new Date(
      new Date(timestamp).getTime() + faker.number.int({ min: 1000, max: 3000 }),
    ).toISOString();

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
      const logonType = faker.helpers.arrayElement(['2', '10']);
      logonTypeKey = logonType;
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

    const logonType = WINDOWS_LOGON_TYPES[logonTypeKey] || 'Service';
    const proc = faker.helpers.arrayElement(WINDOWS_SYSTEM_PROCESSES);
    const authPackage = faker.helpers.arrayElement(WINDOWS_AUTH_PACKAGES);
    const logonProcess = faker.helpers.arrayElement(WINDOWS_LOGON_PROCESSES);
    const logonId = `0x${faker.string.hexadecimal({ length: 5, casing: 'lower', prefix: '' })}`;

    const message =
      `An account was successfully logged on.\n\nSubject:\n\tSecurity ID:\t\t${subjectUser.sid}\n\t` +
      `Account Name:\t\t${subjectUser.name}\n\tAccount Domain:\t\t${subjectUser.domain}\n\tLogon ID:\t\t0x3e7\n\n` +
      `Logon Information:\n\tLogon Type:\t\t${logonTypeKey}\n\t` +
      `New Logon:\n\tSecurity ID:\t\t${user.sid}\n\tAccount Name:\t\t${user.name}\n\t` +
      `Account Domain:\t\t${user.domain}\n\tLogon ID:\t\t${logonId}`;

    const relatedUsers = Array.from(new Set([user.name, subjectUser.name]));

    return {
      '@timestamp': timestamp,
      agent: {
        ephemeral_id: faker.string.uuid(),
        id: ctx.agentId,
        name: ctx.hostname,
        type: 'filebeat',
        version: ctx.agentVersion,
      },
      cloud: ctx.cloud,
      data_stream: { dataset: 'system.security', namespace: 'default', type: 'logs' },
      ecs: { version: '8.11.0' },
      elastic_agent: { id: ctx.agentId, snapshot: false, version: ctx.agentVersion },
      event: {
        action: 'logged-in',
        agent_id_status: 'verified',
        category: ['authentication'],
        code: '4624',
        created,
        dataset: 'system.security',
        ingested: new Date().toISOString(),
        kind: 'event',
        module: 'system',
        outcome: 'success',
        provider: 'Microsoft-Windows-Security-Auditing',
        type: ['start'],
      },
      host: ctx.host,
      input: { type: 'winlog' },
      log: { level: 'information' },
      message,
      process: { executable: proc.executable, name: proc.name, pid: faker.number.int({ min: 400, max: 8000 }) },
      related: { user: relatedUsers },
      user: { domain: user.domain, id: user.sid, name: user.name },
      winlog: {
        activity_id: `{${faker.string.uuid().toUpperCase()}}`,
        channel: 'Security',
        computer_name: ctx.hostname,
        event_data: {
          AuthenticationPackageName: authPackage,
          ElevatedToken: faker.helpers.arrayElement(['Yes', 'No']),
          ImpersonationLevel: 'Impersonation',
          KeyLength: '0',
          LogonProcessName: logonProcess,
          LogonType: logonTypeKey,
          SubjectDomainName: subjectUser.domain,
          SubjectLogonId: '0x3e7',
          SubjectUserName: subjectUser.name,
          SubjectUserSid: subjectUser.sid,
          TargetDomainName: user.domain,
          TargetLinkedLogonId: '0x0',
          TargetLogonId: logonId,
          TargetUserName: user.name,
          TargetUserSid: user.sid,
          VirtualAccount: 'No',
        },
        event_id: '4624',
        keywords: ['Audit Success'],
        logon: { id: logonId, type: logonType },
        opcode: 'Info',
        process: {
          pid: faker.number.int({ min: 600, max: 900 }),
          thread: { id: faker.number.int({ min: 1000, max: 9999 }) },
        },
        provider_guid: '{54849625-5478-4994-A5BA-3E3B0328C30D}',
        provider_name: 'Microsoft-Windows-Security-Auditing',
        record_id: faker.string.numeric(7),
        task: 'Logon',
        version: 2,
      },
    } as IntegrationDocument;
  }

  private createWindowsFailedLogonDocument(ctx: WindowsHostContext): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const created = new Date(
      new Date(timestamp).getTime() + faker.number.int({ min: 1000, max: 3000 }),
    ).toISOString();

    const attackerIp = faker.helpers.arrayElement(ATTACKER_IPS);
    const bruteForceUser = faker.helpers.arrayElement(WINDOWS_BRUTE_FORCE_USERNAMES);
    const failureInfo = faker.helpers.arrayElement(WINDOWS_FAILURE_REASONS);
    const sourcePort = faker.number.int({ min: 30000, max: 65535 });

    const message =
      `An account failed to log on.\n\nSubject:\n\tSecurity ID:\t\tS-1-0-0\n\t` +
      `Account Name:\t\t-\n\tAccount Domain:\t\t-\n\tLogon ID:\t\t0x0\n\n` +
      `Logon Type:\t\t\t3\n\n` +
      `Account For Which Logon Failed:\n\tSecurity ID:\t\tS-1-0-0\n\t` +
      `Account Name:\t\t${bruteForceUser}\n\tAccount Domain:\t\t\n\n` +
      `Failure Information:\n\tFailure Reason:\t\t${failureInfo.reason}\n\t` +
      `Status:\t\t\t${failureInfo.status}\n\tSub Status:\t\t${failureInfo.subStatus}`;

    return {
      '@timestamp': timestamp,
      agent: {
        ephemeral_id: faker.string.uuid(),
        id: ctx.agentId,
        name: ctx.hostname,
        type: 'filebeat',
        version: ctx.agentVersion,
      },
      cloud: ctx.cloud,
      data_stream: { dataset: 'system.security', namespace: 'default', type: 'logs' },
      ecs: { version: '8.11.0' },
      elastic_agent: { id: ctx.agentId, snapshot: false, version: ctx.agentVersion },
      event: {
        action: 'logon-failed',
        agent_id_status: 'verified',
        category: ['authentication'],
        code: '4625',
        created,
        dataset: 'system.security',
        ingested: new Date().toISOString(),
        kind: 'event',
        module: 'system',
        outcome: 'failure',
        provider: 'Microsoft-Windows-Security-Auditing',
        type: ['start'],
      },
      host: ctx.host,
      input: { type: 'winlog' },
      log: { level: 'information' },
      message,
      process: { pid: 0 },
      related: { ip: [attackerIp], user: [bruteForceUser] },
      source: { ip: attackerIp, port: sourcePort },
      user: { id: 'S-1-0-0', name: bruteForceUser },
      winlog: {
        activity_id: `{${faker.string.uuid().toUpperCase()}}`,
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
        logon: {
          failure: {
            reason: failureInfo.reason,
            status: WINDOWS_LOGON_FAILURE_STATUS_DESCRIPTIONS[failureInfo.status] || failureInfo.reason,
            sub_status: WINDOWS_LOGON_FAILURE_SUBSTATUS_DESCRIPTIONS[failureInfo.subStatus] || failureInfo.subStatus,
          },
          id: '0x0',
          type: 'Network',
        },
        opcode: 'Info',
        process: {
          pid: faker.number.int({ min: 600, max: 900 }),
          thread: { id: faker.number.int({ min: 1000, max: 9999 }) },
        },
        provider_guid: '{54849625-5478-4994-A5BA-3E3B0328C30D}',
        provider_name: 'Microsoft-Windows-Security-Auditing',
        record_id: faker.string.numeric(7),
        task: 'Logon',
      },
    } as IntegrationDocument;
  }

  private createWindowsLogoffDocument(
    ctx: WindowsHostContext,
    employee: Employee,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const created = new Date(
      new Date(timestamp).getTime() + faker.number.int({ min: 1000, max: 3000 }),
    ).toISOString();

    const isServiceLogoff = faker.number.float() < 0.5;
    const user = isServiceLogoff
      ? faker.helpers.arrayElement(WINDOWS_SERVICE_USERS)
      : { name: employee.userName, domain: employee.userName.split('.')[0].toUpperCase(), sid: employee.windowsSid };
    const logonTypeKey = isServiceLogoff ? '5' : faker.helpers.arrayElement(['2', '3', '10']);
    const logonType = WINDOWS_LOGON_TYPES[logonTypeKey] || 'Interactive';
    const logonId = `0x${faker.string.hexadecimal({ length: 5, casing: 'lower', prefix: '' })}`;

    const message =
      `An account was logged off.\n\nSubject:\n\tSecurity ID:\t\t${user.sid}\n\t` +
      `Account Name:\t\t${user.name}\n\tAccount Domain:\t\t${user.domain}\n\t` +
      `Logon ID:\t\t${logonId}\n\nLogon Type:\t\t\t${logonTypeKey}`;

    return {
      '@timestamp': timestamp,
      agent: {
        ephemeral_id: faker.string.uuid(),
        id: ctx.agentId,
        name: ctx.hostname,
        type: 'filebeat',
        version: ctx.agentVersion,
      },
      cloud: ctx.cloud,
      data_stream: { dataset: 'system.security', namespace: 'default', type: 'logs' },
      ecs: { version: '8.11.0' },
      elastic_agent: { id: ctx.agentId, snapshot: false, version: ctx.agentVersion },
      event: {
        action: 'logged-out',
        agent_id_status: 'verified',
        category: ['authentication'],
        code: '4634',
        created,
        dataset: 'system.security',
        ingested: new Date().toISOString(),
        kind: 'event',
        module: 'system',
        outcome: 'success',
        provider: 'Microsoft-Windows-Security-Auditing',
        type: ['end'],
      },
      host: ctx.host,
      input: { type: 'winlog' },
      log: { level: 'information' },
      message,
      process: { pid: faker.number.int({ min: 400, max: 8000 }) },
      related: { user: [user.name] },
      user: { domain: user.domain, id: user.sid, name: user.name },
      winlog: {
        activity_id: `{${faker.string.uuid().toUpperCase()}}`,
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
        logon: { id: logonId, type: logonType },
        opcode: 'Info',
        process: {
          pid: faker.number.int({ min: 600, max: 900 }),
          thread: { id: faker.number.int({ min: 1000, max: 9999 }) },
        },
        provider_guid: '{54849625-5478-4994-A5BA-3E3B0328C30D}',
        provider_name: 'Microsoft-Windows-Security-Auditing',
        record_id: faker.string.numeric(7),
        task: 'Logoff',
        version: 0,
      },
    } as IntegrationDocument;
  }

  private createWindowsExplicitLogonDocument(
    ctx: WindowsHostContext,
    employee: Employee,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const created = new Date(
      new Date(timestamp).getTime() + faker.number.int({ min: 1000, max: 3000 }),
    ).toISOString();

    const subjectUser = {
      name: employee.userName,
      domain: employee.userName.split('.')[0].toUpperCase(),
      sid: employee.windowsSid,
    };
    const targetUser = faker.helpers.weightedArrayElement([
      { value: { name: 'Administrator', domain: ctx.hostname.toUpperCase(), sid: 'S-1-5-21-0-0-0-500' }, weight: 3 },
      { value: faker.helpers.arrayElement(WINDOWS_SERVICE_USERS), weight: 2 },
    ]);
    const subjectLogonId = `0x${faker.string.hexadecimal({ length: 5, casing: 'lower', prefix: '' })}`;
    const targetServer = faker.helpers.arrayElement([ctx.hostname, 'localhost', faker.internet.domainWord()]);
    const proc = faker.helpers.arrayElement(WINDOWS_SYSTEM_PROCESSES);

    const message =
      `A logon was attempted using explicit credentials.\n\nSubject:\n\tSecurity ID:\t\t${subjectUser.sid}\n\t` +
      `Account Name:\t\t${subjectUser.name}\n\tAccount Domain:\t\t${subjectUser.domain}\n\t` +
      `Logon ID:\t\t${subjectLogonId}\n\n` +
      `Account Whose Credentials Were Used:\n\tAccount Name:\t\t${targetUser.name}\n\t` +
      `Account Domain:\t\t${targetUser.domain}\n\n` +
      `Target Server:\n\tTarget Server Name:\t${targetServer}`;

    const relatedUsers = Array.from(new Set([subjectUser.name, targetUser.name]));

    return {
      '@timestamp': timestamp,
      agent: {
        ephemeral_id: faker.string.uuid(),
        id: ctx.agentId,
        name: ctx.hostname,
        type: 'filebeat',
        version: ctx.agentVersion,
      },
      cloud: ctx.cloud,
      data_stream: { dataset: 'system.security', namespace: 'default', type: 'logs' },
      ecs: { version: '8.11.0' },
      elastic_agent: { id: ctx.agentId, snapshot: false, version: ctx.agentVersion },
      event: {
        action: 'logged-in-explicit',
        agent_id_status: 'verified',
        category: ['authentication'],
        code: '4648',
        created,
        dataset: 'system.security',
        ingested: new Date().toISOString(),
        kind: 'event',
        module: 'system',
        outcome: 'success',
        provider: 'Microsoft-Windows-Security-Auditing',
        type: ['start'],
      },
      host: ctx.host,
      input: { type: 'winlog' },
      log: { level: 'information' },
      message,
      process: { executable: proc.executable, name: proc.name, pid: faker.number.int({ min: 400, max: 8000 }) },
      related: { user: relatedUsers },
      user: {
        domain: subjectUser.domain,
        id: subjectUser.sid,
        name: subjectUser.name,
        target: { domain: targetUser.domain, id: targetUser.sid, name: targetUser.name },
      },
      winlog: {
        activity_id: `{${faker.string.uuid().toUpperCase()}}`,
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
        opcode: 'Info',
        process: {
          pid: faker.number.int({ min: 600, max: 900 }),
          thread: { id: faker.number.int({ min: 1000, max: 9999 }) },
        },
        provider_guid: '{54849625-5478-4994-A5BA-3E3B0328C30D}',
        provider_name: 'Microsoft-Windows-Security-Auditing',
        record_id: faker.string.numeric(7),
        task: 'Logon',
        version: 0,
      },
    } as IntegrationDocument;
  }

  private createWindowsCredentialValidatedDocument(
    ctx: WindowsHostContext,
    employee: Employee,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const created = new Date(
      new Date(timestamp).getTime() + faker.number.int({ min: 1000, max: 3000 }),
    ).toISOString();

    const isFailure = faker.number.float() < 0.15;
    const isAttacker = isFailure && faker.number.float() < 0.7;

    const userName = isAttacker
      ? faker.helpers.arrayElement(WINDOWS_BRUTE_FORCE_USERNAMES)
      : employee.userName;
    const errorCode = isFailure ? '0xC0000064' : '0x0';
    const outcome = isFailure ? 'failure' : 'success';

    const message = isFailure
      ? `The domain controller failed to validate the credentials for an account.\n\n` +
        `Authentication Package:\tMICROSOFT_AUTHENTICATION_PACKAGE_V1_0\n` +
        `Logon Account:\t${userName}\n` +
        `Source Workstation:\t${ctx.hostname}\n` +
        `Error Code:\t${errorCode}`
      : `The domain controller attempted to validate the credentials for an account.\n\n` +
        `Authentication Package:\tMICROSOFT_AUTHENTICATION_PACKAGE_V1_0\n` +
        `Logon Account:\t${userName}\n` +
        `Source Workstation:\t${ctx.hostname}\n` +
        `Error Code:\t${errorCode}`;

    return {
      '@timestamp': timestamp,
      agent: {
        ephemeral_id: faker.string.uuid(),
        id: ctx.agentId,
        name: ctx.hostname,
        type: 'filebeat',
        version: ctx.agentVersion,
      },
      cloud: ctx.cloud,
      data_stream: { dataset: 'system.security', namespace: 'default', type: 'logs' },
      ecs: { version: '8.11.0' },
      elastic_agent: { id: ctx.agentId, snapshot: false, version: ctx.agentVersion },
      event: {
        action: 'credential-validated',
        agent_id_status: 'verified',
        category: ['authentication'],
        code: '4776',
        created,
        dataset: 'system.security',
        ingested: new Date().toISOString(),
        kind: 'event',
        module: 'system',
        outcome,
        provider: 'Microsoft-Windows-Security-Auditing',
        type: ['info'],
      },
      host: ctx.host,
      input: { type: 'winlog' },
      log: { level: 'information' },
      message,
      related: { user: [userName] },
      user: { name: userName },
      winlog: {
        activity_id: `{${faker.string.uuid().toUpperCase()}}`,
        channel: 'Security',
        computer_name: ctx.hostname,
        event_data: {
          PackageName: 'MICROSOFT_AUTHENTICATION_PACKAGE_V1_0',
          Status: errorCode,
          TargetUserName: userName,
          Workstation: ctx.hostname,
        },
        event_id: '4776',
        keywords: [isFailure ? 'Audit Failure' : 'Audit Success'],
        opcode: 'Info',
        process: {
          pid: faker.number.int({ min: 600, max: 900 }),
          thread: { id: faker.number.int({ min: 1000, max: 9999 }) },
        },
        provider_guid: '{54849625-5478-4994-A5BA-3E3B0328C30D}',
        provider_name: 'Microsoft-Windows-Security-Auditing',
        record_id: faker.string.numeric(7),
        task: 'Credential Validation',
        version: 0,
      },
    } as IntegrationDocument;
  }

  private buildWindowsHostContext(
    employee: Employee,
    device: Device,
    org: Organization,
  ): WindowsHostContext {
    const agentId = faker.string.uuid();
    const hostname = `${employee.userName}-windows`;
    const os = faker.helpers.arrayElement(WINDOWS_OS_VARIANTS);
    const hostIp = device.ipAddress;
    const hostIpv6 = `fe80::${faker.string.hexadecimal({ length: 4, prefix: '' })}:${faker.string.hexadecimal({ length: 4, prefix: '' })}:${faker.string.hexadecimal({ length: 4, prefix: '' })}:${faker.string.hexadecimal({ length: 4, prefix: '' })}`;

    const cloudAccount = org.cloudAccounts[0];
    const accountId = cloudAccount?.id || faker.string.uuid();
    const provider = cloudAccount?.provider || 'gcp';

    return {
      agentId,
      agentVersion: '9.0.3',
      hostname,
      host: {
        architecture: 'x86_64',
        hostname,
        id: device.id,
        ip: [hostIp, hostIpv6],
        mac: [device.macAddress],
        name: hostname,
        os: {
          build: os.build,
          family: 'windows',
          kernel: os.kernel,
          name: os.name,
          platform: 'windows',
          type: 'windows',
          version: os.version,
        },
      },
      cloud: {
        account: { id: accountId },
        availability_zone: `us-central1-${faker.helpers.arrayElement(['a', 'b', 'c', 'f'])}`,
        instance: { id: faker.string.numeric(19), name: hostname },
        machine: { type: faker.helpers.arrayElement(['e2-standard-4', 'n1-standard-2']) },
        project: { id: accountId },
        provider,
        region: 'us-central1',
        service: { name: CLOUD_SERVICES[provider] || 'Compute' },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Syslog document generation
  // ---------------------------------------------------------------------------

  /**
   * Generate syslog documents for a single host
   */
  private generateSyslogDocuments(
    host: Host,
    ctx: HostContext,
    sshEmployees: Employee[],
  ): IntegrationDocument[] {
    const documents: IntegrationDocument[] = [];
    const eventCount = faker.number.int({ min: 3, max: 8 });

    for (let i = 0; i < eventCount; i++) {
      const syslogEvent = faker.helpers.arrayElement(SYSLOG_EVENTS);
      const message = this.buildSyslogMessage(
        faker.helpers.arrayElement(syslogEvent.messages),
        host,
        ctx,
        sshEmployees,
      );

      documents.push(this.createSyslogDocument(host, ctx, syslogEvent.process, message));
    }

    return documents;
  }

  /**
   * Create a syslog document - raw pre-pipeline format
   */
  private createSyslogDocument(
    host: Host,
    _ctx: HostContext,
    processName: string,
    logMessage: string,
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const procId = faker.number.int({ min: 1, max: 9999999 });
    const message = `${this.formatSyslogTimestamp(timestamp)} ${host.name} ${processName}[${procId}]: ${logMessage}`;

    return {
      '@timestamp': timestamp,
      message,
      input: { type: 'log' },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.syslog',
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helper methods
  // ---------------------------------------------------------------------------

  /**
   * Build host context from an organization host (reused across all documents for that host)
   */
  private buildHostContext(host: Host, org: Organization): HostContext {
    const agentId = faker.string.uuid();
    const hostId = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase();
    const hostIp = `10.${faker.number.int({ min: 0, max: 255 })}.${faker.number.int({ min: 0, max: 255 })}.${faker.number.int({ min: 1, max: 254 })}`;
    const hostIpv6 = `fe80::${faker.string.hexadecimal({ length: 4, prefix: '' })}:${faker.string.hexadecimal({ length: 4, prefix: '' })}:${faker.string.hexadecimal({ length: 4, prefix: '' })}:${faker.string.hexadecimal({ length: 4, prefix: '' })}`;
    const mac = `${faker.string.hexadecimal({ length: 2, prefix: '' }).toUpperCase()}-${faker.string.hexadecimal({ length: 2, prefix: '' }).toUpperCase()}-${faker.string.hexadecimal({ length: 2, prefix: '' }).toUpperCase()}-${faker.string.hexadecimal({ length: 2, prefix: '' }).toUpperCase()}-${faker.string.hexadecimal({ length: 2, prefix: '' }).toUpperCase()}-${faker.string.hexadecimal({ length: 2, prefix: '' }).toUpperCase()}`;

    const kernelFamily = host.os.family as string;
    const kernelVersions = KERNEL_VERSIONS[kernelFamily] || KERNEL_VERSIONS['debian'];
    const kernelVersion = faker.helpers.arrayElement(kernelVersions);

    // Map OS family to codename
    const codenames: Record<string, string[]> = {
      debian: ['focal', 'jammy', 'noble', 'bookworm'],
      rhel: ['Blue Onyx', 'Plow'],
      alpine: [''],
    };
    const codename = faker.helpers.arrayElement(codenames[kernelFamily] || ['']);

    // Build cloud account from org
    const cloudAccount = org.cloudAccounts.find((a) => a.provider === host.cloudProvider);
    const accountId = cloudAccount?.id || faker.string.uuid();

    const machineTypes = CLOUD_MACHINE_TYPES[host.cloudProvider] || ['t3.micro'];
    const machineType = faker.helpers.arrayElement(machineTypes);

    return {
      agentId,
      hostIp,
      host: {
        hostname: host.name,
        os: {
          kernel: kernelVersion,
          codename: codename || undefined,
          name: host.os.name,
          type: 'linux',
          family: host.os.family,
          version: `${host.os.version}${codename ? ` (${codename.charAt(0).toUpperCase() + codename.slice(1)})` : ''}`,
          platform: host.os.name.toLowerCase().replace(/\s+/g, ''),
        },
        containerized: host.type === 'container',
        ip: [hostIp, hostIpv6],
        name: host.name,
        id: hostId,
        mac: [mac],
        architecture: 'x86_64',
      },
      cloud: {
        availability_zone: `${host.region}${faker.helpers.arrayElement(['a', 'b', 'c'])}`,
        instance: {
          name: host.name,
          id: faker.string.numeric(18),
        },
        provider: host.cloudProvider,
        service: {
          name: CLOUD_SERVICES[host.cloudProvider] || 'Compute',
        },
        machine: {
          type: machineType,
        },
        region: host.region,
        account: {
          id: accountId,
        },
      },
    };
  }

  /**
   * Build a syslog message by replacing template variables
   */
  private buildSyslogMessage(
    template: string,
    host: Host,
    ctx: HostContext,
    sshEmployees: Employee[],
  ): string {
    const employee = faker.helpers.arrayElement(sshEmployees);
    return template
      .replace(/\{ip\}/g, faker.helpers.arrayElement(ATTACKER_IPS))
      .replace(/\{host_ip\}/g, ctx.hostIp)
      .replace(/\{user\}/g, employee.userName)
      .replace(/\{session_id\}/g, String(faker.number.int({ min: 1, max: 9999 })))
      .replace(/\{uid\}/g, String(faker.number.int({ min: 1000, max: 65534 })))
      .replace(/\{xid\}/g, faker.string.hexadecimal({ length: 8, prefix: '' }).toLowerCase());
  }

  private formatSyslogTimestamp(timestamp: string): string {
    const d = new Date(timestamp);
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
    const month = months[d.getUTCMonth()];
    const day = String(d.getUTCDate()).padStart(2, ' ');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${month} ${day} ${hh}:${mm}:${ss}`;
  }
}

/**
 * Host context built once per host and reused across all documents
 */
interface HostContext {
  agentId: string;
  hostIp: string;
  host: Record<string, unknown>;
  cloud: Record<string, unknown>;
}

/**
 * Windows host context built once per employee Windows device
 */
interface WindowsHostContext {
  agentId: string;
  agentVersion: string;
  hostname: string;
  host: Record<string, unknown>;
  cloud: Record<string, unknown>;
}
