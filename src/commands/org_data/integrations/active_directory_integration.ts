/**
 * Active Directory Entity Analytics Integration
 * Generates user and device documents for entityanalytics_ad data stream
 * Based on beats x-pack/filebeat/input/entityanalytics/provider/activedirectory/
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
  type AgentData,
} from './base_integration.ts';
import {
  type Organization,
  type Employee,
  type Device,
  type ActiveDirectoryDocument,
  type CorrelationMap,
} from '../types.ts';
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
    correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];
    const timestamp = this.getTimestamp();
    const centralAgent = this.buildCentralAgent(org);

    const baseDn = `DC=${org.domain.replace('.com', '')},DC=com`;

    // Pre-build a map of employee id → computer DNs for their Windows devices,
    // so managers can reference their direct reports' machines as managedObjects.
    const employeeComputerDns = new Map<string, string[]>();
    for (const employee of org.employees) {
      const dns = employee.devices
        .filter((d) => d.type === 'laptop' && d.platform === 'windows')
        .map(() => `CN=${this.buildComputerName(employee)},OU=Computers,${baseDn}`);
      employeeComputerDns.set(employee.id, dns);
    }

    // Generate user documents for all employees
    for (const employee of org.employees) {
      const userDn = this.buildUserDn(employee, baseDn);
      correlationMap.adDnToEmployee.set(userDn, employee);

      // Direct reports of this employee (managerId references the manager's oktaUserId).
      const directReports = org.employees.filter((e) => e.managerId === employee.oktaUserId);
      // Managers administer the computers of their direct reports (user -> host).
      const directReportComputerDns = directReports.flatMap(
        (e) => employeeComputerDns.get(e.id) ?? [],
      );
      // Managers supervise the direct reports themselves (user -> user).
      const directReportUserDns = directReports.map((e) => this.buildUserDn(e, baseDn));

      const userDoc = this.createUserDocument(
        employee,
        org,
        timestamp,
        baseDn,
        userDn,
        centralAgent,
        {
          managedObjects: directReportComputerDns,
          directReports: directReportUserDns,
        },
      );
      documents.push(userDoc);
    }

    // Collect all computer DNs so device managedObjects can reference real entities.
    const allComputerDns = [...employeeComputerDns.values()].flat();

    // Generate computer documents for Windows devices
    for (const employee of org.employees) {
      const windowsDevices = employee.devices.filter(
        (d) => d.type === 'laptop' && d.platform === 'windows',
      );
      for (const device of windowsDevices) {
        // ~15% of devices administer 1–2 other computers (e.g. shared lab machines).
        // Reference actual generated computer DNs so the maintainer can resolve them.
        const ownDn = `CN=${this.buildComputerName(employee)},OU=Computers,${baseDn}`;
        const otherDns = allComputerDns.filter((dn) => dn !== ownDn);
        const managedObjects =
          faker.datatype.boolean({ probability: 0.15 }) && otherDns.length > 0
            ? faker.helpers.arrayElements(otherDns, { min: 1, max: Math.min(2, otherDns.length) })
            : [];

        const computerDoc = this.createDeviceDocument(
          device,
          employee,
          org,
          timestamp,
          baseDn,
          centralAgent,
          managedObjects,
        );
        documents.push(computerDoc);
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  /**
   * Mirrors the ingest pipeline's buildHostRel() Painless function, which is now
   * identical in both pipelines:
   *
   *   - device.yml (host actor): host.name = FQDN (cn.toLowerCase() + "." + domain)
   *   - user.yml   (user actor): host.name = FQDN (cn.toLowerCase() + "." + domain)
   *
   * Both compose the FQDN when a domain is present, falling back to the bare CN
   * otherwise. The administers maintainer resolves target host EUIDs as
   * CONCAT("host:", raw_identifiers.host.name); the FQDN matches the device
   * entity's own EUID (host:<FQDN>), since AD device docs set root host.name to
   * the FQDN and never set root host.id.
   *
   * Example input:  ["CN=Workstation01,OU=Computers,DC=testserver,DC=local"]
   *   -> host.name = ["workstation01.testserver.local"]
   *
   * host.id always carries the full DN, and user.domain the DC parts joined,
   * exactly as parseDn()/buildHostRel() produce them.
   */
  private buildAdministersFromDns(dns: string[]): Record<string, unknown> {
    const hostIds: string[] = [];
    const hostNames: string[] = [];
    const userDomains: string[] = [];

    for (const dn of dns) {
      if (!dn) continue;
      hostIds.push(dn);

      const cnMatch = dn.match(/^CN=([^,]+)/i);
      const dcParts = [...dn.matchAll(/DC=([^,]+)/gi)].map((m) => m[1]);
      const domain = dcParts.length > 0 ? dcParts.join('.') : undefined;

      if (cnMatch) {
        const cn = cnMatch[1];
        // buildHostRel() composes the FQDN only when a domain is present;
        // otherwise it falls back to the bare CN.
        hostNames.push(domain ? `${cn.toLowerCase()}.${domain}` : cn);
      }

      if (domain) userDomains.push(domain);
    }

    return {
      host: { id: hostIds, name: hostNames },
      ...(userDomains.length > 0 && { user: { domain: userDomains } }),
    };
  }

  /**
   * Mirrors the ingest pipeline's buildUserRel() Painless function, used for the
   * supervises relationship (user -> user). Each DN yields user.id = the full DN,
   * user.name = the bare CN, and user.domain = the DC components joined.
   *
   * Unlike buildHostRel()/buildAdministersFromDns(), the name is the bare CN with no
   * FQDN composition, exactly as parseDn()/buildUserRel() produce it.
   *
   * Example input:  ["CN=Jane Smith,OU=Staff,DC=testserver,DC=local"]
   *   -> user.id     = ["CN=Jane Smith,OU=Staff,DC=testserver,DC=local"]
   *      user.name   = ["Jane Smith"]
   *      user.domain = ["testserver.local"]
   */
  private buildSupervisesFromDns(dns: string[]): Record<string, unknown> {
    const userIds: string[] = [];
    const userNames: string[] = [];
    const userDomains: string[] = [];

    for (const dn of dns) {
      if (!dn) continue;
      userIds.push(dn);

      const cnMatch = dn.match(/^CN=([^,]+)/i);
      const dcParts = [...dn.matchAll(/DC=([^,]+)/gi)].map((m) => m[1]);

      if (cnMatch) userNames.push(cnMatch[1]);
      if (dcParts.length > 0) userDomains.push(dcParts.join('.'));
    }

    return { user: { id: userIds, name: userNames, domain: userDomains } };
  }

  /**
   * Build a deterministic computer name for an employee's Windows device.
   * Must be called consistently — both the device document and the managedObjects
   * reference in the manager's document use this same name so the maintainer can
   * resolve raw_identifiers.host.name to an actual entity.
   */
  private buildComputerName(employee: Employee): string {
    // Derive a stable 3-digit suffix from the employee id so the name is
    // deterministic across both the device doc and the manager's managedObjects list.
    const suffix = employee.id.replace(/\D/g, '').slice(-3).padStart(3, '0');
    return `${employee.userName.replaceAll('.', '').substring(0, 8).toUpperCase()}-PC${suffix}`;
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
    userDn: string,
    centralAgent: AgentData,
    relationshipDns: { managedObjects: string[]; directReports: string[] },
  ): ActiveDirectoryDocument {
    const { managedObjects, directReports } = relationshipDns;
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
    const objectSid = this.sidToBase64(employee.windowsSid);

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
      // Both camelCase (raw event shape) and snake_case (post-pipeline shape) are written
      // because the generator bypasses the ingest pipeline that would do the rename.
      ...(managedObjects.length > 0 && {
        managedObjects,
        managed_objects: managedObjects,
      }),
      ...(directReports.length > 0 && {
        directReports,
        direct_reports: directReports,
      }),
    };

    // Add groups as structured array (pipeline expects name and objectSid for privileged detection)
    const groups = memberOf.map((dn) => {
      const cnMatch = dn.match(/^CN=([^,]+)/);
      const cn = cnMatch ? cnMatch[1] : dn;
      // Generate SID for group; use well-known RID for Domain Users (513)
      const groupSid = `S-1-5-21-${faker.string.numeric(10)}-${faker.string.numeric(10)}-${faker.string.numeric(10)}-513`;
      return {
        distinguishedName: dn,
        cn,
        name: cn,
        objectSid: this.sidToBase64(groupSid),
      };
    });

    // Build the post-pipeline relationship shapes the entity store extraction reads from.
    // administers (user -> host): user.yml's buildHostRel() composes host.name as the FQDN.
    // supervises (user -> user): user.yml's buildUserRel() uses the bare CN for user.name.
    const administers =
      managedObjects.length > 0 ? this.buildAdministersFromDns(managedObjects) : undefined;
    const supervises =
      directReports.length > 0 ? this.buildSupervisesFromDns(directReports) : undefined;

    const relationships: Record<string, unknown> = {};
    if (administers) relationships.administers = administers;
    if (supervises) relationships.supervises = supervises;

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      activedirectory: {
        id: userDn,
        user: entry,
        groups: groups,
      },
      event: {
        action: 'user-discovered',
      },
      user: {
        id: employee.windowsSid,
        ...(Object.keys(relationships).length > 0 && { entity: { relationships } }),
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
    _device: Device,
    employee: Employee,
    org: Organization,
    timestamp: string,
    baseDn: string,
    centralAgent: AgentData,
    managedObjects: string[],
  ): ActiveDirectoryDocument {
    const whenCreated = faker.date.past({ years: 1 }).toISOString();
    const whenChanged = faker.date.recent({ days: 14 }).toISOString();
    const lastLogon = this.generateWindowsNtTime(faker.date.recent({ days: 3 }));
    const lastLogonTimestamp = this.generateWindowsNtTime(faker.date.recent({ days: 7 }));

    const osInfo = faker.helpers.arrayElement(WINDOWS_OS_VERSIONS);
    const computerName = this.buildComputerName(employee);
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
      ...(managedObjects.length > 0 && {
        managedObjects,
        managed_objects: managedObjects,
      }),
    };

    // device.yml's buildHostRel() composes host.name as the FQDN
    // (cn.toLowerCase() + "." + domain), so this device document mirrors that.
    const administers =
      managedObjects.length > 0 ? this.buildAdministersFromDns(managedObjects) : undefined;

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      activedirectory: {
        id: computerDn,
        device: entry,
      },
      event: {
        action: 'device-discovered',
      },
      device: {
        id: computerDn,
      },
      ...(administers && { host: { entity: { relationships: { administers } } } }),
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
    baseDn: string,
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
   * Convert a SID string (e.g. S-1-5-21-XXX-XXX-XXX-1001) to binary base64.
   * SID layout: revision(1), subAuthCount(1), identifierAuthority(6), subAuthorities(n*4 LE)
   */
  private sidToBase64(sidString: string): string {
    const parts = sidString.split('-');
    // S-{revision}-{identifierAuthority}-{subAuth1}-{subAuth2}-...
    const revision = parseInt(parts[1], 10);
    const identifierAuthority = parseInt(parts[2], 10);
    const subAuthorities = parts.slice(3).map((p) => parseInt(p, 10));

    const sid = Buffer.alloc(8 + subAuthorities.length * 4);
    sid[0] = revision;
    sid[1] = subAuthorities.length;
    sid[7] = identifierAuthority;

    subAuthorities.forEach((value, index) => {
      sid.writeUInt32LE(value >>> 0, 8 + index * 4);
    });

    return sid.toString('base64');
  }

  /**
   * Generate objectSid in binary form encoded as base64 (for computer objects).
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
