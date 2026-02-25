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
    _correlationMap: CorrelationMap
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
          isFailure ? 'INVALID_CREDENTIALS' : undefined
        )
      );

      // Session end (logout) - only for successful logins
      if (!isFailure && faker.number.float() < 0.7) {
        const logoutTime = new Date(
          new Date(loginTime).getTime() + faker.number.int({ min: 30, max: 480 }) * 60 * 1000
        ).toISOString();
        events.push(
          this.createSessionEvent(
            employee,
            org,
            'user.session.end',
            'User logout from Okta',
            logoutTime,
            sessionId,
            'SUCCESS'
          )
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
          isFailure ? 'INVALID_MFA_CODE' : undefined
        )
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
    org: Organization
  ): OktaSystemLogDocument[] {
    const events: OktaSystemLogDocument[] = [];

    // Generate one event per group, backdated to when employee was "added"
    for (const group of groups) {
      const timestamp = faker.date.past({ years: 1 }).toISOString();
      events.push(this.createGroupMembershipEvent(employee, group, org, timestamp));
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
    reason?: string
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
      host: {
        name: `${org.domain.replace('.com', '')}.okta.com`,
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
      tags: ['session', 'okta-system', 'forwarded', 'preserve_original_event'],
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Create an SSO event document
   */
  private createSsoEvent(
    employee: Employee,
    org: Organization,
    app: { name: string; id: string; type: string },
    timestamp: string
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
      host: {
        name: `${org.domain.replace('.com', '')}.okta.com`,
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
      tags: ['authentication', 'okta-system', 'forwarded', 'preserve_original_event'],
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
    reason?: string
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
      host: {
        name: `${org.domain.replace('.com', '')}.okta.com`,
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
      tags: ['authentication', 'mfa', 'okta-system', 'forwarded', 'preserve_original_event'],
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Create a policy evaluation event document
   */
  private createPolicyEvent(
    employee: Employee,
    org: Organization,
    timestamp: string
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
      host: {
        name: `${org.domain.replace('.com', '')}.okta.com`,
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
      tags: ['policy', 'okta-system', 'forwarded', 'preserve_original_event'],
    } as unknown as OktaSystemLogDocument;
  }

  /**
   * Create a group membership event document
   */
  private createGroupMembershipEvent(
    employee: Employee,
    group: OktaGroup,
    org: Organization,
    timestamp: string
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
      eventType: 'group.user_membership.add',
      displayMessage: 'Add user to group membership',
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
      host: {
        name: `${org.domain.replace('.com', '')}.okta.com`,
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'okta.system',
      },
      tags: ['iam', 'group', 'okta-system', 'forwarded', 'preserve_original_event'],
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
      ['Slack', 'Zoom', 'Google Workspace'].includes(app.name)
    );

    // Engineering gets GitHub and AWS
    if (employee.department === 'Product & Engineering') {
      return [
        ...baseApps,
        ...OKTA_APPLICATIONS.filter((app) =>
          ['AWS Console', 'GitHub Enterprise', 'Jira', 'Confluence'].includes(app.name)
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
