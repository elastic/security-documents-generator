/**
 * System Integration (system.auth + system.syslog)
 * Generates authentication, session, process, and syslog documents for Linux hosts
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Host, Employee, CorrelationMap } from '../types';
import { ATTACKER_IPS } from '../data/network_data';
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

/** Attacker geo/AS info for failed SSH attempts */
const ATTACKER_GEO_INFO = [
  {
    geo: {
      continent_name: 'Europe',
      country_iso_code: 'NL',
      country_name: 'Netherlands',
      region_name: 'North Holland',
      city_name: 'Amsterdam',
      location: { lat: 52.352, lon: 4.9392 },
    },
    as: { number: 14061, organization: { name: 'DigitalOcean, LLC' } },
  },
  {
    geo: {
      continent_name: 'Europe',
      country_iso_code: 'DE',
      country_name: 'Germany',
      region_name: 'Hesse',
      city_name: 'Frankfurt',
      location: { lat: 50.1109, lon: 8.6821 },
    },
    as: { number: 24940, organization: { name: 'Hetzner Online GmbH' } },
  },
  {
    geo: {
      continent_name: 'Asia',
      country_iso_code: 'CN',
      country_name: 'China',
      region_name: 'Beijing',
      city_name: 'Beijing',
      location: { lat: 39.9042, lon: 116.4074 },
    },
    as: { number: 4134, organization: { name: 'CHINANET-BACKBONE' } },
  },
  {
    geo: {
      continent_name: 'Europe',
      country_iso_code: 'RU',
      country_name: 'Russia',
      region_name: 'Moscow',
      city_name: 'Moscow',
      location: { lat: 55.7558, lon: 37.6173 },
    },
    as: { number: 49505, organization: { name: 'OOO Network of data-centers Selectel' } },
  },
  {
    geo: {
      continent_name: 'South America',
      country_iso_code: 'BR',
      country_name: 'Brazil',
      region_name: 'Sao Paulo',
      city_name: 'Sao Paulo',
      location: { lat: -23.5505, lon: -46.6333 },
    },
    as: { number: 16509, organization: { name: 'Amazon.com, Inc.' } },
  },
  {
    geo: {
      continent_name: 'North America',
      country_iso_code: 'US',
      country_name: 'United States',
      region_name: 'Virginia',
      city_name: 'Ashburn',
      location: { lat: 39.0438, lon: -77.4874 },
    },
    as: { number: 396982, organization: { name: 'GOOGLE-CLOUD-PLATFORM' } },
  },
];

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
  ];

  /**
   * Generate all system log documents
   */
  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const authDocuments: IntegrationDocument[] = [];
    const syslogDocuments: IntegrationDocument[] = [];

    // Use all hosts (they are all Linux-based)
    const hosts = org.hosts;

    // Get employees with SSH access (Product & Engineering + Operations)
    const sshEmployees = org.employees.filter(
      (e) =>
        e.department === 'Product & Engineering' ||
        e.department === 'Operations' ||
        e.department === 'Executive'
    );

    for (const host of hosts) {
      const hostContext = this.buildHostContext(host, org);

      // Generate auth documents
      authDocuments.push(...this.generateAuthDocuments(host, hostContext, sshEmployees));

      // Generate syslog documents
      syslogDocuments.push(...this.generateSyslogDocuments(host, hostContext, sshEmployees));
    }

    // Sort by timestamp
    authDocuments.sort(
      (a, b) => new Date(a['@timestamp']).getTime() - new Date(b['@timestamp']).getTime()
    );
    syslogDocuments.sort(
      (a, b) => new Date(a['@timestamp']).getTime() - new Date(b['@timestamp']).getTime()
    );

    documentsMap.set(this.dataStreams[0].index, authDocuments);
    documentsMap.set(this.dataStreams[1].index, syslogDocuments);

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
    sshEmployees: Employee[]
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
   * Create a failed SSH login document (brute force attempt)
   */
  private createFailedSshLoginDocument(host: Host, ctx: HostContext): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const attackerIp = faker.helpers.arrayElement(ATTACKER_IPS);
    const attackerGeo = faker.helpers.arrayElement(ATTACKER_GEO_INFO);
    const bruteForceUser = faker.helpers.arrayElement(BRUTE_FORCE_USERNAMES);
    const procId = String(faker.number.int({ min: 1000, max: 9999999 }));
    const offset = faker.number.int({ min: 100000, max: 9999999 });

    return {
      '@timestamp': timestamp,
      agent: {
        name: host.name,
        id: ctx.agentId,
        ephemeral_id: faker.string.uuid(),
        type: 'filebeat',
        version: '8.17.2',
      },
      process: {
        name: 'sshd',
      },
      log: {
        file: {
          path: '/var/log/auth.log',
        },
        offset,
        syslog: {
          hostname: host.name,
          appname: 'sshd',
          procid: procId,
        },
      },
      elastic_agent: {
        id: ctx.agentId,
        version: '8.17.2',
        snapshot: false,
      },
      source: {
        geo: attackerGeo.geo,
        as: attackerGeo.as,
        address: attackerIp,
        ip: attackerIp,
      },
      tags: ['system-auth'],
      cloud: ctx.cloud,
      input: {
        type: 'log',
      },
      system: {
        auth: {
          ssh: {
            event: 'Invalid',
          },
        },
      },
      ecs: {
        version: '8.11.0',
      },
      related: {
        hosts: [host.name],
        ip: [attackerIp],
        user: [bruteForceUser],
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.auth',
      },
      host: ctx.host,
      event: {
        agent_id_status: 'verified',
        ingested: new Date().toISOString(),
        timezone: '+00:00',
        kind: 'event',
        action: 'ssh_login',
        type: ['info'],
        category: ['authentication'],
        dataset: 'system.auth',
        outcome: 'failure',
      },
      user: {
        name: bruteForceUser,
      },
    };
  }

  /**
   * Create a successful SSH login document (legitimate employee)
   */
  private createSuccessfulSshLoginDocument(
    host: Host,
    ctx: HostContext,
    employee: Employee
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const sourceIp = faker.internet.ipv4();
    const sourcePort = faker.number.int({ min: 30000, max: 65535 });
    const procId = String(faker.number.int({ min: 1000, max: 9999999 }));
    const offset = faker.number.int({ min: 100000, max: 9999999 });
    const method = faker.helpers.arrayElement(SSH_AUTH_METHODS);
    const signature =
      method === 'publickey' ? faker.helpers.arrayElement(SSH_SIGNATURES) : undefined;

    const successGeo = faker.helpers.arrayElement(
      ATTACKER_GEO_INFO.filter((g) => g.geo.country_iso_code === 'US').length > 0
        ? ATTACKER_GEO_INFO.filter((g) => g.geo.country_iso_code === 'US')
        : [ATTACKER_GEO_INFO[5]]
    );

    return {
      '@timestamp': timestamp,
      agent: {
        name: host.name,
        id: ctx.agentId,
        ephemeral_id: faker.string.uuid(),
        type: 'filebeat',
        version: '8.17.2',
      },
      process: {
        name: 'sshd',
      },
      log: {
        file: {
          path: '/var/log/auth.log',
        },
        offset,
        syslog: {
          hostname: host.name,
          appname: 'sshd',
          procid: procId,
        },
      },
      elastic_agent: {
        id: ctx.agentId,
        version: '8.17.2',
        snapshot: false,
      },
      source: {
        geo: successGeo.geo,
        as: successGeo.as,
        address: sourceIp,
        port: sourcePort,
        ip: sourceIp,
      },
      tags: ['system-auth'],
      cloud: ctx.cloud,
      input: {
        type: 'log',
      },
      system: {
        auth: {
          ssh: {
            method,
            ...(signature ? { signature } : {}),
            event: 'Accepted',
          },
        },
      },
      ecs: {
        version: '8.11.0',
      },
      related: {
        hosts: [host.name],
        ip: [sourceIp],
        user: [employee.userName],
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.auth',
      },
      host: ctx.host,
      event: {
        agent_id_status: 'verified',
        ingested: new Date().toISOString(),
        timezone: '+00:00',
        kind: 'event',
        action: 'ssh_login',
        type: ['info'],
        category: ['authentication', 'session'],
        dataset: 'system.auth',
        outcome: 'success',
      },
      user: {
        name: employee.userName,
      },
    };
  }

  /**
   * Create a session opened/closed event
   */
  private createSessionEvent(
    host: Host,
    ctx: HostContext,
    employee: Employee,
    action: 'opened' | 'closed'
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const processName = faker.helpers.arrayElement(['sshd', 'systemd-logind']);
    const procId = String(faker.number.int({ min: 1000, max: 9999999 }));
    const offset = faker.number.int({ min: 100000, max: 9999999 });

    return {
      '@timestamp': timestamp,
      agent: {
        name: host.name,
        id: ctx.agentId,
        ephemeral_id: faker.string.uuid(),
        type: 'filebeat',
        version: '8.17.2',
      },
      process: {
        name: processName,
      },
      log: {
        file: {
          path: '/var/log/auth.log',
        },
        offset,
        syslog: {
          hostname: host.name,
          appname: processName,
          procid: procId,
        },
      },
      elastic_agent: {
        id: ctx.agentId,
        version: '8.17.2',
        snapshot: false,
      },
      tags: ['system-auth'],
      cloud: ctx.cloud,
      input: {
        type: 'log',
      },
      ecs: {
        version: '8.11.0',
      },
      related: {
        hosts: [host.name],
        user: [employee.userName],
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.auth',
      },
      host: ctx.host,
      event: {
        agent_id_status: 'verified',
        ingested: new Date().toISOString(),
        timezone: '+00:00',
        kind: 'event',
        action: action,
        type: ['info'],
        category: ['session'],
        dataset: 'system.auth',
        outcome: 'success',
      },
      user: {
        name: employee.userName,
      },
    };
  }

  /**
   * Create a sudo command event
   */
  private createSudoEvent(host: Host, ctx: HostContext, employee: Employee): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const command = faker.helpers.arrayElement(SUDO_COMMANDS);
    const procId = String(faker.number.int({ min: 1000, max: 9999999 }));
    const offset = faker.number.int({ min: 100000, max: 9999999 });

    return {
      '@timestamp': timestamp,
      agent: {
        name: host.name,
        id: ctx.agentId,
        ephemeral_id: faker.string.uuid(),
        type: 'filebeat',
        version: '8.17.2',
      },
      process: {
        name: 'sudo',
      },
      log: {
        file: {
          path: '/var/log/auth.log',
        },
        offset,
        syslog: {
          hostname: host.name,
          appname: 'sudo',
          procid: procId,
        },
      },
      elastic_agent: {
        id: ctx.agentId,
        version: '8.17.2',
        snapshot: false,
      },
      message: `${employee.userName} : TTY=pts/0 ; PWD=/home/${employee.userName} ; USER=root ; COMMAND=${command}`,
      tags: ['system-auth'],
      cloud: ctx.cloud,
      input: {
        type: 'log',
      },
      ecs: {
        version: '8.11.0',
      },
      related: {
        hosts: [host.name],
        user: [employee.userName, 'root'],
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.auth',
      },
      host: ctx.host,
      event: {
        agent_id_status: 'verified',
        ingested: new Date().toISOString(),
        timezone: '+00:00',
        kind: 'event',
        action: 'ran-command',
        type: ['info'],
        category: ['process'],
        dataset: 'system.auth',
        outcome: 'success',
      },
      user: {
        name: employee.userName,
        effective: {
          name: 'root',
        },
      },
    };
  }

  /**
   * Create a cron job event
   */
  private createCronEvent(host: Host, ctx: HostContext): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const command = faker.helpers.arrayElement(CRON_COMMANDS);
    const procId = String(faker.number.int({ min: 1000, max: 9999999 }));
    const offset = faker.number.int({ min: 100000, max: 9999999 });
    const cronUser = faker.helpers.arrayElement(['root', 'root', 'root', 'www-data']);

    return {
      '@timestamp': timestamp,
      agent: {
        name: host.name,
        id: ctx.agentId,
        ephemeral_id: faker.string.uuid(),
        type: 'filebeat',
        version: '8.17.2',
      },
      process: {
        name: 'CRON',
      },
      log: {
        file: {
          path: '/var/log/auth.log',
        },
        offset,
        syslog: {
          hostname: host.name,
          appname: 'CRON',
          procid: procId,
        },
      },
      elastic_agent: {
        id: ctx.agentId,
        version: '8.17.2',
        snapshot: false,
      },
      message: `(${cronUser}) CMD (${command})`,
      tags: ['system-auth'],
      cloud: ctx.cloud,
      input: {
        type: 'log',
      },
      ecs: {
        version: '8.11.0',
      },
      related: {
        hosts: [host.name],
        user: [cronUser],
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.auth',
      },
      host: ctx.host,
      event: {
        agent_id_status: 'verified',
        ingested: new Date().toISOString(),
        timezone: '+00:00',
        kind: 'event',
        action: 'ran-command',
        type: ['info'],
        category: ['process'],
        dataset: 'system.auth',
        outcome: 'success',
      },
      user: {
        name: cronUser,
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
    sshEmployees: Employee[]
  ): IntegrationDocument[] {
    const documents: IntegrationDocument[] = [];
    const eventCount = faker.number.int({ min: 3, max: 8 });

    for (let i = 0; i < eventCount; i++) {
      const syslogEvent = faker.helpers.arrayElement(SYSLOG_EVENTS);
      const message = this.buildSyslogMessage(
        faker.helpers.arrayElement(syslogEvent.messages),
        host,
        ctx,
        sshEmployees
      );

      documents.push(this.createSyslogDocument(host, ctx, syslogEvent.process, message));
    }

    return documents;
  }

  /**
   * Create a syslog document
   */
  private createSyslogDocument(
    host: Host,
    ctx: HostContext,
    processName: string,
    message: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const procId = String(faker.number.int({ min: 1, max: 9999999 }));
    const offset = faker.number.int({ min: 100000, max: 9999999 });
    const syslogMessage = `${this.formatSyslogTimestamp(timestamp)} ${host.name} ${processName}[${procId}]: ${message}`;

    return {
      '@timestamp': timestamp,
      agent: {
        name: host.name,
        id: ctx.agentId,
        ephemeral_id: faker.string.uuid(),
        type: 'filebeat',
        version: '8.17.2',
      },
      process: {
        name: processName,
        pid: Number(procId),
      },
      log: {
        file: {
          path: '/var/log/syslog',
        },
        offset,
        syslog: {
          hostname: host.name,
          appname: processName,
          procid: procId,
        },
      },
      elastic_agent: {
        id: ctx.agentId,
        version: '8.17.2',
        snapshot: false,
      },
      message: syslogMessage,
      tags: ['system-syslog'],
      cloud: ctx.cloud,
      input: {
        type: 'log',
      },
      ecs: {
        version: '8.11.0',
      },
      related: {
        hosts: [host.name],
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'system.syslog',
      },
      host: ctx.host,
      event: {
        agent_id_status: 'verified',
        ingested: new Date().toISOString(),
        timezone: '+00:00',
        kind: 'event',
        module: 'system',
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
    sshEmployees: Employee[]
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
