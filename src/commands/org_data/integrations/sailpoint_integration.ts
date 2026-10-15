/**
 * SailPoint Identity Security Cloud Integration
 * Generates identity governance event documents and identity inventory records
 * Based on the Elastic sailpoint_identity_sc integration package
 *
 * Every document is stamped with the generation time (`modified` / `created`, which
 * the pipelines copy to `@timestamp`), so extracted entities get a current
 * `entity.lifecycle.last_seen` and fall inside the maintainers' freshness gates.
 *
 * All data streams are sent as raw `message` JSON so the package's default
 * pipelines produce the final ECS shape. For `identities` this includes
 * `user.entity.relationships.supervises.user.{id,name,email}`, which the pipeline
 * renames from the `_supervises` key the CEL input attaches to each manager.
 *
 * `machine_identities` records become `service.*` documents and keep their owners
 * under `sailpoint_identity_sc.machine_identity.owners.{primary,secondary}`. Owner
 * `id` / `name` are the owner employee's identity `id` / `name`, so they resolve
 * to the `identities` documents (`user.id` / `user.name`) and the inverse
 * user -> owns -> service edge can be derived from them.
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
  type AgentData,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap } from '../types.ts';
import { faker } from '@faker-js/faker';

/** SailPoint event types with associated actions and weights */
const EVENT_TYPES: Array<{
  type: string;
  actions: string[];
  objects: string[];
  operation: string;
  weight: number;
}> = [
  {
    type: 'AUTH',
    actions: ['AUTH_LOGIN_PASSED', 'AUTH_LOGIN_FAILED', 'AUTH_LOGOUT'],
    objects: ['AUTH'],
    operation: 'LOGIN',
    weight: 25,
  },
  {
    type: 'SSO',
    actions: ['SSO_LOGIN_PASSED', 'SSO_LOGIN_FAILED'],
    objects: ['SSO'],
    operation: 'LOGIN',
    weight: 20,
  },
  {
    type: 'USER_MANAGEMENT',
    actions: [
      'USER_ATTRIBUTE_UPDATE_PASSED',
      'USER_CREATE_PASSED',
      'USER_DISABLE_PASSED',
      'USER_ENABLE_PASSED',
    ],
    objects: ['USER'],
    operation: 'UPDATE',
    weight: 15,
  },
  {
    type: 'PASSWORD_ACTIVITY',
    actions: [
      'USER_PASSWORD_UPDATE_PASSED',
      'USER_PASSWORD_UPDATE_FAILED',
      'USER_PASSWORD_RESET_PASSED',
    ],
    objects: ['USER', 'PASSWORD'],
    operation: 'UPDATE',
    weight: 12,
  },
  {
    type: 'PROVISIONING',
    actions: [
      'PROVISIONING_CREATE_PASSED',
      'PROVISIONING_UPDATE_PASSED',
      'PROVISIONING_DELETE_PASSED',
      'PROVISIONING_CREATE_FAILED',
    ],
    objects: ['ACCOUNT'],
    operation: 'CREATE',
    weight: 10,
  },
  {
    type: 'ACCESS_ITEM',
    actions: ['ACCESS_ITEM_GRANTED', 'ACCESS_ITEM_REVOKED', 'ACCESS_ITEM_REQUESTED'],
    objects: ['ACCESS'],
    operation: 'GRANT',
    weight: 8,
  },
  {
    type: 'ACCESS_REQUEST',
    actions: [
      'ACCESS_REQUEST_CREATED',
      'ACCESS_REQUEST_APPROVED',
      'ACCESS_REQUEST_DENIED',
      'ACCESS_REQUEST_COMPLETED',
    ],
    objects: ['ACCESS_REQUEST'],
    operation: 'CREATE',
    weight: 5,
  },
  {
    type: 'CERTIFICATION',
    actions: [
      'CERTIFICATION_CREATED',
      'CERTIFICATION_SIGNED_OFF',
      'CERTIFICATION_ITEM_APPROVED',
      'CERTIFICATION_ITEM_REVOKED',
    ],
    objects: ['CERTIFICATION'],
    operation: 'APPROVE',
    weight: 3,
  },
  {
    type: 'SOURCE_MANAGEMENT',
    actions: [
      'SOURCE_ACCOUNT_AGGREGATION_PASSED',
      'SOURCE_ACCOUNT_AGGREGATION_FAILED',
      'SOURCE_UPDATED',
    ],
    objects: ['SOURCE'],
    operation: 'AGGREGATE',
    weight: 2,
  },
];

/** Source names for provisioning events */
const SOURCE_NAMES = [
  'IdentityNow',
  'Active Directory',
  'Okta',
  'Azure AD',
  'ServiceNow',
  'Workday',
  'SAP',
  'Salesforce',
];

