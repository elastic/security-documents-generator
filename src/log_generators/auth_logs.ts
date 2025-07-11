import { faker } from '@faker-js/faker';
import { generateTimestamp } from '../utils/timestamp_utils';
import {
  getThemedUsername,
  getThemedHostname,
  getThemedDomain,
} from '../utils/universal_theme_generator';

export interface AuthLogConfig {
  hostName?: string;
  userName?: string;
  timestampConfig?: import('../utils/timestamp_utils').TimestampConfig;
  namespace?: string;
  sessionView?: boolean;
  visualAnalyzer?: boolean;
}

const AUTH_METHODS = [
  'password',
  'kerberos',
  'ntlm',
  'certificate',
  'mfa',
  'biometric',
];

const LOGIN_TYPES = [
  'interactive',
  'network',
  'batch',
  'service',
  'unlock',
  'remote',
];

const FAILURE_REASONS = [
  'bad_password',
  'account_locked',
  'account_disabled',
  'expired_password',
  'logon_time_restriction',
  'workstation_restriction',
  'password_expired',
  'account_expired',
  'user_not_found',
];

const PRIVILEGE_OPERATIONS = [
  'SeDebugPrivilege',
  'SeBackupPrivilege',
  'SeRestorePrivilege',
  'SeTakeOwnershipPrivilege',
  'SeLoadDriverPrivilege',
  'SeSystemtimePrivilege',
  'SeShutdownPrivilege',
  'SeRemoteShutdownPrivilege',
];

export const generateLoginSuccessLog = async (config: AuthLogConfig = {}) => {
  const {
    hostName = await getThemedHostname(faker.internet.domainName()),
    userName = await getThemedUsername(faker.internet.username()),
    timestampConfig,
    namespace = 'default',
  } = config;

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'winlogbeat',
    'agent.version': '8.15.0',
    'authentication.method': faker.helpers.arrayElement(AUTH_METHODS),
    'data_stream.dataset': 'security.security',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'logged-in',
    'event.category': ['authentication'],
    'event.code': '4624',
    'event.dataset': 'security.security',
    'event.kind': 'event',
    'event.module': 'security',
    'event.outcome': 'success',
    'event.provider': 'Microsoft Windows security auditing',
    'event.type': ['start'],
    'host.name': hostName,
    'host.os.family': 'windows',
    'log.level': 'information',
    message: `An account was successfully logged on.`,
    'source.ip': faker.internet.ip(),
    'source.port': faker.internet.port(),
    'user.name': userName,
    'user.domain': await getThemedDomain(faker.internet.domainName()),
    'user.id': faker.string.uuid(),
    'user.target.name': userName,
    'user.target.domain': await getThemedDomain(faker.internet.domainName()),
    'winlog.channel': 'Security',
    'winlog.event_id': 4624,
    'winlog.logon.id': faker.string.hexadecimal({ length: 16, prefix: '0x' }),
    'winlog.logon.type': faker.helpers.arrayElement(LOGIN_TYPES),
    'winlog.process.pid': faker.number.int({ min: 100, max: 65535 }),
    'winlog.record_id': faker.number.int({ min: 1000000, max: 9999999 }),
    'related.ip': [faker.internet.ip()],
    'related.user': [userName],
  };
};

export const generateLoginFailureLog = async (config: AuthLogConfig = {}) => {
  const {
    hostName = await getThemedHostname(faker.internet.domainName()),
    userName = await getThemedUsername(faker.internet.username()),
    timestampConfig,
    namespace = 'default',
  } = config;

  const failureReason = faker.helpers.arrayElement(FAILURE_REASONS);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'winlogbeat',
    'agent.version': '8.15.0',
    'authentication.method': faker.helpers.arrayElement(AUTH_METHODS),
    'data_stream.dataset': 'security.security',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'logon-failed',
    'event.category': ['authentication'],
    'event.code': '4625',
    'event.dataset': 'security.security',
    'event.kind': 'event',
    'event.module': 'security',
    'event.outcome': 'failure',
    'event.provider': 'Microsoft Windows security auditing',
    'event.type': ['start'],
    'host.name': hostName,
    'host.os.family': 'windows',
    'log.level': 'information',
    message: `An account failed to log on. Reason: ${failureReason}`,
    'source.ip': faker.internet.ip(),
    'source.port': faker.internet.port(),
    'user.name': userName,
    'user.domain': await getThemedDomain(faker.internet.domainName()),
    'user.target.name': userName,
    'user.target.domain': await getThemedDomain(faker.internet.domainName()),
    'winlog.channel': 'Security',
    'winlog.event_id': 4625,
    'winlog.logon.failure.reason': failureReason,
    'winlog.logon.type': faker.helpers.arrayElement(LOGIN_TYPES),
    'winlog.process.pid': faker.number.int({ min: 100, max: 65535 }),
    'winlog.record_id': faker.number.int({ min: 1000000, max: 9999999 }),
    'related.ip': [faker.internet.ip()],
    'related.user': [userName],
  };
};

