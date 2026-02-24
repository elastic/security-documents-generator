/**
 * Active Directory Entity Analytics Integration
 * Generates user and device documents for entityanalytics_ad data stream
 * Based on beats x-pack/filebeat/input/entityanalytics/provider/activedirectory/
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, Device, ActiveDirectoryDocument, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const IDENTITY_SOURCE = 'ad-saas-organization';

/** OU paths for different departments */
const DEPARTMENT_OUS: Record<string, string> = {
  'Product & Engineering': 'OU=Engineering,OU=Users',
  'Sales & Marketing': 'OU=Sales,OU=Users',
  'Customer Success': 'OU=Support,OU=Users',
  Operations: 'OU=Operations,OU=Users',
  Executive: 'OU=Executives,OU=Users',
};

/** Windows OS versions for AD computers */
const WINDOWS_OS_VERSIONS = [
  { os: 'Windows 11 Enterprise', version: '10.0 (22631)' },
  { os: 'Windows 11 Enterprise', version: '10.0 (22621)' },
  { os: 'Windows 10 Enterprise', version: '10.0 (19045)' },
  { os: 'Windows 10 Enterprise', version: '10.0 (19044)' },
  { os: 'Windows Server 2022 Standard', version: '10.0 (20348)' },
  { os: 'Windows Server 2019 Standard', version: '10.0 (17763)' },
];

/**
 * Active Directory Entity Analytics Integration
 * Generates user and device (computer) documents from on-premises AD
 */
