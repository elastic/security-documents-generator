/**
 * Google Workspace Integration
 * Generates documents for all 21 Google Workspace data streams
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

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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

  private base(
    dataset: string,
    provider: string,
    employee: Employee,
    org: Organization,
    extra: Record<string, unknown>
  ): IntegrationDocument {
    const sourceIp = faker.internet.ipv4();
    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        dataset: `google_workspace.${dataset}`,
        provider,
        kind: 'event',
        ...((extra.event as Record<string, unknown>) ?? {}),
      },
      google_workspace: {
        actor: { type: 'USER' },
        kind: 'admin#reports#activity',
        organization: { domain: org.domain },
        ...((extra.google_workspace as Record<string, unknown>) ?? {}),
      },
      source: { ip: sourceIp, user: { email: employee.email } },
      user: { email: employee.email, name: employee.userName, domain: org.domain },
      related: { user: [employee.email, employee.userName], ip: [sourceIp] },
      data_stream: { namespace: 'default', type: 'logs', dataset: `google_workspace.${dataset}` },
      tags: ['forwarded', `google_workspace-${dataset}`],
      ...Object.fromEntries(
        Object.entries(extra).filter(([k]) => k !== 'event' && k !== 'google_workspace')
      ),
    } as IntegrationDocument;
  }

  // ---------------------------------------------------------------------------
  // Document generators – existing datasets
  // ---------------------------------------------------------------------------

  private loginDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.login;
    const eventType = faker.helpers.weightedArrayElement([
      { value: 'login_success', weight: 85 },
      { value: 'login_failure', weight: 8 },
      { value: 'login_challenge', weight: 5 },
      { value: 'logout', weight: 2 },
    ]);
    const isSuccess = eventType === 'login_success' || eventType === 'logout';

    return this.base('login', 'login', employee, org, {
      event: {
        action: eventType,
        category: ['authentication'],
        type: isSuccess ? ['start'] : ['info'],
        outcome: isSuccess ? 'success' : 'failure',
      },
      google_workspace: {
        event: { type: eventType.includes('login') ? 'login' : 'logout' },
        login: {
          challenge_method:
            eventType === 'login_challenge'
              ? faker.helpers.arrayElement(cfg.challengeMethods)
              : undefined,
          is_suspicious: eventType === 'login_failure' && faker.datatype.boolean(0.1),
          type: faker.helpers.arrayElement(['exchange', 'google_password', 'saml', 'reauth']),
          timestamp: Date.now() * 1000,
        },
      },
    });
  }

  private adminDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.admin;
    const eventAction = faker.helpers.arrayElement(cfg.events);

    return this.base('admin', 'admin', employee, org, {
      event: {
        action: eventAction,
        category: ['iam', 'configuration'],
        type: ['change'],
      },
      google_workspace: {
        event: { type: eventAction },
        admin: {
          application: { name: faker.helpers.arrayElement(cfg.applications) },
          setting: { name: eventAction.toLowerCase().replace(/_/g, ' ') },
          old_value: faker.helpers.arrayElement(['true', 'false', 'enabled', 'disabled']),
          new_value: faker.helpers.arrayElement(['true', 'false', 'enabled', 'disabled']),
        },
      },
    });
  }

  private driveDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.drive;
    const eventAction = faker.helpers.arrayElement(cfg.events);
    const fileType = this.pickFileType(employee.department);
    const visibility = faker.helpers.arrayElement(cfg.visibilities);

    return this.base('drive', 'drive', employee, org, {
      event: {
        action: eventAction,
        category: ['file'],
        type: this.mapDriveEventType(eventAction),
      },
      google_workspace: {
        event: { type: eventAction },
        drive: {
          file: {
            id: faker.string.alphanumeric(44),
            type: fileType,
            owner: { email: employee.email, is_shared_drive: false },
          },
          billable: faker.datatype.boolean(0.8),
          visibility,
          primary_event: true,
          originating_app_id: faker.string.numeric(12),
          ...(eventAction.includes('folder')
            ? {
                destination_folder_id: faker.string.alphanumeric(33),
                destination_folder_title: faker.helpers.arrayElement([
                  'Projects',
                  'Shared',
                  'Archive',
                  'Templates',
                ]),
              }
            : {}),
          ...(eventAction.includes('change_acl') || eventAction.includes('shared')
            ? { target_user: faker.helpers.arrayElement(org.employees).email }
            : {}),
        },
      },
      file: {
        name: `${faker.word.adjective()}-${faker.word.noun()}.${this.fileTypeToExt(fileType)}`,
        owner: employee.email,
        type: 'file',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Document generators – security / authentication
  // ---------------------------------------------------------------------------

  private samlDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.saml;
    const action = faker.helpers.arrayElement(cfg.events);
    const isFailure = action === 'login_failure';

    return this.base('saml', 'saml', employee, org, {
      event: {
        action,
        category: ['authentication', 'session'],
        type: ['start'],
        outcome: isFailure ? 'failure' : 'success',
      },
      google_workspace: {
        event: { type: 'login' },
        saml: {
          application_name: faker.helpers.arrayElement(cfg.applications),
          failure_type: isFailure ? faker.helpers.arrayElement(cfg.failureTypes) : undefined,
          initiated_by: faker.helpers.arrayElement(cfg.initiatedBy),
          orgunit_path: `/${org.domain}`,
          status_code: isFailure ? 'FAILURE_URI' : 'SUCCESS_URI',
          second_level_status_code: 'SUCCESS_URI',
        },
      },
    });
  }

  private tokenDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.token;
    const action = faker.helpers.arrayElement(cfg.events);
    const appName = faker.helpers.arrayElement(cfg.appNames);

    return this.base('token', 'token', employee, org, {
      event: {
        action,
        category: ['iam'],
        type: ['info', 'user'],
      },
      google_workspace: {
        event: { name: action },
        token: {
          api_name: 'token',
          app_name: appName,
          client: {
            id: faker.string.alphanumeric(40),
            type: faker.helpers.arrayElement(cfg.clientTypes),
          },
          method_name: 'oauth',
          num_response_bytes: faker.number.int({ min: 500, max: 5000 }),
          scope: {
            value: faker.helpers.arrayElements(cfg.scopes, { min: 1, max: 3 }),
          },
        },
      },
    });
  }

  private accessTransparencyDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.access_transparency;
    const product = faker.helpers.arrayElement(cfg.products);

    return this.base('access_transparency', 'device', employee, org, {
      event: { action: 'APPLICATION_EVENT' },
      google_workspace: {
        event: { name: 'APPLICATION_EVENT', type: 'device_applications' },
        access_transparency: {
          access_approval: {
            alert_center_ids: faker.string.alphanumeric(10),
            request_ids: faker.string.alphanumeric(10),
          },
          access_management: { policy: 'default' },
          actor_home_office: faker.location.city(),
          gsuite_product_name: product,
          justifications: faker.helpers.arrayElement([
            'Customer Initiated Support',
            'Google Initiated Review',
            'Third Party Data Request',
          ]),
          log_id: faker.string.alphanumeric(10),
          on_behalf_of: employee.email,
          owner_email: employee.email,
          resource_name: faker.system.fileName(),
          tickets: faker.string.alphanumeric(8),
        },
      },
    });
  }

  private contextAwareAccessDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.context_aware_access;

    return this.base('context_aware_access', 'device', employee, org, {
      event: { action: 'APPLICATION_EVENT' },
      google_workspace: {
        event: { name: 'APPLICATION_EVENT', type: 'device_applications' },
        context_aware_access: {
          access_level: {
            applied: faker.helpers.arrayElement(cfg.accessLevels),
            satisfied: faker.helpers.arrayElement(cfg.accessLevels),
            unsatisfied: faker.helpers.arrayElement(cfg.accessLevels),
          },
          application: faker.helpers.arrayElement(cfg.applications),
          device: {
            id: faker.string.alphanumeric(12),
            state: faker.helpers.arrayElement(cfg.deviceStates),
          },
        },
      },
    });
  }

  private alertDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.alert;
    const alertType = faker.helpers.arrayElement(cfg.types);
    const source = faker.helpers.arrayElement(cfg.sources);
    const severity = faker.helpers.arrayElement(cfg.severities);
    const alertId = faker.string.uuid();

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action: source,
        category: ['email', 'threat'],
        type: ['info'],
        kind: 'alert',
        dataset: 'google_workspace.alert',
        id: alertId,
      },
      google_workspace: {
        alert: {
          create_time: this.getRandomTimestamp(72),
          customer: { id: faker.string.alphanumeric(8) },
          data: {
            type: 'type.googleapis.com/google.apps.alertcenter.type.MailPhishing',
            is_internal: faker.datatype.boolean(0.3),
            system_action_type: faker.helpers.arrayElement([
              'NO_OPERATION',
              'ALERT',
              'DELETE_MESSAGE',
            ]),
          },
          deleted: false,
          etag: faker.string.alphanumeric(12),
          id: alertId,
          metadata: {
            alert: { id: alertId },
            assignee: employee.email,
            customer: { id: faker.string.alphanumeric(8) },
            etag: faker.string.alphanumeric(12),
            severity,
            status: faker.helpers.arrayElement(cfg.statuses),
            update_time: this.getRandomTimestamp(72),
          },
          source,
          type: alertType,
          update_time: this.getRandomTimestamp(72),
        },
      },
      user: { email: employee.email, name: employee.userName, domain: org.domain },
      related: { user: [employee.email, employee.userName] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.alert' },
      tags: ['forwarded', 'google_workspace-alert'],
    } as IntegrationDocument;
  }

  // ---------------------------------------------------------------------------
  // Document generators – user / group management
  // ---------------------------------------------------------------------------

  private userAccountsDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.user_accounts;
    const action = faker.helpers.arrayElement(cfg.events);

    return this.base('user_accounts', 'user_accounts', employee, org, {
      event: {
        action,
        category: ['iam'],
        type: ['change', 'user'],
      },
      google_workspace: {
        event: { type: faker.helpers.arrayElement(cfg.eventTypes) },
      },
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

    return this.base('groups', 'groups', employee, org, {
      event: {
        action,
        category: ['iam'],
        type: ['group', 'change'],
      },
      google_workspace: {
        event: { type: faker.helpers.arrayElement(cfg.eventTypes) },
        groups: {
          acl_permission: faker.helpers.arrayElement(cfg.aclPermissions),
          email: `${groupName}@${org.domain}`,
          new_value: faker.helpers.arrayElements(cfg.memberRoles, { min: 1, max: 2 }),
          old_value: [faker.helpers.arrayElement(cfg.memberRoles)],
        },
      },
      group: { domain: org.domain, name: groupName },
    });
  }

  private groupEnterpriseDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.group_enterprise;
    const action = faker.helpers.arrayElement(cfg.events);

    return this.base('group_enterprise', 'group_enterprise', employee, org, {
      event: { action },
      google_workspace: {
        event: { name: action, type: faker.helpers.arrayElement(cfg.eventTypes) },
        group_enterprise: {
          group: { id: faker.string.alphanumeric(10) },
          info_setting: faker.helpers.arrayElement(['description', 'name', 'alias']),
          member: {
            id: faker.string.alphanumeric(10),
            role: faker.helpers.arrayElement(cfg.memberRoles),
            type: faker.helpers.arrayElement(cfg.memberTypes),
          },
          namespace: org.domain,
          new_value: faker.word.sample(),
          old_value: faker.word.sample(),
          security_setting: {
            state: faker.helpers.arrayElement(['enabled', 'disabled']),
            value: faker.helpers.arrayElement([
              'ALLOW_EXTERNAL_MEMBERS',
              'COLLABORATIVE_INBOX',
              'WHO_CAN_JOIN',
            ]),
          },
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Document generators – device & security rules
  // ---------------------------------------------------------------------------

  private deviceDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.device;
    const action = faker.helpers.arrayElement(cfg.events);
    const deviceType = faker.helpers.arrayElement(cfg.deviceTypes);

    return this.base('device', 'device', employee, org, {
      event: { action },
      google_workspace: {
        event: { name: action, type: 'device_applications' },
        device: {
          account_state: faker.helpers.arrayElement(cfg.accountStates),
          compliance: faker.helpers.arrayElement(cfg.complianceStates),
          compromised_state: faker.helpers.arrayElement(cfg.compromisedStates),
          id: faker.string.alphanumeric(12),
          model: faker.helpers.arrayElement(['Pixel 8', 'iPhone 15', 'Galaxy S24', 'Surface Pro']),
          os: { version: faker.system.semver() },
          ownership: faker.helpers.arrayElement(cfg.ownerships),
          serial_number: faker.string.alphanumeric(12).toUpperCase(),
          type: deviceType,
          user_email: employee.email,
        },
      },
    });
  }

  private rulesDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.rules;
    const action = faker.helpers.arrayElement(cfg.events);
    const ruleId = String(faker.number.int({ min: 100, max: 9999 }));

    return this.base('rules', 'rules', employee, org, {
      event: { action },
      google_workspace: {
        event: { name: action, type: faker.helpers.arrayElement(cfg.eventTypes) },
        rules: {
          actor_ip_address: faker.internet.ipv4(),
          has_alert: faker.datatype.boolean(0.4),
          id: [ruleId],
          name: [faker.helpers.arrayElement(cfg.ruleNames)],
          data_source: faker.helpers.arrayElement(cfg.dataSources),
          severity: faker.helpers.arrayElement(cfg.severities),
          scan_type: faker.helpers.arrayElement(cfg.scanTypes),
          resource: { recipients_omitted_count: faker.number.int({ min: 0, max: 50 }) },
        },
      },
      rule: { id: [ruleId], name: [faker.helpers.arrayElement(cfg.ruleNames)] },
    });
  }

  private chromeDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.chrome;
    const action = faker.helpers.arrayElement(cfg.events);
    const browserVersion = faker.helpers.arrayElement(cfg.browserVersions);

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action: action.toLowerCase().replace(/_/g, '-'),
        category: ['configuration'],
        type: ['change'],
        kind: 'event',
        dataset: 'google_workspace.chrome',
        provider: 'chrome',
        outcome: 'success',
        reason: action,
      },
      google_workspace: {
        chrome: {
          actor: { caller_type: 'USER', email: employee.email },
          app_name: faker.helpers.arrayElement(cfg.extensionNames),
          app_id: faker.string.alphanumeric(32),
          browser_version: browserVersion,
          client_type: faker.helpers.arrayElement(cfg.clientTypes),
          device_name: `${employee.userName}-device`,
          device_user: employee.email,
          event_reason: action,
          event_result: 'REPORTED',
          extension_action: action.includes('INSTALL') ? 'INSTALL' : 'UNINSTALL',
          extension_source: faker.helpers.arrayElement(cfg.extensionSources),
          name: action,
          type: `${action}_TYPE`,
          org_unit_name: org.domain,
          profile_user_name: employee.email,
        },
      },
      observer: { product: 'Chrome', vendor: 'Google Workspace' },
      source: { user: { email: employee.email, domain: org.domain, name: employee.userName } },
      user: { email: employee.email, name: employee.userName, domain: org.domain },
      related: { user: [employee.email, employee.userName] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.chrome' },
      tags: ['forwarded', 'google_workspace-chrome'],
    } as IntegrationDocument;
  }

  // ---------------------------------------------------------------------------
  // Document generators – collaboration
  // ---------------------------------------------------------------------------

  private gmailDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.gmail;
    const action = faker.helpers.arrayElement(cfg.events);
    const recipient = faker.helpers.arrayElement(org.employees);
    const sourceIp = faker.internet.ipv4();

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action,
        category: ['email'],
        type: ['info'],
        kind: 'event',
        dataset: 'google_workspace.gmail',
        outcome: 'success',
      },
      email: {
        from: { address: [employee.email] },
        to: { address: [recipient.email] },
        subject: faker.lorem.sentence({ min: 3, max: 8 }),
        message_id: `${faker.string.alphanumeric(20)}@${org.domain}`,
      },
      google_workspace: {
        gmail: {
          email: recipient.email,
          event_info: {
            mail_event_type: faker.helpers.arrayElement(cfg.mailEventTypes),
          },
          event_type: 'delivery_type',
          ip_address: sourceIp,
          message_info: {
            action_type: faker.helpers.arrayElement(cfg.actionTypes),
            connection_info: {
              dkim_pass: true,
              is_internal: employee.email.endsWith(org.domain),
              spf_pass: true,
            },
            is_spam: faker.datatype.boolean(0.05),
            num_message_attachments: faker.number.int({ min: 0, max: 3 }),
            payload_size: faker.number.int({ min: 1000, max: 100000 }),
            source: {
              from_header_address: employee.email,
              service: 'smtp-inbound',
            },
          },
        },
      },
      related: { ip: [sourceIp], user: [employee.email, recipient.email] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.gmail' },
      tags: ['forwarded', 'google_workspace-gmail'],
    } as IntegrationDocument;
  }

  private calendarDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.calendar;
    const action = faker.helpers.arrayElement(cfg.events);

    return this.base('calendar', 'calendar', employee, org, {
      event: {
        action: action.replace(/_/g, '-'),
        category: ['configuration'],
        type: action.includes('delete')
          ? ['deletion']
          : action.includes('create')
            ? ['creation']
            : ['change'],
      },
      google_workspace: {
        calendar: {
          api_kind: faker.helpers.arrayElement(cfg.apiKinds),
          name: action,
          type: faker.helpers.arrayElement(cfg.eventTypes),
        },
      },
      observer: { product: 'Calendar', vendor: 'Google Workspace' },
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

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action: action.replace(/_/g, '-'),
        category: ['configuration'],
        type: ['change'],
        kind: 'event',
        dataset: 'google_workspace.chat',
        provider: 'chat',
      },
      google_workspace: {
        actor: { caller_type: 'USER' },
        kind: 'admin#reports#activity',
        chat: {
          actor: employee.email,
          actor_type: faker.helpers.arrayElement(cfg.actorTypes),
          conversation_ownership: faker.helpers.arrayElement(cfg.conversationOwnerships),
          conversation_type: faker.helpers.arrayElement(cfg.conversationTypes),
          external_room: 'DISABLED',
          name: action,
          room_id: faker.string.numeric(6),
          room_name: roomName,
          type: faker.helpers.arrayElement(cfg.eventTypes),
        },
      },
      observer: { product: 'Chat', vendor: 'Google Workspace' },
      source: { user: { email: employee.email, domain: org.domain, name: employee.userName } },
      user: { email: employee.email, name: employee.userName, domain: org.domain },
      related: { user: [employee.email] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.chat' },
      tags: ['forwarded', 'google_workspace-chat'],
    } as IntegrationDocument;
  }

  private meetDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.meet;
    const action = faker.helpers.arrayElement(cfg.events);

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action: action.replace(/_/g, '-'),
        type: ['info'],
        kind: 'event',
        dataset: 'google_workspace.meet',
        provider: 'meet',
      },
      google_workspace: {
        actor: { caller_type: 'USER' },
        kind: 'admin#reports#activity',
        meet: {
          conference_id: faker.string.alphanumeric(24),
          endpoint: {
            identifier: employee.email,
            identifier_type: faker.helpers.arrayElement(cfg.identifierTypes),
            is_external: false,
          },
          meeting_code: faker.string.alpha({ length: 10, casing: 'upper' }),
          name: action,
          target: { user_count: faker.number.int({ min: 1, max: 20 }) },
          type: faker.helpers.arrayElement(cfg.eventTypes),
        },
      },
      observer: { product: 'Meet', vendor: 'Google Workspace' },
      source: { user: { email: employee.email, domain: org.domain, name: employee.userName } },
      user: { email: employee.email, name: employee.userName, domain: org.domain },
      related: { user: [employee.email] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.meet' },
      tags: ['forwarded', 'google_workspace-meet'],
    } as IntegrationDocument;
  }

  private keepDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.keep;
    const action = faker.helpers.arrayElement(cfg.events);
    const noteId = faker.string.alphanumeric(12);

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action: action.replace(/_/g, '-'),
        type: ['change'],
        kind: 'event',
        dataset: 'google_workspace.keep',
        provider: 'keep',
      },
      google_workspace: {
        actor: { caller_type: 'USER' },
        kind: 'admin#reports#activity',
        keep: {
          name: action,
          note_name: `https://keep.googleapis.com/v1/notes/${noteId}`,
          owner_email: employee.email,
          type: 'user_action',
          ...(action.includes('attachment')
            ? {
                attachment_name: `https://keep.googleapis.com/v1/notes/${noteId}/attachments/${faker.string.alphanumeric(8)}`,
              }
            : {}),
        },
      },
      observer: { product: 'Keep', vendor: 'Google Workspace' },
      source: { user: { email: employee.email, domain: org.domain, name: employee.userName } },
      user: { email: employee.email, name: employee.userName, domain: org.domain },
      related: { user: [employee.email] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.keep' },
      tags: ['forwarded', 'google_workspace-keep'],
    } as IntegrationDocument;
  }

  // ---------------------------------------------------------------------------
  // Document generators – analytics / compliance
  // ---------------------------------------------------------------------------

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

    return this.base('data_studio', 'data_studio', employee, org, {
      event: {
        action: action.replace(/_/g, '-'),
        category: ['configuration'],
        type: action.includes('delete') ? ['deletion'] : ['access'],
      },
      google_workspace: {
        data_studio: {
          asset_id: faker.string.alphanumeric(12),
          asset_name: reportName,
          asset_type: faker.helpers.arrayElement(cfg.assetTypes),
          name: action.toUpperCase(),
          owner_email: employee.email,
          type: faker.helpers.arrayElement(cfg.eventTypes),
          visibility: faker.helpers.arrayElement(cfg.visibilities),
        },
      },
      observer: { product: 'Data Studio', vendor: 'Google Workspace' },
    });
  }

  private vaultDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.vault;
    const action = faker.helpers.arrayElement(cfg.events);

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action: action.replace(/_/g, '-'),
        category: ['configuration'],
        type: ['access'],
        kind: 'event',
        dataset: 'google_workspace.vault',
        provider: 'vault',
      },
      google_workspace: {
        actor: { caller_type: 'USER' },
        kind: 'admin#reports#activity',
        vault: {
          name: action,
          type: 'user_action',
          matter_id: faker.string.uuid(),
          additional_details: {
            matter_name: faker.helpers.arrayElement([
              'Legal Review 2025',
              'HR Investigation',
              'Compliance Audit',
              'eDiscovery Case',
            ]),
          },
        },
      },
      observer: { product: 'Vault', vendor: 'Google Workspace' },
      source: { user: { email: employee.email, domain: org.domain, name: employee.userName } },
      user: { email: employee.email, name: employee.userName, domain: org.domain },
      related: { user: [employee.email] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.vault' },
      tags: ['forwarded', 'google_workspace-vault'],
    } as IntegrationDocument;
  }

  private gcpDoc(employee: Employee, org: Organization): IntegrationDocument {
    const cfg = GOOGLE_WORKSPACE_SERVICES.gcp;
    const action = faker.helpers.arrayElement(cfg.events);

    return this.base('gcp', 'device', employee, org, {
      event: { action },
      google_workspace: {
        event: { name: action, type: faker.helpers.arrayElement(cfg.eventTypes) },
        gcp: { user_email: employee.email },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Drive helpers
  // ---------------------------------------------------------------------------

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

  private mapDriveEventType(action: string): string[] {
    if (action.includes('create') || action.includes('upload') || action.includes('add'))
      return ['creation'];
    if (action.includes('delete') || action.includes('remove')) return ['deletion'];
    if (
      action.includes('edit') ||
      action.includes('rename') ||
      action.includes('move') ||
      action.includes('change')
    )
      return ['change'];
    return ['access'];
  }
}
