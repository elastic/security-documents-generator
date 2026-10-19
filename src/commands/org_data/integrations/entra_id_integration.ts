/**
 * Entra ID Entity Analytics Integration
 *
 * Generates user and device documents indexed through the entity data stream.
 * The entity ingest pipeline handles ECS enrichment, field renaming, and
 * rerouting to the user/device data streams (matching real Filebeat behavior).
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import {
  type Organization,
  type Employee,
  type Device,
  type EntraIdGroup,
  type EntraIdUserDocument,
  type EntraIdDeviceDocument,
  type EntraIdSyncMarkerDocument,
  type CorrelationMap,
} from '../types.ts';
import { faker } from '@faker-js/faker';

const IDENTITY_SOURCE = 'entra_id-saas-organization';

/**
 * Tags applied to every published document.
 *
 * `preserve_duplicate_custom_fields` is load-bearing, not cosmetic. Without it the
 * entity default pipeline strips every subfield of
 * entityanalytics_entra_id.device.registered_owners (id, mail, user_principal_name,
 * ...) as "duplicates", on the assumption they are already covered by related.user:
 *
 *   default.yml -> foreach entityanalytics_entra_id.device.registered_owners
 *                  remove [id, user_principal_name, mail, ...]
 *                  if: !ctx.tags.contains('preserve_duplicate_custom_fields')
 *
 * That would leave only the flat related.user array (UPN/mail/display_name mixed
 * together, no id), which is too weak to resolve a device's owner back to a user.
 * The package's own pipeline fixtures set the same tag via test-common-config.yml,
 * which is why their expected output retains populated owners.
 *
 * Note this models a policy with "Preserve duplicate custom fields" enabled; real
 * Filebeat leaves it off by default.
 */
const ENTITY_TAGS = [
  'forwarded',
  'entityanalytics_entra_id-entity',
  'preserve_duplicate_custom_fields',
];

/**
 * Entra ID exposes two distinct login/contact identifiers per user, and they are
 * routinely different in real tenants: userPrincipalName is the sign-in name,
 * while mail is the SMTP address of the mailbox (and is absent entirely for
 * accounts without one).
 *
 * The entity pipeline maps them to two different ECS fields:
 *   azure_ad.userPrincipalName -> user.name
 *   azure_ad.mail              -> user.email
 *
 * Employee.email is a single value shared by ~40 other integrations, so deriving
 * mail from it verbatim would make user.name and user.email identical. Anything
 * resolving a device's registered owner back to a user by ranking id > UPN > mail
 * would then pass even if it matched on the wrong field. Deriving mail with a
 * different local-part separator keeps the two independently verifiable without
 * touching the shared Employee.email that other integrations correlate on.
 */
const entraUserPrincipalName = (employee: Employee): string => employee.email;

const entraMail = (employee: Employee): string => {
  const atIndex = employee.email.lastIndexOf('@');
  if (atIndex === -1) return employee.email;
  const localPart = employee.email.slice(0, atIndex).replaceAll('.', '_');
  return `${localPart}${employee.email.slice(atIndex)}`;
};

/**
 * Build the registered owner/user object for a device, in the raw camelCase Graph
 * shape that Filebeat publishes. The entity pipeline snake-cases these keys into
 * entityanalytics_entra_id.device.registered_owners.*
 *
 * The id/userPrincipalName/mail triple is what lets a device document be joined
 * back to its owner's user document on user.id / user.name / user.email.
 */
const buildOwnerInfo = (employee: Employee) => ({
  id: employee.entraIdUserId,
  userPrincipalName: entraUserPrincipalName(employee),
  mail: entraMail(employee),
  displayName: `${employee.firstName} ${employee.lastName}`,
  givenName: employee.firstName,
  surname: employee.lastName,
  jobTitle: employee.role,
  mobilePhone: faker.phone.number({ style: 'international' }),
  businessPhones: [faker.phone.number({ style: 'international' })],
});

