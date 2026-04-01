/**
 * Okta System Logs Integration
 * Generates authentication and activity log documents for okta.system data stream
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, OktaSystemLogDocument, CorrelationMap, OktaGroup } from '../types';
import { faker } from '@faker-js/faker';

/**
 * Okta applications for SSO events
 */
const OKTA_APPLICATIONS = [
  { name: 'AWS Console', id: '0oa1234567890abcdef', type: 'SAML_2_0' },
  { name: 'GitHub Enterprise', id: '0oa2345678901bcdefg', type: 'SAML_2_0' },
  { name: 'Slack', id: '0oa3456789012cdefgh', type: 'SAML_2_0' },
  { name: 'Jira', id: '0oa4567890123defghi', type: 'SAML_2_0' },
  { name: 'Confluence', id: '0oa5678901234efghij', type: 'SAML_2_0' },
  { name: 'Salesforce', id: '0oa6789012345fghijk', type: 'SAML_2_0' },
  { name: 'Zoom', id: '0oa7890123456ghijkl', type: 'OIDC' },
  { name: 'Google Workspace', id: '0oa8901234567hijklm', type: 'SAML_2_0' },
];

/**
 * Browser types for user agents
 */
const BROWSERS = ['CHROME', 'FIREFOX', 'SAFARI', 'EDGE'];
const OS_TYPES = ['Mac OS X', 'Windows 10', 'Windows 11', 'Linux'];
const DEVICE_TYPES = ['Computer', 'Mobile'];

/**
 * Okta admin privilege types for group.privilege events
 */
const OKTA_PRIVILEGE_TYPES = [
  'Super admin',
  'Group admin',
  'App admin',
  'Read-only admin',
  'Help desk admin',
  'Org admin',
  'API access management admin',
];

/**
 * Anomalous geo locations for rare region/IP detection scenarios
 */
const ANOMALOUS_LOCATIONS = [
  { country: 'North Korea', state: 'Pyongyang', city: 'Pyongyang', ip: '175.45.176.' },
  {
    country: 'Russia',
    state: 'Kamchatka Krai',
    city: 'Petropavlovsk-Kamchatsky',
    ip: '185.220.101.',
  },
  { country: 'China', state: 'Xinjiang', city: 'Urumqi', ip: '103.25.61.' },
  { country: 'Nigeria', state: 'Lagos', city: 'Lagos', ip: '41.58.100.' },
  { country: 'Brazil', state: 'Roraima', city: 'Boa Vista', ip: '177.54.32.' },
];

/**
 * Okta System Logs Integration
 */
