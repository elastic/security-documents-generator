/**
 * Microsoft Defender XDR (m365_defender) integration.
 * Raw pre-pipeline documents: message = JSON.stringify(Graph / Advanced Hunting payload).
 * Alert evidence follows the Microsoft Graph alert shape (userEvidence + deviceEvidence).
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import { type Organization, type CorrelationMap, type Employee, type Device } from '../types.ts';
import { faker } from '@faker-js/faker';

const TENANT_ID = 'a839b112-1253-6432-9bf6-94542403f21c';
const DETECTOR_ID = '7f1c3609-a3ff-40e2-995b-c01770161d68';

const ALERT_TITLES = [
  'Suspicious PowerShell command line',
  'Suspicious execution of hidden file',
  'Anomalous sign-in followed by mailbox rule',
  'Credential access from an unusual process',
];

const hostnameFor = (employee: Employee, device: Device): string =>
  `${employee.userName}-${device.platform}`;

const netbiosFor = (employee: Employee): string =>
  (employee.email.split('@')[1]?.split('.')[0] ?? 'corp').toUpperCase();

const laptopEntries = (correlationMap: CorrelationMap) =>
  [...correlationMap.defenderDeviceIdToDevice.entries()].filter(
    ([, { device }]) => device.type === 'laptop',
  );

const osEvidenceFor = (platform: Device['platform']): { osPlatform: string; osBuild: number } => {
  if (platform === 'windows') {
    return { osPlatform: 'Windows11', osBuild: 22621 };
  }
  if (platform === 'mac') {
    return { osPlatform: 'macOS', osBuild: 0 };
  }
  return { osPlatform: 'Linux', osBuild: 0 };
};

export class M365DefenderIntegration extends BaseIntegration {
  readonly packageName = 'm365_defender';
  readonly displayName = 'Microsoft Defender XDR';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'alert', index: 'logs-m365_defender.alert-default' },
    { name: 'event', index: 'logs-m365_defender.event-default' },
    { name: 'incident', index: 'logs-m365_defender.incident-default' },
    { name: 'vulnerability', index: 'logs-m365_defender.vulnerability-default' },
  ];

  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const laptops = laptopEntries(correlationMap);
    const alertDocs: IntegrationDocument[] = [];
    const eventDocs: IntegrationDocument[] = [];
    const incidentDocs: IntegrationDocument[] = [];
    const vulnDocs: IntegrationDocument[] = [];

    for (const [, { employee, device }] of laptops) {
      const alertCount = faker.number.int({ min: 1, max: 2 });
      for (let i = 0; i < alertCount; i++) {
        alertDocs.push(this.alertDoc(employee, device, org));
      }
      if (device.platform === 'windows') {
        const eventCount = faker.number.int({ min: 2, max: 5 });
        for (let i = 0; i < eventCount; i++) {
          eventDocs.push(this.eventDoc(employee, device, org));
        }
      }
      if (faker.datatype.boolean(0.2)) {
        incidentDocs.push(this.incidentDoc(employee, device, org));
      }
      if (device.platform === 'windows' && faker.datatype.boolean(0.3)) {
        vulnDocs.push(this.vulnerabilityDoc(employee, device));
      }
    }

    return new Map([
      ['logs-m365_defender.alert-default', alertDocs],
      ['logs-m365_defender.event-default', eventDocs],
      ['logs-m365_defender.incident-default', incidentDocs],
      ['logs-m365_defender.vulnerability-default', vulnDocs],
    ]);
  }

  private wrap(
    dataset: string,
    timestamp: string,
    raw: Record<string, unknown>,
    employee: Employee,
    device: Device,
  ): IntegrationDocument {
    return {
      '@timestamp': timestamp,
      agent: this.buildLocalAgent(device, hostnameFor(employee, device)),
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset },
    } as IntegrationDocument;
  }

  private alertDoc(employee: Employee, device: Device, org: Organization): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(48);
    const hostname = hostnameFor(employee, device);
    const osEvidence = osEvidenceFor(device.platform);
    const alertId = `da${faker.string.hexadecimal({ length: 8, prefix: '' })}-${faker.string.uuid()}_1`;
    const incidentId = String(faker.number.int({ min: 10, max: 5000 }));
    const title = faker.helpers.arrayElement(ALERT_TITLES);
    const severity = faker.helpers.weightedArrayElement([
      { value: 'low', weight: 30 },
      { value: 'medium', weight: 45 },
      { value: 'high', weight: 20 },
      { value: 'informational', weight: 5 },
    ]);
    const raw = {
      actorDisplayName: null,
      additionalData: null,
      alertPolicyId: null,
      alertWebUrl: `https://security.microsoft.com/alerts/${alertId}?tid=${TENANT_ID}`,
      assignedTo: null,
      category: 'Execution',
      classification: null,
      comments: [],
      createdDateTime: timestamp,
      description: `${title} observed on ${hostname} (${org.name}).`,
      detectionSource: 'microsoftDefenderForEndpoint',
      detectorId: DETECTOR_ID,
      determination: null,
      evidence: [
        {
          '@odata.type': '#microsoft.graph.security.deviceEvidence',
          azureAdDeviceId: device.id,
          createdDateTime: timestamp,
          defenderAvStatus: 'updated',
          detailedRoles: ['PrimaryDevice'],
          deviceDnsName: hostname,
          firstSeenDateTime: timestamp,
          healthStatus: 'active',
          ipInterfaces: [device.ipAddress],
          loggedOnUsers: [
            {
              accountName: employee.userName,
              domainName: netbiosFor(employee),
            },
          ],
          mdeDeviceId: device.defenderDeviceId,
          onboardingStatus: 'onboarded',
          osBuild: osEvidence.osBuild,
          osPlatform: osEvidence.osPlatform,
          rbacGroupId: 0,
          rbacGroupName: null,
          remediationStatus: 'none',
          remediationStatusDetails: null,
          riskScore: 'high',
          roles: [],
          tags: [],
          verdict: 'unknown',
          version: '22H2',
          vmMetadata: null,
        },
        {
          '@odata.type': '#microsoft.graph.security.userEvidence',
          createdDateTime: timestamp,
          userAccount: {
            accountName: employee.userName,
            domainName: netbiosFor(employee),
            userPrincipalName: employee.email,
            azureAdUserId: employee.entraIdUserId,
            userSid: employee.windowsSid,
          },
          verdict: 'suspicious',
        },
      ],
      firstActivityDateTime: timestamp,
      id: alertId,
      incidentId,
      incidentWebUrl: `https://security.microsoft.com/incidents/${incidentId}?tid=${TENANT_ID}`,
      lastActivityDateTime: timestamp,
      lastUpdateDateTime: timestamp,
      mitreTechniques: ['T1059.001'],
      productName: 'Microsoft Defender for Endpoint',
      providerAlertId: alertId.replace(/^da/, ''),
      recommendedActions: 'Examine the PowerShell command line and related process tree.',
      resolvedDateTime: null,
      serviceSource: 'microsoftDefenderForEndpoint',
      severity,
      status: 'new',
      tenantId: TENANT_ID,
      threatDisplayName: null,
      threatFamilyName: null,
      title,
    };
    return this.wrap('m365_defender.alert', timestamp, raw, employee, device);
  }

  private eventDoc(employee: Employee, device: Device, org: Organization): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const hostname = hostnameFor(employee, device);
    const raw = {
      Tenant: org.name,
      category: 'AdvancedHunting-DeviceProcessEvents',
      operationName: 'Publish',
      time: timestamp,
      tenantId: TENANT_ID,
      properties: {
        Timestamp: timestamp,
        AccountDomain: netbiosFor(employee),
        AccountName: employee.userName,
        AccountObjectId: employee.entraIdUserId,
        AccountSid: employee.windowsSid,
        AccountUpn: employee.email,
        ActionType: 'ProcessCreated',
        AdditionalFields: '[]',
        AppGuardContainerId: null,
        DeviceId: device.defenderDeviceId,
        DeviceName: hostname,
        FileName: 'powershell.exe',
        FileSize: 452608,
        FolderPath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        InitiatingProcessAccountDomain: netbiosFor(employee),
        InitiatingProcessAccountName: employee.userName,
        InitiatingProcessAccountObjectId: employee.entraIdUserId,
        InitiatingProcessAccountSid: employee.windowsSid,
        InitiatingProcessAccountUpn: employee.email,
        InitiatingProcessCommandLine: 'explorer.exe',
        InitiatingProcessCreationTime: timestamp,
        InitiatingProcessFileName: 'explorer.exe',
        InitiatingProcessFileSize: 4000000,
        InitiatingProcessFolderPath: 'C:\\Windows\\explorer.exe',
        InitiatingProcessId: faker.number.int({ min: 400, max: 2000 }),
        InitiatingProcessIntegrityLevel: 'Medium',
        InitiatingProcessMD5: faker.string.hexadecimal({ length: 32, prefix: '', casing: 'lower' }),
        InitiatingProcessParentCreationTime: timestamp,
        InitiatingProcessParentFileName: 'userinit.exe',
        InitiatingProcessParentId: faker.number.int({ min: 100, max: 400 }),
        InitiatingProcessSHA1: faker.string.hexadecimal({
          length: 40,
          prefix: '',
          casing: 'lower',
        }),
        InitiatingProcessSHA256: faker.string.hexadecimal({
          length: 64,
          prefix: '',
          casing: 'lower',
        }),
        MD5: faker.string.hexadecimal({ length: 32, prefix: '', casing: 'lower' }),
        SHA1: faker.string.hexadecimal({ length: 40, prefix: '', casing: 'lower' }),
        SHA256: faker.string.hexadecimal({ length: 64, prefix: '', casing: 'lower' }),
        ProcessCommandLine: 'powershell.exe -ep bypass -file C:\\temp\\script.ps1',
        ProcessCreationTime: timestamp,
        ProcessId: faker.number.int({ min: 2000, max: 65000 }),
        ProcessIntegrityLevel: 'Medium',
        ProcessTokenElevation: 'None',
        ReportId: faker.number.int({ min: 1, max: 99999 }),
        MachineGroup: employee.department,
      },
    };
    return this.wrap('m365_defender.event', timestamp, raw, employee, device);
  }

  private incidentDoc(employee: Employee, device: Device, org: Organization): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const hostname = hostnameFor(employee, device);
    const incidentId = String(faker.number.int({ min: 1000, max: 99999 }));
    const alertId = `da${faker.string.numeric(18)}_${faker.string.numeric(9)}`;
    const osEvidence = osEvidenceFor(device.platform);
    const raw = {
      '@odata.type': '#microsoft.graph.security.incident',
      assignedTo: employee.email,
      classification: 'truePositive',
      comments: [],
      createdDateTime: timestamp,
      determination: 'multiStagedAttack',
      displayName: `Multi-stage incident on ${hostname}`,
      id: incidentId,
      incidentWebUrl: `https://security.microsoft.com/incidents/${incidentId}?tid=${TENANT_ID}`,
      lastUpdateDateTime: timestamp,
      redirectIncidentId: null,
      severity: 'medium',
      status: 'active',
      customTags: [org.name],
      tenantId: TENANT_ID,
      alerts: [
        {
          '@odata.type': '#microsoft.graph.security.alert',
          id: alertId,
          incidentId,
          title: faker.helpers.arrayElement(ALERT_TITLES),
          severity: 'medium',
          status: 'new',
          category: 'Execution',
          serviceSource: 'microsoftDefenderForEndpoint',
          detectionSource: 'microsoftDefenderForEndpoint',
          productName: 'Microsoft Defender for Endpoint',
          tenantId: TENANT_ID,
          createdDateTime: timestamp,
          firstActivityDateTime: timestamp,
          lastActivityDateTime: timestamp,
          lastUpdateDateTime: timestamp,
          description: `Suspicious activity on ${hostname}.`,
          alertWebUrl: `https://security.microsoft.com/alerts/${alertId}?tid=${TENANT_ID}`,
          incidentWebUrl: `https://security.microsoft.com/incidents/${incidentId}?tid=${TENANT_ID}`,
          evidence: [
            {
              '@odata.type': '#microsoft.graph.security.deviceEvidence',
              deviceDnsName: hostname,
              mdeDeviceId: device.defenderDeviceId,
              azureAdDeviceId: device.id,
              createdDateTime: timestamp,
              firstSeenDateTime: timestamp,
              healthStatus: 'active',
              onboardingStatus: 'onboarded',
              osPlatform: osEvidence.osPlatform,
              osBuild: osEvidence.osBuild,
              rbacGroupId: 0,
              loggedOnUsers: [{ accountName: employee.userName, domainName: netbiosFor(employee) }],
              verdict: 'unknown',
            },
            {
              '@odata.type': '#microsoft.graph.security.userEvidence',
              createdDateTime: timestamp,
              userAccount: {
                accountName: employee.userName,
                domainName: netbiosFor(employee),
                userPrincipalName: employee.email,
                azureAdUserId: employee.entraIdUserId,
                userSid: employee.windowsSid,
              },
            },
          ],
        },
      ],
    };
    return this.wrap('m365_defender.incident', timestamp, raw, employee, device);
  }

  private vulnerabilityDoc(employee: Employee, device: Device): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const hostname = hostnameFor(employee, device);
    const cveId = 'CVE-2022-49226';
    const vulnId = `${device.defenderDeviceId}_microsoft_windows_${cveId}`;
    const stamp = timestamp.replace('T', ' ').replace('Z', '');
    const raw = {
      cveId,
      deviceId: device.defenderDeviceId,
      deviceName: hostname,
      diskPaths: [],
      eventTimestamp: stamp,
      exploitabilityLevel: 'NoExploit',
      firstSeenTimestamp: stamp,
      id: vulnId,
      lastSeenTimestamp: stamp,
      osArchitecture: 'x64',
      osPlatform: device.platform === 'windows' ? 'Windows' : device.platform,
      osVersion: '22H2',
      rbacGroupName: 'Unassigned',
      recommendationReference: 'va-_-microsoft-_-windows',
      recommendedSecurityUpdate: cveId,
      recommendedSecurityUpdateId: null,
      recommendedSecurityUpdateUrl: null,
      registryPaths: [],
      softwareName: 'windows',
      softwareVendor: 'microsoft',
      softwareVersion: '10.0.22621',
      status: 'New',
      vulnerabilitySeverityLevel: 'Medium',
    };
    return this.wrap('m365_defender.vulnerability', timestamp, raw, employee, device);
  }
}
