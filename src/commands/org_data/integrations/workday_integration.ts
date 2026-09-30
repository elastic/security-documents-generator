/**
 * Workday Integration
 *
 * Generates post-pipeline shaped documents for the Elastic Fleet `workday`
 * package's `user`, `activity`, and `sign_on` data streams.
 *
 * Documents are indexed directly via bulk API (no ingest pipeline runs), so
 * they must already be in the final ECS + workday.* field shape that the
 * package's ingest pipelines would produce — NOT the raw `message` blob.
 *
 * Field shapes are derived from the pipeline YAMLs and the sample_event.json
 * in packages/workday/data_stream/{user,activity,sign_on}/.
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
  type AgentData,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap } from '../types.ts';
import { faker } from '@faker-js/faker';

const COST_CENTERS: Record<string, string> = {
  'Product & Engineering': 'Engineering',
  'Sales & Marketing': 'Sales & Marketing',
  'Customer Success': 'Customer Success',
  Operations: 'Operations',
  Executive: 'Executive Leadership',
};

const SECURITY_GROUPS = [
  'Report Writer',
  'Employee As Self',
  'Manager',
  'HR Partner',
  'Compensation Partner',
  'Recruiter',
];

const ORGANIZATION_ROLES = [
  'Cost Center Manager',
  'Manager',
  'HR Business Partner',
  'Timekeeper',
  'Expense Approver',
];

const ACTIVITY_ACTIONS = [
  'View',
  'Edit',
  'Delete',
  'Create',
  'Sign In',
  'Sign Out',
  'Export',
  'Print',
  'Submit',
  'Approve',
];

const AUTH_TYPES = ['Password', 'SSO', 'MFA', 'SAML', 'OAuth'];
const BROWSER_TYPES = ['Chrome', 'Firefox', 'Safari', 'Edge', 'Mobile App'];
const OPERATING_SYSTEMS = ['Mac OS X', 'Windows 11', 'Windows 10', 'iOS', 'Android', 'Linux'];
const DEVICE_TYPES_SIGNON = ['Computer', 'Mobile', 'Tablet'];

export class WorkdayIntegration extends BaseIntegration {
  readonly packageName = 'workday';
  readonly displayName = 'Workday';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'user', index: 'logs-workday.user-default' },
    { name: 'activity', index: 'logs-workday.activity-default' },
    { name: 'sign_on', index: 'logs-workday.sign_on-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const centralAgent = this.buildCentralAgent(org);

    // managerId is set to the manager's oktaUserId (see org_data_generator.ts:368)
    const employeeByOktaUserId = new Map<string, Employee>();
    for (const emp of org.employees) {
      employeeByOktaUserId.set(emp.oktaUserId, emp);
    }

    const managerOktaIds = new Set<string>();
    for (const emp of org.employees) {
      if (emp.managerId) managerOktaIds.add(emp.managerId);
    }

    // user
    const userDocs: IntegrationDocument[] = [];
    for (const employee of org.employees) {
      const manager = employee.managerId ? employeeByOktaUserId.get(employee.managerId) : undefined;
      userDocs.push(
        this.createUserDocument(
          employee,
          manager,
          managerOktaIds.has(employee.oktaUserId),
          centralAgent,
        ),
      );
    }
    documentsMap.set(this.dataStreams[0].index, userDocs);

    // activity
    const activityDocs: IntegrationDocument[] = [];
    for (const employee of org.employees) {
      const count = faker.number.int({ min: 1, max: 5 });
      for (let i = 0; i < count; i++) {
        activityDocs.push(this.createActivityDocument(employee, centralAgent));
      }
    }
    documentsMap.set(this.dataStreams[1].index, activityDocs);

    // sign_on
    const signOnDocs: IntegrationDocument[] = [];
    for (const employee of org.employees) {
      const count = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < count; i++) {
        signOnDocs.push(this.createSignOnDocument(employee, org, centralAgent));
      }
    }
    documentsMap.set(this.dataStreams[2].index, signOnDocs);

    return documentsMap;
  }

  /**
   * Post-pipeline user document matching sample_event.json shape.
   *
   * Pipeline: json-parses message → workday.user.*, then renames:
   *   Employee_ID       → user.id
   *   User_Name         → user.name
   *   primaryWorkEmail  → user.email  (+user.domain dissected)
   *   Organization_Roles (split on ';') → user.roles
   *   User-Based_Security_Groups_for_User (split on ';') → user.group.name
   *   Hire_Date         → @timestamp  (then removed from workday.user)
   * Remaining workday.user.* fields stay in place.
   */
  private createUserDocument(
    employee: Employee,
    manager: Employee | undefined,
    isManager: boolean,
    centralAgent: AgentData,
  ): IntegrationDocument {
    const hireDate = faker.date
      .past({ years: faker.number.int({ min: 1, max: 8 }) })
      .toISOString()
      .split('T')[0];

    const lastLogin = faker.date.recent({ days: 30 }).toISOString();
    const costCenter = COST_CENTERS[employee.department] ?? COST_CENTERS.Operations;

    const securityGroupList = faker.helpers.arrayElements(
      SECURITY_GROUPS,
      faker.number.int({ min: 1, max: 3 }),
    );

    const roles = faker.helpers.arrayElements(
      ORGANIZATION_ROLES,
      faker.number.int({ min: 1, max: 2 }),
    );
    if (isManager && !roles.includes('Manager')) roles.push('Manager');

    const relatedUser = [employee.employeeNumber, employee.userName, employee.email];
    if (manager) {
      relatedUser.push(manager.employeeNumber, manager.email);
    }

    const workdayUser: Record<string, unknown> = {
      Cost_Center: costCenter,
      Job_Title: employee.role,
      Last_Account_or_Proxy_Login_Moment: lastLogin,
      WorkerIsManager: isManager,
      Worker_Type: faker.datatype.boolean(0.9) ? 'Employee' : 'Contingent Worker',
      Worker_s_Manager: manager
        ? `${manager.firstName} ${manager.lastName} (${manager.employeeNumber})`
        : undefined,
      Manager_Email: manager?.email,
      Manager_ID: manager?.employeeNumber,
      location: `${employee.country} - ${employee.city}`,
    };

    // Occasional terminated employees.
    if (faker.datatype.boolean(0.05)) {
      workdayUser.termination_date = faker.date
        .past({ years: faker.number.int({ min: 1, max: 2 }) })
        .toISOString();
    }

    // Remove undefined values (mirrors pipeline's remove_null_values script).
    for (const key of Object.keys(workdayUser)) {
      if (workdayUser[key] === undefined) delete workdayUser[key];
    }

    const emailDomain = employee.email.split('@')[1];

    return {
      '@timestamp': hireDate,
      ecs: { version: '9.5.0' },
      agent: centralAgent,
      event: {
        kind: 'asset',
        category: ['iam'],
        type: ['user'],
        dataset: 'workday.user',
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'workday.user' },
      user: {
        id: employee.employeeNumber,
        name: employee.userName,
        email: employee.email,
        domain: emailDomain,
        roles,
        group: { name: securityGroupList },
      },
      related: { user: relatedUser },
      workday: { user: workdayUser },
    } as IntegrationDocument;
  }

  /**
   * Post-pipeline activity document.
   *
   * Pipeline: json-parses message → json.*, then renames/converts:
   *   json.activityAction → workday.activity.activity_action → event.action (lowercased, space→hyphen)
   *   json.deviceType     → workday.activity.device_type     → device.type (lowercased)
   *   json.ipAddress      → workday.activity.ip_address      → source.ip
   *   json.requestTime    → workday.activity.request_time    → @timestamp
   *   json.systemAccount  → workday.activity.system_account  → user.name
   *   json.sessionId      → workday.activity.session_id
   *   json.target.*       → workday.activity.target.*
   *   json.taskDisplayName→ workday.activity.task_display_name
   *   json.taskId         → workday.activity.task_id
   *   json.userActivityEntryCount → workday.activity.user_activity_entry_count (long)
   * ip_address / request_time / user_agent / device_type / system_account removed after mapping.
   */
  private createActivityDocument(employee: Employee, centralAgent: AgentData): IntegrationDocument {
    const requestTime = faker.date.recent({ days: 7 }).toISOString();
    const rawAction = faker.helpers.arrayElement(ACTIVITY_ACTIONS);
    // Pipeline: lowercase then split on whitespace and join with '-'
    const eventAction = rawAction.toLowerCase().replace(/\s+/g, '-');
    const deviceType = faker.helpers.arrayElement(['browser', 'mobile', 'web services']);
    const ip = faker.internet.ip();

    return {
      '@timestamp': requestTime,
      ecs: { version: '9.5.0' },
      agent: centralAgent,
      event: {
        kind: 'event',
        category: ['iam'],
        type: ['info'],
        action: eventAction,
        dataset: 'workday.activity',
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'workday.activity' },
      user: { name: employee.userName },
      device: { type: deviceType },
      source: { ip },
      related: {
        ip: [ip],
        user: [employee.userName],
      },
      workday: {
        activity: {
          activity_action: rawAction,
          session_id: faker.string.uuid(),
          task_display_name: faker.lorem.words({ min: 2, max: 4 }),
          task_id: faker.string.alphanumeric(8).toUpperCase(),
          user_activity_entry_count: faker.number.int({ min: 1, max: 20 }),
          target: {
            descriptor: faker.lorem.words({ min: 1, max: 3 }),
            href: `https://wd5.myworkday.com/example/d/${faker.string.alphanumeric(12)}`,
            id: faker.string.uuid(),
          },
        },
      },
    } as IntegrationDocument;
  }

  /**
   * Post-pipeline sign-on document.
   *
   * Pipeline: json-parses message → workday.sign_on.*, then:
   *   painless: normalise hyphenated keys → underscores
   *   painless: convert "0"/"1" boolean flag strings → booleans
   *   Sign_on_Time / Session_Start / Signon_DateTime → @timestamp + event.start
   *   Session_End / Signoff_DateTime / Signoff_Time  → event.end
   *   Created_Moment → event.created
   *   userName        → user.name
   *   Signon_Worker   → user.full_name
   *   User_Agent      → user_agent.original (then user_agent processor)
   *   Operating_System→ host.os.name
   *   Device_Type     → device.type
   *   Signon_IP_Address / Session_IP_Address → source.ip
   *   Authentication_Failure_Message → event.reason
   *   tenant_name     → organization.name
   *   Browser_Type    → user_agent.name (if not already set by user_agent processor)
   *   Is_Device_Managed → host.entity.attributes.managed
   *   event.start / event.end → host.entity.lifecycle.last_activity
   * Mapped fields removed from workday.sign_on.* after mapping.
   */
  private createSignOnDocument(
    employee: Employee,
    org: Organization,
    centralAgent: AgentData,
  ): IntegrationDocument {
    const signOnTime = faker.date.recent({ days: 14 }).toISOString();
    const sessionDurationMs = faker.number.int({ min: 5 * 60 * 1000, max: 8 * 60 * 60 * 1000 });
    const sessionEnd = new Date(new Date(signOnTime).getTime() + sessionDurationMs).toISOString();
    const isFailed = faker.datatype.boolean(0.08);
    const failureMessage = isFailed
      ? faker.helpers.arrayElement([
          'Invalid username or password',
          'Account locked',
          'Session expired',
          'MFA verification failed',
        ])
      : undefined;
    const ip = faker.internet.ip();
    const isDeviceManaged = faker.datatype.boolean(0.8);
    const browserType = faker.helpers.arrayElement(BROWSER_TYPES);
    const authType = faker.helpers.arrayElement(AUTH_TYPES);

    return {
      '@timestamp': signOnTime,
      ecs: { version: '9.5.0' },
      agent: centralAgent,
      event: {
        kind: 'event',
        category: ['authentication', 'session'],
        type: isFailed ? ['start'] : ['start', 'end'],
        action: 'user-signon',
        start: signOnTime,
        ...(isFailed ? {} : { end: sessionEnd }),
        outcome: isFailed ? 'failure' : 'success',
        created: signOnTime,
        dataset: 'workday.sign_on',
        ...(failureMessage && { reason: failureMessage }),
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'workday.sign_on' },
      user: {
        name: employee.userName,
        full_name: `${employee.firstName} ${employee.lastName}`,
      },
      source: { ip },
      host: {
        os: { name: faker.helpers.arrayElement(OPERATING_SYSTEMS) },
        entity: {
          attributes: { managed: isDeviceManaged },
          lifecycle: { last_activity: isFailed ? signOnTime : sessionEnd },
        },
      },
      device: { type: faker.helpers.arrayElement(DEVICE_TYPES_SIGNON) },
      organization: { name: org.name },
      user_agent: { name: browserType },
      related: {
        ip: [ip],
        user: [employee.userName, `${employee.firstName} ${employee.lastName}`],
      },
      workday: {
        sign_on: {
          Authentication_Type: authType,
          // Boolean flags — already converted (pipeline painless script does "0"/"1" → bool)
          Account_Locked__Disabled_or_Expired: false,
          Active_Session: true,
          Device_is_Trusted: faker.datatype.boolean(0.7),
          Failed_Signon: isFailed,
          Forgotten_Password_Reset_Request: false,
          Invalid_Credentials: isFailed,
          Invalid_Password: false,
          Is_Device_Managed: isDeviceManaged,
          Password_Changed: false,
          Signon: !isFailed,
          Successful: !isFailed,
          ...(failureMessage && { Authentication_Failure_Message: failureMessage }),
        },
      },
    } as IntegrationDocument;
  }
}
