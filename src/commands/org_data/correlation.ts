/**
 * Correlation Logic
 * Handles cross-integration data correlation and ensures realistic relationships
 */

import {
  type Organization,
  type Employee,
  type OktaGroup,
  type CorrelationMap,
  type DepartmentName,
} from './types.ts';
import { getCloudAccessDepartments } from './data/departments.ts';

/**
 * Build correlation map from organization data
 * This establishes the relationships between different data sources
 */
export const buildCorrelationMap = (org: Organization): CorrelationMap => {
  const correlationMap: CorrelationMap = {
    oktaUserIdToEmployee: new Map(),
    employeeIdToOktaUserId: new Map(),
    awsUserToOktaUser: new Map(),
    departmentToOktaGroup: new Map(),
    entraIdUserIdToEmployee: new Map(),
    departmentToEntraIdGroup: new Map(),
    githubUsernameToEmployee: new Map(),
    duoUserIdToEmployee: new Map(),
    onePasswordUuidToEmployee: new Map(),
    crowdstrikeAgentIdToDevice: new Map(),
    jamfUdidToDevice: new Map(),
    adDnToEmployee: new Map(),
    windowsSidToEmployee: new Map(),
    serviceIdToService: new Map(),
    serviceEntityIdToService: new Map(),
    hostIdToServices: new Map(),
  };

  // Build employee to Okta user correlations
  for (const employee of org.employees) {
    correlationMap.oktaUserIdToEmployee.set(employee.oktaUserId, employee);
    correlationMap.employeeIdToOktaUserId.set(employee.id, employee.oktaUserId);
  }

  // Build employee to Entra ID user correlations
  for (const employee of org.employees) {
    correlationMap.entraIdUserIdToEmployee.set(employee.entraIdUserId, employee);
  }

  // Build AWS user to Okta user correlations
  for (const iamUser of org.cloudIamUsers) {
    if (iamUser.isFederated && iamUser.oktaUserId) {
      correlationMap.awsUserToOktaUser.set(iamUser.userName, iamUser.oktaUserId);
    }
  }

  // Build department to Okta group correlations
  for (const group of org.oktaGroups) {
    if (group.type === 'department') {
      correlationMap.departmentToOktaGroup.set(group.name as DepartmentName, group);
    }
  }

  // Build department to Entra ID group correlations
  for (const group of org.entraIdGroups) {
    if (group.type === 'department') {
      correlationMap.departmentToEntraIdGroup.set(group.name as DepartmentName, group);
    }
  }

  // Build GitHub username to employee correlations
  for (const employee of org.employees) {
    if (employee.githubUsername) {
      correlationMap.githubUsernameToEmployee.set(employee.githubUsername, employee);
    }
  }

  // Build Duo user ID to employee correlations
  for (const employee of org.employees) {
    correlationMap.duoUserIdToEmployee.set(employee.duoUserId, employee);
  }

  // Build 1Password UUID to employee correlations
  for (const employee of org.employees) {
    correlationMap.onePasswordUuidToEmployee.set(employee.onePasswordUuid, employee);
  }

  // Build CrowdStrike agent ID to device correlations
  for (const employee of org.employees) {
    for (const device of employee.devices) {
      correlationMap.crowdstrikeAgentIdToDevice.set(device.crowdstrikeAgentId, {
        employee,
        device,
      });
    }
  }

  // Build Windows SID to employee correlations
  for (const employee of org.employees) {
    correlationMap.windowsSidToEmployee.set(employee.windowsSid, employee);
  }

  // Build service correlations: id -> Service, entityId -> Service, hostId -> Service[]
  for (const svc of org.services) {
    correlationMap.serviceIdToService.set(svc.id, svc);
    correlationMap.serviceEntityIdToService.set(svc.entityId, svc);
    for (const hostId of svc.hostIds ?? []) {
      const list = correlationMap.hostIdToServices.get(hostId) ?? [];
      list.push(svc);
      correlationMap.hostIdToServices.set(hostId, list);
    }
  }

  return correlationMap;
};

/**
 * Get employees with AWS access (Product & Engineering + Executives)
 */
export const getAwsAccessEmployees = (org: Organization): Employee[] => {
  const cloudAccessDepts = getCloudAccessDepartments().map((d) => d.name);
  return org.employees.filter((e) => cloudAccessDepts.includes(e.department));
};

/**
 * Get the Okta AWS-Access group
 */
