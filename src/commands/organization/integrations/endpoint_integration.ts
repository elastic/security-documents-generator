/**
 * Elastic Defend (Endpoint) Integration
 * Generates endpoint process, file, network, security, alert, registry, and library events
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap, Employee, Device } from '../types';
import { faker } from '@faker-js/faker';
import { MALWARE_HASHES } from '../data/threat_intel_data';

const ENDPOINT_AGENT_VERSION = '8.17.4';

const PROCESS_ACTIONS: Array<{ action: string; type: string[] }> = [
  { action: 'start', type: ['start'] },
  { action: 'exec', type: ['start'] },
  { action: 'end', type: ['end'] },
  { action: 'already_running', type: ['info'] },
];

const COMMON_PROCESSES: Array<{
  name: string;
  executable: Record<string, string>;
  args: string[];
}> = [
  {
    name: 'svchost.exe',
    executable: { windows: 'C:\\Windows\\System32\\svchost.exe', mac: '/usr/sbin/svchost', linux: '/usr/sbin/svchost' },
    args: ['-k', 'netsvcs'],
  },
  {
    name: 'chrome',
    executable: {
      windows: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      mac: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      linux: '/usr/bin/google-chrome',
    },
    args: ['--type=renderer'],
  },
  {
    name: 'code',
    executable: {
      windows: 'C:\\Users\\%USER%\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      mac: '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
      linux: '/usr/share/code/code',
    },
    args: ['--ms-enable-electron-run-as-node'],
  },
  {
    name: 'slack',
    executable: {
      windows: 'C:\\Users\\%USER%\\AppData\\Local\\slack\\slack.exe',
      mac: '/Applications/Slack.app/Contents/MacOS/Slack',
      linux: '/usr/bin/slack',
    },
    args: ['--enable-features=WebRtcHideLocalIpsWithMdns'],
  },
  {
    name: 'node',
    executable: {
      windows: 'C:\\Program Files\\nodejs\\node.exe',
      mac: '/usr/local/bin/node',
      linux: '/usr/bin/node',
    },
    args: ['server.js'],
  },
  {
    name: 'python3',
    executable: {
      windows: 'C:\\Python311\\python.exe',
      mac: '/usr/local/bin/python3',
      linux: '/usr/bin/python3',
    },
    args: ['-m', 'http.server'],
  },
  {
    name: 'Terminal',
    executable: {
      windows: 'C:\\Windows\\System32\\cmd.exe',
      mac: '/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal',
      linux: '/usr/bin/bash',
    },
    args: [],
  },
  {
    name: 'explorer.exe',
    executable: { windows: 'C:\\Windows\\explorer.exe', mac: '/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder', linux: '/usr/bin/nautilus' },
    args: [],
  },
];

const FILE_ACTIONS: Array<{ action: string; type: string[] }> = [
  { action: 'creation', type: ['creation'] },
  { action: 'modification', type: ['change'] },
  { action: 'deletion', type: ['deletion'] },
  { action: 'rename', type: ['change'] },
];

const FILE_PATHS: Record<string, string[]> = {
  windows: [
    'C:\\Users\\%USER%\\Documents\\report.docx',
    'C:\\Users\\%USER%\\Downloads\\installer.exe',
    'C:\\ProgramData\\app\\config.json',
    'C:\\Windows\\Temp\\update.tmp',
    'C:\\Users\\%USER%\\AppData\\Local\\Temp\\~DF1234.tmp',
  ],
  mac: [
    '/Users/%USER%/Documents/report.docx',
    '/Users/%USER%/Downloads/installer.dmg',
    '/Library/Application Support/app/config.plist',
    '/tmp/update.tmp',
    '/Users/%USER%/.config/settings.json',
  ],
  linux: [
    '/home/%USER%/Documents/report.odt',
    '/home/%USER%/Downloads/package.deb',
    '/etc/app/config.yml',
    '/tmp/update.tmp',
    '/home/%USER%/.local/share/app/data.db',
  ],
};

const NETWORK_ACTIONS: Array<{ action: string; type: string[] }> = [
  { action: 'connection_attempted', type: ['start'] },
  { action: 'connection_accepted', type: ['start', 'connection'] },
  { action: 'disconnect_received', type: ['end'] },
];

const DESTINATION_HOSTS = [
  { ip: '142.250.80.46', port: 443, org: 'GOOGLE', domain: 'google.com' },
  { ip: '13.107.42.14', port: 443, org: 'MICROSOFT', domain: 'microsoft.com' },
  { ip: '151.101.1.69', port: 443, org: 'FASTLY', domain: 'github.com' },
  { ip: '104.18.32.68', port: 443, org: 'CLOUDFLARE', domain: 'slack.com' },
  { ip: '52.96.166.66', port: 443, org: 'MICROSOFT', domain: 'outlook.office365.com' },
  { ip: '34.107.243.93', port: 443, org: 'GOOGLE', domain: 'cloud.google.com' },
  { ip: '185.199.108.133', port: 443, org: 'GITHUB', domain: 'raw.githubusercontent.com' },
  { ip: '3.5.29.97', port: 443, org: 'AMAZON', domain: 'aws.amazon.com' },
];

const SECURITY_LOGON_TYPES = ['Interactive', 'Network', 'RemoteInteractive', 'Unlock'];

const ALERT_TYPES = [
  { code: 'malicious_file', category: ['malware', 'intrusion_detection', 'file'], message: 'Malware Prevention Alert' },
  { code: 'memory_signature', category: ['malware', 'intrusion_detection'], message: 'Memory Threat Prevention Alert' },
  { code: 'behavior', category: ['malware', 'intrusion_detection', 'process'], message: 'Malicious Behavior Prevention Alert' },
  { code: 'ransomware', category: ['malware', 'intrusion_detection', 'file'], message: 'Ransomware Prevention Alert' },
  { code: 'shellcode_thread', category: ['malware', 'intrusion_detection'], message: 'Memory Threat Prevention Alert' },
];

const REGISTRY_HIVES = ['HKLM', 'HKCU', 'HKU'];
const REGISTRY_PATHS = [
  'SYSTEM\\ControlSet001\\Control\\Lsa\\FipsAlgorithmPolicy\\Enabled',
  'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\SecurityHealth',
  'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders\\Common Startup',
  'SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy',
  'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU\\NoAutoUpdate',
];
const REGISTRY_ACTIONS: Array<{ action: string; type: string[] }> = [
  { action: 'query', type: ['access'] },
  { action: 'modification', type: ['change'] },
  { action: 'creation', type: ['creation'] },
];

const DLLS: Array<{ name: string; path: string }> = [
  { name: 'ntdll.dll', path: 'C:\\Windows\\System32\\ntdll.dll' },
  { name: 'kernel32.dll', path: 'C:\\Windows\\System32\\kernel32.dll' },
  { name: 'msxml3.dll', path: 'C:\\Windows\\System32\\msxml3.dll' },
  { name: 'combase.dll', path: 'C:\\Windows\\System32\\combase.dll' },
  { name: 'rpcrt4.dll', path: 'C:\\Windows\\System32\\rpcrt4.dll' },
  { name: 'advapi32.dll', path: 'C:\\Windows\\System32\\advapi32.dll' },
];

const SHARED_LIBS: Array<{ name: string; path: string }> = [
  { name: 'libc.so.6', path: '/usr/lib/x86_64-linux-gnu/libc.so.6' },
  { name: 'libpthread.so.0', path: '/usr/lib/x86_64-linux-gnu/libpthread.so.0' },
  { name: 'libssl.so.3', path: '/usr/lib/x86_64-linux-gnu/libssl.so.3' },
  { name: 'libcrypto.so.3', path: '/usr/lib/x86_64-linux-gnu/libcrypto.so.3' },
];

const MAC_DYLIBS: Array<{ name: string; path: string }> = [
  { name: 'libSystem.B.dylib', path: '/usr/lib/libSystem.B.dylib' },
  { name: 'libobjc.A.dylib', path: '/usr/lib/libobjc.A.dylib' },
  { name: 'Security.framework', path: '/System/Library/Frameworks/Security.framework/Versions/A/Security' },
  { name: 'CoreFoundation', path: '/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation' },
];

const OS_INFO: Record<string, { name: string; family: string; version: string; platform: string; full: string; kernel: string }> = {
  mac: {
    name: 'macOS',
    family: 'darwin',
    version: '14.2.1',
    platform: 'darwin',
    full: 'macOS Sonoma 14.2.1',
    kernel: '23.2.0',
  },
  windows: {
    name: 'Windows',
    family: 'windows',
    version: '10.0.22631',
    platform: 'windows',
    full: 'Windows 11 Pro 10.0.22631',
    kernel: '10.0.22631.2715',
  },
  linux: {
    name: 'Ubuntu',
    family: 'debian',
    version: '22.04',
    platform: 'linux',
    full: 'Ubuntu 22.04.3 LTS',
    kernel: '6.5.0-14-generic',
  },
};

export class EndpointIntegration extends BaseIntegration {
  readonly packageName = 'endpoint';
  readonly displayName = 'Elastic Defend';
  readonly prerelease = true;

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'Process Events', index: 'logs-endpoint.events.process-default' },
    { name: 'File Events', index: 'logs-endpoint.events.file-default' },
    { name: 'Network Events', index: 'logs-endpoint.events.network-default' },
    { name: 'Security Events', index: 'logs-endpoint.events.security-default' },
    { name: 'Alerts', index: 'logs-endpoint.alerts-default' },
    { name: 'Registry Events', index: 'logs-endpoint.events.registry-default' },
    { name: 'Library Events', index: 'logs-endpoint.events.library-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const processDocs: IntegrationDocument[] = [];
    const fileDocs: IntegrationDocument[] = [];
    const networkDocs: IntegrationDocument[] = [];
    const securityDocs: IntegrationDocument[] = [];
    const alertDocs: IntegrationDocument[] = [];
    const registryDocs: IntegrationDocument[] = [];
    const libraryDocs: IntegrationDocument[] = [];

    const allLaptops: Array<{ employee: Employee; device: Device }> = [];

    for (const employee of org.employees) {
      const laptops = employee.devices.filter((d) => d.type === 'laptop');
      for (const device of laptops) {
        allLaptops.push({ employee, device });
        const agentId = device.crowdstrikeAgentId;
        const hostId = device.id;
        const platform = device.platform as string;

        const processCount = faker.number.int({ min: 3, max: 5 });
        for (let i = 0; i < processCount; i++) {
          processDocs.push(this.generateProcessDocument(employee, device, agentId, hostId, platform));
        }

        const fileCount = faker.number.int({ min: 2, max: 4 });
        for (let i = 0; i < fileCount; i++) {
          fileDocs.push(this.generateFileDocument(employee, device, agentId, hostId, platform));
        }

        const networkCount = faker.number.int({ min: 2, max: 4 });
        for (let i = 0; i < networkCount; i++) {
          networkDocs.push(this.generateNetworkDocument(employee, device, agentId, hostId, platform));
        }

        const securityCount = faker.number.int({ min: 1, max: 2 });
        for (let i = 0; i < securityCount; i++) {
          securityDocs.push(this.generateSecurityDocument(employee, device, agentId, hostId, platform));
        }

        if (platform === 'windows') {
          const registryCount = faker.number.int({ min: 1, max: 2 });
          for (let i = 0; i < registryCount; i++) {
            registryDocs.push(this.generateRegistryDocument(employee, device, agentId, hostId));
          }
        }

        const libraryCount = faker.number.int({ min: 1, max: 2 });
        for (let i = 0; i < libraryCount; i++) {
          libraryDocs.push(this.generateLibraryDocument(employee, device, agentId, hostId, platform));
        }
      }
    }

    const alertCount = Math.max(
      1,
      Math.floor(allLaptops.length * faker.number.float({ min: 0.02, max: 0.05 }))
    );
    const alertDevices = faker.helpers.arrayElements(allLaptops, Math.min(alertCount, allLaptops.length));
    for (const { employee, device } of alertDevices) {
      alertDocs.push(
        this.generateAlertDocument(employee, device, device.crowdstrikeAgentId, device.id, device.platform as string)
      );
    }

    documentsMap.set('logs-endpoint.events.process-default', processDocs);
    documentsMap.set('logs-endpoint.events.file-default', fileDocs);
    documentsMap.set('logs-endpoint.events.network-default', networkDocs);
    documentsMap.set('logs-endpoint.events.security-default', securityDocs);
    documentsMap.set('logs-endpoint.alerts-default', alertDocs);
    documentsMap.set('logs-endpoint.events.registry-default', registryDocs);
    documentsMap.set('logs-endpoint.events.library-default', libraryDocs);

    return documentsMap;
  }

  private buildHostObject(employee: Employee, device: Device, hostId: string, platform: string) {
    const hostname = `${employee.userName}-${device.platform}`;
    const os = OS_INFO[platform] ?? OS_INFO.linux;
    return {
      hostname,
      os: {
        Ext: { variant: os.full },
        kernel: os.kernel,
        name: os.name,
        family: os.family,
        type: os.platform,
        version: os.version,
        platform: os.platform,
        full: os.full,
      },
      ip: [device.ipAddress, '127.0.0.1', '::1'],
      name: hostname,
      id: hostId,
      mac: [device.macAddress],
      architecture: 'x86_64',
    };
  }

  private buildAgentObject(agentId: string) {
    return {
      id: agentId,
      type: 'endpoint',
      version: ENDPOINT_AGENT_VERSION,
    };
  }

  private generateProcessDocument(
    employee: Employee,
    device: Device,
    agentId: string,
    hostId: string,
    platform: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp();
    const proc = faker.helpers.arrayElement(COMMON_PROCESSES);
    const action = faker.helpers.arrayElement(PROCESS_ACTIONS);
    const pid = faker.number.int({ min: 100, max: 65535 });
    const parentPid = faker.number.int({ min: 1, max: 10000 });
    const entityId = faker.string.alphanumeric(40);
    const parentEntityId = faker.string.alphanumeric(40);
    const executablePath = (proc.executable[platform] ?? proc.executable.linux).replace('%USER%', employee.userName);

    return {
      '@timestamp': timestamp,
      agent: this.buildAgentObject(agentId),
      process: {
        Ext: {
          ancestry: [parentEntityId],
        },
        parent: {
          pid: parentPid,
          entity_id: parentEntityId,
          executable: platform === 'windows' ? 'C:\\Windows\\explorer.exe' : '/usr/bin/bash',
          name: platform === 'windows' ? 'explorer.exe' : 'bash',
        },
        pid,
        entity_id: entityId,
        executable: executablePath,
        args: [executablePath, ...proc.args],
        args_count: proc.args.length + 1,
        name: proc.name,
        command_line: [executablePath, ...proc.args].join(' '),
        hash: {
          sha256: faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' }),
          md5: faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' }),
        },
      },
      message: 'Endpoint process event',
      ecs: { version: '1.11.0' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'endpoint.events.process' },
      elastic: { agent: { id: agentId } },
      host: this.buildHostObject(employee, device, hostId, platform),
      event: {
        agent_id_status: 'verified',
        sequence: faker.number.int({ min: 1000, max: 99999 }),
        ingested: new Date().toISOString(),
        created: timestamp,
        kind: 'event',
        module: 'endpoint',
        action: action.action,
        id: faker.string.alphanumeric(24),
        category: ['process'],
        type: action.type,
        dataset: 'endpoint.events.process',
      },
      user: {
        domain: platform === 'windows' ? employee.userName.split('.')[0].toUpperCase() : undefined,
        name: employee.userName,
        id: platform === 'windows' ? employee.windowsSid : String(employee.unixUid),
      },
    } as IntegrationDocument;
  }

  private generateFileDocument(
    employee: Employee,
    device: Device,
    agentId: string,
    hostId: string,
    platform: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp();
    const action = faker.helpers.arrayElement(FILE_ACTIONS);
    const paths = FILE_PATHS[platform] ?? FILE_PATHS.linux;
    const filePath = faker.helpers.arrayElement(paths).replace('%USER%', employee.userName);
    const fileName = filePath.split(/[/\\]/).pop() ?? 'file.tmp';
    const extension = fileName.includes('.') ? fileName.split('.').pop() : undefined;
    const entityId = faker.string.alphanumeric(40);

    return {
      '@timestamp': timestamp,
      agent: this.buildAgentObject(agentId),
      process: {
        Ext: { ancestry: [faker.string.alphanumeric(40)] },
        name: platform === 'windows' ? 'explorer.exe' : 'bash',
        pid: faker.number.int({ min: 100, max: 65535 }),
        entity_id: entityId,
        executable: platform === 'windows' ? 'C:\\Windows\\explorer.exe' : '/usr/bin/bash',
      },
      file: {
        path: filePath,
        extension,
        size: faker.number.int({ min: 64, max: 5242880 }),
        name: fileName,
      },
      message: 'Endpoint file event',
      ecs: { version: '1.11.0' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'endpoint.events.file' },
      elastic: { agent: { id: agentId } },
      host: this.buildHostObject(employee, device, hostId, platform),
      event: {
        agent_id_status: 'verified',
        sequence: faker.number.int({ min: 1000, max: 99999 }),
        ingested: new Date().toISOString(),
        created: timestamp,
        kind: 'event',
        module: 'endpoint',
        action: action.action,
        id: faker.string.alphanumeric(24),
        category: ['file'],
        type: action.type,
        dataset: 'endpoint.events.file',
      },
      user: {
        domain: platform === 'windows' ? employee.userName.split('.')[0].toUpperCase() : undefined,
        name: employee.userName,
        id: platform === 'windows' ? employee.windowsSid : String(employee.unixUid),
      },
    } as IntegrationDocument;
  }

  private generateNetworkDocument(
    employee: Employee,
    device: Device,
    agentId: string,
    hostId: string,
    platform: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp();
    const action = faker.helpers.arrayElement(NETWORK_ACTIONS);
    const dest = faker.helpers.arrayElement(DESTINATION_HOSTS);
    const sourceIp = faker.internet.ipv4();
    const sourcePort = faker.number.int({ min: 49152, max: 65535 });
    const entityId = faker.string.alphanumeric(40);
    const proc = faker.helpers.arrayElement(COMMON_PROCESSES);

    return {
      '@timestamp': timestamp,
      agent: this.buildAgentObject(agentId),
      process: {
        Ext: { ancestry: [faker.string.alphanumeric(40)] },
        name: proc.name,
        pid: faker.number.int({ min: 100, max: 65535 }),
        entity_id: entityId,
        executable: (proc.executable[platform] ?? proc.executable.linux).replace('%USER%', employee.userName),
      },
      destination: {
        address: dest.ip,
        port: dest.port,
        bytes: faker.number.int({ min: 100, max: 50000 }),
        ip: dest.ip,
      },
      source: {
        address: sourceIp,
        port: sourcePort,
        bytes: faker.number.int({ min: 100, max: 10000 }),
        ip: sourceIp,
      },
      network: {
        transport: faker.helpers.arrayElement(['tcp', 'udp']),
        type: 'ipv4',
        direction: faker.helpers.arrayElement(['egress', 'ingress']),
      },
      message: 'Endpoint network event',
      ecs: { version: '1.11.0' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'endpoint.events.network' },
      elastic: { agent: { id: agentId } },
      host: this.buildHostObject(employee, device, hostId, platform),
      event: {
        agent_id_status: 'verified',
        sequence: faker.number.int({ min: 1000, max: 99999 }),
        ingested: new Date().toISOString(),
        created: timestamp,
        kind: 'event',
        module: 'endpoint',
        action: action.action,
        id: faker.string.alphanumeric(24),
        category: ['network'],
        type: action.type,
        dataset: 'endpoint.events.network',
      },
      user: {
        domain: platform === 'windows' ? employee.userName.split('.')[0].toUpperCase() : undefined,
        name: employee.userName,
        id: platform === 'windows' ? employee.windowsSid : String(employee.unixUid),
      },
    } as IntegrationDocument;
  }

  private generateSecurityDocument(
    employee: Employee,
    device: Device,
    agentId: string,
    hostId: string,
    platform: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp();
    const logonType = faker.helpers.arrayElement(SECURITY_LOGON_TYPES);
    const outcome = faker.helpers.weightedArrayElement([
      { value: 'success' as const, weight: 90 },
      { value: 'failure' as const, weight: 10 },
    ]);
    const entityId = faker.string.alphanumeric(40);

    return {
      '@timestamp': timestamp,
      agent: this.buildAgentObject(agentId),
      process: {
        Ext: {
          ancestry: [faker.string.alphanumeric(40)],
          session_info: {
            logon_type: logonType,
            authentication_package: platform === 'windows' ? 'Negotiate' : 'PAM',
          },
        },
        name: platform === 'windows' ? 'services.exe' : 'sshd',
        entity_id: entityId,
        executable: platform === 'windows' ? 'C:\\Windows\\System32\\services.exe' : '/usr/sbin/sshd',
        parent: {
          executable: platform === 'windows' ? 'C:\\Windows\\System32\\wininit.exe' : '/usr/sbin/sshd',
          pid: faker.number.int({ min: 1, max: 1000 }),
        },
      },
      message: 'Endpoint security event',
      ecs: { version: '1.11.0' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'endpoint.events.security' },
      elastic: { agent: { id: agentId } },
      host: this.buildHostObject(employee, device, hostId, platform),
      event: {
        agent_id_status: 'verified',
        sequence: faker.number.int({ min: 1000, max: 99999 }),
        ingested: new Date().toISOString(),
        created: timestamp,
        kind: 'event',
        module: 'endpoint',
        action: 'log_on',
        id: faker.string.alphanumeric(24),
        category: ['authentication', 'session'],
        type: ['start'],
        dataset: 'endpoint.events.security',
        outcome,
      },
      source: {
        ip: faker.internet.ipv4(),
        port: faker.number.int({ min: 49152, max: 65535 }),
      },
      user: {
        domain: platform === 'windows' ? employee.userName.split('.')[0].toUpperCase() : undefined,
        name: employee.userName,
        id: platform === 'windows' ? employee.windowsSid : String(employee.unixUid),
      },
    } as IntegrationDocument;
  }

  private generateAlertDocument(
    employee: Employee,
    device: Device,
    agentId: string,
    hostId: string,
    platform: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const alertType = faker.helpers.arrayElement(ALERT_TYPES);
    const severity = faker.helpers.weightedArrayElement([
      { value: 47, weight: 30 },
      { value: 73, weight: 40 },
      { value: 85, weight: 20 },
      { value: 99, weight: 10 },
    ]);
    const sha256 = faker.helpers.arrayElement(MALWARE_HASHES);
    const fileName = `${faker.string.alphanumeric(8)}.${faker.helpers.arrayElement(['dll', 'exe', 'ps1', 'vbs'])}`;

    return {
      '@timestamp': timestamp,
      agent: {
        ...this.buildAgentObject(agentId),
        build: {
          original: `version: ${ENDPOINT_AGENT_VERSION}, compiled: Mon Jan 01 00:00:00 2024, branch: main, commit: ${faker.string.hexadecimal({ length: 40, casing: 'lower', prefix: '' })}`,
        },
      },
      process: {
        Ext: {
          ancestry: [faker.string.alphanumeric(40)],
          token: {
            integrity_level_name: 'system',
            elevation: true,
            domain: 'NT AUTHORITY',
            user: 'SYSTEM',
            sid: 'S-1-5-18',
          },
        },
        parent: {
          name: platform === 'windows' ? 'explorer.exe' : 'bash',
          pid: faker.number.int({ min: 1, max: 10000 }),
          entity_id: faker.string.alphanumeric(40),
          executable: platform === 'windows' ? 'C:\\Windows\\explorer.exe' : '/usr/bin/bash',
        },
        name: platform === 'windows' ? 'cmd.exe' : 'sh',
        pid: faker.number.int({ min: 100, max: 65535 }),
        entity_id: faker.string.alphanumeric(40),
        executable: platform === 'windows' ? 'C:\\Windows\\System32\\cmd.exe' : '/bin/sh',
      },
      rule: { ruleset: 'production' },
      message: alertType.message,
      file: {
        Ext: {
          malware_classification: {
            identifier: 'endpointpe-v4-model',
            score: faker.number.float({ min: 0.6, max: 0.99, fractionDigits: 6 }),
            threshold: 0.58,
            version: '4.0.19000',
          },
        },
        extension: fileName.split('.').pop(),
        size: faker.number.int({ min: 1024, max: 5242880 }),
        path: platform === 'windows'
          ? `C:\\Users\\${employee.userName}\\AppData\\Local\\Temp\\${fileName}`
          : `/tmp/${fileName}`,
        name: fileName,
        hash: {
          sha256,
          sha1: faker.string.hexadecimal({ length: 40, casing: 'lower', prefix: '' }),
          md5: faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' }),
        },
      },
      ecs: { version: '1.11.0' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'endpoint.alerts' },
      elastic: { agent: { id: agentId } },
      host: this.buildHostObject(employee, device, hostId, platform),
      event: {
        severity,
        code: alertType.code,
        risk_score: severity,
        created: timestamp,
        kind: 'alert',
        module: 'endpoint',
        type: ['info', 'denied'],
        agent_id_status: 'verified',
        sequence: faker.number.int({ min: 1000, max: 99999 }),
        ingested: new Date().toISOString(),
        action: 'execution',
        id: faker.string.alphanumeric(24),
        category: alertType.category,
        dataset: 'endpoint.alerts',
        outcome: 'success',
      },
      user: {
        domain: platform === 'windows' ? employee.userName.split('.')[0].toUpperCase() : undefined,
        name: employee.userName,
        id: platform === 'windows' ? employee.windowsSid : String(employee.unixUid),
      },
    } as IntegrationDocument;
  }

  private generateRegistryDocument(
    employee: Employee,
    device: Device,
    agentId: string,
    hostId: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp();
    const action = faker.helpers.arrayElement(REGISTRY_ACTIONS);
    const hive = faker.helpers.arrayElement(REGISTRY_HIVES);
    const regPath = faker.helpers.arrayElement(REGISTRY_PATHS);
    const fullPath = `${hive}\\${regPath}`;
    const value = regPath.split('\\').pop() ?? 'Value';
    const entityId = faker.string.alphanumeric(40);

    return {
      '@timestamp': timestamp,
      agent: this.buildAgentObject(agentId),
      registry: {
        hive,
        path: fullPath,
        data: { strings: [], type: 'REG_DWORD' },
        value,
        key: regPath.substring(0, regPath.lastIndexOf('\\')),
      },
      process: {
        Ext: {
          ancestry: [faker.string.alphanumeric(40)],
        },
        name: 'svchost.exe',
        pid: faker.number.int({ min: 100, max: 65535 }),
        entity_id: entityId,
        executable: 'C:\\Windows\\System32\\svchost.exe',
      },
      message: 'Endpoint registry event',
      ecs: { version: '1.11.0' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'endpoint.events.registry' },
      elastic: { agent: { id: agentId } },
      host: this.buildHostObject(employee, device, hostId, 'windows'),
      event: {
        agent_id_status: 'verified',
        sequence: faker.number.int({ min: 1000, max: 99999 }),
        ingested: new Date().toISOString(),
        created: timestamp,
        kind: 'event',
        module: 'endpoint',
        action: action.action,
        id: faker.string.alphanumeric(24),
        category: ['registry'],
        type: action.type,
        dataset: 'endpoint.events.registry',
      },
      user: {
        domain: 'NT AUTHORITY',
        name: 'SYSTEM',
        id: 'S-1-5-18',
      },
    } as IntegrationDocument;
  }

  private generateLibraryDocument(
    employee: Employee,
    device: Device,
    agentId: string,
    hostId: string,
    platform: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp();
    const entityId = faker.string.alphanumeric(40);

    let lib: { name: string; path: string };
    if (platform === 'windows') {
      lib = faker.helpers.arrayElement(DLLS);
    } else if (platform === 'mac') {
      lib = faker.helpers.arrayElement(MAC_DYLIBS);
    } else {
      lib = faker.helpers.arrayElement(SHARED_LIBS);
    }

    return {
      '@timestamp': timestamp,
      agent: this.buildAgentObject(agentId),
      process: {
        Ext: {
          ancestry: [faker.string.alphanumeric(40)],
        },
        name: platform === 'windows' ? 'svchost.exe' : 'node',
        pid: faker.number.int({ min: 100, max: 65535 }),
        entity_id: entityId,
        executable: platform === 'windows'
          ? 'C:\\Windows\\System32\\svchost.exe'
          : platform === 'mac'
            ? '/usr/local/bin/node'
            : '/usr/bin/node',
      },
      dll: {
        path: lib.path,
        name: lib.name,
        hash: {
          sha256: faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' }),
          sha1: faker.string.hexadecimal({ length: 40, casing: 'lower', prefix: '' }),
          md5: faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' }),
        },
      },
      message: 'Endpoint DLL load event',
      ecs: { version: '1.11.0' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'endpoint.events.library' },
      elastic: { agent: { id: agentId } },
      host: this.buildHostObject(employee, device, hostId, platform),
      event: {
        agent_id_status: 'verified',
        sequence: faker.number.int({ min: 1000, max: 99999 }),
        ingested: new Date().toISOString(),
        created: timestamp,
        kind: 'event',
        module: 'endpoint',
        action: 'load',
        id: faker.string.alphanumeric(24),
        category: ['library'],
        type: ['start'],
        dataset: 'endpoint.events.library',
      },
      user: {
        domain: platform === 'windows' ? employee.userName.split('.')[0].toUpperCase() : undefined,
        name: employee.userName,
        id: platform === 'windows' ? employee.windowsSid : String(employee.unixUid),
      },
    } as IntegrationDocument;
  }
}
