import { faker } from '@faker-js/faker';
import { generateTimestamp } from '../utils/timestamp_utils';
import {
  getThemedUsername,
  getThemedHostname,
  getThemedProcessName,
  getThemedFilename,
  getGlobalThemeGenerator,
} from '../utils/universal_theme_generator';

export interface SystemLogConfig {
  hostName?: string;
  userName?: string;
  timestampConfig?: import('../utils/timestamp_utils').TimestampConfig;
  namespace?: string;
  sessionView?: boolean;
  visualAnalyzer?: boolean;
}

// Common system processes and services
const SYSTEM_PROCESSES = [
  'svchost.exe',
  'winlogon.exe',
  'csrss.exe',
  'lsass.exe',
  'explorer.exe',
  'systemd',
  'init',
  'kthreadd',
  'migration',
  'ksoftirqd',
  'watchdog',
  'chrome.exe',
  'firefox.exe',
  'notepad.exe',
  'cmd.exe',
  'powershell.exe',
  'ssh',
  'sshd',
  'httpd',
  'nginx',
  'mysql',
  'postgres',
];

const SYSTEM_SERVICES = [
  'Windows Update',
  'Windows Defender',
  'Task Scheduler',
  'Event Log',
  'systemd-logind',
  'NetworkManager',
  'cron',
  'apache2',
  'docker',
];

const FILE_PATHS = [
  'C:\\Windows\\System32\\',
  'C:\\Program Files\\',
  'C:\\Users\\',
  '/usr/bin/',
  '/usr/sbin/',
  '/var/log/',
  '/tmp/',
  '/home/',
  '/etc/',
];

const REGISTRY_KEYS = [
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services',
];

export const generateProcessLog = async (config: SystemLogConfig = {}) => {
  const {
    hostName = await getThemedHostname(faker.internet.domainName()),
    userName = await getThemedUsername(faker.internet.username()),
    timestampConfig,
    namespace = 'default',
  } = config;

  const process = await getThemedProcessName(
    faker.helpers.arrayElement(SYSTEM_PROCESSES),
  );
  const pid = faker.number.int({ min: 100, max: 65535 });
  const ppid = faker.number.int({ min: 1, max: pid - 1 });

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.process',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': faker.helpers.arrayElement(['start', 'end', 'creation']),
    'event.category': ['process'],
    'event.dataset': 'endpoint.events.process',
    'event.kind': 'event',
    'event.module': 'endpoint',
    'event.type': faker.helpers.arrayElement(['start', 'end', 'creation']),
    'host.name': hostName,
    'host.os.family': faker.helpers.arrayElement(['windows', 'linux', 'macos']),
    'host.os.name': faker.helpers.arrayElement([
      'Windows 10',
      'Ubuntu',
      'macOS',
    ]),
    'process.name': process,
    'process.pid': pid,
    'process.ppid': ppid,
    'process.executable': process.includes('.exe')
      ? `${faker.helpers.arrayElement(FILE_PATHS)}${process}`
      : `${faker.helpers.arrayElement(FILE_PATHS)}${process}`,
    'process.command_line': `${process} ${faker.helpers.maybe(() => '--verbose', { probability: 0.3 }) || ''}`,
    'user.name': userName,
    'user.domain': faker.internet.domainName(),
  };
};

export const generateFileLog = async (config: SystemLogConfig = {}) => {
  const {
    hostName = await getThemedHostname(faker.internet.domainName()),
    userName = await getThemedUsername(faker.internet.username()),
    timestampConfig,
    namespace = 'default',
  } = config;

  const fileName = await getThemedFilename(faker.system.fileName());
  const filePath = `${faker.helpers.arrayElement(FILE_PATHS)}${fileName}`;

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.file',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': faker.helpers.arrayElement([
      'creation',
      'deletion',
      'modification',
      'rename',
    ]),
    'event.category': ['file'],
    'event.dataset': 'endpoint.events.file',
    'event.kind': 'event',
    'event.module': 'endpoint',
    'event.type': faker.helpers.arrayElement([
      'creation',
      'deletion',
      'change',
    ]),
    'file.name': fileName,
    'file.path': filePath,
    'file.directory': faker.helpers.arrayElement(FILE_PATHS),
    'file.extension': faker.system.fileExt(),
    'file.size': faker.number.int({ min: 1024, max: 10485760 }),
    'host.name': hostName,
    'host.os.family': faker.helpers.arrayElement(['windows', 'linux', 'macos']),
    'process.name': faker.helpers.arrayElement(SYSTEM_PROCESSES),
    'process.pid': faker.number.int({ min: 100, max: 65535 }),
    'user.name': userName,
    'user.domain': faker.internet.domainName(),
  };
};