export const getAwsAccessGroup = (org: Organization): OktaGroup | undefined => {
  return org.oktaGroups.find((g) => g.name === 'AWS-Access');
};

/**
 * Verify correlation integrity
 * Checks that all correlations are valid and bidirectional where expected
 */
export const verifyCorrelationIntegrity = (
  org: Organization,
  correlationMap: CorrelationMap,
): CorrelationVerificationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check all employees have Okta user IDs in map
  for (const employee of org.employees) {
    if (!correlationMap.oktaUserIdToEmployee.has(employee.oktaUserId)) {
      errors.push(`Employee ${employee.email} not found in oktaUserIdToEmployee map`);
    }
    if (!correlationMap.employeeIdToOktaUserId.has(employee.id)) {
      errors.push(`Employee ${employee.email} not found in employeeIdToOktaUserId map`);
    }
  }

  // Check all federated IAM users have Okta correlations
  const federatedUsers = org.cloudIamUsers.filter((u) => u.isFederated);
  for (const iamUser of federatedUsers) {
    if (!iamUser.oktaUserId) {
      errors.push(`Federated IAM user ${iamUser.userName} missing oktaUserId`);
    } else if (!correlationMap.oktaUserIdToEmployee.has(iamUser.oktaUserId)) {
      errors.push(
        `Federated IAM user ${iamUser.userName} has oktaUserId not found in employee map`,
      );
    }
  }

  // Check employees with AWS access have corresponding IAM users
  const awsEmployees = getAwsAccessEmployees(org);
  const iamUserOktaIds = new Set(
    org.cloudIamUsers.filter((u) => u.isFederated).map((u) => u.oktaUserId),
  );

  for (const employee of awsEmployees) {
    if (!iamUserOktaIds.has(employee.oktaUserId)) {
      warnings.push(`Employee ${employee.email} has AWS access but no corresponding IAM user`);
    }
  }

  // Check employees without AWS access don't have IAM users
  const nonAwsEmployees = org.employees.filter((e) => !e.hasAwsAccess);
  for (const employee of nonAwsEmployees) {
    if (iamUserOktaIds.has(employee.oktaUserId)) {
      errors.push(`Employee ${employee.email} should not have AWS access but has IAM user`);
    }
  }

  // Check department groups exist for all departments
  for (const dept of org.departments) {
    const group = org.oktaGroups.find((g) => g.name === dept.name && g.type === 'department');
    if (!group) {
      errors.push(`Missing Okta group for department ${dept.name}`);
    }
  }

  // Check all employees have Entra ID user IDs in map
  for (const employee of org.employees) {
    if (!correlationMap.entraIdUserIdToEmployee.has(employee.entraIdUserId)) {
      errors.push(`Employee ${employee.email} not found in entraIdUserIdToEmployee map`);
    }
  }

  // Check department groups exist in Entra ID for all departments
  for (const dept of org.departments) {
    const group = org.entraIdGroups.find((g) => g.name === dept.name && g.type === 'department');
    if (!group) {
      errors.push(`Missing Entra ID group for department ${dept.name}`);
    }
  }

  // Service entity integrity: unique entityIds, valid owner/host references.
  const serviceEntityIds = new Set<string>();
  const employeeIds = new Set(org.employees.map((e) => e.id));
  const hostIds = new Set(org.hosts.map((h) => h.id));
  for (const svc of org.services) {
    if (serviceEntityIds.has(svc.entityId)) {
      errors.push(`Duplicate service entity ID: ${svc.entityId}`);
    }
    serviceEntityIds.add(svc.entityId);

    if (svc.kind === 'org_service') {
      if (svc.ownerEmployeeId && !employeeIds.has(svc.ownerEmployeeId)) {
        errors.push(
          `Org service ${svc.id} ownerEmployeeId=${svc.ownerEmployeeId} not found in employees`,
        );
      }
      for (const hostId of svc.hostIds ?? []) {
        if (!hostIds.has(hostId)) {
          errors.push(`Org service ${svc.id} hostId=${hostId} not found in hosts`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalEmployees: org.employees.length,
      employeesWithAwsAccess: awsEmployees.length,
      federatedIamUsers: federatedUsers.length,
      serviceAccounts: org.cloudIamUsers.filter((u) => !u.isFederated).length,
      oktaGroups: org.oktaGroups.length,
      entraIdGroups: org.entraIdGroups.length,
      services: org.services.length,
      cloudPlatformServices: org.services.filter((s) => s.kind === 'cloud_platform').length,
      saasApps: org.services.filter((s) => s.kind === 'saas_app').length,
      orgServices: org.services.filter((s) => s.kind === 'org_service').length,
    },
  };
};

/**
 * Correlation verification result
 */
export interface CorrelationVerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalEmployees: number;
    employeesWithAwsAccess: number;
    federatedIamUsers: number;
    serviceAccounts: number;
    oktaGroups: number;
    entraIdGroups: number;
    services: number;
    cloudPlatformServices: number;
    saasApps: number;
    orgServices: number;
  };
}

