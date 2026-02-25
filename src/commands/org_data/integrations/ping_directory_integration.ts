/**
 * PingDirectory Custom Integration
 * Generates user profile documents simulating a customer-built pipeline
 * from the PingDirectory SCIM v2 Users API into Elasticsearch.
 *
 * This is NOT an Elastic Fleet package — it represents a custom integration
 * where the customer fetches user profiles from PingDirectory's SCIM v2 endpoint
 * and indexes them.
 *
 * API reference: https://developer.pingidentity.com/pingdirectory/directory-proxy-scim/user-profile-endpoints/get-read-search-users.html
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

/** SCIM v2 schema URNs used by PingDirectory */
const SCIM_SCHEMAS = [
  'urn:ietf:params:scim:schemas:core:2.0:User',
  'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
  'urn:pingidentity:schemas:User:1.0',
];

/** SCIM group names mapped by department */
const DEPARTMENT_GROUPS: Record<string, Array<{ display: string; value: string }>> = {
  'Product & Engineering': [
    { display: 'Engineering', value: faker.string.uuid() },
    { display: 'Developers', value: faker.string.uuid() },
    { display: 'Platform Team', value: faker.string.uuid() },
  ],
  'Sales & Marketing': [
    { display: 'Sales', value: faker.string.uuid() },
    { display: 'Marketing', value: faker.string.uuid() },
    { display: 'Revenue Ops', value: faker.string.uuid() },
  ],
  'Customer Success': [
    { display: 'Customer Success', value: faker.string.uuid() },
    { display: 'Support', value: faker.string.uuid() },
  ],
  Operations: [
    { display: 'Operations', value: faker.string.uuid() },
    { display: 'Finance', value: faker.string.uuid() },
    { display: 'IT', value: faker.string.uuid() },
  ],
  Executive: [
    { display: 'Leadership', value: faker.string.uuid() },
    { display: 'Executive Team', value: faker.string.uuid() },
  ],
};

/** Locale codes */
const LOCALE_MAP: Record<string, string> = {
  US: 'en-US',
  GB: 'en-GB',
  CA: 'en-CA',
  DE: 'de-DE',
  AU: 'en-AU',
  FR: 'fr-FR',
  IN: 'en-IN',
};

/** Timezone mapping */
const TIMEZONE_MAP: Record<string, string> = {
  US: 'America/New_York',
  GB: 'Europe/London',
  CA: 'America/Toronto',
  DE: 'Europe/Berlin',
  AU: 'Australia/Sydney',
  FR: 'Europe/Paris',
  IN: 'Asia/Kolkata',
};

/**
 * PingDirectory Custom Integration
 * Generates SCIM v2 user profile documents from PingDirectory
 */
