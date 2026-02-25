/**
 * Workday Custom Integration
 * Generates person/worker documents simulating a customer-built pipeline
 * from the Workday People REST API v4 into Elasticsearch.
 *
 * This is NOT an Elastic Fleet package — it represents a custom integration
 * where the customer fetches data from Workday's People API and indexes it.
 *
 * API reference: https://community.workday.com/sites/default/files/file-hosting/restapi/index.html#person/v4/people
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

/** Cost center codes mapped by department */
const COST_CENTERS: Record<string, { code: string; name: string }> = {
  'Product & Engineering': { code: 'CC-1001', name: 'Engineering' },
  'Sales & Marketing': { code: 'CC-2001', name: 'Sales & Marketing' },
  'Customer Success': { code: 'CC-3001', name: 'Customer Success' },
  Operations: { code: 'CC-4001', name: 'Operations' },
  Executive: { code: 'CC-5001', name: 'Executive Leadership' },
};

/** Job family mappings by department */
const JOB_FAMILIES: Record<string, string[]> = {
  'Product & Engineering': [
    'Software Engineering',
    'Product Management',
    'Quality Engineering',
    'Platform Engineering',
    'Data Engineering',
  ],
  'Sales & Marketing': [
    'Sales',
    'Business Development',
    'Marketing',
    'Revenue Operations',
    'Demand Generation',
  ],
  'Customer Success': [
    'Customer Success Management',
    'Technical Support',
    'Customer Onboarding',
    'Solutions Engineering',
  ],
  Operations: ['Finance', 'Human Resources', 'Legal', 'IT Operations', 'Facilities'],
  Executive: ['Executive Leadership', 'Strategy', 'Corporate Development'],
};

/** Pay groups */
const PAY_GROUPS = [
  'USA - Salaried',
  'USA - Hourly',
  'CAN - Salaried',
  'GBR - Salaried',
  'DEU - Salaried',
  'AUS - Salaried',
];

/** Workday location IDs */
const LOCATION_MAP: Record<string, string> = {
  US: 'LOC-US-001',
  GB: 'LOC-UK-001',
  CA: 'LOC-CA-001',
  DE: 'LOC-DE-001',
  AU: 'LOC-AU-001',
  FR: 'LOC-FR-001',
  IN: 'LOC-IN-001',
};

/**
 * Workday Custom Integration
 * Generates HR person/worker records from the Workday People API v4
 */