/**
 * Get correlation summary for logging
 */
export const getCorrelationSummary = (
  org: Organization,
  correlationMap: CorrelationMap,
): string => {
  const verification = verifyCorrelationIntegrity(org, correlationMap);
  const awsAccessGroup = getAwsAccessGroup(org);
  const awsEmployees = getAwsAccessEmployees(org);

  return `
Correlation Summary:
-------------------
Employee -> Okta User mappings: ${correlationMap.oktaUserIdToEmployee.size}
Employee -> Entra ID User mappings: ${correlationMap.entraIdUserIdToEmployee.size}
AWS User -> Okta User mappings: ${correlationMap.awsUserToOktaUser.size}
Department -> Okta Group mappings: ${correlationMap.departmentToOktaGroup.size}
Department -> Entra ID Group mappings: ${correlationMap.departmentToEntraIdGroup.size}
GitHub Username -> Employee mappings: ${correlationMap.githubUsernameToEmployee.size}
Duo User ID -> Employee mappings: ${correlationMap.duoUserIdToEmployee.size}
1Password UUID -> Employee mappings: ${correlationMap.onePasswordUuidToEmployee.size}
CrowdStrike Agent -> Device mappings: ${correlationMap.crowdstrikeAgentIdToDevice.size}
Jamf UDID -> Device mappings: ${correlationMap.jamfUdidToDevice.size}
AD DN -> Employee mappings: ${correlationMap.adDnToEmployee.size}
Windows SID -> Employee mappings: ${correlationMap.windowsSidToEmployee.size}
Service ID -> Service mappings: ${correlationMap.serviceIdToService.size}
Service EntityID -> Service mappings: ${correlationMap.serviceEntityIdToService.size}
Host ID -> Services mappings: ${correlationMap.hostIdToServices.size}

AWS Access Group: ${awsAccessGroup?.name || 'Not found'}
Employees with AWS Access: ${awsEmployees.length}
  - Departments: ${[...new Set(awsEmployees.map((e) => e.department))].join(', ')}

Federated IAM Users: ${verification.stats.federatedIamUsers}
Service Accounts: ${verification.stats.serviceAccounts}

Okta Groups: ${verification.stats.oktaGroups}
Entra ID Groups: ${verification.stats.entraIdGroups}

Services: ${verification.stats.services}
  - Cloud Platform: ${verification.stats.cloudPlatformServices}
  - SaaS Apps: ${verification.stats.saasApps}
  - Org-Owned: ${verification.stats.orgServices}

Verification: ${verification.valid ? '✓ PASSED' : '✗ FAILED'}
${verification.errors.length > 0 ? `Errors:\n  - ${verification.errors.join('\n  - ')}` : ''}
${verification.warnings.length > 0 ? `Warnings:\n  - ${verification.warnings.join('\n  - ')}` : ''}
`.trim();
};

/**
 * AWS Access Flow description
 * Describes how users access AWS through Okta SSO
 */
export const AWS_ACCESS_FLOW = `
AWS Access Flow (Okta Federated Login):
======================================

1. User authenticates to Okta using their corporate credentials
   - Multi-factor authentication required
   - User must be member of 'AWS-Access' Okta group

2. Okta verifies user is in Product & Engineering department
   - Only employees with hasAwsAccess=true can access AWS
   - Executives have read-only access

3. User selects AWS account and role from Okta dashboard
   - Available roles: Developer, Admin, ReadOnly based on role
   - Production access requires additional approval

4. Okta sends SAML assertion to AWS
   - User identity mapped to IAM role via SAML provider
   - Session duration typically 1-8 hours

5. User accesses AWS Console or CLI
   - Actions logged in CloudTrail
   - Identity traced back to Okta user

Security Controls:
- AWS access only through Okta (no direct IAM passwords)
- Service accounts for automation (separate from federated users)
- All API calls auditable via CloudTrail
- Principle of least privilege enforced via IAM policies
`;