/**
 * Entra ID Entity Analytics Integration
 * Generates users and devices synced from Microsoft Entra ID (formerly Azure AD)
 */
export class EntraIdIntegration extends BaseIntegration {
  readonly packageName = 'entityanalytics_entra_id';
  readonly displayName = 'Microsoft Entra ID Entity Analytics';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'entity',
      index: 'logs-entityanalytics_entra_id.entity-default',
    },
  ];

  /**
   * Generate all Entra ID documents.
   *
   * All documents are indexed through the entity data stream, matching real
   * Filebeat entity analytics behavior. The entity ingest pipeline processes
   * the documents (enriching ECS fields, renaming azure_ad, etc.) and then
   * reroutes user docs to the user data stream and device docs to the device
   * data stream. Only sync markers remain in the entity index.
   */
  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const entityIndex = this.dataStreams[0].index;
    const entityDataset = 'entityanalytics_entra_id.entity';
    const timestamp = this.getTimestamp();
    const centralAgent = this.buildCentralAgent(org);
    const documents: IntegrationDocument[] = [];

    // Sync start marker
    documents.push(this.createSyncMarker('started', timestamp, entityDataset, centralAgent));

    // User documents
    for (const employee of org.employees) {
      correlationMap.entraIdUserIdToEmployee.set(employee.entraIdUserId, employee);
      documents.push(this.createUserDocument(employee, org, timestamp));
    }

    // Device documents (only laptops are enrolled in Entra ID)
    for (const employee of org.employees) {
      const laptops = employee.devices.filter((d) => d.type === 'laptop');
      for (const device of laptops) {
        documents.push(this.createDeviceDocument(device, employee, org, timestamp));
      }
    }

    // Shared workstation with multiple registered owners
    const sharedWorkstation = this.createSharedDeviceDocument(org, timestamp);
    if (sharedWorkstation) {
      documents.push(sharedWorkstation);
    }

    // Sync end marker
    documents.push(this.createSyncMarker('completed', timestamp, entityDataset, centralAgent));

    documentsMap.set(entityIndex, documents);
    return documentsMap;
  }

  /**
   * Create an Entra ID user document.
   *
   * Matches real Filebeat publishUser() output: only azure_ad (raw camelCase),
   * user.id, user.group, event.action, and labels. The entity ingest pipeline
   * handles all ECS enrichment (event.kind, event.category, event.type, etc.),
   * field renaming (azure_ad -> entityanalytics_entra_id.user), and rerouting
   * to the user data stream.
   */
  private createUserDocument(
    employee: Employee,
    org: Organization,
    timestamp: string,
  ): EntraIdUserDocument {
    // Find groups for this employee
    const employeeGroups = this.getEmployeeGroups(employee, org.entraIdGroups);

    // Generate realistic phone numbers
    const mobilePhone = faker.phone.number({ style: 'international' });
    const businessPhone = faker.phone.number({ style: 'international' });

    // Direct reports (managerId references the manager's shared person id / oktaUserId)
    // become the supervises relationship. The raw azure_ad.directReports shape is the
    // expanded Graph object; the entity pipeline renames it and builds
    // user.entity.relationships.supervises.user.{id,name,email}.
    const directReports = org.employees
      .filter((report) => report.managerId === employee.oktaUserId)
      .map((report) => ({
        id: report.entraIdUserId,
        displayName: `${report.firstName} ${report.lastName}`,
        userPrincipalName: entraUserPrincipalName(report),
        mail: entraMail(report),
      }));

    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      azure_ad: {
        userPrincipalName: entraUserPrincipalName(employee),
        mail: entraMail(employee),
        displayName: `${employee.firstName} ${employee.lastName}`,
        givenName: employee.firstName,
        surname: employee.lastName,
        jobTitle: employee.role,
        department: employee.department,
        officeLocation: `${employee.city}, ${employee.country}`,
        mobilePhone: mobilePhone,
        businessPhones: [businessPhone],
        accountEnabled: true,
        ...(directReports.length > 0 && { directReports }),
      },
      event: {
        action: 'user-discovered',
      },
      user: {
        id: employee.entraIdUserId,
        group: employeeGroups.map((g) => ({
          id: g.id,
          name: g.name,
        })),
      },
      labels: {
        identity_source: IDENTITY_SOURCE,
      },
      tags: ENTITY_TAGS,
    };
  }

  /**
   * Create an Entra ID device document.
   *
   * Matches real Filebeat publishDevice() output: only azure_ad (raw camelCase),
   * device.id, device.group, device.registered_owners, device.registered_users,
   * event.action, and labels. The entity ingest pipeline handles all ECS
   * enrichment and rerouting to the device data stream.
   */
  private createDeviceDocument(
    device: Device,
    employee: Employee,
    org: Organization,
    timestamp: string,
  ): EntraIdDeviceDocument {
    const registrationDate = faker.date.past({ years: 1 }).toISOString();
    const lastSignIn = faker.date.recent({ days: 7 }).toISOString();

    // Map platform to OS info
    const osInfo = this.getOsInfo(device.platform);

    // Map platform to manufacturer/model
    const deviceInfo = this.getDeviceInfo(device.platform, device.displayName);

    // Determine trust type based on platform
    const trustType = this.getTrustType(device.platform);

    // Get device groups
    const deviceGroups = this.getDeviceGroups(device, org.entraIdGroups);

    // Create registered owner/user info
    const ownerInfo = buildOwnerInfo(employee);

    // Generate device display name in Entra ID format
    const entraDisplayName = this.generateEntraDeviceName(device.platform, employee);

    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      azure_ad: {
        accountEnabled: true,
        displayName: entraDisplayName,
        operatingSystem: osInfo.name,
        operatingSystemVersion: osInfo.version,
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        isManaged: true,
        isCompliant: device.diskEncryptionEnabled,
        trustType: trustType,
        deviceId: device.id,
        registrationDateTime: registrationDate,
        approximateLastSignInDateTime: lastSignIn,
        onPremisesSyncEnabled: false,
        physicalIds: [`[OrderId]:${faker.string.alphanumeric(12).toUpperCase()}`],
        extensionAttributes: {
          extensionAttribute1: employee.department,
          extensionAttribute2: employee.role,
        },
        alternativeSecurityIds: [
          {
            type: 2,
            key: faker.string.alphanumeric(64),
          },
        ],
      },
      event: {
        action: 'device-discovered',
      },
      device: {
        id: faker.string.uuid(), // Entra ID device object ID
        group: deviceGroups.map((g) => ({
          id: g.id,
          name: g.name,
        })),
        registered_owners: [ownerInfo],
        registered_users: [ownerInfo],
      },
      labels: {
        identity_source: IDENTITY_SOURCE,
      },
      tags: ENTITY_TAGS,
    };
  }

  /**
   * Create a shared workstation registered to multiple owners.
   *
   * Per-employee devices always carry exactly one registered owner, which leaves
   * the multi-owner case untested. It matters because
   * entityanalytics_entra_id.device.registered_owners is mapped as an object
   * group rather than `nested`, so Elasticsearch flattens the array at index
   * time:
   *
   *   registered_owners.id                  = [<owner A id>, <owner B id>]
   *   registered_owners.user_principal_name  = [<owner A upn>, <owner B upn>]
   *
   * The per-object correlation is lost, so a query combining two owner attributes
   * matches this document even when no single owner has that combination. Any
   * owner-to-user resolver needs a device like this to exercise that ambiguity,
   * and to confirm it emits one match per owner rather than collapsing to one.
   *
   * Returns null for organizations too small to have two distinct owners.
   */
  private createSharedDeviceDocument(
    org: Organization,
    timestamp: string,
  ): EntraIdDeviceDocument | null {
    const owners = org.employees.slice(0, 2);
    if (owners.length < 2) return null;

    const registrationDate = faker.date.past({ years: 1 }).toISOString();
    const lastSignIn = faker.date.recent({ days: 7 }).toISOString();
    const osInfo = this.getOsInfo('windows');
    const deviceGroups = this.getDeviceGroups(
      { diskEncryptionEnabled: true, platform: 'windows' } as Device,
      org.entraIdGroups,
    );

    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      azure_ad: {
        accountEnabled: true,
        displayName: `SHARED-WORKSTATION-${faker.string.alphanumeric(5).toUpperCase()}`,
        operatingSystem: osInfo.name,
        operatingSystemVersion: osInfo.version,
        manufacturer: 'Dell Inc.',
        model: 'OptiPlex 7090',
        isManaged: true,
        isCompliant: true,
        trustType: 'AzureAd',
        deviceId: faker.string.uuid(),
        registrationDateTime: registrationDate,
        approximateLastSignInDateTime: lastSignIn,
        onPremisesSyncEnabled: false,
        physicalIds: [`[OrderId]:${faker.string.alphanumeric(12).toUpperCase()}`],
        alternativeSecurityIds: [
          {
            type: 2,
            key: faker.string.alphanumeric(64),
          },
        ],
      },
      event: {
        action: 'device-discovered',
      },
      device: {
        id: faker.string.uuid(), // Entra ID device object ID
        group: deviceGroups.map((g) => ({
          id: g.id,
          name: g.name,
        })),
        registered_owners: owners.map((owner) => buildOwnerInfo(owner)),
        registered_users: owners.map((owner) => buildOwnerInfo(owner)),
      },
      labels: {
        identity_source: IDENTITY_SOURCE,
      },
      tags: ENTITY_TAGS,
    };
  }

  /**
   * Create a sync marker document
   */
  private createSyncMarker(
    action: 'started' | 'completed',
    timestamp: string,
    dataset: string,
    centralAgent: ReturnType<BaseIntegration['buildCentralAgent']>,
  ): EntraIdSyncMarkerDocument {
    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      event: {
        action,
        kind: 'asset',
        dataset,
        ...(action === 'started' ? { start: timestamp } : { end: timestamp }),
      },
      data_stream: {
        dataset,
        namespace: 'default',
        type: 'logs',
      },
      labels: {
        identity_source: IDENTITY_SOURCE,
      },
    };
  }

  /**
   * Get groups for an employee based on department
   */
  private getEmployeeGroups(employee: Employee, entraIdGroups: EntraIdGroup[]): EntraIdGroup[] {
    const groups: EntraIdGroup[] = [];

    // All Users group
    const allUsersGroup = entraIdGroups.find((g) => g.name === 'All Users');
    if (allUsersGroup) groups.push(allUsersGroup);

    // Department group
    const deptGroup = entraIdGroups.find((g) => g.name === employee.department);
    if (deptGroup) groups.push(deptGroup);

    // Microsoft 365 Users (all employees have M365 licenses)
    const m365Group = entraIdGroups.find((g) => g.name === 'Microsoft 365 Users');
    if (m365Group) groups.push(m365Group);

    // Azure Subscription Contributors for Product & Engineering
    if (employee.hasAwsAccess) {
      const azureGroup = entraIdGroups.find((g) => g.name === 'Azure Subscription Contributors');
      if (azureGroup) groups.push(azureGroup);
    }

    return groups;
  }

  /**
   * Get groups for a device based on its properties
   */
  private getDeviceGroups(device: Device, entraIdGroups: EntraIdGroup[]): EntraIdGroup[] {
    const groups: EntraIdGroup[] = [];

    // Managed Devices group (all enrolled devices)
    const managedGroup = entraIdGroups.find((g) => g.name === 'Managed Devices');
    if (managedGroup) groups.push(managedGroup);

    // Compliant Devices group (if disk encryption enabled)
    if (device.diskEncryptionEnabled) {
      const compliantGroup = entraIdGroups.find((g) => g.name === 'Compliant Devices');
      if (compliantGroup) groups.push(compliantGroup);
    }

    // Platform-specific groups
    if (device.platform === 'windows') {
      const windowsGroup = entraIdGroups.find((g) => g.name === 'Windows Devices');
      if (windowsGroup) groups.push(windowsGroup);
    } else if (device.platform === 'mac') {
      const macGroup = entraIdGroups.find((g) => g.name === 'macOS Devices');
      if (macGroup) groups.push(macGroup);
    }

    return groups;
  }

  /**
   * Get OS information based on platform
   */
  private getOsInfo(platform: string): { name: string; version: string } {
    const osVersions: Record<string, { name: string; versions: string[] }> = {
      windows: {
        name: 'Windows',
        versions: ['10.0.22621.2428', '10.0.22631.2715', '10.0.19045.3693', '11.0.22621.2506'],
      },
      mac: {
        name: 'macOS',
        versions: ['14.1.1', '14.0', '13.6.2', '13.5.2', '12.7.1'],
      },
      linux: {
        name: 'Linux',
        versions: ['Ubuntu 22.04', 'Ubuntu 24.04', 'Fedora 39', 'Debian 12'],
      },
    };

    const osInfo = osVersions[platform] || { name: platform, versions: ['1.0'] };
    return {
      name: osInfo.name,
      version: faker.helpers.arrayElement(osInfo.versions),
    };
  }

  /**
   * Get device manufacturer and model info
   */
  private getDeviceInfo(
    platform: string,
    displayName: string,
  ): { manufacturer: string; model: string } {
    if (platform === 'mac') {
      return {
        manufacturer: 'Apple Inc.',
        model: displayName.includes('MacBook') ? displayName : 'MacBook Pro',
      };
    }

    if (platform === 'windows') {
      if (displayName.includes('Dell')) {
        return { manufacturer: 'Dell Inc.', model: displayName };
      }
      if (displayName.includes('Lenovo')) {
        return { manufacturer: 'Lenovo', model: displayName };
      }
      if (displayName.includes('HP')) {
        return { manufacturer: 'HP Inc.', model: displayName };
      }
      if (displayName.includes('Surface')) {
        return { manufacturer: 'Microsoft Corporation', model: displayName };
      }
      return { manufacturer: 'Dell Inc.', model: 'Latitude 5530' };
    }

    if (platform === 'linux') {
      if (displayName.includes('Dell')) {
        return { manufacturer: 'Dell Inc.', model: displayName };
      }
      if (displayName.includes('Lenovo')) {
        return { manufacturer: 'Lenovo', model: displayName };
      }
      if (displayName.includes('System76')) {
        return { manufacturer: 'System76', model: displayName };
      }
      return { manufacturer: 'Lenovo', model: 'ThinkPad X1 Carbon' };
    }

    return { manufacturer: 'Unknown', model: displayName };
  }

  /**
   * Get trust type based on device platform
   */
  private getTrustType(platform: string): string {
    // Windows and Mac devices are typically Azure AD joined (cloud-only)
    // Linux devices use Workplace join (BYOD-style)
    if (platform === 'windows' || platform === 'mac') {
      return 'AzureAd';
    }
    return 'Workplace';
  }

  /**
   * Generate Entra ID device name
   */
  private generateEntraDeviceName(platform: string, employee: Employee): string {
    const prefix = platform === 'windows' ? 'DESKTOP' : platform === 'mac' ? 'MAC' : 'LINUX';
    const suffix = faker.string.alphanumeric(7).toUpperCase();
    const userName = employee.userName.split('.')[0].toUpperCase().substring(0, 5);
    return `${prefix}-${userName}-${suffix}`;
  }
}