export class WorkdayIntegration extends BaseIntegration {
  readonly packageName = 'workday';
  readonly displayName = 'Workday (Custom)';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'people',
      index: 'logs-workday.people-default',
    },
  ];

  /**
   * Override install() — Workday is a custom integration with no Fleet package.
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

    // Generate 1 person document per employee (asset/roster snapshot)
    for (const employee of org.employees) {
      const manager = employee.managerId ? employeeById.get(employee.managerId) : undefined;

      documents.push(this.createPersonDocument(employee, manager, org));
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  /**
   * Create a Workday People API v4 person document
   */
  private createPersonDocument(
    employee: Employee,
    manager: Employee | undefined,
    org: Organization
  ): IntegrationDocument {
    const workdayId = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase();
    const hireDate = faker.date
      .past({ years: faker.number.int({ min: 1, max: 8 }) })
      .toISOString()
      .split('T')[0]; // YYYY-MM-DD format like Workday returns
    const middleName = faker.datatype.boolean(0.3) ? faker.person.middleName() : undefined;
    const isActive = faker.datatype.boolean(0.95); // 95% active
    const workerType = faker.datatype.boolean(0.9) ? 'Employee' : 'Contingent_Worker';
    const timeType = faker.datatype.boolean(0.92) ? 'Full_time' : 'Part_time';

    const costCenter = COST_CENTERS[employee.department] || COST_CENTERS['Operations'];
    const jobFamilies = JOB_FAMILIES[employee.department] || JOB_FAMILIES['Operations'];
    const jobFamily = faker.helpers.arrayElement(jobFamilies);
    const payGroup = faker.helpers.arrayElement(PAY_GROUPS);
    const locationId = LOCATION_MAP[employee.countryCode] || `LOC-${employee.countryCode}-001`;

    const fullLegalName = middleName
      ? `${employee.firstName} ${middleName} ${employee.lastName}`
      : `${employee.firstName} ${employee.lastName}`;

    return {
      '@timestamp': this.getRandomTimestamp(24),
      event: {
        dataset: 'workday.people',
        kind: 'asset',
        category: ['iam'],
        type: ['user', 'info'],
        module: 'workday',
        action: 'worker-sync',
      },
      workday: {
        people: {
          // Worker identification
          id: workdayId,
          descriptor: `${employee.firstName} ${employee.lastName}`,
          worker_id: workdayId,
          employee_id: employee.employeeNumber,

          // Legal name
          legal_name: {
            first_name: employee.firstName,
            middle_name: middleName || '',
            last_name: employee.lastName,
            full_name: fullLegalName,
          },

          // Preferred name (may differ from legal)
          preferred_name: {
            first_name: employee.firstName,
            last_name: employee.lastName,
            full_name: `${employee.firstName} ${employee.lastName}`,
          },

          // Contact information
          primary_work_email: employee.email,
          primary_work_phone: faker.phone.number({ style: 'international' }),
          primary_home_email: faker.internet.email({
            firstName: employee.firstName,
            lastName: employee.lastName,
            provider: faker.helpers.arrayElement([
              'gmail.com',
              'outlook.com',
              'yahoo.com',
              'proton.me',
            ]),
          }),

          // Job information
          business_title: employee.role,
          job_profile: {
            id: `JP-${faker.string.alphanumeric(6).toUpperCase()}`,
            descriptor: employee.role,
          },
          job_family: {
            id: `JF-${faker.string.alphanumeric(4).toUpperCase()}`,
            descriptor: jobFamily,
          },

          // Organization
          supervisory_organization: {
            id: `SO-${faker.string.alphanumeric(6).toUpperCase()}`,
            descriptor: employee.department,
          },
          cost_center: {
            id: costCenter.code,
            descriptor: costCenter.name,
          },
          company: {
            id: `COMP-001`,
            descriptor: org.name,
          },

          // Location
          location: {
            id: locationId,
            descriptor: `${employee.city}, ${employee.country}`,
            city: employee.city,
            country: employee.country,
            country_code: employee.countryCode,
            timezone: employee.timezone,
          },

          // Business address
          business_address: {
            address_line_1: faker.location.streetAddress(),
            city: employee.city,
            country: employee.country,
            country_code: employee.countryCode,
            postal_code: faker.location.zipCode(),
          },

          // Employment details
          hire_date: hireDate,
          worker_type: workerType,
          time_type: timeType,
          pay_group: {
            id: `PG-${faker.string.alphanumeric(4).toUpperCase()}`,
            descriptor: payGroup,
          },
          active: isActive,
          end_employment_date: isActive
            ? undefined
            : faker.date.recent({ days: 90 }).toISOString().split('T')[0],

          // Manager
          ...(manager
            ? {
                manager: {
                  worker_id: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
                  employee_id: manager.employeeNumber,
                  descriptor: `${manager.firstName} ${manager.lastName}`,
                  primary_work_email: manager.email,
                },
              }
            : {}),

          // Custom IDs (common in Workday implementations)
          custom_ids: {
            badge_id: `BDG-${faker.string.alphanumeric(8).toUpperCase()}`,
            okta_id: employee.oktaUserId,
            entra_id: employee.entraIdUserId,
          },
        },
      },

      // ECS fields for correlation
      user: {
        id: employee.employeeNumber,
        name: employee.userName,
        email: employee.email,
        full_name: `${employee.firstName} ${employee.lastName}`,
        roles: [employee.role],
      },

      asset: {
        id: workdayId,
        category: 'entity',
        type: 'worker',
        status: isActive ? 'active' : 'inactive',
        name: `${employee.firstName} ${employee.lastName}`,
        vendor: 'Workday',
        create_date: hireDate,
        last_updated: this.getRandomTimestamp(48),
        last_seen: this.getRandomTimestamp(24),
      },

      labels: {
        identity_source: 'workday',
        integration_type: 'custom',
      },

      related: {
        user: [
          employee.email,
          employee.userName,
          employee.employeeNumber,
          ...(manager ? [manager.email] : []),
        ],
      },

      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'workday.people',
      },
      tags: ['forwarded', 'workday.people', 'custom-integration'],
    } as IntegrationDocument;
  }
}
