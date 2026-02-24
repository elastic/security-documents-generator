/**
 * Okta Entity Analytics Integration
 * Generates user and device documents for entityanalytics_okta data streams
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import {
  Organization,
  Employee,
  Device,
  OktaGroup,
  OktaUserDocument,
  OktaDeviceDocument,
  OktaSyncMarkerDocument,
  CorrelationMap,
} from '../types';
import { faker } from '@faker-js/faker';

const IDENTITY_SOURCE = 'okta-saas-organization';

/**
 * Okta Entity Analytics Integration
 */
export class OktaIntegration extends BaseIntegration {
  readonly packageName = 'entityanalytics_okta';
  readonly displayName = 'Okta Entity Analytics';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'user',
      index: 'logs-entityanalytics_okta.user-default',
    },
    {
      name: 'device',
      index: 'logs-entityanalytics_okta.device-default',
    },
  ];

  /**
   * Generate all Okta documents
   */
  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();

    // Generate user documents
    const userDocuments = this.generateUserDocuments(org, correlationMap);
    documentsMap.set(this.dataStreams[0].index, userDocuments);

    // Generate device documents
    const deviceDocuments = this.generateDeviceDocuments(org);
    documentsMap.set(this.dataStreams[1].index, deviceDocuments);

    return documentsMap;
  }

  /**
   * Generate Okta user documents for all employees
   */
  private generateUserDocuments(
    org: Organization,
    correlationMap: CorrelationMap
  ): IntegrationDocument[] {
    const documents: IntegrationDocument[] = [];
    const timestamp = this.getTimestamp();

    // Add sync start marker
    documents.push(this.createSyncMarker('started', timestamp));

    // Generate user document for each employee
    for (const employee of org.employees) {
      // Build correlation maps
      correlationMap.oktaUserIdToEmployee.set(employee.oktaUserId, employee);
      correlationMap.employeeIdToOktaUserId.set(employee.id, employee.oktaUserId);

      const userDoc = this.createUserDocument(employee, org, timestamp);
      documents.push(userDoc);
    }

    // Add sync end marker
    documents.push(this.createSyncMarker('completed', timestamp));

    return documents;
  }

  /**
   * Generate Okta device documents for all employee devices
   */
  private generateDeviceDocuments(org: Organization): IntegrationDocument[] {
    const documents: IntegrationDocument[] = [];
    const timestamp = this.getTimestamp();

    // Add sync start marker
    documents.push(this.createDeviceSyncMarker('started', timestamp));

    // Generate device document for each employee device
    for (const employee of org.employees) {
      for (const device of employee.devices) {
        const deviceDoc = this.createDeviceDocument(device, employee, org, timestamp);
        documents.push(deviceDoc);
      }
    }

    // Add sync end marker
    documents.push(this.createDeviceSyncMarker('completed', timestamp));

    return documents;
  }

  /**
   * Create an Okta user document
   */
  private createUserDocument(
    employee: Employee,
    org: Organization,
    timestamp: string
  ): OktaUserDocument {
    const createdDate = faker.date.past({ years: 2 }).toISOString();
    const activatedDate = new Date(new Date(createdDate).getTime() + 60000).toISOString();
    const lastLogin = faker.date.recent({ days: 7 }).toISOString();
    const lastUpdated = faker.date.recent({ days: 30 }).toISOString();
    const statusChanged = faker.date.past({ years: 1 }).toISOString();
    const passwordChanged = faker.date.recent({ days: 90 }).toISOString();
    const displayName = `${employee.firstName} ${employee.lastName}`;

    // Find groups for this employee
    const employeeGroups = this.getEmployeeGroups(employee, org.oktaGroups);

    // Determine user roles based on department
    const userRoles = this.getUserRoles(employee);

    // Generate MFA factors for the user
    const factors = this.getUserFactors(employee);

    // Determine user type
    const userType = employee.role.includes('Contractor') ? 'Contractor' : 'Employee';

    // Generate additional profile fields
    const mobilePhone = faker.phone.number({ style: 'international' });
    const primaryPhone = faker.phone.number({ style: 'international' });
    const secondEmail = `${employee.userName}+recovery@${org.domain}`;
    const streetAddress = faker.location.streetAddress();
    const state = faker.location.state();
    const zipCode = faker.location.zipCode();

    // Build roles array for user.roles ECS field
    const ecsRoles: string[] = [];
    for (const role of userRoles) {
      ecsRoles.push(role.id, role.label);
    }

    // Build related.user array
    const relatedUsers = [
      employee.oktaUserId,
      employee.email,
      employee.firstName,
      employee.lastName,
      employee.userName,
      displayName,
      employee.employeeNumber,
      secondEmail,
    ];
    if (employee.managerId) {
      relatedUsers.push(employee.managerId);
    }

    return {
      '@timestamp': timestamp,
      event: {
        action: 'user-discovered',
        kind: 'asset',
        dataset: 'entityanalytics_okta.user',
        category: ['iam'],
        type: ['user', 'info'],
      },
      entityanalytics_okta: {
        user: {
          id: employee.oktaUserId,
          status: 'ACTIVE',
          created: createdDate,
          activated: activatedDate,
          status_changed: statusChanged,
          last_login: lastLogin,
          last_updated: lastUpdated,
          password_changed: passwordChanged,
          type: { id: `oty${faker.string.alphanumeric(14)}` },
          profile: {
            login: employee.email,
            email: employee.email,
            first_name: employee.firstName,
            last_name: employee.lastName,
            middle_name: faker.datatype.boolean(0.3) ? faker.person.middleName() : undefined,
            nick_name: employee.firstName,
            display_name: displayName,
            second_email: secondEmail,
            primary_phone: primaryPhone,
            mobile_phone: mobilePhone,
            street_address: streetAddress,
            city: employee.city,
            state: state,
            zip_code: zipCode,
            country_code: employee.countryCode,
            preferred_language: 'en',
            locale: 'en_US',
            timezone: employee.timezone,
            user_type: userType,
            employee_number: employee.employeeNumber,
            cost_center: `CC-${employee.department
              .replace(/[^A-Za-z]/g, '')
              .substring(0, 4)
              .toUpperCase()}`,
            organization: org.name,
            division: employee.department,
            department: employee.department,
            title: employee.role,
            manager: employee.managerId
              ? {
                  id: employee.managerId,
                }
              : undefined,
          },
          credentials: {
            provider: {
              type: 'OKTA',
              name: 'OKTA',
            },
            recovery_question: {
              is_set: true,
            },
          },
          _links: {
            self: {
              href: `https://${org.domain.replace('.com', '')}.okta.com/api/v1/users/${employee.oktaUserId}`,
            },
          },
        },
        groups: employeeGroups.map((g) => ({
          id: g.id,
          profile: {
            name: g.name,
            description: g.description,
          },
        })),
        roles: userRoles,
        factors: factors,
      },
      user: {
        id: employee.oktaUserId,
        name: employee.email,
        email: employee.email,
        full_name: displayName,
        roles: ecsRoles.length > 0 ? ecsRoles : undefined,
        profile: {
          department: employee.department,
          job_title: employee.role,
          first_name: employee.firstName,
          last_name: employee.lastName,
          status: 'ACTIVE',
          id: employee.employeeNumber,
          type: userType,
          mobile_phone: mobilePhone,
          primaryPhone: primaryPhone,
          other_identities: secondEmail,
          secondEmail: secondEmail,
          manager: employee.managerId || undefined,
        },
        account: {
          create_date: createdDate,
          activated_date: activatedDate,
          change_date: statusChanged,
          password_change_date: passwordChanged,
          status: {
            password_expired: false,
            deprovisioned: false,
            locked_out: false,
            recovery: false,
            suspended: false,
          },
        },
        geo: {
          name: streetAddress,
          city_name: employee.city,
          region_name: state,
          postal_code: zipCode,
          country_iso_code: employee.countryCode,
          timezone: employee.timezone,
        },
        organization: {
          name: org.name,
        },
        group: {
          name: employeeGroups.map((g) => g.name),
          id: employeeGroups.map((g) => g.id),
        },
      },
      asset: {
        id: employee.oktaUserId,
        category: 'entity',
        type: 'okta_user',
        status: 'ACTIVE',
        name: displayName,
        vendor: 'OKTA',
        costCenter: `CC-${employee.department
          .replace(/[^A-Za-z]/g, '')
          .substring(0, 4)
          .toUpperCase()}`,
        create_date: createdDate,
        last_updated: lastUpdated,
        last_seen: lastLogin,
        last_status_change_date: statusChanged,
      },
      labels: {
        identity_source: IDENTITY_SOURCE,
      },
      related: {
        user: relatedUsers,
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'entityanalytics_okta.user',
      },
      host: {
        name: `${org.domain.replace('.com', '')}.okta.com`,
      },
      tags: ['forwarded', 'entityanalytics_okta-entity'],
    };
  }

  /**
   * Create an Okta device document
   */
  private createDeviceDocument(
    device: Device,
    employee: Employee,
    org: Organization,
    timestamp: string
  ): OktaDeviceDocument {
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
    const resourceId = `guo${faker.string.alphanumeric(14)}`;
    const displayName = device.displayName;

    // Build related.user array from device users
    const relatedUsers = [
      employee.oktaUserId,
      employee.email,
      `${employee.firstName} ${employee.lastName}`,
      employee.firstName,
    ];

    return {
      '@timestamp': timestamp,
      event: {
        action: 'device-discovered',
        kind: 'asset',
        dataset: 'entityanalytics_okta.device',
        category: ['host'],
        type: ['info'],
      },
      entityanalytics_okta: {
        device: {
          id: device.id,
          status: 'ACTIVE',
          created: createdDate,
          activated: activatedDate,
          status_changed: statusChanged,
          last_updated: lastUpdated,
          resourceAlternateID: employee.email,
          resourceDisplayName: {
            sensitive: false,
            value: displayName,
          },
          resourceID: resourceId,
          resourceType: 'UDDevice',
          profile: {
            display_name: displayName,
            platform: platform,
            sid:
              device.platform === 'windows'
                ? `S-1-5-21-${faker.string.numeric(10)}-${faker.string.numeric(10)}-${faker.string.numeric(10)}`
                : undefined,
            disk_encryption_type: diskEncryptionType,
            registered: device.registered,
            secure_hardware_present: device.platform === 'mac' || device.platform === 'ios',
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
      },
      os: {
        platform: platform.toLowerCase(),
      },
      device: {
        id: device.id,
        serial_number: device.serialNumber,
      },
      asset: {
        id: device.id,
        category: 'device',
        type: 'okta_device',
        status: 'ACTIVE',
        name: displayName,
        create_date: createdDate,
        last_updated: lastUpdated,
        last_status_change_date: statusChanged,
      },
      labels: {
        identity_source: IDENTITY_SOURCE,
      },
      related: {
        user: relatedUsers,
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'entityanalytics_okta.device',
      },
      tags: ['forwarded', 'entityanalytics_okta-entity'],
    };
  }

  /**
   * Create a sync marker document for users
   */
  private createSyncMarker(
    action: 'started' | 'completed',
    timestamp: string
  ): OktaSyncMarkerDocument {
    return {
      '@timestamp': timestamp,
      event: {
        action,
        kind: 'asset',
        dataset: 'entityanalytics_okta.user',
        ...(action === 'started' ? { start: timestamp } : { end: timestamp }),
      },
      labels: {
        identity_source: IDENTITY_SOURCE,
      },
    };
  }

  /**
   * Create a sync marker document for devices
   */
  private createDeviceSyncMarker(
    action: 'started' | 'completed',
    timestamp: string
  ): OktaSyncMarkerDocument {
    return {
      '@timestamp': timestamp,
      event: {
        action,
        kind: 'asset',
        dataset: 'entityanalytics_okta.device',
        ...(action === 'started' ? { start: timestamp } : { end: timestamp }),
      },
      labels: {
        identity_source: IDENTITY_SOURCE,
      },
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
