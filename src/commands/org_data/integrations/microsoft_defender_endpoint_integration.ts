/**
 * Microsoft Defender for Endpoint integration.
 * Raw pre-pipeline documents: message = JSON.stringify(Defender API payload).
 * host.id after ingest is machineId (device.defenderDeviceId), not Elastic device.id.
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import { type Organization, type CorrelationMap, type Employee, type Device } from '../types.ts';
import { faker } from '@faker-js/faker';
import { MALWARE_HASHES } from '../data/threat_intel_data.ts';

const MDE_AGENT_VERSION = '10.8760.17763.6414';
const MDE_TENANT_ID = 'a839b112-1253-6432-9bf6-94542403f21c';

const ALERT_TITLES = [
  'Low-reputation arbitrary code executed by signed executable',
  'Suspicious PowerShell command line',
  'An active malware was detected',
  'Credential dumping tool detected',
  'Suspicious network connection',
];

const MACHINE_ACTIONS = ['RunAntiVirusScan', 'CollectInvestigationPackage', 'Isolate', 'Offboard'];

const CVES = [
  {
    cveId: 'CVE-2022-49226',
    softwareVendor: 'microsoft',
    softwareName: 'windows_10',
    softwareVersion: '10.0.22621',
    severity: 'Medium',
    cvssScore: 5.5,
  },
  {
    cveId: 'CVE-2024-21412',
    softwareVendor: 'microsoft',
    softwareName: 'edge',
    softwareVersion: '122.0.2365.80',
    severity: 'High',
    cvssScore: 7.5,
  },
];

const osFor = (
  platform: string,
): { osPlatform: string; osVersion: string; osArchitecture: string } => {
  if (platform === 'mac') {
    return { osPlatform: 'macOS', osVersion: '14.2.1', osArchitecture: 'x64' };
  }
  if (platform === 'linux') {
    return { osPlatform: 'Linux', osVersion: 'ubuntu_22.04', osArchitecture: 'x64' };
  }
  return { osPlatform: 'Windows11', osVersion: '22H2', osArchitecture: 'x64' };
};

const hostnameFor = (employee: Employee, device: Device): string =>
  `${employee.userName}-${device.platform}`;

const netbiosFor = (employee: Employee): string =>
  (employee.email.split('@')[1]?.split('.')[0] ?? 'corp').toUpperCase();

const laptopEntries = (correlationMap: CorrelationMap) =>
  [...correlationMap.defenderDeviceIdToDevice.entries()].filter(
    ([, { device }]) => device.type === 'laptop',
  );

export class MicrosoftDefenderEndpointIntegration extends BaseIntegration {
  readonly packageName = 'microsoft_defender_endpoint';
  readonly displayName = 'Microsoft Defender for Endpoint';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'log', index: 'logs-microsoft_defender_endpoint.log-default' },
    { name: 'machine', index: 'logs-microsoft_defender_endpoint.machine-default' },
    { name: 'machine_action', index: 'logs-microsoft_defender_endpoint.machine_action-default' },
    { name: 'vulnerability', index: 'logs-microsoft_defender_endpoint.vulnerability-default' },
  ];

  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const laptops = laptopEntries(correlationMap);
    const logDocs: IntegrationDocument[] = [];
    const machineDocs: IntegrationDocument[] = [];
    const actionDocs: IntegrationDocument[] = [];
    const vulnDocs: IntegrationDocument[] = [];

    for (const [, { employee, device }] of laptops) {
      machineDocs.push(this.machineDoc(employee, device));
      const alertCount = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < alertCount; i++) {
        logDocs.push(this.logDoc(employee, device, org));
      }
      if (faker.datatype.boolean(0.25)) {
        actionDocs.push(this.actionDoc(employee, device));
      }
      if (faker.datatype.boolean(0.35)) {
        vulnDocs.push(this.vulnerabilityDoc(employee, device));
      }
    }

    return new Map([
      ['logs-microsoft_defender_endpoint.log-default', logDocs],
      ['logs-microsoft_defender_endpoint.machine-default', machineDocs],
      ['logs-microsoft_defender_endpoint.machine_action-default', actionDocs],
      ['logs-microsoft_defender_endpoint.vulnerability-default', vulnDocs],
    ]);
  }

  private wrap(
    dataset: string,
    timestamp: string,
    raw: Record<string, unknown>,
    employee: Employee,
    device: Device,
  ): IntegrationDocument {
    const hostname = hostnameFor(employee, device);
    return {
      '@timestamp': timestamp,
      agent: this.buildLocalAgent(device, hostname),
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset },
    } as IntegrationDocument;
  }

  private logDoc(employee: Employee, device: Device, org: Organization): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const hostname = hostnameFor(employee, device);
    const title = faker.helpers.arrayElement(ALERT_TITLES);
    const severity = faker.helpers.weightedArrayElement([
      { value: 'Low', weight: 40 },
      { value: 'Medium', weight: 35 },
      { value: 'High', weight: 20 },
      { value: 'Critical', weight: 5 },
    ]);
    const raw = {
      id: `da${faker.string.numeric(18)}_${faker.string.numeric(10)}`,
      incidentId: faker.number.int({ min: 10, max: 99999 }),
      investigationId: faker.number.int({ min: 1, max: 500 }),
      assignedTo: null,
      severity,
      status: 'New',
      classification: null,
      determination: null,
      investigationState: 'Queued',
      detectionSource: 'WindowsDefenderAtp',
      category: 'Execution',
      threatFamilyName: null,
      title,
      description: `${title} observed on ${hostname}.`,
      alertCreationTime: timestamp,
      firstEventTime: timestamp,
      lastEventTime: timestamp,
      lastUpdateTime: timestamp,
      resolvedTime: null,
      machineId: device.defenderDeviceId,
      computerDnsName: hostname,
      rbacGroupName: employee.department,
      aadTenantId: MDE_TENANT_ID,
      relatedUser: {
        userName: employee.userName,
        domainName: netbiosFor(employee),
      },
      comments: [],
      evidence: {
        entityType: 'User',
        sha1: null,
        sha256: faker.helpers.arrayElement(MALWARE_HASHES),
        fileName: 'powershell.exe',
        filePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        processId: faker.number.int({ min: 1000, max: 65000 }),
        processCommandLine: 'powershell.exe -ep bypass -file C:\\temp\\script.ps1',
        processCreationTime: timestamp,
        parentProcessId: faker.number.int({ min: 100, max: 999 }),
        parentProcessCreationTime: timestamp,
        ipAddress: device.ipAddress,
        url: null,
        accountName: employee.userName,
        domainName: netbiosFor(employee),
        userSid: employee.windowsSid,
        aadUserId: employee.entraIdUserId,
        userPrincipalName: employee.email,
      },
      orgName: org.name,
    };
    return this.wrap('microsoft_defender_endpoint.log', timestamp, raw, employee, device);
  }

  private machineDoc(employee: Employee, device: Device): IntegrationDocument {
    const timestamp = this.getTimestamp();
    const hostname = hostnameFor(employee, device);
    const os = osFor(device.platform);
    const firstSeen = faker.date.past({ years: 1 }).toISOString();
    const macCompact = device.macAddress.replace(/-/g, '').toUpperCase();
    const raw = {
      id: device.defenderDeviceId,
      computerDnsName: hostname,
      firstSeen,
      lastSeen: timestamp,
      osPlatform: os.osPlatform,
      osVersion: os.osVersion,
      osProcessor: os.osArchitecture,
      osArchitecture: '64-bit',
      osBuild: device.platform === 'windows' ? 22621 : 0,
      lastIpAddress: device.ipAddress,
      lastExternalIpAddress: faker.internet.ipv4(),
      agentVersion: MDE_AGENT_VERSION,
      healthStatus: 'Active',
      deviceValue: 'Normal',
      rbacGroupId: 0,
      rbacGroupName: employee.department,
      riskScore: 'None',
      exposureLevel: faker.helpers.arrayElement(['Low', 'Medium', 'High']),
      isAadJoined: true,
      aadDeviceId: device.id,
      machineTags: [employee.department],
      osSku: null,
      version: os.osVersion,
      ipAddresses: [
        {
          ipAddress: device.ipAddress,
          macAddress: macCompact,
          operationalStatus: 'Up',
          type: 'Ethernet',
        },
      ],
      onboardingStatus: 'Onboarded',
      managedBy: 'MicrosoftDefenderForEndpoint',
      managedByStatus: 'Success',
      exclusionReason: null,
      vmMetadata: null,
      mergedIntoMachineId: null,
      isExcluded: false,
      isPotentialDuplication: false,
    };
    return this.wrap('microsoft_defender_endpoint.machine', timestamp, raw, employee, device);
  }

  private actionDoc(employee: Employee, device: Device): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const hostname = hostnameFor(employee, device);
    const actionType = faker.helpers.arrayElement(MACHINE_ACTIONS);
    const raw = {
      id: faker.string.uuid(),
      type: actionType,
      title: null,
      requestor: employee.email,
      requestorComment: actionType === 'RunAntiVirusScan' ? 'Quick Scan' : 'Investigation',
      status: 'Succeeded',
      machineId: device.defenderDeviceId,
      computerDnsName: hostname,
      creationDateTimeUtc: timestamp,
      lastUpdateDateTimeUtc: timestamp,
      cancellationRequestor: null,
      cancellationComment: null,
      cancellationDateTimeUtc: null,
      errorHResult: 0,
      scope: actionType === 'RunAntiVirusScan' ? 'Quick' : null,
      externalId: null,
      requestSource: 'Portal',
      relatedFileInfo: null,
      commands: [],
      troubleshootInfo: null,
    };
    return this.wrap(
      'microsoft_defender_endpoint.machine_action',
      timestamp,
      raw,
      employee,
      device,
    );
  }

  private vulnerabilityDoc(employee: Employee, device: Device): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const hostname = hostnameFor(employee, device);
    const os = osFor(device.platform);
    const cve = faker.helpers.arrayElement(CVES);
    const vulnId = `${device.defenderDeviceId}_${cve.softwareVendor}_${cve.softwareName}_${cve.cveId}`;
    const raw = {
      id: vulnId,
      deviceId: device.defenderDeviceId,
      rbacGroupName: 'Unassigned',
      deviceName: hostname,
      osPlatform: os.osPlatform,
      osVersion: os.osVersion,
      osArchitecture: os.osArchitecture,
      softwareVendor: cve.softwareVendor,
      softwareName: cve.softwareName,
      softwareVersion: cve.softwareVersion,
      cveId: cve.cveId,
      vulnerabilitySeverityLevel: cve.severity,
      recommendedSecurityUpdate: cve.cveId,
      recommendedSecurityUpdateId: null,
      recommendedSecurityUpdateUrl: null,
      diskPaths: [],
      registryPaths: [],
      lastSeenTimestamp: timestamp.replace('T', ' ').replace('Z', ''),
      firstSeenTimestamp: timestamp.replace('T', ' ').replace('Z', ''),
      exploitabilityLevel: 'NoExploit',
      recommendationReference: `va-_-_${cve.softwareVendor}-_-_${cve.softwareName}`,
      status: 'New',
      eventTimestamp: timestamp.replace('T', ' ').replace('Z', ''),
      cvssScore: cve.cvssScore,
      rbacGroupId: 0,
      isOnboarded: true,
    };
    return this.wrap('microsoft_defender_endpoint.vulnerability', timestamp, raw, employee, device);
  }
}