export class ActiveDirectoryIntegration extends BaseIntegration {
  readonly packageName = 'entityanalytics_ad';
  readonly displayName = 'Active Directory Entity Analytics';
  readonly prerelease = true;

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'entity',
      index: 'logs-entityanalytics_ad.entity-default',
    },
  ];

  /**
   * Generate all Active Directory documents
   */
  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];
    const timestamp = this.getTimestamp();

    const baseDn = `DC=${org.domain.replace('.com', '')},DC=com`;

    // Generate user documents for all employees
    for (const employee of org.employees) {
      const userDn = this.buildUserDn(employee, baseDn);
      correlationMap.adDnToEmployee.set(userDn, employee);

      const userDoc = this.createUserDocument(employee, org, timestamp, baseDn, userDn);
      documents.push(userDoc);
    }

    // Generate computer documents for Windows devices
    for (const employee of org.employees) {
      const windowsDevices = employee.devices.filter(
        (d) => d.type === 'laptop' && d.platform === 'windows'
      );
      for (const device of windowsDevices) {
        const computerDoc = this.createDeviceDocument(device, employee, org, timestamp, baseDn);
        documents.push(computerDoc);
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  /**
   * Build Distinguished Name for a user
   */
  private buildUserDn(employee: Employee, baseDn: string): string {
    const ou = DEPARTMENT_OUS[employee.department] || 'OU=Users';
    return `CN=${employee.firstName} ${employee.lastName},${ou},${baseDn}`;
  }

  /**
   * Create an Active Directory user document
   * Matches the Entry struct from activedirectory.go with typical LDAP attributes
   */
  private createUserDocument(
    employee: Employee,
    org: Organization,
    timestamp: string,
    baseDn: string,
    userDn: string
  ): ActiveDirectoryDocument {
    const whenCreated = faker.date.past({ years: 2 }).toISOString();
    const whenChanged = faker.date.recent({ days: 30 }).toISOString();
    // Windows NT time: 100ns intervals since 1601-01-01
    // We'll use a realistic looking large integer
    const lastLogon = this.generateWindowsNtTime(faker.date.recent({ days: 3 }));
    const lastLogonTimestamp = this.generateWindowsNtTime(faker.date.recent({ days: 7 }));
    const pwdLastSet = faker.date.recent({ days: 60 }).toISOString();
    // Account never expires
    const accountExpires = '9223372036854775807';

    const sAMAccountName = employee.userName.replace(/\./g, '');
    const objectGuid = this.generateObjectGuidBase64();
    const objectSid = this.generateObjectSidBase64();

    // Build group memberships (Distinguished Names of groups)
    const memberOf: string[] = [];
    memberOf.push(`CN=Domain Users,CN=Users,${baseDn}`);
    memberOf.push(`CN=${employee.department},OU=Groups,${baseDn}`);
    if (employee.hasAwsAccess) {
      memberOf.push(`CN=AWS-SSO-Users,OU=Groups,${baseDn}`);
    }
    if (employee.department === 'Product & Engineering') {
      memberOf.push(`CN=GitHub-Users,OU=Groups,${baseDn}`);
      memberOf.push(`CN=VPN-Users,OU=Groups,${baseDn}`);
    }

    // Build manager DN if available
    const managerDn = employee.managerId
      ? this.findManagerDn(employee.managerId, org, baseDn)
      : undefined;

    // userAccountControl: 512 = NORMAL_ACCOUNT, 66048 = NORMAL + DONT_EXPIRE_PASSWD
    const userAccountControl = faker.helpers.arrayElement([512, 66048]);

    const entry: Record<string, unknown> = {
      distinguishedName: userDn,
      cn: `${employee.firstName} ${employee.lastName}`,
      sAMAccountName: sAMAccountName,
      userPrincipalName: employee.email,
      displayName: `${employee.firstName} ${employee.lastName}`,
      givenName: employee.firstName,
      sn: employee.lastName,
      mail: employee.email,
      title: employee.role,
      department: employee.department,
      company: org.name,
      manager: managerDn,
      memberOf: memberOf,
      whenCreated: whenCreated,
      whenChanged: whenChanged,
      lastLogon: lastLogon,
      lastLogonTimestamp: lastLogonTimestamp,
      pwdLastSet: pwdLastSet,
      accountExpires: accountExpires,
      objectGUID: objectGuid,
      objectSid: objectSid,
      objectClass: ['top', 'person', 'organizationalPerson', 'user'],
      objectCategory: `CN=Person,CN=Schema,CN=Configuration,${baseDn}`,
      userAccountControl: String(userAccountControl),
      isCriticalSystemObject: false,
      showInAdvancedViewOnly: false,
      dSCorePropagationData: whenCreated,
    };

    // Add groups as structured array
    const groups = memberOf.map((dn) => {
      const cnMatch = dn.match(/^CN=([^,]+)/);
      return {
        distinguishedName: dn,
        cn: cnMatch ? cnMatch[1] : dn,
      };
    });

    return {
      '@timestamp': timestamp,
      activedirectory: {
        id: userDn,
        user: entry,
        groups: groups,
      },
      event: {
        action: 'user-discovered',
        kind: 'asset',
        category: ['iam'],
        type: ['user', 'info'],
      },
      user: {
        id: userDn,
      },
      labels: {
        identity_source: IDENTITY_SOURCE,
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'entityanalytics_ad.entity',
      },
      tags: ['forwarded', 'entityanalytics_ad-entity'],
    };
  }

  /**
   * Create an Active Directory computer document
   */
  private createDeviceDocument(
    device: Device,
    employee: Employee,
    org: Organization,
    timestamp: string,
    baseDn: string
  ): ActiveDirectoryDocument {
    const whenCreated = faker.date.past({ years: 1 }).toISOString();
    const whenChanged = faker.date.recent({ days: 14 }).toISOString();
    const lastLogon = this.generateWindowsNtTime(faker.date.recent({ days: 3 }));
    const lastLogonTimestamp = this.generateWindowsNtTime(faker.date.recent({ days: 7 }));

    const osInfo = faker.helpers.arrayElement(WINDOWS_OS_VERSIONS);
    const computerName = `${employee.userName.replace(/\./g, '').substring(0, 8).toUpperCase()}-PC${faker.string.numeric(3)}`;
    const computerDn = `CN=${computerName},OU=Computers,${baseDn}`;

    const objectGuid = this.generateObjectGuidBase64();
    const objectSid = this.generateObjectSidBase64();

    // userAccountControl: 4096 = WORKSTATION_TRUST_ACCOUNT
    const userAccountControl = 4096;

    // In real AD, computer SAM account names are the computer name suffixed with '$'
    const sAMAccountName = `${computerName}$`;

    const entry: Record<string, unknown> = {
      distinguishedName: computerDn,
      cn: computerName,
      sAMAccountName: sAMAccountName,
      dNSHostName: `${computerName.toLowerCase()}.${org.domain}`,
      operatingSystem: osInfo.os,
      operatingSystemVersion: osInfo.version,
      whenCreated: whenCreated,
      whenChanged: whenChanged,
      lastLogon: lastLogon,
      lastLogonTimestamp: lastLogonTimestamp,
      objectGUID: objectGuid,
      objectSid: objectSid,
      objectClass: ['top', 'person', 'organizationalPerson', 'user', 'computer'],
      objectCategory: `CN=Computer,CN=Schema,CN=Configuration,${baseDn}`,
      userAccountControl: String(userAccountControl),
      isCriticalSystemObject: false,
      memberOf: [`CN=Domain Computers,CN=Users,${baseDn}`],
      managedBy: `CN=${employee.firstName} ${employee.lastName},${DEPARTMENT_OUS[employee.department] || 'OU=Users'},${baseDn}`,
    };

    return {
      '@timestamp': timestamp,
      activedirectory: {
        id: computerDn,
        device: entry,
      },
      event: {
        action: 'device-discovered',
        kind: 'asset',
        category: ['host'],
        type: ['info'],
      },
      device: {
        id: computerDn,
      },
      labels: {
        identity_source: IDENTITY_SOURCE,
      },
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'entityanalytics_ad.entity',
      },
      tags: ['forwarded', 'entityanalytics_ad-entity'],
    };
  }

  /**
   * Find manager DN from Okta user ID
   */
  private findManagerDn(
    managerOktaId: string,
    org: Organization,
    baseDn: string
  ): string | undefined {
    const manager = org.employees.find((e) => e.oktaUserId === managerOktaId);
    if (manager) {
      return this.buildUserDn(manager, baseDn);
    }
    return undefined;
  }

  /**
   * Generate a Windows NT time value (100ns intervals since 1601-01-01)
   */
  private generateWindowsNtTime(date: Date): string {
    // Offset between Unix epoch (1970) and Windows NT epoch (1601) in milliseconds
    const ntEpochOffset = 11644473600000n;
    const dateMs = BigInt(date.getTime());
    // Convert to 100ns intervals
    const ntTime = (dateMs + ntEpochOffset) * 10000n;
    return ntTime.toString();
  }

  /**
   * Active Directory objectGUID is represented as base64 binary.
   */
  private generateObjectGuidBase64(): string {
    const guidHex = faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase();
    return Buffer.from(guidHex, 'hex').toString('base64');
  }

  /**
   * Generate objectSid in binary form encoded as base64.
   * SID layout: revision(1), subAuthCount(1), identifierAuthority(6), subAuthorities(n*4 LE)
   */
  private generateObjectSidBase64(): string {
    const revision = 1;
    const identifierAuthority = 5; // NT_AUTHORITY
    const subAuthorities = [
      21,
      faker.number.int({ min: 100000000, max: 2147483647 }),
      faker.number.int({ min: 100000000, max: 2147483647 }),
      faker.number.int({ min: 1000, max: 2147483647 }),
    ];

    const sid = Buffer.alloc(8 + subAuthorities.length * 4);
    sid[0] = revision;
    sid[1] = subAuthorities.length;
    sid[7] = identifierAuthority;

    subAuthorities.forEach((value, index) => {
      sid.writeUInt32LE(value >>> 0, 8 + index * 4);
    });

    return sid.toString('base64');
  }
}