export const generatePrivilegeEscalationLog = async (
  config: AuthLogConfig = {},
) => {
  const {
    hostName = await getThemedHostname(faker.internet.domainName()),
    userName = await getThemedUsername(faker.internet.username()),
    timestampConfig,
    namespace = 'default',
  } = config;

  const privilege = faker.helpers.arrayElement(PRIVILEGE_OPERATIONS);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'winlogbeat',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'security.security',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'privilege-use',
    'event.category': ['iam'],
    'event.code': '4672',
    'event.dataset': 'security.security',
    'event.kind': 'event',
    'event.module': 'security',
    'event.outcome': 'success',
    'event.provider': 'Microsoft Windows security auditing',
    'event.type': ['admin'],
    'host.name': hostName,
    'host.os.family': 'windows',
    'log.level': 'information',
    message: `Special privileges assigned to new logon. Privileges: ${privilege}`,
    'user.name': userName,
    'user.domain': await getThemedDomain(faker.internet.domainName()),
    'user.id': faker.string.uuid(),
    'user.privileges': [privilege],
    'winlog.channel': 'Security',
    'winlog.event_id': 4672,
    'winlog.logon.id': faker.string.hexadecimal({ length: 16, prefix: '0x' }),
    'winlog.process.pid': faker.number.int({ min: 100, max: 65535 }),
    'winlog.record_id': faker.number.int({ min: 1000000, max: 9999999 }),
    'related.user': [userName],
  };
};

export const generateAccountLockoutLog = async (config: AuthLogConfig = {}) => {
  const {
    hostName = await getThemedHostname(faker.internet.domainName()),
    userName = await getThemedUsername(faker.internet.username()),
    timestampConfig,
    namespace = 'default',
  } = config;

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'winlogbeat',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'security.security',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'user-account-locked',
    'event.category': ['iam'],
    'event.code': '4740',
    'event.dataset': 'security.security',
    'event.kind': 'event',
    'event.module': 'security',
    'event.outcome': 'success',
    'event.provider': 'Microsoft Windows security auditing',
    'event.type': ['user', 'change'],
    'host.name': hostName,
    'host.os.family': 'windows',
    'log.level': 'information',
    message: `A user account was locked out.`,
    'source.ip': faker.internet.ip(),
    'user.name': userName,
    'user.domain': await getThemedDomain(faker.internet.domainName()),
    'user.target.name': userName,
    'user.target.domain': await getThemedDomain(faker.internet.domainName()),
    'winlog.channel': 'Security',
    'winlog.event_id': 4740,
    'winlog.process.pid': faker.number.int({ min: 100, max: 65535 }),
    'winlog.record_id': faker.number.int({ min: 1000000, max: 9999999 }),
    'related.ip': [faker.internet.ip()],
    'related.user': [userName],
  };
};

export const generateLinuxAuthLog = async (config: AuthLogConfig = {}) => {
  const {
    hostName = await getThemedHostname(faker.internet.domainName()),
    userName = await getThemedUsername(faker.internet.username()),
    timestampConfig,
    namespace = 'default',
  } = config;

  const authMethod = faker.helpers.arrayElement([
    'password',
    'publickey',
    'keyboard-interactive',
  ]);
  const outcome = faker.helpers.arrayElement(['success', 'failure']);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'filebeat',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'system.auth',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': outcome === 'success' ? 'ssh_login' : 'ssh_login_failed',
    'event.category': ['authentication'],
    'event.dataset': 'system.auth',
    'event.kind': 'event',
    'event.module': 'system',
    'event.outcome': outcome,
    'event.type': ['start'],
    'host.name': hostName,
    'host.os.family': 'linux',
    'host.os.name': 'Ubuntu',
    'log.file.path': '/var/log/auth.log',
    'log.level': 'info',
    message:
      outcome === 'success'
        ? `Accepted ${authMethod} for ${userName} from ${faker.internet.ip()} port ${faker.internet.port()}`
        : `Failed ${authMethod} for ${userName} from ${faker.internet.ip()} port ${faker.internet.port()}`,
    'process.name': 'sshd',
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'service.type': 'ssh',
    'source.ip': faker.internet.ip(),
    'source.port': faker.internet.port(),
    'system.auth.ssh.method': authMethod,
    'user.name': userName,
    'related.ip': [faker.internet.ip()],
    'related.user': [userName],
  };
};

export default async function createAuthLog(
  override = {},
  config: AuthLogConfig = {},
) {
  // Weight success vs failure logs (70% success, 30% failure for realism)
  const weightedGenerators = [
    ...Array(7).fill(generateLoginSuccessLog),
    ...Array(3).fill(generateLoginFailureLog),
    generatePrivilegeEscalationLog,
    generateAccountLockoutLog,
    generateLinuxAuthLog,
  ];

  const selectedGenerator = faker.helpers.arrayElement(weightedGenerators);
  const baseLog = await selectedGenerator(config);

  return {
    ...baseLog,
    ...override,
  };
}