export const generateRegistryLog = async (config: SystemLogConfig = {}) => {
  const {
    hostName = await getThemedHostname(faker.internet.domainName()),
    userName = await getThemedUsername(faker.internet.username()),
    timestampConfig,
    namespace = 'default',
  } = config;

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.registry',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': faker.helpers.arrayElement([
      'modification',
      'creation',
      'deletion',
    ]),
    'event.category': ['registry'],
    'event.dataset': 'endpoint.events.registry',
    'event.kind': 'event',
    'event.module': 'endpoint',
    'event.type': faker.helpers.arrayElement([
      'creation',
      'deletion',
      'change',
    ]),
    'host.name': hostName,
    'host.os.family': 'windows',
    'host.os.name': 'Windows 10',
    'process.name': faker.helpers.arrayElement([
      'regedit.exe',
      'reg.exe',
      'powershell.exe',
    ]),
    'process.pid': faker.number.int({ min: 100, max: 65535 }),
    'registry.key': faker.helpers.arrayElement(REGISTRY_KEYS),
    'registry.value': faker.lorem.word(),
    'registry.data.strings': [faker.system.filePath()],
    'user.name': userName,
    'user.domain': faker.internet.domainName(),
  };
};

export const generateServiceLog = async (config: SystemLogConfig = {}) => {
  const {
    hostName = await getThemedHostname(faker.internet.domainName()),
    userName = 'SYSTEM',
    timestampConfig,
    namespace = 'default',
  } = config;

  const service = faker.helpers.arrayElement(SYSTEM_SERVICES);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'winlogbeat',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'system.system',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': faker.helpers.arrayElement([
      'service-started',
      'service-stopped',
      'service-installed',
    ]),
    'event.category': ['system'],
    'event.code': faker.helpers.arrayElement(['7036', '7035', '7034']),
    'event.dataset': 'system.system',
    'event.kind': 'event',
    'event.module': 'system',
    'event.provider': 'Service Control Manager',
    'event.type': faker.helpers.arrayElement(['start', 'end', 'info']),
    'host.name': hostName,
    'host.os.family': 'windows',
    'log.level': faker.helpers.arrayElement(['info', 'warning', 'error']),
    message: `The ${service} service entered the ${faker.helpers.arrayElement(['running', 'stopped', 'starting'])} state.`,
    'service.name': service,
    'service.state': faker.helpers.arrayElement([
      'running',
      'stopped',
      'starting',
      'stopping',
    ]),
    'user.name': userName,
    'winlog.channel': 'System',
    'winlog.event_id': faker.helpers.arrayElement([7036, 7035, 7034]),
    'winlog.opcode': 'Info',
    'winlog.record_id': faker.number.int({ min: 1000000, max: 9999999 }),
  };
};

export default async function createSystemLog(
  override = {},
  config: SystemLogConfig = {},
) {
  const logTypes: Array<(config: SystemLogConfig) => Promise<any>> = [
    generateProcessLog,
    generateFileLog,
    generateServiceLog,
  ];

  // Add registry logs only for Windows hosts
  if (
    !config.hostName ||
    faker.helpers.maybe(() => true, { probability: 0.6 })
  ) {
    logTypes.push(generateRegistryLog);
  }

  const selectedGenerator = faker.helpers.arrayElement(logTypes);
  const baseLog = await selectedGenerator(config);

  return {
    ...baseLog,
    ...override,
  };
}