export class PingDirectoryIntegration extends BaseIntegration {
  readonly packageName = 'ping_directory';
  readonly displayName = 'PingDirectory (Custom)';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'users',
      index: 'logs-ping_directory.users-default',
    },
  ];

  /**
   * Override install() — PingDirectory is a custom integration with no Fleet package.
   * We skip Fleet installation entirely.
   */
  async install(_space: string = 'default'): Promise<void> {
    console.log(`  ℹ ${this.displayName}: Custom integration — no Fleet package to install`);
  }

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    // Build a lookup for managers
    const employeeById = new Map<string, Employee>();
    for (const emp of org.employees) {
      employeeById.set(emp.id, emp);
    }

    // SCIM API base URL for this PingDirectory instance
    const scimBaseUrl = `https://directory.${org.domain}:443/scim/v2`;

    // Generate 1 SCIM user document per employee (directory snapshot)
    for (const employee of org.employees) {
      const manager = employee.managerId ? employeeById.get(employee.managerId) : undefined;

      documents.push(this.createScimUserDocument(employee, manager, org, scimBaseUrl));
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  /**
   * Create a PingDirectory SCIM v2 User resource document
   * Modeled after the SCIM v2 Users endpoint response structure
   */
  private createScimUserDocument(
    employee: Employee,
    manager: Employee | undefined,
    org: Organization,
    scimBaseUrl: string
  ): IntegrationDocument {
    const scimUserId = faker.string.uuid();
    const createdDate = faker.date
      .past({ years: faker.number.int({ min: 1, max: 6 }) })
      .toISOString();
    const lastModifiedDate = this.getRandomTimestamp(168); // within last week
    const isActive = faker.datatype.boolean(0.95);
    const userType = faker.helpers.weightedArrayElement([
      { value: 'Employee', weight: 88 },
      { value: 'Contractor', weight: 10 },
      { value: 'Intern', weight: 2 },
    ]);

    const locale = LOCALE_MAP[employee.countryCode] || 'en-US';
    const timezone = TIMEZONE_MAP[employee.countryCode] || employee.timezone;

    // SCIM groups based on department + an org-wide group
    const deptGroups = DEPARTMENT_GROUPS[employee.department] || DEPARTMENT_GROUPS['Operations'];
    const allUsersGroup = { display: 'All Users', value: faker.string.uuid() };
    const userGroups = [
      allUsersGroup,
      faker.helpers.arrayElement(deptGroups),
      ...(faker.datatype.boolean(0.4) ? [faker.helpers.arrayElement(deptGroups)] : []),
    ];

    // Manager's SCIM ID (consistent UUID for manager reference)
    const managerId = manager ? faker.string.uuid() : undefined;

    return {
      '@timestamp': this.getRandomTimestamp(24),
      event: {
        dataset: 'ping_directory.users',
        kind: 'asset',
        category: ['iam'],
        type: ['user', 'info'],
        module: 'ping_directory',
        action: 'user-sync',
      },
      ping_directory: {
        users: {
          // Core SCIM v2 User resource fields
          schemas: SCIM_SCHEMAS,
          id: scimUserId,
          externalId: employee.employeeNumber,
          userName: employee.userName,
          displayName: `${employee.firstName} ${employee.lastName}`,
          active: isActive,
          userType,

          // SCIM Name object
          name: {
            givenName: employee.firstName,
            familyName: employee.lastName,
            formatted: `${employee.firstName} ${employee.lastName}`,
          },

          // SCIM Emails (multi-valued)
          emails: [
            {
              value: employee.email,
              type: 'work',
              primary: true,
            },
            ...(faker.datatype.boolean(0.3)
              ? [
                  {
                    value: faker.internet.email({
                      firstName: employee.firstName,
                      lastName: employee.lastName,
                      provider: faker.helpers.arrayElement([
                        'gmail.com',
                        'outlook.com',
                        'yahoo.com',
                      ]),
                    }),
                    type: 'home',
                    primary: false,
                  },
                ]
              : []),
          ],

          // SCIM Phone numbers
          phoneNumbers: [
            {
              value: faker.phone.number({ style: 'international' }),
              type: 'work',
              primary: true,
            },
            ...(faker.datatype.boolean(0.5)
              ? [
                  {
                    value: faker.phone.number({ style: 'international' }),
                    type: 'mobile',
                    primary: false,
                  },
                ]
              : []),
          ],

          // SCIM Addresses
          addresses: [
            {
              streetAddress: faker.location.streetAddress(),
              locality: employee.city,
              region: faker.location.state(),
              postalCode: faker.location.zipCode(),
              country: employee.countryCode,
              type: 'work',
              formatted: `${faker.location.streetAddress()}, ${employee.city}, ${employee.country}`,
              primary: true,
            },
          ],

          // SCIM Groups (read-only in SCIM spec — group memberships)
          groups: userGroups.map((g) => ({
            value: g.value,
            display: g.display,
            $ref: `${scimBaseUrl}/Groups/${g.value}`,
            type: 'direct',
          })),

          // SCIM Meta object
          meta: {
            resourceType: 'User',
            created: createdDate,
            lastModified: lastModifiedDate,
            location: `${scimBaseUrl}/Users/${scimUserId}`,
            version: `W/"${faker.string.alphanumeric(8)}"`,
          },

          // Locale & timezone
          locale,
          timezone,
          preferredLanguage: locale.split('-')[0],

          // Enterprise User extension (SCIM standard)
          'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
            employeeNumber: employee.employeeNumber,
            costCenter: employee.department,
            organization: org.name,
            division: employee.department,
            department: employee.department,
            ...(manager
              ? {
                  manager: {
                    value: managerId,
                    displayName: `${manager.firstName} ${manager.lastName}`,
                    $ref: `${scimBaseUrl}/Users/${managerId}`,
                  },
                }
              : {}),
          },

          // PingIdentity-specific extension
          'urn:pingidentity:schemas:User:1.0': {
            title: employee.role,
            department: employee.department,
            organization: org.name,
            accountEnabled: isActive,
            ...(manager
              ? {
                  managerDN: `uid=${manager.userName},ou=${manager.department},dc=${org.domain.split('.')[0]},dc=${org.domain.split('.')[1]}`,
                }
              : {}),
          },
        },
      },

      // ECS fields for correlation
      user: {
        id: scimUserId,
        name: employee.userName,
        email: employee.email,
        full_name: `${employee.firstName} ${employee.lastName}`,
        roles: [employee.role],
        domain: org.domain,
      },

      asset: {
        id: scimUserId,
        category: 'entity',
        type: 'user',
        status: isActive ? 'active' : 'inactive',
        name: `${employee.firstName} ${employee.lastName}`,
        vendor: 'PingIdentity',
        create_date: createdDate,
        last_updated: lastModifiedDate,
        last_seen: this.getRandomTimestamp(24),
      },

      labels: {
        identity_source: 'ping_directory',
        integration_type: 'custom',
      },

      related: {
        user: [
          employee.email,
          employee.userName,
          employee.employeeNumber,
          scimUserId,
          ...(manager ? [manager.email] : []),
        ],
      },

      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'ping_directory.users',
      },
      tags: ['forwarded', 'ping_directory.users', 'custom-integration'],
    } as IntegrationDocument;
  }
}