/** The CEL input fetches at most 250 direct reports per manager. */
const MAX_DIRECT_REPORTS = 250;

/** SailPoint identity ids are 32-char hex; derive one deterministically from the employee uuid. */
const identityId = (employee: Employee): string => employee.id.replace(/-/g, '');

/** Share of employees used to size the machine identity population (min 1). */
const MACHINE_IDENTITIES_PER_EMPLOYEE = 0.1;

/** Share of machine identities the API returns with `name: null` (no service entity). */
const MACHINE_IDENTITY_NO_NAME_RATE = 0.03;

/** Entitlement display names attached to machine identities. */
const MACHINE_ENTITLEMENTS = [
  'Reports DB Read Access',
  'Deploy Pipeline Access',
  'Storage Bucket Writer',
  'Queue Consumer',
  'Audit Log Reader',
];

/**
 * SailPoint Identity Security Cloud Integration
 * Generates identity governance and administration event documents
 */
export class SailPointIntegration extends BaseIntegration {
  readonly packageName = 'sailpoint_identity_sc';
  readonly displayName = 'SailPoint Identity Security Cloud';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'events',
      index: 'logs-sailpoint_identity_sc.events-default',
    },
    {
      name: 'identities',
      index: 'logs-sailpoint_identity_sc.identities-default',
    },
    {
      name: 'machine_identities',
      index: 'logs-sailpoint_identity_sc.machine_identities-default',
    },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];
    const centralAgent = this.buildCentralAgent(org);

    const orgSlug = org.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // Generate 2-3 events per employee
    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 3 });
      for (let i = 0; i < eventCount; i++) {
        const targetEmployee = faker.helpers.arrayElement(org.employees);
        documents.push(this.createEventDocument(employee, targetEmployee, orgSlug, centralAgent));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    documentsMap.set(this.dataStreams[1].index, this.createIdentityDocuments(org, centralAgent));
    documentsMap.set(
      this.dataStreams[2].index,
      this.createMachineIdentityDocuments(org, centralAgent),
    );
    return documentsMap;
  }

  /**
   * Machine identities (service accounts) owned by employees. The service side of
   * the edge is `service.name` (the record's `name`); the owner side is the
   * primary and secondary owner references, which carry the owning employee's
   * identity `id` and `name` and therefore resolve to `identities` documents.
   *
   * A small share has `name: null`, as the API can return: the pipeline then sets
   * `service.id` but no `service.name`, so no service entity exists for it.
   */
  private createMachineIdentityDocuments(
    org: Organization,
    centralAgent: AgentData,
  ): IntegrationDocument[] {
    const count = Math.max(1, Math.round(org.employees.length * MACHINE_IDENTITIES_PER_EMPLOYEE));
    const documents: IntegrationDocument[] = [];
    for (let i = 0; i < count; i++) {
      const primary = faker.helpers.arrayElement(org.employees);
      const secondaryCount = faker.helpers.weightedArrayElement([
        { value: 0, weight: 5 },
        { value: 1, weight: 4 },
        { value: 2, weight: 1 },
      ]);
      const secondary: Employee[] = [];
      const ownerIds = new Set([primary.id]);
      const maxSecondary = Math.min(secondaryCount, org.employees.length - 1);
      while (secondary.length < maxSecondary) {
        const candidate = faker.helpers.arrayElement(org.employees);
        if (ownerIds.has(candidate.id)) continue;
        ownerIds.add(candidate.id);
        secondary.push(candidate);
      }
      documents.push(this.createMachineIdentityDocument(i, primary, secondary, centralAgent));
    }
    return documents;
  }

  /**
   * Create a SailPoint machine identities document (raw `/machine-identities` record).
   * `name` is index-suffixed so every service name is unique: service EUIDs are not
   * namespaced, and a repeated name would merge distinct machine identities.
   */
  private createMachineIdentityDocument(
    index: number,
    primary: Employee,
    secondary: Employee[],
    centralAgent: AgentData,
  ): IntegrationDocument {
    const modified = new Date().toISOString();
    const created = new Date(
      new Date(modified).getTime() - faker.number.int({ min: 30, max: 900 }) * 86_400_000,
    ).toISOString();
    const noName = faker.datatype.boolean({ probability: MACHINE_IDENTITY_NO_NAME_RATE });
    const slug = faker.helpers.slugify(faker.word.noun()).toLowerCase();
    const name = noName ? null : `svc-${slug}-${index}`;
    const sourceName = faker.helpers.arrayElement(SOURCE_NAMES);
    const sourceId = faker.string.uuid();
    const owner = (employee: Employee) => ({
      type: 'IDENTITY',
      id: identityId(employee),
      name: employee.userName,
    });

    const rawMachineIdentity = {
      id: faker.string.uuid(),
      name,
      created,
      modified,
      nativeIdentity: `svc-${slug}-${index}:prod:${String(index).padStart(5, '0')}`,
      description: `Service account for ${faker.hacker.noun()} automation.`,
      attributes: { env: 'production', team: primary.department },
      subtype: 'Application',
      owners: {
        primaryIdentity: owner(primary),
        secondaryIdentities: secondary.map(owner),
      },
      sourceId,
      uuid: faker.string.uuid(),
      manuallyEdited: false,
      manuallyCreated: false,
      source: { type: 'SOURCE', id: sourceId, name: sourceName },
      datasetId: faker.string.uuid(),
      userEntitlements: faker.helpers
        .arrayElements(MACHINE_ENTITLEMENTS, faker.number.int({ min: 0, max: 2 }))
        .map((displayName) => {
          const entitlementSourceId = faker.string.uuid();
          return {
            sourceId: entitlementSourceId,
            entitlementId: faker.string.uuid(),
            displayName,
            source: {
              type: 'SOURCE',
              id: entitlementSourceId,
              name: faker.helpers.arrayElement(SOURCE_NAMES),
            },
          };
        }),
    };

    return {
      '@timestamp': modified,
      agent: centralAgent,
      message: JSON.stringify(rawMachineIdentity),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'sailpoint_identity_sc.machine_identities',
      },
    } as IntegrationDocument;
  }

  /**
   * One identity record per employee. Managers carry `_supervises` with their
   * direct reports, which is what the CEL input attaches when
   * `enable_supervises_enrichment` is on; the pipeline turns it into
   * `user.entity.relationships.supervises.user.*`.
   */
  private createIdentityDocuments(
    org: Organization,
    centralAgent: AgentData,
  ): IntegrationDocument[] {
    // Employee.managerId is the manager's oktaUserId (see org_data_generator.ts)
    const reportsByManagerOktaId = new Map<string, Employee[]>();
    for (const employee of org.employees) {
      if (!employee.managerId) continue;
      const reports = reportsByManagerOktaId.get(employee.managerId);
      if (reports) reports.push(employee);
      else reportsByManagerOktaId.set(employee.managerId, [employee]);
    }
    const employeeByOktaUserId = new Map<string, Employee>();
    for (const employee of org.employees) {
      employeeByOktaUserId.set(employee.oktaUserId, employee);
    }

    return org.employees.map((employee) => {
      const manager = employee.managerId ? employeeByOktaUserId.get(employee.managerId) : undefined;
      const reports = (reportsByManagerOktaId.get(employee.oktaUserId) ?? []).slice(
        0,
        MAX_DIRECT_REPORTS,
      );
      return this.createIdentityDocument(employee, manager, reports, centralAgent);
    });
  }

  /**
   * Create a SailPoint identities document (raw search API record).
   * `id` is the 32-char hex identity id and `name` is the account name; the
   * pipeline maps them to `user.id` / `user.name`, and the same values appear in
   * the managers' `_supervises` lists so they resolve to these identities.
   */
  private createIdentityDocument(
    employee: Employee,
    manager: Employee | undefined,
    reports: Employee[],
    centralAgent: AgentData,
  ): IntegrationDocument {
    const modified = new Date().toISOString();
    const created = new Date(
      new Date(modified).getTime() - faker.number.int({ min: 30, max: 1500 }) * 86_400_000,
    ).toISOString();
    const fullName = `${employee.firstName} ${employee.lastName}`;

    const rawIdentity = {
      _type: 'identity',
      id: identityId(employee),
      name: employee.userName,
      displayName: fullName,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      created,
      modified,
      synced: modified,
      status: 'ACTIVE',
      disabled: false,
      inactive: false,
      locked: false,
      protected: false,
      isManager: reports.length > 0,
      type: 'identity',
      attributes: {
        department: employee.department,
        jobTitle: employee.role,
        country: employee.countryCode,
        city: employee.city,
      },
      ...(manager
        ? {
            manager: {
              type: 'IDENTITY',
              id: identityId(manager),
              name: manager.userName,
              displayName: `${manager.firstName} ${manager.lastName}`,
            },
          }
        : {}),
      ...(reports.length > 0
        ? {
            _supervises: {
              user: {
                id: reports.map(identityId),
                name: reports.map((r) => r.userName),
                email: reports.map((r) => r.email),
              },
            },
          }
        : {}),
    };

    return {
      '@timestamp': modified,
      agent: centralAgent,
      message: JSON.stringify(rawIdentity),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'sailpoint_identity_sc.identities',
      },
    } as IntegrationDocument;
  }

  /**
   * Create a SailPoint events document
   */
  private createEventDocument(
    actor: Employee,
    target: Employee,
    orgSlug: string,
    centralAgent: AgentData,
  ): IntegrationDocument {
    const eventType = faker.helpers.weightedArrayElement(
      EVENT_TYPES.map((et) => ({ value: et, weight: et.weight })),
    );
    const action = faker.helpers.arrayElement(eventType.actions);
    const status = action.includes('FAILED') ? 'FAILED' : 'PASSED';
    const sourceIp = faker.internet.ipv4();
    const created = new Date().toISOString();
    const eventId = faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase();

    // For AUTH/SSO the actor and target are the same person
    const isAuthEvent = eventType.type === 'AUTH' || eventType.type === 'SSO';
    const effectiveTarget = isAuthEvent ? actor : target;

    const rawEvent = {
      _type: 'event',
      _version: 'v2',
      id: eventId,
      name: this.actionToDisplayName(action),
      action: action,
      type: eventType.type,
      actor: {
        name: isAuthEvent
          ? actor.userName
          : eventType.type === 'SOURCE_MANAGEMENT'
            ? 'System'
            : actor.userName,
      },
      target: {
        name: effectiveTarget.userName,
      },
      operation: eventType.operation,
      status: status,
      objects: eventType.objects,
      technical_name: action,
      tracking_number: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
      created: created,
      synced: created,
      org: orgSlug,
      pod: `se01-useast1`,
      stack: faker.helpers.arrayElement(['pigs', 'oar', 'fedramp']),
      ip_address: sourceIp,
      details: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
      attributes: {
        account_id: isAuthEvent ? actor.userName : effectiveTarget.userName,
        source_name: faker.helpers.arrayElement(SOURCE_NAMES),
        org: orgSlug,
        pod: 'se01-useast1',
        scope: ['sp:scopes:all'],
        ...(sourceIp ? { host_name: sourceIp } : {}),
        ...(eventType.type === 'PASSWORD_ACTIVITY'
          ? {
              info: `Password workflow invoked successfully. Request Id :${faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase()}`,
            }
          : {}),
      },
    };

    return {
      '@timestamp': created,
      agent: centralAgent,
      message: JSON.stringify(rawEvent),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'sailpoint_identity_sc.events',
      },
    } as IntegrationDocument;
  }

  /**
   * Convert a technical action name to a human-readable display name
   */
  private actionToDisplayName(action: string): string {
    const map: Record<string, string> = {
      AUTH_LOGIN_PASSED: 'Authentication Passed',
      AUTH_LOGIN_FAILED: 'Authentication Failed',
      AUTH_LOGOUT: 'Logout',
      SSO_LOGIN_PASSED: 'SSO Authentication Passed',
      SSO_LOGIN_FAILED: 'SSO Authentication Failed',
      USER_ATTRIBUTE_UPDATE_PASSED: 'Update User Attribute Passed',
      USER_CREATE_PASSED: 'Create User Passed',
      USER_DISABLE_PASSED: 'Disable User Passed',
      USER_ENABLE_PASSED: 'Enable User Passed',
      USER_PASSWORD_UPDATE_PASSED: 'Update User Password Passed',
      USER_PASSWORD_UPDATE_FAILED: 'Update User Password Failed',
      USER_PASSWORD_RESET_PASSED: 'Reset User Password Passed',
      PROVISIONING_CREATE_PASSED: 'Create Account Passed',
      PROVISIONING_UPDATE_PASSED: 'Update Account Passed',
      PROVISIONING_DELETE_PASSED: 'Delete Account Passed',
      PROVISIONING_CREATE_FAILED: 'Create Account Failed',
      ACCESS_ITEM_GRANTED: 'Access Item Granted',
      ACCESS_ITEM_REVOKED: 'Access Item Revoked',
      ACCESS_ITEM_REQUESTED: 'Access Item Requested',
      ACCESS_REQUEST_CREATED: 'Access Request Created',
      ACCESS_REQUEST_APPROVED: 'Access Request Approved',
      ACCESS_REQUEST_DENIED: 'Access Request Denied',
      ACCESS_REQUEST_COMPLETED: 'Access Request Completed',
      CERTIFICATION_CREATED: 'Certification Created',
      CERTIFICATION_SIGNED_OFF: 'Certification Signed Off',
      CERTIFICATION_ITEM_APPROVED: 'Certification Item Approved',
      CERTIFICATION_ITEM_REVOKED: 'Certification Item Revoked',
      SOURCE_ACCOUNT_AGGREGATION_PASSED: 'Source Account Aggregation Passed',
      SOURCE_ACCOUNT_AGGREGATION_FAILED: 'Source Account Aggregation Failed',
      SOURCE_UPDATED: 'Source Updated',
    };
    return map[action] || action.replace(/_/g, ' ').toLowerCase();
  }
}