export class OktaSystemIntegration extends BaseIntegration {
  readonly packageName = 'okta';
  readonly displayName = 'Okta System Logs';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'system',
      index: 'logs-okta.system-default',
    },
  ];

  /**
   * Generate all Okta system log documents
   */
  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    // Generate events for each employee
    for (const employee of org.employees) {
      // Session events (login/logout)
      documents.push(...this.generateSessionEvents(employee, org));

      // SSO events for employees with app access
      documents.push(...this.generateSsoEvents(employee, org));

      // MFA events
      documents.push(...this.generateMfaEvents(employee, org));

      // Policy evaluation events
      documents.push(...this.generatePolicyEvents(employee, org));

      // Group membership events (one-time setup)
      const employeeGroups = this.getEmployeeGroups(employee, org.oktaGroups);
      documents.push(...this.generateGroupMembershipEvents(employee, employeeGroups, org));
    }

    // Org-level PAD event types (not per-employee)
    documents.push(...this.generateUserLifecycleEvents(org));
    documents.push(...this.generateGroupPrivilegeEvents(org));
    documents.push(...this.generateGroupApplicationAssignmentEvents(org));
    documents.push(...this.generateGroupLifecycleEvents(org));

    // Anomalous behavior patterns for PAD detection
    documents.push(...this.generateAnomalousEvents(org));

    // Sort documents by timestamp
    documents.sort((a, b) => {
      const timestampA = (a as OktaSystemLogDocument)['@timestamp'];
      const timestampB = (b as OktaSystemLogDocument)['@timestamp'];
      return new Date(timestampA).getTime() - new Date(timestampB).getTime();
    });

    documentsMap.set(this.dataStreams[0].index, documents);

    return documentsMap;
  }

  /**
   * Generate session start/end events for an employee
   */
  private generateSessionEvents(employee: Employee, org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const sessionCount = faker.number.int({ min: 1, max: 3 });

    for (let i = 0; i < sessionCount; i++) {
      const sessionId = this.generateSessionId();
      const loginTime = this.getRandomTimestamp(48);
      const isFailure = faker.number.float() < 0.05; // 5% failure rate

      // Session start (login)
      events.push(
        this.createSessionEvent(
          employee,
          org,
          'user.session.start',
          'User login to Okta',
          loginTime,
          sessionId,
          isFailure ? 'FAILURE' : 'SUCCESS',
          isFailure ? 'INVALID_CREDENTIALS' : undefined,
        ),
      );

      // Session end (logout) - only for successful logins
      if (!isFailure && faker.number.float() < 0.7) {
        const logoutTime = new Date(
          new Date(loginTime).getTime() + faker.number.int({ min: 30, max: 480 }) * 60 * 1000,
        ).toISOString();
        events.push(
          this.createSessionEvent(
            employee,
            org,
            'user.session.end',
            'User logout from Okta',
            logoutTime,
            sessionId,
            'SUCCESS',
          ),
        );
      }
    }

    return events;
  }

  /**
   * Generate SSO events for an employee
   */
  private generateSsoEvents(employee: Employee, org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];

    // Determine which apps the employee would use
    const availableApps = this.getEmployeeApps(employee);
    const ssoCount = faker.number.int({ min: 1, max: Math.min(5, availableApps.length) });

    for (let i = 0; i < ssoCount; i++) {
      const app = faker.helpers.arrayElement(availableApps);
      const timestamp = this.getRandomTimestamp(48);

      events.push(this.createSsoEvent(employee, org, app, timestamp));
    }

    return events;
  }

  /**
   * Generate MFA events for an employee
   */
  private generateMfaEvents(employee: Employee, org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const mfaCount = faker.number.int({ min: 0, max: 2 });

    for (let i = 0; i < mfaCount; i++) {
      const timestamp = this.getRandomTimestamp(48);
      const isFailure = faker.number.float() < 0.03; // 3% failure rate

      events.push(
        this.createMfaEvent(
          employee,
          org,
          timestamp,
          isFailure ? 'FAILURE' : 'SUCCESS',
          isFailure ? 'INVALID_MFA_CODE' : undefined,
        ),
      );
    }

    return events;
  }

  /**
   * Generate policy evaluation events
   */
  private generatePolicyEvents(employee: Employee, org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const policyCount = faker.number.int({ min: 1, max: 2 });

    for (let i = 0; i < policyCount; i++) {
      const timestamp = this.getRandomTimestamp(48);
      events.push(this.createPolicyEvent(employee, org, timestamp));
    }

    return events;
  }

  /**
   * Generate group membership events (setup events)
   */
  private generateGroupMembershipEvents(
    employee: Employee,
    groups: OktaGroup[],
    org: Organization,
  ): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];

    // Generate one event per group, backdated to when employee was "added"
    for (const group of groups) {
      const timestamp = faker.date.past({ years: 1 }).toISOString();
      events.push(
        this.createGroupMembershipEvent(
          employee,
          group,
          org,
          timestamp,
          'group.user_membership.add',
          'Add user to group membership',
        ),
      );
    }

    // ~10% of employees get a removal event from a random group
    if (groups.length > 1 && faker.number.float() < 0.1) {
      const removedGroup = faker.helpers.arrayElement(groups);
      const timestamp = this.getRandomTimestamp(48);
      events.push(
        this.createGroupMembershipEvent(
          employee,
          removedGroup,
          org,
          timestamp,
          'group.user_membership.remove',
          'Remove user from group membership',
        ),
      );
    }

    return events;
  }

  /**
   * Generate user lifecycle events across the org
   */
  private generateUserLifecycleEvents(org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const adminEmployee = faker.helpers.arrayElement(org.employees);

    for (const employee of org.employees) {
      // Every employee had a create + activate (backdated)
      const createTime = faker.date.past({ years: 2 }).toISOString();
      events.push(
        this.createAdminActionEvent(
          adminEmployee,
          employee,
          null,
          org,
          createTime,
          'user.lifecycle.create',
          'Create Okta user',
        ),
      );
      const activateTime = new Date(
        new Date(createTime).getTime() + faker.number.int({ min: 1, max: 60 }) * 60000,
      ).toISOString();
      events.push(
        this.createAdminActionEvent(
          adminEmployee,
          employee,
          null,
          org,
          activateTime,
          'user.lifecycle.activate',
          'Activate Okta user',
        ),
      );

      // ~30% get a profile update
      if (faker.number.float() < 0.3) {
        const timestamp = this.getRandomTimestamp(48);
        events.push(
          this.createAdminActionEvent(
            adminEmployee,
            employee,
            null,
            org,
            timestamp,
            'user.lifecycle.update',
            'Update Okta user profile',
          ),
        );
      }

      // ~3% get deactivated (offboarding)
      if (faker.number.float() < 0.03) {
        const timestamp = this.getRandomTimestamp(48);
        events.push(
          this.createAdminActionEvent(
            adminEmployee,
            employee,
            null,
            org,
            timestamp,
            'user.lifecycle.deactivate',
            'Deactivate Okta user',
          ),
        );
      }

      // ~2% get suspended then unsuspended
      if (faker.number.float() < 0.02) {
        const suspendTime = this.getRandomTimestamp(48);
        events.push(
          this.createAdminActionEvent(
            adminEmployee,
            employee,
            null,
            org,
            suspendTime,
            'user.lifecycle.suspend',
            'Suspend Okta user',
          ),
        );
        const unsuspendTime = new Date(
          new Date(suspendTime).getTime() + faker.number.int({ min: 1, max: 24 }) * 3600000,
        ).toISOString();
        events.push(
          this.createAdminActionEvent(
            adminEmployee,
            employee,
            null,
            org,
            unsuspendTime,
            'user.lifecycle.unsuspend',
            'Unsuspend Okta user',
          ),
        );
      }
    }

    return events;
  }

  /**
   * Generate group privilege grant/revoke events
   */
  private generateGroupPrivilegeEvents(org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const adminEmployee = faker.helpers.arrayElement(org.employees);

    // ~5% of employees get privilege grants
    for (const employee of org.employees) {
      if (faker.number.float() < 0.05) {
        const privilege = faker.helpers.arrayElement(OKTA_PRIVILEGE_TYPES);
        const timestamp = this.getRandomTimestamp(48);
        events.push(
          this.createAdminActionEvent(
            adminEmployee,
            employee,
            null,
            org,
            timestamp,
            'group.privilege.grant',
            'Grant group admin privilege',
            { privilegeGranted: privilege },
          ),
        );

        // Occasional revoke (~30% of grants)
        if (faker.number.float() < 0.3) {
          const revokeTime = new Date(
            new Date(timestamp).getTime() + faker.number.int({ min: 1, max: 48 }) * 3600000,
          ).toISOString();
          events.push(
            this.createAdminActionEvent(
              adminEmployee,
              employee,
              null,
              org,
              revokeTime,
              'group.privilege.revoke',
              'Revoke group admin privilege',
              { privilegeRevoked: privilege },
            ),
          );
        }
      }
    }

    return events;
  }

  /**
   * Generate group application assignment events
   */
  private generateGroupApplicationAssignmentEvents(org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const adminEmployee = faker.helpers.arrayElement(org.employees);

    // For a few groups, assign them to applications
    const groups = org.oktaGroups.slice(0, Math.min(5, org.oktaGroups.length));
    for (const group of groups) {
      const app = faker.helpers.arrayElement(OKTA_APPLICATIONS);
      const timestamp = faker.date.past({ years: 1 }).toISOString();
      events.push(
        this.createGroupAppAssignmentEvent(
          adminEmployee,
          group,
          app,
          org,
          timestamp,
          'group.application_assignment.add',
          'Add application assignment to group',
        ),
      );

      // Occasional removal
      if (faker.number.float() < 0.2) {
        const removeTime = this.getRandomTimestamp(48);
        events.push(
          this.createGroupAppAssignmentEvent(
            adminEmployee,
            group,
            app,
            org,
            removeTime,
            'group.application_assignment.remove',
            'Remove application assignment from group',
          ),
        );
      }
    }

    return events;
  }

  /**
   * Generate group lifecycle create/delete events
   */
  private generateGroupLifecycleEvents(org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const adminEmployee = faker.helpers.arrayElement(org.employees);

    // Each existing group had a create event (backdated)
    for (const group of org.oktaGroups) {
      const timestamp = faker.date.past({ years: 2 }).toISOString();
      events.push(
        this.createGroupLifecycleEvent(
          adminEmployee,
          group,
          org,
          timestamp,
          'group.lifecycle.create',
          'Create Okta group',
        ),
      );
    }

    // Occasional group deletion (~10% of groups)
    for (const group of org.oktaGroups) {
      if (faker.number.float() < 0.1) {
        const timestamp = this.getRandomTimestamp(48);
        events.push(
          this.createGroupLifecycleEvent(
            adminEmployee,
            group,
            org,
            timestamp,
            'group.lifecycle.delete',
            'Delete Okta group',
          ),
        );
      }
    }

    return events;
  }

  /**
   * Create a session event document
   */
  private createSessionEvent(
    employee: Employee,
    org: Organization,
    eventType: 'user.session.start' | 'user.session.end',
    displayMessage: string,
    timestamp: string,
    sessionId: string,
    result: 'SUCCESS' | 'FAILURE',
    reason?: string,
  ): OktaSystemLogDocument {
    const clientInfo = this.generateClientInfo(employee);
    const transactionId = this.generateTransactionId();
    const uuid = faker.string.uuid();

    const rawEvent = {
      actor: {
        id: employee.oktaUserId,
        type: 'User',
        alternateId: employee.email,
        displayName: `${employee.firstName} ${employee.lastName}`,
        detailEntry: null,
      },
      eventType: eventType,
      displayMessage: displayMessage,
      outcome: {
        result,
        reason: reason || null,
      },
      severity: result === 'SUCCESS' ? 'INFO' : 'WARN',
      published: timestamp,
      client: {
        ipAddress: clientInfo.ip,
        device: clientInfo.device,
        userAgent: {
          browser: clientInfo.browser,
          os: clientInfo.os,
          rawUserAgent: clientInfo.rawUserAgent,
        },
        zone: 'null',
        geographicalContext: {
          city: clientInfo.geo.city_name,
          country: clientInfo.geo.country_name,
          state: clientInfo.geo.region_name,
          geolocation: clientInfo.geo.location,
        },
      },
      authenticationContext: {
        authenticationStep: 0,
        externalSessionId: sessionId,
      },
      debugContext: {
        debugData: {
          requestId: transactionId,
          requestUri: eventType === 'user.session.start' ? '/api/v1/authn' : '/login/signout',
          url: eventType === 'user.session.start' ? '/api/v1/authn?' : '/login/signout',
          deviceFingerprint: faker.string.alphanumeric(32),
          threatSuspected: 'false',
        },
      },
      request: {
        ipChain: [
          {
            ip: clientInfo.ip,
            version: 'V4',
            geographicalContext: {
              city: clientInfo.geo.city_name,
              country: clientInfo.geo.country_name,
              state: clientInfo.geo.region_name,
              geolocation: clientInfo.geo.location,
            },
          },
        ],
      },
      transaction: {
        id: transactionId,
        type: 'WEB',
      },
      uuid,
      version: '0',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      agent: this.buildCentralAgent(org),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Create an SSO event document
   */
  private createSsoEvent(
    employee: Employee,
    org: Organization,
    app: { name: string; id: string; type: string },
    timestamp: string,
  ): OktaSystemLogDocument {
    const clientInfo = this.generateClientInfo(employee);
    const transactionId = this.generateTransactionId();
    const uuid = faker.string.uuid();
    const sessionId = this.generateSessionId();

    const rawEvent = {
      actor: {
        id: employee.oktaUserId,
        type: 'User',
        alternateId: employee.email,
        displayName: `${employee.firstName} ${employee.lastName}`,
        detailEntry: null,
      },
      eventType: 'user.authentication.sso',
      displayMessage: 'User single sign on to app',
      outcome: {
        result: 'SUCCESS',
      },
      severity: 'INFO',
      published: timestamp,
      client: {
        ipAddress: clientInfo.ip,
        device: clientInfo.device,
        userAgent: {
          browser: clientInfo.browser,
          os: clientInfo.os,
          rawUserAgent: clientInfo.rawUserAgent,
        },
        zone: 'null',
      },
      authenticationContext: {
        authenticationStep: 0,
        externalSessionId: sessionId,
        credentialType: app.type,
        credentialProvider: 'OKTA_CREDENTIAL_PROVIDER',
      },
      debugContext: {
        debugData: {
          requestId: transactionId,
          requestUri: `/app/${app.id}/sso/saml`,
          url: `/app/${app.id}/sso/saml`,
          threatSuspected: 'false',
        },
      },
      transaction: {
        id: transactionId,
        type: 'WEB',
      },
      uuid,
      target: [
        {
          id: app.id,
          type: 'AppInstance',
          alternateId: app.name,
          displayName: app.name,
        },
      ],
      version: '0',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      agent: this.buildCentralAgent(org),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Create an MFA event document
   */
  private createMfaEvent(
    employee: Employee,
    org: Organization,
    timestamp: string,
    result: 'SUCCESS' | 'FAILURE',
    reason?: string,
  ): OktaSystemLogDocument {
    const clientInfo = this.generateClientInfo(employee);
    const transactionId = this.generateTransactionId();
    const uuid = faker.string.uuid();
    const sessionId = this.generateSessionId();

    const rawEvent = {
      actor: {
        id: employee.oktaUserId,
        type: 'User',
        alternateId: employee.email,
        displayName: `${employee.firstName} ${employee.lastName}`,
        detailEntry: null,
      },
      eventType: 'user.authentication.auth_via_mfa',
      displayMessage: 'Authentication of user via MFA',
      outcome: {
        result,
        reason: reason || null,
      },
      severity: result === 'SUCCESS' ? 'INFO' : 'WARN',
      published: timestamp,
      client: {
        ipAddress: clientInfo.ip,
        device: clientInfo.device,
        userAgent: {
          browser: clientInfo.browser,
          os: clientInfo.os,
          rawUserAgent: clientInfo.rawUserAgent,
        },
        zone: 'null',
      },
      authenticationContext: {
        authenticationStep: 1,
        externalSessionId: sessionId,
        credentialType: 'OTP',
        credentialProvider: 'OKTA_CREDENTIAL_PROVIDER',
      },
      debugContext: {
        debugData: {
          requestId: transactionId,
          requestUri: '/api/v1/authn/factors/verify',
          url: '/api/v1/authn/factors/verify',
          threatSuspected: 'false',
        },
      },
      transaction: {
        id: transactionId,
        type: 'WEB',
      },
      uuid,
      version: '0',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      agent: this.buildCentralAgent(org),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Create a policy evaluation event document
   */
  private createPolicyEvent(
    employee: Employee,
    org: Organization,
    timestamp: string,
  ): OktaSystemLogDocument {
    const clientInfo = this.generateClientInfo(employee);
    const transactionId = this.generateTransactionId();
    const uuid = faker.string.uuid();
    const sessionId = this.generateSessionId();
    const policyId = `pol${faker.string.alphanumeric(16)}`;
    const ruleId = `rul${faker.string.alphanumeric(16)}`;

    const rawEvent = {
      actor: {
        id: employee.oktaUserId,
        type: 'User',
        alternateId: employee.email,
        displayName: `${employee.firstName} ${employee.lastName}`,
        detailEntry: null,
      },
      eventType: 'policy.evaluate_sign_on',
      displayMessage: 'Evaluation of sign-on policy',
      outcome: {
        result: 'ALLOW',
      },
      severity: 'INFO',
      published: timestamp,
      client: {
        ipAddress: clientInfo.ip,
        device: clientInfo.device,
        userAgent: {
          browser: clientInfo.browser,
          os: clientInfo.os,
          rawUserAgent: clientInfo.rawUserAgent,
        },
        zone: 'null',
      },
      authenticationContext: {
        authenticationStep: 0,
        externalSessionId: sessionId,
      },
      debugContext: {
        debugData: {
          requestId: transactionId,
          requestUri: '/api/v1/authn',
          url: '/api/v1/authn?',
          threatSuspected: 'false',
        },
      },
      transaction: {
        id: transactionId,
        type: 'WEB',
      },
      uuid,
      target: [
        {
          id: policyId,
          type: 'PolicyEntity',
          displayName: 'Default Sign On Policy',
        },
        {
          id: ruleId,
          type: 'PolicyRule',
          displayName: 'Default Sign On Rule',
        },
      ],
      version: '0',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      agent: this.buildCentralAgent(org),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Create a group membership event document
   */
  private createGroupMembershipEvent(
    employee: Employee,
    group: OktaGroup,
    org: Organization,
    timestamp: string,
    eventType: string = 'group.user_membership.add',
    displayMessage: string = 'Add user to group membership',
  ): OktaSystemLogDocument {
    const transactionId = this.generateTransactionId();
    const uuid = faker.string.uuid();
    const adminId = `00u${faker.string.alphanumeric(17)}`;

    const rawEvent = {
      actor: {
        id: adminId,
        type: 'SystemPrincipal',
        alternateId: 'system@okta.com',
        displayName: 'Okta System',
        detailEntry: null,
      },
      eventType,
      displayMessage,
      outcome: {
        result: 'SUCCESS',
      },
      severity: 'INFO',
      published: timestamp,
      client: {
        ipAddress: '127.0.0.1',
        device: 'Unknown',
        userAgent: {
          browser: 'UNKNOWN',
          os: 'Unknown',
          rawUserAgent: 'Okta System',
        },
        zone: 'null',
      },
      authenticationContext: {
        authenticationStep: 0,
        externalSessionId: 'unknown',
      },
      transaction: {
        id: transactionId,
        type: 'JOB',
      },
      uuid,
      target: [
        {
          id: employee.oktaUserId,
          type: 'User',
          alternateId: employee.email,
          displayName: `${employee.firstName} ${employee.lastName}`,
        },
        {
          id: group.id,
          type: 'UserGroup',
          alternateId: group.name,
          displayName: group.name,
        },
      ],
      version: '0',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      agent: this.buildCentralAgent(org),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Create an admin action event (user lifecycle, group privilege, etc.)
   */
  private createAdminActionEvent(
    actor: Employee,
    targetEmployee: Employee,
    targetGroup: OktaGroup | null,
    org: Organization,
    timestamp: string,
    eventType: string,
    displayMessage: string,
    debugExtras?: Record<string, string>,
    clientInfoOverride?: ReturnType<OktaSystemIntegration['generateClientInfo']>,
  ): OktaSystemLogDocument {
    const clientInfo = clientInfoOverride || this.generateClientInfo(actor);
    const transactionId = this.generateTransactionId();
    const uuid = faker.string.uuid();

    const target: Array<{ id: string; type: string; alternateId: string; displayName: string }> = [
      {
        id: targetEmployee.oktaUserId,
        type: 'User',
        alternateId: targetEmployee.email,
        displayName: `${targetEmployee.firstName} ${targetEmployee.lastName}`,
      },
    ];

    if (targetGroup) {
      target.push({
        id: targetGroup.id,
        type: 'UserGroup',
        alternateId: targetGroup.name,
        displayName: targetGroup.name,
      });
    }

    const rawEvent = {
      actor: {
        id: actor.oktaUserId,
        type: 'User',
        alternateId: actor.email,
        displayName: `${actor.firstName} ${actor.lastName}`,
        detailEntry: null,
      },
      eventType,
      displayMessage,
      outcome: {
        result: 'SUCCESS',
      },
      severity: 'INFO',
      published: timestamp,
      client: {
        ipAddress: clientInfo.ip,
        device: clientInfo.device,
        userAgent: {
          browser: clientInfo.browser,
          os: clientInfo.os,
          rawUserAgent: clientInfo.rawUserAgent,
        },
        zone: 'null',
        geographicalContext: {
          city: clientInfo.geo.city_name,
          country: clientInfo.geo.country_name,
          state: clientInfo.geo.region_name,
          geolocation: clientInfo.geo.location,
        },
      },
      authenticationContext: {
        authenticationStep: 0,
        externalSessionId: this.generateSessionId(),
      },
      debugContext: {
        debugData: {
          requestId: transactionId,
          requestUri: '/api/v1/users',
          url: '/api/v1/users',
          threatSuspected: 'false',
          ...debugExtras,
        },
      },
      transaction: {
        id: transactionId,
        type: 'WEB',
      },
      uuid,
      target,
      version: '0',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      agent: this.buildCentralAgent(org),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Create a group application assignment event
   */
  private createGroupAppAssignmentEvent(
    actor: Employee,
    group: OktaGroup,
    app: { name: string; id: string; type: string },
    org: Organization,
    timestamp: string,
    eventType: string,
    displayMessage: string,
  ): OktaSystemLogDocument {
    const clientInfo = this.generateClientInfo(actor);
    const transactionId = this.generateTransactionId();
    const uuid = faker.string.uuid();

    const rawEvent = {
      actor: {
        id: actor.oktaUserId,
        type: 'User',
        alternateId: actor.email,
        displayName: `${actor.firstName} ${actor.lastName}`,
        detailEntry: null,
      },
      eventType,
      displayMessage,
      outcome: {
        result: 'SUCCESS',
      },
      severity: 'INFO',
      published: timestamp,
      client: {
        ipAddress: clientInfo.ip,
        device: clientInfo.device,
        userAgent: {
          browser: clientInfo.browser,
          os: clientInfo.os,
          rawUserAgent: clientInfo.rawUserAgent,
        },
        zone: 'null',
        geographicalContext: {
          city: clientInfo.geo.city_name,
          country: clientInfo.geo.country_name,
          state: clientInfo.geo.region_name,
          geolocation: clientInfo.geo.location,
        },
      },
      authenticationContext: {
        authenticationStep: 0,
        externalSessionId: this.generateSessionId(),
      },
      debugContext: {
        debugData: {
          requestId: transactionId,
          requestUri: '/api/v1/apps',
          url: '/api/v1/apps',
          threatSuspected: 'false',
        },
      },
      transaction: {
        id: transactionId,
        type: 'WEB',
      },
      uuid,
      target: [
        {
          id: group.id,
          type: 'UserGroup',
          alternateId: group.name,
          displayName: group.name,
        },
        {
          id: app.id,
          type: 'AppInstance',
          alternateId: app.name,
          displayName: app.name,
        },
      ],
      version: '0',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      agent: this.buildCentralAgent(org),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Create a group lifecycle event (create/delete)
   */
  private createGroupLifecycleEvent(
    actor: Employee,
    group: OktaGroup,
    org: Organization,
    timestamp: string,
    eventType: string,
    displayMessage: string,
  ): OktaSystemLogDocument {
    const clientInfo = this.generateClientInfo(actor);
    const transactionId = this.generateTransactionId();
    const uuid = faker.string.uuid();

    const rawEvent = {
      actor: {
        id: actor.oktaUserId,
        type: 'User',
        alternateId: actor.email,
        displayName: `${actor.firstName} ${actor.lastName}`,
        detailEntry: null,
      },
      eventType,
      displayMessage,
      outcome: {
        result: 'SUCCESS',
      },
      severity: 'INFO',
      published: timestamp,
      client: {
        ipAddress: clientInfo.ip,
        device: clientInfo.device,
        userAgent: {
          browser: clientInfo.browser,
          os: clientInfo.os,
          rawUserAgent: clientInfo.rawUserAgent,
        },
        zone: 'null',
        geographicalContext: {
          city: clientInfo.geo.city_name,
          country: clientInfo.geo.country_name,
          state: clientInfo.geo.region_name,
          geolocation: clientInfo.geo.location,
        },
      },
      authenticationContext: {
        authenticationStep: 0,
        externalSessionId: this.generateSessionId(),
      },
      debugContext: {
        debugData: {
          requestId: transactionId,
          requestUri: '/api/v1/groups',
          url: '/api/v1/groups',
          threatSuspected: 'false',
        },
      },
      transaction: {
        id: transactionId,
        type: 'WEB',
      },
      uuid,
      target: [
        {
          id: group.id,
          type: 'UserGroup',
          alternateId: group.name,
          displayName: group.name,
        },
      ],
      version: '0',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      agent: this.buildCentralAgent(org),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
    } as unknown as OktaSystemLogDocument;
  }

  // ==========================================
  // Anomalous behavior generation for PAD
  // ==========================================

  /**
   * Generate anomalous events designed to trigger PAD ML detections.
   * Selects ~3% of employees as "rogue actors" and generates concentrated
   * bursts of suspicious activity.
   */
  private generateAnomalousEvents(org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const rogueCount = Math.max(1, Math.floor(org.employees.length * 0.03));
    const rogueEmployees = faker.helpers.arrayElements(org.employees, rogueCount);

    console.log(
      `  Generating PAD anomalous Okta patterns for ${rogueEmployees.length} rogue actor(s)...`,
    );

    for (const rogue of rogueEmployees) {
      const burstEvents = this.generateRogueAdminBurst(rogue, org);
      const sessionEvents = this.generateMultiCountrySessions(rogue, org);
      const rareEvents = this.generateRareAccessEvents(rogue, org);

      events.push(...burstEvents, ...sessionEvents, ...rareEvents);

      console.log(
        `    - ${rogue.firstName} ${rogue.lastName} (${rogue.email}): ` +
          `${burstEvents.length} admin burst events, ` +
          `${sessionEvents.length} multi-country sessions, ` +
          `${rareEvents.length} rare IP/region events`,
      );
    }

    console.log(`  Total PAD anomalous events: ${events.length}`);

    return events;
  }

  /**
   * Scenario A: Rogue admin burst — triggers all 5 PAD spike ML jobs.
   * Generates a concentrated burst of admin actions within a 1-2 hour window.
   */
  private generateRogueAdminBurst(rogue: Employee, org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const burstStart = new Date(Date.now() - faker.number.int({ min: 1, max: 24 }) * 3600000);
    const burstDurationMs = faker.number.int({ min: 30, max: 120 }) * 60000;

    const randomBurstTime = (): string => {
      return new Date(
        burstStart.getTime() + faker.number.int({ min: 0, max: burstDurationMs }),
      ).toISOString();
    };

    const targetEmployees = faker.helpers.arrayElements(
      org.employees.filter((e) => e.oktaUserId !== rogue.oktaUserId),
      Math.min(20, org.employees.length - 1),
    );

    // 15-30 group membership add/remove events
    const membershipCount = faker.number.int({ min: 15, max: 30 });
    for (let i = 0; i < membershipCount; i++) {
      const target = faker.helpers.arrayElement(targetEmployees);
      const group = faker.helpers.arrayElement(org.oktaGroups);
      const isAdd = faker.number.float() < 0.6;
      events.push(
        this.createGroupMembershipEvent(
          target,
          group,
          org,
          randomBurstTime(),
          isAdd ? 'group.user_membership.add' : 'group.user_membership.remove',
          isAdd ? 'Add user to group membership' : 'Remove user from group membership',
        ),
      );
      // Override actor to be the rogue admin (the default uses SystemPrincipal)
      // Re-create with createAdminActionEvent for proper actor attribution
    }
    // Replace the membership events with properly attributed ones
    events.length = events.length - membershipCount;
    for (let i = 0; i < membershipCount; i++) {
      const target = faker.helpers.arrayElement(targetEmployees);
      const group = faker.helpers.arrayElement(org.oktaGroups);
      const isAdd = faker.number.float() < 0.6;
      events.push(
        this.createAdminActionEvent(
          rogue,
          target,
          group,
          org,
          randomBurstTime(),
          isAdd ? 'group.user_membership.add' : 'group.user_membership.remove',
          isAdd ? 'Add user to group membership' : 'Remove user from group membership',
        ),
      );
    }

    // 10-20 user lifecycle events
    const lifecycleCount = faker.number.int({ min: 10, max: 20 });
    const lifecycleTypes = [
      { type: 'user.lifecycle.activate', msg: 'Activate Okta user' },
      { type: 'user.lifecycle.deactivate', msg: 'Deactivate Okta user' },
      { type: 'user.lifecycle.suspend', msg: 'Suspend Okta user' },
      { type: 'user.lifecycle.update', msg: 'Update Okta user profile' },
      { type: 'user.lifecycle.unsuspend', msg: 'Unsuspend Okta user' },
    ];
    for (let i = 0; i < lifecycleCount; i++) {
      const target = faker.helpers.arrayElement(targetEmployees);
      const action = faker.helpers.arrayElement(lifecycleTypes);
      events.push(
        this.createAdminActionEvent(
          rogue,
          target,
          null,
          org,
          randomBurstTime(),
          action.type,
          action.msg,
        ),
      );
    }

    // 5-10 group privilege grant/revoke events
    const privilegeCount = faker.number.int({ min: 5, max: 10 });
    for (let i = 0; i < privilegeCount; i++) {
      const target = faker.helpers.arrayElement(targetEmployees);
      const privilege = faker.helpers.arrayElement(OKTA_PRIVILEGE_TYPES);
      const isGrant = faker.number.float() < 0.7;
      events.push(
        this.createAdminActionEvent(
          rogue,
          target,
          null,
          org,
          randomBurstTime(),
          isGrant ? 'group.privilege.grant' : 'group.privilege.revoke',
          isGrant ? 'Grant group admin privilege' : 'Revoke group admin privilege',
          isGrant ? { privilegeGranted: privilege } : { privilegeRevoked: privilege },
        ),
      );
    }

    // 5-10 group application assignment events
    const appAssignCount = faker.number.int({ min: 5, max: 10 });
    for (let i = 0; i < appAssignCount; i++) {
      const group = faker.helpers.arrayElement(org.oktaGroups);
      const app = faker.helpers.arrayElement(OKTA_APPLICATIONS);
      const isAdd = faker.number.float() < 0.6;
      events.push(
        this.createGroupAppAssignmentEvent(
          rogue,
          group,
          app,
          org,
          randomBurstTime(),
          isAdd ? 'group.application_assignment.add' : 'group.application_assignment.remove',
          isAdd
            ? 'Add application assignment to group'
            : 'Remove application assignment from group',
        ),
      );
    }

    // 3-5 group lifecycle create/delete events
    const groupLifecycleCount = faker.number.int({ min: 3, max: 5 });
    for (let i = 0; i < groupLifecycleCount; i++) {
      const fakeGroup: OktaGroup = {
        id: `00g${faker.string.alphanumeric(17)}`,
        name: `${faker.word.adjective()}-${faker.word.noun()}-group`,
        description: faker.company.catchPhrase(),
        type: 'access',
      };
      const isCreate = faker.number.float() < 0.6;
      events.push(
        this.createGroupLifecycleEvent(
          rogue,
          fakeGroup,
          org,
          randomBurstTime(),
          isCreate ? 'group.lifecycle.create' : 'group.lifecycle.delete',
          isCreate ? 'Create Okta group' : 'Delete Okta group',
        ),
      );
    }

    return events;
  }

  /**
   * Scenario B: Concurrent multi-country sessions — triggers the Okta session
   * transform and pad_okta_high_sum_concurrent_sessions_by_user ML job.
   * Generates session.start events from 3-4 different countries within ~30 minutes
   * WITHOUT matching session.end events.
   */
  private generateMultiCountrySessions(
    rogue: Employee,
    org: Organization,
  ): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const baseTime = new Date(Date.now() - faker.number.int({ min: 1, max: 12 }) * 3600000);

    const foreignLocations = faker.helpers.arrayElements(
      ANOMALOUS_LOCATIONS,
      faker.number.int({ min: 3, max: 4 }),
    );

    for (const location of foreignLocations) {
      const sessionId = this.generateSessionId();
      const timestamp = new Date(
        baseTime.getTime() + faker.number.int({ min: 0, max: 30 }) * 60000,
      ).toISOString();
      const ip = location.ip + faker.number.int({ min: 1, max: 254 });

      const clientInfo = {
        ip,
        device: 'Computer',
        browser: 'CHROME',
        os: 'Linux',
        rawUserAgent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        geo: {
          city_name: location.city,
          country_name: location.country,
          region_name: location.state,
          location: { lat: faker.location.latitude(), lon: faker.location.longitude() },
        },
      };

      // Session start only — no end event so transform flags it as active
      events.push(
        this.createSessionEventWithClientInfo(
          rogue,
          org,
          'user.session.start',
          'User login to Okta',
          timestamp,
          sessionId,
          'SUCCESS',
          undefined,
          clientInfo,
        ),
      );
    }

    return events;
  }

  /**
   * Scenario C: Rare source IP and region — triggers pad_okta_rare_source_ip_by_user
   * and pad_okta_rare_region_name_by_user ML jobs.
   * Generates admin action events from unusual geographic locations.
   */
  private generateRareAccessEvents(rogue: Employee, org: Organization): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];
    const location = faker.helpers.arrayElement(ANOMALOUS_LOCATIONS);
    const ip = location.ip + faker.number.int({ min: 1, max: 254 });

    const rareClientInfo = {
      ip,
      device: 'Computer',
      browser: 'FIREFOX',
      os: 'Linux',
      rawUserAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      geo: {
        city_name: location.city,
        country_name: location.country,
        region_name: location.state,
        location: { lat: faker.location.latitude(), lon: faker.location.longitude() },
      },
    };

    // Generate admin actions from the rare location
    const targetEmployees = faker.helpers.arrayElements(
      org.employees.filter((e) => e.oktaUserId !== rogue.oktaUserId),
      Math.min(5, org.employees.length - 1),
    );

    const eventTypes = [
      { type: 'group.user_membership.add', msg: 'Add user to group membership' },
      { type: 'user.lifecycle.update', msg: 'Update Okta user profile' },
      { type: 'group.privilege.grant', msg: 'Grant group admin privilege' },
      { type: 'user.lifecycle.deactivate', msg: 'Deactivate Okta user' },
    ];

    for (const target of targetEmployees) {
      const action = faker.helpers.arrayElement(eventTypes);
      const timestamp = this.getRandomTimestamp(24);
      const debugExtras =
        action.type === 'group.privilege.grant'
          ? { privilegeGranted: faker.helpers.arrayElement(OKTA_PRIVILEGE_TYPES) }
          : undefined;
      events.push(
        this.createAdminActionEvent(
          rogue,
          target,
          action.type.startsWith('group.user_membership')
            ? faker.helpers.arrayElement(org.oktaGroups)
            : null,
          org,
          timestamp,
          action.type,
          action.msg,
          debugExtras,
          rareClientInfo,
        ),
      );
    }

    return events;
  }

  /**
   * Create a session event with custom client info (used for anomalous multi-country sessions)
   */
  private createSessionEventWithClientInfo(
    employee: Employee,
    org: Organization,
    eventType: 'user.session.start' | 'user.session.end',
    displayMessage: string,
    timestamp: string,
    sessionId: string,
    result: 'SUCCESS' | 'FAILURE',
    reason?: string,
    clientInfo?: ReturnType<OktaSystemIntegration['generateClientInfo']>,
  ): OktaSystemLogDocument {
    const client = clientInfo || this.generateClientInfo(employee);
    const transactionId = this.generateTransactionId();
    const uuid = faker.string.uuid();

    const rawEvent = {
      actor: {
        id: employee.oktaUserId,
        type: 'User',
        alternateId: employee.email,
        displayName: `${employee.firstName} ${employee.lastName}`,
        detailEntry: null,
      },
      eventType,
      displayMessage,
      outcome: {
        result,
        reason: reason || null,
      },
      severity: result === 'SUCCESS' ? 'INFO' : 'WARN',
      published: timestamp,
      client: {
        ipAddress: client.ip,
        device: client.device,
        userAgent: {
          browser: client.browser,
          os: client.os,
          rawUserAgent: client.rawUserAgent,
        },
        zone: 'null',
        geographicalContext: {
          city: client.geo.city_name,
          country: client.geo.country_name,
          state: client.geo.region_name,
          geolocation: client.geo.location,
        },
      },
      authenticationContext: {
        authenticationStep: 0,
        externalSessionId: sessionId,
      },
      debugContext: {
        debugData: {
          requestId: transactionId,
          requestUri: eventType === 'user.session.start' ? '/api/v1/authn' : '/login/signout',
          url: eventType === 'user.session.start' ? '/api/v1/authn?' : '/login/signout',
          deviceFingerprint: faker.string.alphanumeric(32),
          threatSuspected: 'false',
        },
      },
      request: {
        ipChain: [
          {
            ip: client.ip,
            version: 'V4',
            geographicalContext: {
              city: client.geo.city_name,
              country: client.geo.country_name,
              state: client.geo.region_name,
              geolocation: client.geo.location,
            },
          },
        ],
      },
      transaction: {
        id: transactionId,
        type: 'WEB',
      },
      uuid,
      version: '0',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      agent: this.buildCentralAgent(org),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Generate client information for an employee
   */
  private generateClientInfo(employee: Employee): {
    ip: string;
    device: string;
    browser: string;
    os: string;
    rawUserAgent: string;
    geo: {
      city_name: string;
      country_name: string;
      region_name: string;
      location: { lat: number; lon: number };
    };
  } {
    const browser = faker.helpers.arrayElement(BROWSERS);
    const os = faker.helpers.arrayElement(OS_TYPES);
    const device = faker.helpers.arrayElement(DEVICE_TYPES);
    const ip = faker.internet.ipv4();

    const browserVersions: Record<string, string> = {
      CHROME: '120.0.0.0',
      FIREFOX: '121.0',
      SAFARI: '17.2',
      EDGE: '120.0.0.0',
    };

    const rawUserAgent = this.generateUserAgentString(browser, os, browserVersions[browser]);

    return {
      ip,
      device,
      browser,
      os,
      rawUserAgent,
      geo: {
        city_name: employee.city,
        country_name: employee.country,
        region_name: employee.city,
        location: {
          lat: faker.location.latitude(),
          lon: faker.location.longitude(),
        },
      },
    };
  }

  /**
   * Generate a realistic user agent string
   */
  private generateUserAgentString(browser: string, os: string, version: string): string {
    const osVersions: Record<string, string> = {
      'Mac OS X': '10_15_7',
      'Windows 10': 'Windows NT 10.0; Win64; x64',
      'Windows 11': 'Windows NT 10.0; Win64; x64',
      Linux: 'X11; Linux x86_64',
    };

    const osString = osVersions[os] || os;

    switch (browser) {
      case 'CHROME':
        return `Mozilla/5.0 (${osString}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
      case 'FIREFOX':
        return `Mozilla/5.0 (${os === 'Mac OS X' ? 'Macintosh; Intel Mac OS X 10.15' : osString}; rv:${version}) Gecko/20100101 Firefox/${version}`;
      case 'SAFARI':
        return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Safari/605.1.15`;
      case 'EDGE':
        return `Mozilla/5.0 (${osString}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36 Edg/${version}`;
      default:
        return `Mozilla/5.0 (${osString})`;
    }
  }

  /**
   * Generate a session ID
   */
  private generateSessionId(): string {
    return faker.string.alphanumeric(24);
  }

  /**
   * Generate a transaction ID
   */
  private generateTransactionId(): string {
    return `${faker.string.alphanumeric(20)}@${faker.string.alphanumeric(6)}`;
  }

  /**
   * Get apps available to an employee based on department
   */
  private getEmployeeApps(employee: Employee): typeof OKTA_APPLICATIONS {
    const baseApps = OKTA_APPLICATIONS.filter((app) =>
      ['Slack', 'Zoom', 'Google Workspace'].includes(app.name),
    );

    // Engineering gets GitHub and AWS
    if (employee.department === 'Product & Engineering') {
      return [
        ...baseApps,
        ...OKTA_APPLICATIONS.filter((app) =>
          ['AWS Console', 'GitHub Enterprise', 'Jira', 'Confluence'].includes(app.name),
        ),
      ];
    }

    // Sales & Marketing gets Salesforce
    if (employee.department === 'Sales & Marketing') {
      return [...baseApps, ...OKTA_APPLICATIONS.filter((app) => ['Salesforce'].includes(app.name))];
    }

    // Customer Success gets Jira
    if (employee.department === 'Customer Success') {
      return [...baseApps, ...OKTA_APPLICATIONS.filter((app) => ['Jira'].includes(app.name))];
    }

    // Executives get everything
    if (employee.department === 'Executive') {
      return OKTA_APPLICATIONS;
    }

    return baseApps;
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
}
