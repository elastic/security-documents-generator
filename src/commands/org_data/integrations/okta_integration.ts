/**
 * Okta Entity Analytics Integration
 *
 * Generates user and device documents for the entity data stream.
 * Matches Beats entity-analytics input format: flat `okta` object that the
 * entity ingest pipeline renames to entityanalytics_okta and routes to user/device.
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
  type OktaGroup,
  type OktaSyncMarkerDocument,
  type CorrelationMap,
} from '../types.ts';
import { faker } from '@faker-js/faker';

const IDENTITY_SOURCE = 'okta-saas-organization';
const ENTITY_DATASET = 'entityanalytics_okta.entity';

/**
 * Okta Entity Analytics Integration
 */
export class OktaIntegration extends BaseIntegration {
  readonly packageName = 'entityanalytics_okta';
  readonly displayName = 'Okta Entity Analytics';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'entity',
      index: 'logs-entityanalytics_okta.entity-default',
    },
  ];

  /**
   * Generate all Okta documents.
   * All docs go to entity index; pipeline routes user/device to their indices.
   */
  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];
    const entityIndex = this.dataStreams[0].index;
    const timestamp = this.getTimestamp();

    documents.push(this.createSyncMarker('started', timestamp));

    for (const employee of org.employees) {
      correlationMap.oktaUserIdToEmployee.set(employee.oktaUserId, employee);
      correlationMap.employeeIdToOktaUserId.set(employee.id, employee.oktaUserId);
      documents.push(this.createUserDocument(employee, org, timestamp));
    }

    documents.push(this.createSyncMarker('completed', timestamp));
    documents.push(this.createDeviceSyncMarker('started', timestamp));

    for (const employee of org.employees) {
      for (const device of employee.devices) {
        documents.push(this.createDeviceDocument(device, employee, org, timestamp));
      }
    }

    documents.push(this.createDeviceSyncMarker('completed', timestamp));

    documentsMap.set(entityIndex, documents);
    return documentsMap;
  }

  /**
   * Create an Okta user document in Beats entity-analytics format (flat okta).
   * Pipeline renames okta -> entityanalytics_okta.user and enriches ECS.
   */
  private createUserDocument(
    employee: Employee,
    org: Organization,
    timestamp: string,
  ): IntegrationDocument {
    const createdDate = faker.date.past({ years: 2 }).toISOString();
    const activatedDate = new Date(new Date(createdDate).getTime() + 60000).toISOString();
    const lastLogin = faker.date.recent({ days: 7 }).toISOString();
    const lastUpdated = faker.date.recent({ days: 30 }).toISOString();
    const statusChanged = faker.date.past({ years: 1 }).toISOString();
    const passwordChanged = faker.date.recent({ days: 90 }).toISOString();
    const displayName = `${employee.firstName} ${employee.lastName}`;
    const employeeGroups = this.getEmployeeGroups(employee, org.oktaGroups);
    const userRoles = this.getUserRoles(employee);
    const userType = employee.role.includes('Contractor') ? 'Contractor' : 'Employee';
    const mobilePhone = faker.phone.number({ style: 'international' });
    const primaryPhone = faker.phone.number({ style: 'international' });
    const secondEmail = `${employee.userName}+recovery@${org.domain}`;
    const streetAddress = faker.location.streetAddress();
    const state = faker.location.state();
    const zipCode = faker.location.zipCode();

    return {
      '@timestamp': timestamp,
      event: { action: 'user-discovered' },
      okta: {
        id: employee.oktaUserId,
        status: 'ACTIVE',
        created: createdDate,
        activated: activatedDate,
        statusChanged: statusChanged,
        lastLogin: lastLogin,
        lastUpdated: lastUpdated,
        passwordChanged: passwordChanged,
        type: { id: `oty${faker.string.alphanumeric(14)}` },
        profile: {
          login: employee.email,
          email: employee.email,
          firstName: employee.firstName,
          lastName: employee.lastName,
          middleName: faker.datatype.boolean(0.3) ? faker.person.middleName() : undefined,
          nickName: employee.firstName,
          displayName: displayName,
          secondEmail: secondEmail,
          primaryPhone: primaryPhone,
          mobilePhone: mobilePhone,
          streetAddress: streetAddress,
          city: employee.city,
          state: state,
          zipCode: zipCode,
          countryCode: employee.countryCode,
          preferredLanguage: 'en',
          locale: 'en_US',
          timezone: employee.timezone,
          userType: userType,
          employeeNumber: employee.employeeNumber,
          costCenter: `CC-${employee.department
            .replace(/[^A-Za-z]/g, '')
            .substring(0, 4)
            .toUpperCase()}`,
          organization: org.name,
          division: employee.department,
          department: employee.department,
          title: employee.role,
          managerId: employee.managerId,
        },
        credentials: {
          provider: { type: 'OKTA', name: 'OKTA' },
          recovery_question: { is_set: true },
        },
        _links: {
          self: {
            href: `https://${org.domain.replace('.com', '')}.okta.com/api/v1/users/${employee.oktaUserId}`,
          },
        },
      },
      groups: employeeGroups.map((g) => ({
        id: g.id,
        profile: { name: g.name, description: g.description },
      })),
      roles: userRoles.map((r) => ({
        id: r.id,
        label: r.label,
        assignmentType: r.assignment_type,
        lastUpdated: r.last_updated ?? r.created ?? lastUpdated,
      })),
      user: { id: employee.oktaUserId },
      labels: { identity_source: IDENTITY_SOURCE },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: ENTITY_DATASET,
      },
      tags: ['forwarded', 'entityanalytics_okta-entity'],
    };
  }

  /**
   * Create an Okta device document in Beats entity-analytics format (flat okta).
   * Pipeline renames okta -> entityanalytics_okta.device and enriches ECS.
   */
  private createDeviceDocument(
    device: Device,
    employee: Employee,
    org: Organization,
    timestamp: string,
  ): IntegrationDocument {
    const createdDate = faker.date.past({ years: 1 }).toISOString();
    const activatedDate = new Date(new Date(createdDate).getTime() + 60000).toISOString();
    const lastUpdated = faker.date.recent({ days: 30 }).toISOString();
    const statusChanged = faker.date.past({ years: 0.5 }).toISOString();

    const platformMapping: Record<string, string> = {
      mac: 'MACOS',
      windows: 'WINDOWS',
      linux: 'LINUX',
      android: 'ANDROID',
      ios: 'IOS',
    };

    const platform = platformMapping[device.platform] || device.platform.toUpperCase();
    const diskEncryptionType = device.diskEncryptionEnabled ? 'ALL_INTERNAL_VOLUMES' : 'NONE';
    const displayName = device.displayName;

    return {
      '@timestamp': timestamp,
      event: { action: 'device-discovered' },
      okta: {
        id: device.id,
        status: 'ACTIVE',
        created: createdDate,
        activated: activatedDate,
        statusChanged: statusChanged,
        lastUpdated: lastUpdated,
        profile: {
          platform: platform,
          displayName: displayName,
          sid:
            device.platform === 'windows'
              ? `S-1-5-21-${faker.string.numeric(10)}-${faker.string.numeric(10)}-${faker.string.numeric(10)}`
              : undefined,
          serialNumber: device.serialNumber,
          diskEncryptionType: diskEncryptionType,
          registered: device.registered,
          secureHardwarePresent: device.platform === 'mac' || device.platform === 'ios',
        },
        users: [
          {
            id: employee.oktaUserId,
            status: 'ACTIVE',
            profile: {
              login: employee.email,
              email: employee.email,
              firstName: employee.firstName,
              lastName: employee.lastName,
              displayName: `${employee.firstName} ${employee.lastName}`,
              nickName: employee.firstName,
            },
          },
        ],
        _links: {
          self: {
            href: `https://${org.domain.replace('.com', '')}.okta.com/api/v1/devices/${device.id}`,
          },
          users: {
            href: `https://${org.domain.replace('.com', '')}.okta.com/api/v1/devices/${device.id}/users`,
          },
        },
      },
      device: { id: device.id },
      labels: { identity_source: IDENTITY_SOURCE },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: ENTITY_DATASET,
      },
      tags: ['forwarded', 'entityanalytics_okta-entity'],
    };
  }

  /**
   * Create a sync marker document for users
   */
  private createSyncMarker(
    action: 'started' | 'completed',
    timestamp: string,
  ): OktaSyncMarkerDocument {
    return {
      '@timestamp': timestamp,
      event: {
        action,
        kind: 'asset',
        dataset: ENTITY_DATASET,
        ...(action === 'started' ? { start: timestamp } : { end: timestamp }),
      },
      labels: { identity_source: IDENTITY_SOURCE },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: ENTITY_DATASET,
      },
      tags: ['forwarded', 'entityanalytics_okta-entity'],
    };
  }

  /**
   * Create a sync marker document for devices
   */
  private createDeviceSyncMarker(
    action: 'started' | 'completed',
    timestamp: string,
  ): OktaSyncMarkerDocument {
    return {
      '@timestamp': timestamp,
      event: {
        action,
        kind: 'asset',
        dataset: ENTITY_DATASET,
        ...(action === 'started' ? { start: timestamp } : { end: timestamp }),
      },
      labels: { identity_source: IDENTITY_SOURCE },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: ENTITY_DATASET,
      },
      tags: ['forwarded', 'entityanalytics_okta-entity'],
    };
  }

  /**
   * Get groups for an employee based on department and access
   */
  private getEmployeeGroups(employee: Employee, oktaGroups: OktaGroup[]): OktaGroup[] {
    const groups: OktaGroup[] = [];

    // Everyone group
    const everyoneGroup = oktaGroups.find((g) => g.name === 'Everyone');
    if (everyoneGroup) groups.push(everyoneGroup);

    // Department group
    const deptGroup = oktaGroups.find((g) => g.name === employee.department);
    if (deptGroup) groups.push(deptGroup);

    // AWS access group (only for Product & Engineering)
    if (employee.hasAwsAccess) {
      const awsGroup = oktaGroups.find((g) => g.name === 'AWS-Access');
      if (awsGroup) groups.push(awsGroup);
    }

    // VPN access for all
    const vpnGroup = oktaGroups.find((g) => g.name === 'VPN-Users');
    if (vpnGroup) groups.push(vpnGroup);

    // GitHub access for engineering
    if (employee.department === 'Product & Engineering') {
      const githubGroup = oktaGroups.find((g) => g.name === 'GitHub-Access');
      if (githubGroup) groups.push(githubGroup);
    }

    return groups;
  }

  /**
   * Get Okta roles for an employee based on their position
   */
  private getUserRoles(employee: Employee): Array<{
    id: string;
    label: string;
    type: string;
    status: string;
    assignment_type: string;
    created?: string;
    last_updated?: string;
  }> {
    const roles: Array<{
      id: string;
      label: string;
      type: string;
      status: string;
      assignment_type: string;
      created?: string;
      last_updated?: string;
    }> = [];

    // Super Admin for executives
    if (
      employee.role.includes('Chief') ||
      employee.role === 'VP of Engineering' ||
      employee.role === 'VP of Operations'
    ) {
      roles.push({
        id: `ra1${faker.string.alphanumeric(14)}`,
        label: 'Super Administrator',
        type: 'SUPER_ADMIN',
        status: 'ACTIVE',
        assignment_type: 'USER',
        created: faker.date.past({ years: 1 }).toISOString(),
        last_updated: faker.date.recent({ days: 90 }).toISOString(),
      });
    }

    // Help Desk Admin for support and customer success managers
    if (
      employee.department === 'Customer Success' &&
      (employee.role.includes('Manager') || employee.role.includes('Director'))
    ) {
      roles.push({
        id: `ra1${faker.string.alphanumeric(14)}`,
        label: 'Help Desk Administrator',
        type: 'HELP_DESK_ADMIN',
        status: 'ACTIVE',
        assignment_type: 'USER',
        created: faker.date.past({ years: 1 }).toISOString(),
        last_updated: faker.date.recent({ days: 90 }).toISOString(),
      });
    }

    // Organization Admin for HR
    if (employee.department === 'Operations' && employee.role.includes('HR')) {
      roles.push({
        id: `ra1${faker.string.alphanumeric(14)}`,
        label: 'Organization Administrator',
        type: 'ORG_ADMIN',
        status: 'ACTIVE',
        assignment_type: 'USER',
        created: faker.date.past({ years: 1 }).toISOString(),
        last_updated: faker.date.recent({ days: 90 }).toISOString(),
      });
    }

    // Application Administrator for DevOps/SRE
    if (
      employee.role.includes('DevOps') ||
      employee.role.includes('Site Reliability') ||
      employee.role.includes('Platform Engineer')
    ) {
      roles.push({
        id: `ra1${faker.string.alphanumeric(14)}`,
        label: 'Application Administrator',
        type: 'APP_ADMIN',
        status: 'ACTIVE',
        assignment_type: 'USER',
        created: faker.date.past({ years: 1 }).toISOString(),
        last_updated: faker.date.recent({ days: 90 }).toISOString(),
      });
    }

    return roles;
  }

  /**
   * Generate MFA factors for an employee
   * Based on beats Factor struct from okta.go
   */
  private getUserFactors(employee: Employee): Array<{
    id: string;
    factorType: string;
    provider: string;
    vendorName: string;
    status: string;
    created?: string;
    lastUpdated?: string;
    profile?: Record<string, unknown>;
  }> {
    const factors: Array<{
      id: string;
      factorType: string;
      provider: string;
      vendorName: string;
      status: string;
      created?: string;
      lastUpdated?: string;
      profile?: Record<string, unknown>;
    }> = [];

    const createdDate = faker.date.past({ years: 1 }).toISOString();
    const lastUpdated = faker.date.recent({ days: 60 }).toISOString();

    // Everyone gets Okta Verify push factor
    factors.push({
      id: `opf${faker.string.alphanumeric(14)}`,
      factorType: 'push',
      provider: 'OKTA',
      vendorName: 'OKTA',
      status: 'ACTIVE',
      created: createdDate,
      lastUpdated: lastUpdated,
      profile: {
        credentialId: employee.email,
        deviceType: 'SmartPhone_IPhone',
        keys: [{ kty: 'EC', use: 'sig' }],
        name: faker.helpers.arrayElement(['iPhone', 'Pixel', 'Samsung Galaxy']),
        platform: faker.helpers.arrayElement(['IOS', 'ANDROID']),
        version: faker.helpers.arrayElement(['16.6', '17.0', '14.0', '13.0']),
      },
    });

    // Everyone gets TOTP factor (Okta Verify TOTP)
    factors.push({
      id: `osf${faker.string.alphanumeric(14)}`,
      factorType: 'token:software:totp',
      provider: 'OKTA',
      vendorName: 'OKTA',
      status: 'ACTIVE',
      created: createdDate,
      lastUpdated: lastUpdated,
      profile: {
        credentialId: employee.email,
      },
    });

    // 70% have SMS factor as backup
    if (faker.datatype.boolean(0.7)) {
      factors.push({
        id: `smf${faker.string.alphanumeric(14)}`,
        factorType: 'sms',
        provider: 'OKTA',
        vendorName: 'OKTA',
        status: 'ACTIVE',
        created: createdDate,
        lastUpdated: lastUpdated,
        profile: {
          phoneNumber: faker.phone.number({ style: 'international' }),
        },
      });
    }

    // Engineering gets WebAuthn/FIDO2 factor (security key)
    if (employee.department === 'Product & Engineering' || employee.department === 'Executive') {
      factors.push({
        id: `fwf${faker.string.alphanumeric(14)}`,
        factorType: 'webauthn',
        provider: 'FIDO',
        vendorName: 'FIDO',
        status: 'ACTIVE',
        created: createdDate,
        lastUpdated: lastUpdated,
        profile: {
          authenticatorName: faker.helpers.arrayElement([
            'YubiKey 5',
            'YubiKey 5 NFC',
            'MacBook Touch ID',
            'Windows Hello',
          ]),
        },
      });
    }

    return factors;
  }
}
