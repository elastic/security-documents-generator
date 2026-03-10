/**
 * Google Workspace Integration
 * Generates raw/pre-pipeline documents for all 21 Google Workspace data streams.
 * Documents use message field with JSON.stringify(raw) matching Google Admin Reports API format.
 * The ingest pipeline parses message and derives ECS fields.
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap, Employee, DepartmentName } from '../types';
import { faker } from '@faker-js/faker';
import { GOOGLE_WORKSPACE_SERVICES, DEPT_DRIVE_WEIGHTS } from '../data/saas_apps';

const DS = {
  login: 'logs-google_workspace.login-default',
  admin: 'logs-google_workspace.admin-default',
  drive: 'logs-google_workspace.drive-default',
  saml: 'logs-google_workspace.saml-default',
  token: 'logs-google_workspace.token-default',
  access_transparency: 'logs-google_workspace.access_transparency-default',
  context_aware_access: 'logs-google_workspace.context_aware_access-default',
  alert: 'logs-google_workspace.alert-default',
  user_accounts: 'logs-google_workspace.user_accounts-default',
  groups: 'logs-google_workspace.groups-default',
  group_enterprise: 'logs-google_workspace.group_enterprise-default',
  device: 'logs-google_workspace.device-default',
  rules: 'logs-google_workspace.rules-default',
  chrome: 'logs-google_workspace.chrome-default',
  gmail: 'logs-google_workspace.gmail-default',
  calendar: 'logs-google_workspace.calendar-default',
  chat: 'logs-google_workspace.chat-default',
  meet: 'logs-google_workspace.meet-default',
  keep: 'logs-google_workspace.keep-default',
  data_studio: 'logs-google_workspace.data_studio-default',
  vault: 'logs-google_workspace.vault-default',
  gcp: 'logs-google_workspace.gcp-default',
} as const;

type DsKey = keyof typeof DS;

interface RawActivityEvent {
  name: string;
  type: string;
  parameters?: Array<{
    name: string;
    value?: string;
    intValue?: number | string;
    boolValue?: boolean;
    multiValue?: string[];
  }>;
}

interface RawActivityPayload {
  kind: string;
  id: {
    time: string;
    applicationName: string;
    uniqueQualifier: string;
    customerId: string;
  };
  actor: {
    email: string;
    profileId: string;
    callerType: string;
    key?: string;
  };
  ipAddress?: string;
  events: RawActivityEvent;
  ownerDomain: string;
}

function param(name: string, value: string): { name: string; value: string } {
  return { name, value };
}
function paramInt(name: string, val: number): { name: string; intValue: number } {
  return { name, intValue: val };
}
function paramBool(name: string, val: boolean): { name: string; boolValue: boolean } {
  return { name, boolValue: val };
}
function paramMulti(name: string, vals: string[]): { name: string; multiValue: string[] } {
  return { name, multiValue: vals };
}

export class GoogleWorkspaceIntegration extends BaseIntegration {
  readonly packageName = 'google_workspace';
  readonly displayName = 'Google Workspace';

  readonly dataStreams: DataStreamConfig[] = Object.entries(DS).map(([name, index]) => ({
    name,
    index,
  }));

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const docs = new Map<string, IntegrationDocument[]>();

    if (org.productivitySuite !== 'google') {
      for (const index of Object.values(DS)) {
        docs.set(index, []);
      }
      return docs;
    }

    const buckets: Record<DsKey, IntegrationDocument[]> = {} as Record<
      DsKey,
      IntegrationDocument[]
    >;
    for (const key of Object.keys(DS) as DsKey[]) {
      buckets[key] = [];
    }

    const admins = this.resolveAdmins(org);

    for (const emp of org.employees) {
      this.repeat(1, 3, () => buckets.login.push(this.loginDoc(emp, org)));
      this.repeat(2, 6, () => buckets.drive.push(this.driveDoc(emp, org)));
      this.repeat(0, 2, () => buckets.saml.push(this.samlDoc(emp, org)));
      this.repeat(0, 2, () => buckets.token.push(this.tokenDoc(emp, org)));
      this.repeat(1, 3, () => buckets.gmail.push(this.gmailDoc(emp, org)));
      this.repeat(1, 3, () => buckets.calendar.push(this.calendarDoc(emp, org)));
      this.repeat(0, 2, () => buckets.chat.push(this.chatDoc(emp, org)));
      this.repeat(0, 2, () => buckets.meet.push(this.meetDoc(emp, org)));
      this.repeat(0, 1, () => buckets.keep.push(this.keepDoc(emp, org)));
      this.repeat(0, 1, () => buckets.data_studio.push(this.dataStudioDoc(emp, org)));
      this.repeat(0, 2, () => buckets.chrome.push(this.chromeDoc(emp, org)));
      this.repeat(0, 1, () =>
        buckets.context_aware_access.push(this.contextAwareAccessDoc(emp, org))
      );
      this.repeat(0, 1, () => buckets.user_accounts.push(this.userAccountsDoc(emp, org)));
    }

    for (const admin of admins) {
      this.repeat(1, 4, () => buckets.admin.push(this.adminDoc(admin, org)));
      this.repeat(0, 2, () => buckets.groups.push(this.groupsDoc(admin, org)));
      this.repeat(0, 2, () => buckets.group_enterprise.push(this.groupEnterpriseDoc(admin, org)));
      this.repeat(0, 2, () => buckets.device.push(this.deviceDoc(admin, org)));
      this.repeat(0, 2, () => buckets.rules.push(this.rulesDoc(admin, org)));
      this.repeat(0, 1, () => buckets.alert.push(this.alertDoc(admin, org)));
      this.repeat(0, 1, () =>
        buckets.access_transparency.push(this.accessTransparencyDoc(admin, org))
      );
      this.repeat(0, 1, () => buckets.vault.push(this.vaultDoc(admin, org)));
      this.repeat(0, 1, () => buckets.gcp.push(this.gcpDoc(admin, org)));
    }

    for (const [key, arr] of Object.entries(buckets)) {
      docs.set(DS[key as DsKey], arr);
    }
    return docs;
  }

  private repeat(min: number, max: number, fn: () => void): void {
    const count = faker.number.int({ min, max });
    for (let i = 0; i < count; i++) fn();
  }

  private resolveAdmins(org: Organization): Employee[] {
    const adminEmps = org.employees.filter(
      (e) => e.department === 'Operations' && (e.role.includes('IT') || e.role.includes('Admin'))
    );
    return adminEmps.length > 0
      ? adminEmps
      : org.employees.filter((e) => e.department === 'Operations').slice(0, 3);
  }

  private rawActivityDoc(
    dataset: string,
    applicationName: string,
    employee: Employee,
    org: Organization,
    events: RawActivityEvent
  ): IntegrationDocument {
    const sourceIp = faker.internet.ipv4();
    const ts = this.getRandomTimestamp(72);
    const raw: RawActivityPayload = {
      kind: 'admin#reports#activity',
      id: {
        time: ts,
        applicationName,
        uniqueQualifier: String(faker.number.int({ min: 1, max: 999999999 })),
        customerId: faker.string.alphanumeric(8),
      },
      actor: {
        email: employee.email,
        profileId: String(faker.number.int({ min: 1e5, max: 1e10 })),
        callerType: 'USER',
        key: '',
      },
      ipAddress: sourceIp,
      events,
      ownerDomain: org.domain,
    };
    return {
      '@timestamp': ts,
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset: `google_workspace.${dataset}` },
    } as IntegrationDocument;
  }

  private loginDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.login;
    const eventType = faker.helpers.weightedArrayElement([
      { value: 'login_success', weight: 85 },
      { value: 'login_failure', weight: 8 },
      { value: 'login_challenge', weight: 5 },
      { value: 'logout', weight: 2 },
    ]);
    const params: RawActivityEvent['parameters'] = [
      param(
        'login_type',
        faker.helpers.arrayElement(['exchange', 'google_password', 'saml', 'reauth'])
      ),
      paramInt('login_timestamp', Date.now() * 1000),
    ];
    if (eventType === 'login_challenge') {
      params.push(
        param('login_challenge_method', faker.helpers.arrayElement(cfg.challengeMethods))
      );
    }
    if (eventType === 'login_failure') {
      if (faker.datatype.boolean(0.1)) params.push(paramBool('is_suspicious', true));
    }
    return this.rawActivityDoc('login', 'login', employee, org, {
      name: eventType,
      type: eventType.includes('login') ? 'login' : 'logout',
      parameters: params,
    });
  }

  private adminDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.admin;
    const eventAction = faker.helpers.arrayElement(cfg.events);
    return this.rawActivityDoc('admin', 'admin', employee, org, {
      name: eventAction,
      type: eventAction.includes('SETTING') ? 'APPLICATION_SETTINGS' : 'USER_SETTINGS',
      parameters: [
        param('APPLICATION_NAME', faker.helpers.arrayElement(cfg.applications)),
        param('SETTING_NAME', eventAction.toLowerCase().replace(/_/g, ' ')),
        param('OLD_VALUE', faker.helpers.arrayElement(['true', 'false', 'enabled', 'disabled'])),
        param('NEW_VALUE', faker.helpers.arrayElement(['true', 'false', 'enabled', 'disabled'])),
      ],
    });
  }

  private driveDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.drive;
    const eventAction = faker.helpers.arrayElement(cfg.events);
    const fileType = this.pickFileType(employee.department);
    const visibility = faker.helpers.arrayElement(cfg.visibilities);
    const params: Array<{ name: string; value?: string; boolValue?: boolean }> = [
      param('doc_id', faker.string.alphanumeric(44)),
      param(
        'doc_title',
        `${faker.word.adjective()}-${faker.word.noun()}.${this.fileTypeToExt(fileType)}`
      ),
      param('doc_type', fileType),
      param('owner', employee.email),
      paramBool('owner_is_shared_drive', false),
      paramBool('billable', faker.datatype.boolean(0.8)),
      paramBool('primary_event', true),
      param('visibility', visibility),
      param('originating_app_id', faker.string.numeric(12)),
    ];
    if (eventAction.includes('folder')) {
      params.push(param('destination_folder_id', faker.string.alphanumeric(33)));
      params.push(
        param(
          'destination_folder_title',
          faker.helpers.arrayElement(['Projects', 'Shared', 'Archive', 'Templates'])
        )
      );
    }
    if (eventAction.includes('change_acl') || eventAction.includes('shared')) {
      params.push(param('target_user', faker.helpers.arrayElement(org.employees).email));
    }
    return this.rawActivityDoc('drive', 'drive', employee, org, {
      name: eventAction,
      type:
        eventAction.includes('view') ||
        eventAction.includes('download') ||
        eventAction.includes('preview')
          ? 'access'
          : 'change',
      parameters: params,
    });
  }

  private samlDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.saml;
    const action = faker.helpers.arrayElement(cfg.events);
    const isFailure = action === 'login_failure';
    return this.rawActivityDoc('saml', 'saml', employee, org, {
      name: action,
      type: 'login',
      parameters: [
        param('application_name', faker.helpers.arrayElement(cfg.applications)),
        param('initiated_by', faker.helpers.arrayElement(cfg.initiatedBy)),
        param('orgunit_path', `/${org.domain}`),
        param('saml_status_code', isFailure ? 'FAILURE_URI' : 'SUCCESS_URI'),
        param('saml_second_level_status_code', 'SUCCESS_URI'),
        ...(isFailure ? [param('failure_type', faker.helpers.arrayElement(cfg.failureTypes))] : []),
      ],
    });
  }

  private tokenDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.token;
    const action = faker.helpers.arrayElement(cfg.events);
    const appName = faker.helpers.arrayElement(cfg.appNames);
    const scopes = faker.helpers.arrayElements(cfg.scopes, { min: 1, max: 3 });
    return this.rawActivityDoc('token', 'token', employee, org, {
      name: action,
      type: 'token',
      parameters: [
        param(
          'client_id',
          `${faker.string.numeric(12)}-${faker.string.alphanumeric(32)}.apps.googleusercontent.com`
        ),
        param('app_name', appName),
        param('api_name', 'token'),
        param('method_name', 'oauth'),
        paramInt('num_response_bytes', faker.number.int({ min: 500, max: 5000 })),
        param('client_type', faker.helpers.arrayElement(cfg.clientTypes)),
        paramMulti('scope', scopes),
      ],
    });
  }

  private accessTransparencyDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.access_transparency;
    const product = faker.helpers.arrayElement(cfg.products);
    return this.rawActivityDoc('access_transparency', 'device', employee, org, {
      name: 'APPLICATION_EVENT',
      type: 'device_applications',
      parameters: [param('gsuite_product_name', product), param('on_behalf_of', employee.email)],
    });
  }

  private contextAwareAccessDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.context_aware_access;
    return this.rawActivityDoc('context_aware_access', 'device', employee, org, {
      name: 'APPLICATION_EVENT',
      type: 'device_applications',
      parameters: [
        param('access_level_applied', faker.helpers.arrayElement(cfg.accessLevels)),
        param('application', faker.helpers.arrayElement(cfg.applications)),
        param('device_state', faker.helpers.arrayElement(cfg.deviceStates)),
      ],
    });
  }

  private alertDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.alert;
    const alertType = faker.helpers.arrayElement(cfg.types);
    const source = faker.helpers.arrayElement(cfg.sources);
    const severity = faker.helpers.arrayElement(cfg.severities);
    const alertId = faker.string.uuid();
    const ts = this.getRandomTimestamp(72);
    const raw = {
      alertId,
      createTime: ts,
      customerId: faker.string.alphanumeric(8),
      data: {
        '@type': 'type.googleapis.com/google.apps.alertcenter.type.MailPhishing',
        domainId: { customerPrimaryDomain: org.domain },
        isInternal: faker.datatype.boolean(0.3),
        systemActionType: faker.helpers.arrayElement(['NO_OPERATION', 'ALERT', 'DELETE_MESSAGE']),
        maliciousEntity: {
          displayName: faker.person.fullName(),
          entity: { displayName: employee.userName, emailAddress: employee.email },
          fromHeader: `${faker.string.alphanumeric(8)}@${org.domain}`,
        },
        messages: [
          {
            messageId: `${faker.string.alphanumeric(10)}@${org.domain}`,
            subjectText: faker.lorem.sentence({ min: 2, max: 5 }),
            recipient: employee.email,
            date: ts,
            attachmentsSha256Hash: [faker.string.alphanumeric(64)],
            md5HashMessageBody: faker.string.alphanumeric(32),
            md5HashSubject: faker.string.alphanumeric(32),
            messageBodySnippet: faker.lorem.sentence({ min: 3, max: 8 }),
          },
        ],
      },
      deleted: false,
      etag: faker.string.alphanumeric(12),
      metadata: {
        alertId,
        assignee: employee.email,
        customerId: faker.string.alphanumeric(8),
        etag: faker.string.alphanumeric(12),
        severity,
        status: faker.helpers.arrayElement(cfg.statuses),
        updateTime: ts,
      },
      source,
      type: alertType,
      updateTime: ts,
      startTime: ts,
      endTime: ts,
    };
    return {
      '@timestamp': ts,
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.alert' },
    } as IntegrationDocument;
  }

  private userAccountsDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.user_accounts;
    const action = faker.helpers.arrayElement(cfg.events);
    return this.rawActivityDoc('user_accounts', 'user_accounts', employee, org, {
      name: action,
      type: faker.helpers.arrayElement(cfg.eventTypes),
    });
  }

  private groupsDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.groups;
    const action = faker.helpers.arrayElement(cfg.events);
    const groupName = faker.helpers.arrayElement([
      'engineering',
      'sales',
      'marketing',
      'all-staff',
      'security-team',
      'finance',
      'leadership',
    ]);
    return this.rawActivityDoc('groups', 'groups', employee, org, {
      name: action,
      type: faker.helpers.arrayElement(cfg.eventTypes),
      parameters: [
        param('acl_permission', faker.helpers.arrayElement(cfg.aclPermissions)),
        param('email', `${groupName}@${org.domain}`),
        param(
          'new_value',
          faker.helpers.arrayElements(cfg.memberRoles, { min: 1, max: 2 }).join(',')
        ),
        param('old_value', faker.helpers.arrayElement(cfg.memberRoles)),
      ],
    });
  }

  private groupEnterpriseDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.group_enterprise;
    const action = faker.helpers.arrayElement(cfg.events);
    return this.rawActivityDoc('group_enterprise', 'group_enterprise', employee, org, {
      name: action,
      type: faker.helpers.arrayElement(cfg.eventTypes),
      parameters: [
        param('group_id', faker.string.alphanumeric(10)),
        param('info_setting', faker.helpers.arrayElement(['description', 'name', 'alias'])),
        param('member_id', faker.string.alphanumeric(10)),
        param('member_role', faker.helpers.arrayElement(cfg.memberRoles)),
        param('member_type', faker.helpers.arrayElement(cfg.memberTypes)),
        param('namespace', org.domain),
        param('new_value', faker.word.sample()),
        param('old_value', faker.word.sample()),
        param('security_setting_state', faker.helpers.arrayElement(['enabled', 'disabled'])),
        param(
          'security_setting_value',
          faker.helpers.arrayElement([
            'ALLOW_EXTERNAL_MEMBERS',
            'COLLABORATIVE_INBOX',
            'WHO_CAN_JOIN',
          ])
        ),
      ],
    });
  }

  private deviceDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.device;
    const action = faker.helpers.arrayElement(cfg.events);
    return this.rawActivityDoc('device', 'device', employee, org, {
      name: action,
      type: 'device_applications',
      parameters: [
        param('account_state', faker.helpers.arrayElement(cfg.accountStates)),
        param('compliance', faker.helpers.arrayElement(cfg.complianceStates)),
        param('compromised_state', faker.helpers.arrayElement(cfg.compromisedStates)),
        param('device_id', faker.string.alphanumeric(12)),
        param(
          'device_model',
          faker.helpers.arrayElement(['Pixel 8', 'iPhone 15', 'Galaxy S24', 'Surface Pro'])
        ),
        param('ownership', faker.helpers.arrayElement(cfg.ownerships)),
        param('serial_number', faker.string.alphanumeric(12).toUpperCase()),
        param('device_type', faker.helpers.arrayElement(cfg.deviceTypes)),
        param('user_email', employee.email),
      ],
    });
  }

  private rulesDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.rules;
    const action = faker.helpers.arrayElement(cfg.events);
    const ruleId = String(faker.number.int({ min: 100, max: 9999 }));
    const ruleName = faker.helpers.arrayElement(cfg.ruleNames);
    return this.rawActivityDoc('rules', 'rules', employee, org, {
      name: action,
      type: faker.helpers.arrayElement(cfg.eventTypes),
      parameters: [
        param('actor_ip_address', faker.internet.ipv4()),
        paramBool('has_alert', faker.datatype.boolean(0.4)),
        param('rule_id', ruleId),
        param('rule_name', ruleName),
        param('data_source', faker.helpers.arrayElement(cfg.dataSources)),
        param('severity', faker.helpers.arrayElement(cfg.severities)),
        param('scan_type', faker.helpers.arrayElement(cfg.scanTypes)),
      ],
    });
  }

  private chromeDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.chrome;
    const action = faker.helpers.arrayElement(cfg.events);
    const browserVersion = faker.helpers.arrayElement(cfg.browserVersions);
    return this.rawActivityDoc('chrome', 'chrome', employee, org, {
      name: action,
      type: `${action}_TYPE`,
      parameters: [
        paramInt('TIMESTAMP', Date.now()),
        param('EVENT_REASON', action),
        param('APP_ID', faker.string.alphanumeric(32)),
        param('APP_NAME', faker.helpers.arrayElement(cfg.extensionNames)),
        param('BROWSER_VERSION', browserVersion),
        param('CLIENT_TYPE', faker.helpers.arrayElement(cfg.clientTypes)),
        param('DEVICE_NAME', `${employee.userName}-device`),
        param('DEVICE_USER', employee.email),
        param('EVENT_RESULT', 'REPORTED'),
        param('EXTENSION_ACTION', action.includes('INSTALL') ? 'INSTALL' : 'UNINSTALL'),
        param('EXTENSION_SOURCE', faker.helpers.arrayElement(cfg.extensionSources)),
        param('ORG_UNIT_NAME', org.domain),
        param('PROFILE_USER_NAME', employee.email),
      ],
    });
  }

  private gmailDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.gmail;
    const action = faker.helpers.arrayElement(cfg.events);
    const recipient = faker.helpers.arrayElement(org.employees);
    const sourceIp = faker.internet.ipv4();
    const timestampUsec = (Date.now() - faker.number.int({ min: 0, max: 72 * 3600 * 1000 })) * 1000;
    const elapsedUsec = faker.number.int({ min: 100000, max: 2000000 });
    const isInternal = employee.email.endsWith(`@${org.domain}`);
    const subject = faker.lorem.sentence({ min: 3, max: 8 });
    const messageId = `<${faker.string.alphanumeric(20)}@${org.domain}>`;
    const actionType = faker.helpers.arrayElement(cfg.actionTypes);
    const mailEventType = faker.helpers.arrayElement(cfg.mailEventTypes);
    const encodedIp = Buffer.from(sourceIp).toString('base64');

    const bv = (v: unknown) => ({ v });
    const bRecord = (fields: Array<{ v: unknown }>) => ({ v: { f: fields } });

    const row = {
      f: [
        bv(recipient.email),
        bv(faker.string.uuid()),
        bv(action),
        bv('delivery_type'),
        bv(encodedIp),
        bv(timestampUsec),
        bRecord([
          bv(timestampUsec),
          bv(elapsedUsec),
          bv(true),
          bv(mailEventType),
          bRecord([bRecord([bv(employee.email)])]),
        ]),
        bRecord([
          bRecord([
            bv(employee.email),
            bv(employee.email),
            bv(`${employee.firstName} ${employee.lastName}`),
            bv('smtp-inbound'),
          ]),
          bRecord([
            bv(true),
            bv(true),
            bv(isInternal),
            bv(false),
            bv(sourceIp),
            bv(sourceIp),
            bv(250),
            bv('1'),
            bv('1'),
            bv([bRecord([bv(org.domain), bv('2')])]),
          ]),
          bv(subject),
          bv(messageId),
          bv(faker.number.int({ min: 0, max: 3 })),
          bv(faker.number.int({ min: 1000, max: 100000 })),
          bv(faker.datatype.boolean(0.05)),
          bv(false),
          bv('250 2.0.0 OK'),
          bv(actionType),
          bv(`gmail-ui::${recipient.email}`),
          bv([bRecord([bv(recipient.email), bv('1'), bv('gmail-ui')])]),
        ]),
      ],
    };

    const schema = {
      fields: [
        { name: 'email', type: 'STRING' },
        { name: 'event_id', type: 'STRING' },
        { name: 'event_name', type: 'STRING' },
        { name: 'event_type', type: 'STRING' },
        { name: 'ip_address', type: 'STRING' },
        { name: 'time_usec', type: 'INTEGER' },
        {
          name: 'event_info',
          type: 'RECORD',
          fields: [
            { name: 'timestamp_usec', type: 'INTEGER' },
            { name: 'elapsed_time_usec', type: 'INTEGER' },
            { name: 'success', type: 'BOOLEAN' },
            { name: 'mail_event_type', type: 'STRING' },
            {
              name: 'client_context',
              type: 'RECORD',
              fields: [
                {
                  name: 'session_context',
                  type: 'RECORD',
                  fields: [{ name: 'delegate_user_email', type: 'STRING' }],
                },
              ],
            },
          ],
        },
        {
          name: 'message_info',
          type: 'RECORD',
          fields: [
            {
              name: 'source',
              type: 'RECORD',
              fields: [
                { name: 'address', type: 'STRING' },
                { name: 'from_header_address', type: 'STRING' },
                { name: 'from_header_displayname', type: 'STRING' },
                { name: 'service', type: 'STRING' },
              ],
            },
            {
              name: 'connection_info',
              type: 'RECORD',
              fields: [
                { name: 'dkim_pass', type: 'BOOLEAN' },
                { name: 'spf_pass', type: 'BOOLEAN' },
                { name: 'is_internal', type: 'BOOLEAN' },
                { name: 'is_intra_domain', type: 'BOOLEAN' },
                { name: 'smtp_in_connect_ip', type: 'STRING' },
                { name: 'smtp_user_agent_ip', type: 'STRING' },
                { name: 'smtp_reply_code', type: 'INTEGER' },
                { name: 'smtp_tls_state', type: 'STRING' },
                { name: 'smtp_response_reason', type: 'STRING' },
                {
                  name: 'authenticated_domain',
                  type: 'RECORD',
                  mode: 'REPEATED',
                  fields: [
                    { name: 'name', type: 'STRING' },
                    { name: 'type', type: 'STRING' },
                  ],
                },
              ],
            },
            { name: 'subject', type: 'STRING' },
            { name: 'rfc2822_message_id', type: 'STRING' },
            { name: 'num_message_attachments', type: 'INTEGER' },
            { name: 'payload_size', type: 'INTEGER' },
            { name: 'is_spam', type: 'BOOLEAN' },
            { name: 'is_policy_check_for_sender', type: 'BOOLEAN' },
            { name: 'description', type: 'STRING' },
            { name: 'action_type', type: 'STRING' },
            { name: 'flattened_destinations', type: 'STRING' },
            {
              name: 'destination',
              type: 'RECORD',
              mode: 'REPEATED',
              fields: [
                { name: 'address', type: 'STRING' },
                { name: 'selector', type: 'STRING' },
                { name: 'service', type: 'STRING' },
              ],
            },
          ],
        },
      ],
    };

    const raw = { row, schema };
    return {
      '@timestamp': new Date(timestampUsec / 1000).toISOString(),
      message: JSON.stringify(raw),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.gmail' },
    } as IntegrationDocument;
  }

  private calendarDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.calendar;
    const action = faker.helpers.arrayElement(cfg.events);
    return this.rawActivityDoc('calendar', 'calendar', employee, org, {
      name: action.replace(/_/g, '-'),
      type: faker.helpers.arrayElement(cfg.eventTypes),
      parameters: [param('api_kind', faker.helpers.arrayElement(cfg.apiKinds))],
    });
  }

  private chatDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.chat;
    const action = faker.helpers.arrayElement(cfg.events);
    const roomName = faker.helpers.arrayElement([
      'General',
      'Engineering',
      'Sales Updates',
      'Random',
      'Incidents',
      'Design',
    ]);
    return this.rawActivityDoc('chat', 'chat', employee, org, {
      name: action.replace(/_/g, '-'),
      type: faker.helpers.arrayElement(cfg.eventTypes),
      parameters: [
        param('actor', employee.email),
        param('room_id', faker.string.numeric(6)),
        param('room_name', roomName),
      ],
    });
  }

  private meetDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.meet;
    const action = faker.helpers.arrayElement(cfg.events);
    return this.rawActivityDoc('meet', 'meet', employee, org, {
      name: action.replace(/_/g, '-'),
      type: faker.helpers.arrayElement(cfg.eventTypes),
      parameters: [
        paramBool('is_external', false),
        param('meeting_code', faker.string.alpha({ length: 10, casing: 'upper' })),
        param('conference_id', faker.string.alphanumeric(24)),
        paramInt('target_user_count', faker.number.int({ min: 1, max: 20 })),
        param('identifier', employee.email),
        param('identifier_type', faker.helpers.arrayElement(cfg.identifierTypes)),
      ],
    });
  }

  private keepDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.keep;
    const action = faker.helpers.arrayElement(cfg.events);
    const noteId = faker.string.alphanumeric(12);
    const params: Array<{ name: string; value?: string }> = [
      param('note_name', `https://keep.googleapis.com/v1/notes/${noteId}`),
      param('owner_email', employee.email),
      param('type', 'user_action'),
    ];
    if (action.includes('attachment')) {
      params.push(
        param(
          'attachment_name',
          `https://keep.googleapis.com/v1/notes/${noteId}/attachments/${faker.string.alphanumeric(8)}`
        )
      );
    }
    return this.rawActivityDoc('keep', 'keep', employee, org, {
      name: action,
      type: 'user_action',
      parameters: params,
    });
  }

  private dataStudioDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.data_studio;
    const action = faker.helpers.arrayElement(cfg.events);
    const reportName = faker.helpers.arrayElement([
      'Q4 Revenue Dashboard',
      'Weekly Metrics',
      'Sales Pipeline',
      'Engineering Velocity',
      'Customer Health',
    ]);
    return this.rawActivityDoc('data_studio', 'data_studio', employee, org, {
      name: action.replace(/_/g, '-').toUpperCase(),
      type: faker.helpers.arrayElement(cfg.eventTypes),
      parameters: [
        param('asset_id', faker.string.alphanumeric(12)),
        param('asset_name', reportName),
        param('asset_type', faker.helpers.arrayElement(cfg.assetTypes)),
        param('owner_email', employee.email),
        param('visibility', faker.helpers.arrayElement(cfg.visibilities)),
      ],
    });
  }

  private vaultDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.vault;
    const action = faker.helpers.arrayElement(cfg.events);
    return this.rawActivityDoc('vault', 'vault', employee, org, {
      name: action.replace(/_/g, '-'),
      type: 'user_action',
      parameters: [
        param('matter_id', faker.string.uuid()),
        param(
          'matter_name',
          faker.helpers.arrayElement([
            'Legal Review 2025',
            'HR Investigation',
            'Compliance Audit',
            'eDiscovery Case',
          ])
        ),
      ],
    });
  }

  private gcpDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.gcp;
    const action = faker.helpers.arrayElement(cfg.events);
    return this.rawActivityDoc('gcp', 'device', employee, org, {
      name: action,
      type: faker.helpers.arrayElement(cfg.eventTypes),
      parameters: [param('user_email', employee.email)],
    });
  }

  private pickFileType(department: DepartmentName): string {
    const weights = DEPT_DRIVE_WEIGHTS[department];
    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let random = faker.number.float({ min: 0, max: totalWeight });
    for (const [type, weight] of entries) {
      random -= weight;
      if (random <= 0) return type;
    }
    return 'document';
  }

  private fileTypeToExt(fileType: string): string {
    const map: Record<string, string> = {
      document: 'gdoc',
      spreadsheet: 'gsheet',
      presentation: 'gslides',
      form: 'gform',
      pdf: 'pdf',
      image: 'png',
      video: 'mp4',
      folder: '',
    };
    return map[fileType] || 'txt';
  }
}
