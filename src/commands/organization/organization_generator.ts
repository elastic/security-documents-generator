/**
 * Organization Generator
 * Generates complete organization structure with employees, devices, hosts, and cloud resources
 */

import { faker } from '@faker-js/faker';
import {
  Organization,
  OrganizationConfig,
  Employee,
  Device,
  Host,
  CloudAccount,
  CloudResource,
  CloudIamUser,
  OktaGroup,
  EntraIdGroup,
  GitHubRepo,
  GitHubOrg,
  CloudflareZone,
  OnePasswordVault,
  DeviceType,
  LaptopPlatform,
  MobilePlatform,
  CloudProvider,
  ProductivitySuite,
  OrganizationSize,
  SIZE_CONFIGS,
  DepartmentName,
} from './types';
import { DEPARTMENTS, getCloudAccessDepartments } from './data/departments';
import { getRandomCountry, getRandomCity } from './data/countries';
import {
  getResourcesForProvider,
  S3_BUCKET_PURPOSES,
  IAM_ROLE_NAMES,
  SERVICE_NAMES,
} from './data/cloud_resources';

/**
 * Generate a complete organization based on configuration
 */
export const generateOrganization = (config: OrganizationConfig): Organization => {
  // Set seed for reproducibility if provided
  if (config.seed !== undefined) {
    faker.seed(config.seed);
  }

  const sizeConfig = SIZE_CONFIGS[config.size];
  const domain = config.domain || `${config.name.toLowerCase().replace(/\s+/g, '')}.com`;

  // Calculate total employees
  const employeeCount = faker.number.int({
    min: sizeConfig.employeeRange.min,
    max: sizeConfig.employeeRange.max,
  });

  // Generate departments with Okta groups
  const oktaGroups = generateOktaGroups();

  // Generate Entra ID groups (similar structure to Okta groups)
  const entraIdGroups = generateEntraIdGroups();

  // Generate employees
  const employees = generateEmployees(employeeCount, domain, oktaGroups);

  // Generate hosts
  const hostCount = faker.number.int({
    min: sizeConfig.hostRange.min,
    max: sizeConfig.hostRange.max,
  });
  const hosts = generateHosts(hostCount, sizeConfig.cloudProviders);

  // Generate cloud accounts
  const cloudAccounts = generateCloudAccounts(
    sizeConfig.cloudAccounts,
    sizeConfig.cloudProviders,
    config.name
  );

  // Generate cloud resources
  const cloudResources = generateCloudResources(
    cloudAccounts,
    sizeConfig.resourceMultiplier,
    config.name
  );

  // Generate cloud IAM users (linked to employees with AWS access)
  const cloudIamUsers = generateCloudIamUsers(employees, cloudAccounts);

  // Generate GitHub organization and repos
  const orgPrefix = config.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const githubOrg = generateGitHubOrg(orgPrefix, config.size);

  // Generate Cloudflare zones
  const cloudflareZones = generateCloudflareZones(domain, config.size);

  // Generate 1Password vaults
  const onePasswordVaults = generateOnePasswordVaults();

  // Determine productivity suite
  const productivitySuite: ProductivitySuite = config.productivitySuite || 'microsoft';

  return {
    name: config.name,
    domain,
    size: config.size,
    departments: DEPARTMENTS,
    employees,
    hosts,
    cloudAccounts,
    cloudResources,
    cloudIamUsers,
    oktaGroups,
    entraIdGroups,
    githubOrg,
    cloudflareZones,
    onePasswordVaults,
    productivitySuite,
  };
};

/**
 * Generate Okta groups for departments and special access
 */
const generateOktaGroups = (): OktaGroup[] => {
  const groups: OktaGroup[] = [];

  // Department groups
  for (const dept of DEPARTMENTS) {
    groups.push({
      id: faker.string.uuid(),
      name: dept.name,
      description: `All employees in ${dept.name}`,
      type: 'department',
    });
  }

  // Special access groups
  groups.push({
    id: faker.string.uuid(),
    name: 'Everyone',
    description: 'All users in the organization',
    type: 'access',
  });

  groups.push({
    id: faker.string.uuid(),
    name: 'AWS-Access',
    description: 'Users with AWS console access via SSO',
    type: 'access',
  });

  groups.push({
    id: faker.string.uuid(),
    name: 'VPN-Users',
    description: 'Users with VPN access',
    type: 'access',
  });

  groups.push({
    id: faker.string.uuid(),
    name: 'GitHub-Access',
    description: 'Users with GitHub organization access',
    type: 'access',
  });

  return groups;
};

/**
 * Generate Entra ID groups for departments and special access
 * Mirrors organization structure in Microsoft Entra ID (Azure AD)
 */
const generateEntraIdGroups = (): EntraIdGroup[] => {
  const groups: EntraIdGroup[] = [];

  // Department groups (synced from HR system or created in Entra ID)
  for (const dept of DEPARTMENTS) {
    groups.push({
      id: faker.string.uuid(),
      name: dept.name,
      description: `${dept.name} department members`,
      type: 'department',
    });
  }

  // Special access groups
  groups.push({
    id: faker.string.uuid(),
    name: 'All Users',
    description: 'All users in the organization',
    type: 'access',
  });

  groups.push({
    id: faker.string.uuid(),
    name: 'Microsoft 365 Users',
    description: 'Users with Microsoft 365 licenses',
    type: 'access',
  });

  groups.push({
    id: faker.string.uuid(),
    name: 'Azure Subscription Contributors',
    description: 'Users with Azure subscription contributor access',
    type: 'access',
  });

  // Device groups
  groups.push({
    id: faker.string.uuid(),
    name: 'Managed Devices',
    description: 'All managed devices enrolled in Intune',
    type: 'device',
  });

  groups.push({
    id: faker.string.uuid(),
    name: 'Compliant Devices',
    description: 'Devices meeting compliance policies',
    type: 'device',
  });

  groups.push({
    id: faker.string.uuid(),
    name: 'Windows Devices',
    description: 'All Windows devices in the organization',
    type: 'device',
  });

  groups.push({
    id: faker.string.uuid(),
    name: 'macOS Devices',
    description: 'All macOS devices in the organization',
    type: 'device',
  });

  return groups;
};

/**
 * Generate employees distributed across departments
 */
const generateEmployees = (
  totalCount: number,
  domain: string,
  _oktaGroups: OktaGroup[]
): Employee[] => {
  const employees: Employee[] = [];
  const cloudAccessDepts = getCloudAccessDepartments().map((d) => d.name);

  // Shared AD domain SID prefix (S-1-5-21-{3 sub-authorities}) used by all employees
  const domainSidPrefix = `S-1-5-21-${faker.number.int({ min: 100000000, max: 2147483647 })}-${faker.number.int({ min: 100000000, max: 2147483647 })}-${faker.number.int({ min: 100000000, max: 2147483647 })}`;
  let nextRid = 1001;
  let nextUid = 1000;

  // Single employee mode: create John Doe directly in Product & Engineering
  // Force Mac laptop so Jamf Pro MDM always has a device to manage
  if (totalCount === 1) {
    const engDept = DEPARTMENTS.find((d) => d.name === 'Product & Engineering')!;
    const employee = generateEmployee(
      engDept.name,
      engDept.roles,
      domain,
      cloudAccessDepts,
      domainSidPrefix,
      nextRid,
      nextUid,
      true
    );
    employee.firstName = 'John';
    employee.lastName = 'Doe';
    employee.userName = 'john.doe';
    employee.email = `john.doe@${domain}`;
    employee.githubUsername = 'john-doe';
    return [employee];
  }

  // Track manager candidates per department
  const managersByDept: Map<DepartmentName, Employee[]> = new Map();

  // First pass: generate all employees
  for (const dept of DEPARTMENTS) {
    const deptEmployeeCount = Math.max(1, Math.round(totalCount * dept.percentage));
    managersByDept.set(dept.name, []);

    for (let i = 0; i < deptEmployeeCount; i++) {
      const employee = generateEmployee(
        dept.name,
        dept.roles,
        domain,
        cloudAccessDepts,
        domainSidPrefix,
        nextRid++,
        nextUid++
      );
      employees.push(employee);

      // Track potential managers (senior roles)
      if (
        employee.role.includes('Manager') ||
        employee.role.includes('Director') ||
        employee.role.includes('VP') ||
        employee.role.includes('Chief') ||
        employee.role.includes('Lead') ||
        employee.role.includes('Senior')
      ) {
        managersByDept.get(dept.name)?.push(employee);
      }
    }
  }

  // Ensure there is always a "John Doe" employee in Product & Engineering
  const johnDoe = employees.find((e) => e.department === 'Product & Engineering');
  if (johnDoe) {
    johnDoe.firstName = 'John';
    johnDoe.lastName = 'Doe';
    johnDoe.userName = 'john.doe';
    johnDoe.email = `john.doe@${domain}`;
    johnDoe.githubUsername = 'john-doe';
  }

  // Second pass: assign managers
  for (const employee of employees) {
    const deptManagers = managersByDept.get(employee.department) || [];
    // Don't assign manager to themselves, and only non-executives get managers
    const potentialManagers = deptManagers.filter(
      (m) => m.id !== employee.id && !employee.role.includes('Chief')
    );

    if (potentialManagers.length > 0 && !employee.role.includes('Chief')) {
      employee.managerId = faker.helpers.arrayElement(potentialManagers).oktaUserId;
    }
  }

  return employees;
};

/**
 * Generate a single employee
 */
const generateEmployee = (
  department: DepartmentName,
  roles: string[],
  domain: string,
  cloudAccessDepts: string[],
  domainSidPrefix: string,
  rid: number,
  uid: number,
  allPlatforms: boolean = false
): Employee => {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const userName = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`.replace(/[^a-z.]/g, '');
  const email = `${userName}@${domain}`;

  const country = getRandomCountry(faker.number.float);
  const city = getRandomCity(country, faker.number.float);

  const hasAwsAccess = cloudAccessDepts.includes(department);

  // GitHub username only for Engineering + Executive departments
  const hasGithubAccess = department === 'Product & Engineering' || department === 'Executive';
  const githubUsername = hasGithubAccess ? userName.replace(/\./g, '-') : undefined;

  return {
    id: faker.string.uuid(),
    firstName,
    lastName,
    email,
    userName,
    department,
    role: faker.helpers.arrayElement(roles),
    country: country.name,
    countryCode: country.code,
    city,
    timezone: country.timezone,
    devices: generateDevicesForEmployee(allPlatforms),
    hasAwsAccess,
    oktaUserId: `00u${faker.string.alphanumeric(14)}`,
    entraIdUserId: faker.string.uuid(),
    employeeNumber: faker.string.numeric(6),
    githubUsername,
    duoUserId: `DU${faker.string.alphanumeric(18).toUpperCase()}`,
    onePasswordUuid: faker.string.uuid(),
    windowsSid: `${domainSidPrefix}-${rid}`,
    unixUid: uid,
  };
};

/**
 * Generate devices for an employee (laptops + 1 mobile)
 * Uses weighted platform distribution: mac ~50%, windows ~35%, linux ~15%
 * This ensures Jamf Pro (macOS MDM) always has meaningful device inventory.
 *
 * @param allPlatforms - If true, generates one laptop per platform (mac, windows, linux).
 *                       Used for john_doe mode to ensure full integration coverage.
 */
const generateDevicesForEmployee = (allPlatforms: boolean = false): Device[] => {
  const devices: Device[] = [];

  if (allPlatforms) {
    // Generate one laptop per platform (mac, windows, linux) for full coverage
    const platforms: LaptopPlatform[] = ['mac', 'windows', 'linux'];
    for (const platform of platforms) {
      devices.push(generateDevice('laptop', platform));
    }
  } else {
    // Generate a single laptop with weighted platform distribution
    // Mac gets higher weight since Jamf Pro MDM requires macOS devices
    const laptopPlatform = faker.helpers.weightedArrayElement<LaptopPlatform>([
      { value: 'mac', weight: 5 },
      { value: 'windows', weight: 3.5 },
      { value: 'linux', weight: 1.5 },
    ]);
    devices.push(generateDevice('laptop', laptopPlatform));
  }

  // Generate mobile device
  const mobilePlatform = faker.helpers.arrayElement<MobilePlatform>(['android', 'ios']);
  devices.push(generateDevice('mobile', mobilePlatform));

  return devices;
};

/**
 * Generate a single device
 */
const generateDevice = (type: DeviceType, platform: LaptopPlatform | MobilePlatform): Device => {
  const displayNameByPlatform: Record<string, string> = {
    mac: `MacBook Pro ${faker.number.int({ min: 13, max: 16 })}-inch`,
    windows: `${faker.helpers.arrayElement(['Dell XPS', 'Lenovo ThinkPad', 'HP EliteBook', 'Surface Pro'])} ${faker.number.int({ min: 13, max: 15 })}`,
    linux: `${faker.helpers.arrayElement(['Dell XPS', 'Lenovo ThinkPad', 'System76'])} ${faker.number.int({ min: 13, max: 15 })}`,
    android: `${faker.helpers.arrayElement(['Samsung Galaxy S', 'Google Pixel ', 'OnePlus '])}${faker.number.int({ min: 20, max: 24 })}`,
    ios: `iPhone ${faker.number.int({ min: 13, max: 16 })} ${faker.helpers.arrayElement(['', 'Pro', 'Pro Max'])}`,
  };

  return {
    id: faker.string.uuid(),
    type,
    platform,
    serialNumber: faker.string.alphanumeric(12).toUpperCase(),
    displayName: displayNameByPlatform[platform] || `${platform} Device`,
    registered: true,
    diskEncryptionEnabled: faker.datatype.boolean(0.9), // 90% have encryption
    crowdstrikeAgentId: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
    crowdstrikeDeviceId: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
    macAddress: faker.internet.mac({ separator: '-' }),
    ipAddress: faker.internet.ipv4(),
  };
};

/**
 * Generate hosts/servers for the organization
 */
const generateHosts = (count: number, cloudProviders: CloudProvider[]): Host[] => {
  const hosts: Host[] = [];
  const regions: Record<CloudProvider, string[]> = {
    aws: ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1'],
    gcp: ['us-central1', 'us-east1', 'europe-west1'],
    azure: ['eastus', 'westus2', 'westeurope'],
  };

  const purposes = [
    'api-server',
    'web-server',
    'worker',
    'database',
    'cache',
    'message-queue',
    'scheduler',
    'monitoring',
    'logging',
    'ci-runner',
  ];

  for (let i = 0; i < count; i++) {
    const provider = faker.helpers.arrayElement(cloudProviders);
    const region = faker.helpers.arrayElement(regions[provider]);
    const purpose = faker.helpers.arrayElement(purposes);
    const env = faker.helpers.arrayElement(['prod', 'staging', 'dev']);
    const os = generateHostOS();

    hosts.push({
      id: faker.string.uuid(),
      name: `${purpose}-${env}-${faker.string.alphanumeric(6).toLowerCase()}`,
      type: faker.helpers.arrayElement(['server', 'container', 'virtual_machine']),
      cloudProvider: provider,
      region,
      purpose,
      os,
    });
  }

  return hosts;
};

/**
 * Generate OS information for a host
 */
const generateHostOS = (): { name: string; version: string; family: string } => {
  const osOptions = [
    { name: 'Amazon Linux', version: '2023', family: 'linux' },
    { name: 'Ubuntu', version: '22.04', family: 'debian' },
    { name: 'Ubuntu', version: '24.04', family: 'debian' },
    { name: 'Debian', version: '12', family: 'debian' },
    { name: 'CentOS', version: '9', family: 'rhel' },
    { name: 'Alpine Linux', version: '3.19', family: 'alpine' },
  ];

  return faker.helpers.arrayElement(osOptions);
};

/**
 * Generate cloud accounts based on organization size
 */
const generateCloudAccounts = (
  count: number,
  providers: CloudProvider[],
  orgName: string
): CloudAccount[] => {
  const accounts: CloudAccount[] = [];
  const environments: Array<'production' | 'staging' | 'development'> = [
    'production',
    'staging',
    'development',
  ];
  const orgPrefix = orgName.toLowerCase().replace(/\s+/g, '-');

  // Ensure at least one account per provider for enterprise
  const accountsPerProvider = Math.max(1, Math.floor(count / providers.length));

  for (const provider of providers) {
    for (let i = 0; i < accountsPerProvider && accounts.length < count; i++) {
      const environment = environments[i % environments.length];
      accounts.push({
        id: generateAccountId(provider),
        name: `${orgPrefix}-${environment}-${provider}`,
        provider,
        environment,
      });
    }
  }

  return accounts;
};

/**
 * Generate account ID based on provider format
 */
const generateAccountId = (provider: CloudProvider): string => {
  switch (provider) {
    case 'aws':
      return faker.string.numeric(12);
    case 'gcp':
      return `${faker.word.adjective()}-${faker.word.noun()}-${faker.string.numeric(6)}`;
    case 'azure':
      return faker.string.uuid();
    default:
      return faker.string.uuid();
  }
};

/**
 * Generate cloud resources for all accounts
 */
const generateCloudResources = (
  accounts: CloudAccount[],
  multiplier: number,
  orgName: string
): CloudResource[] => {
  const resources: CloudResource[] = [];
  const orgPrefix = orgName.toLowerCase().replace(/\s+/g, '-');

  for (const account of accounts) {
    const resourceTypes = getResourcesForProvider(account.provider);

    for (const resourceType of resourceTypes) {
      // Skip IAM users as they're generated separately
      if (resourceType.subType.includes('IAM User')) continue;

      const count = Math.max(1, Math.round(resourceType.baseCount * multiplier));

      for (let i = 0; i < count; i++) {
        const region = faker.helpers.arrayElement(resourceType.regions);
        const resourceName = generateResourceName(resourceType, orgPrefix, account.environment);

        resources.push({
          id: generateResourceId(account.provider, resourceType.subType),
          name: resourceName,
          type: resourceType.type,
          subType: resourceType.subType,
          provider: account.provider,
          region,
          accountId: account.id,
          accountName: account.name,
          tags: {
            Environment: account.environment,
            Team: faker.helpers.arrayElement(['platform', 'backend', 'frontend', 'data', 'devops']),
            Service: faker.helpers.arrayElement(SERVICE_NAMES),
          },
        });
      }
    }
  }

  return resources;
};

/**
 * Generate a resource name based on type and org context
 */
const generateResourceName = (
  resourceType: { subType: string; namePrefix: string },
  orgPrefix: string,
  environment: string
): string => {
  const serviceName = faker.helpers.arrayElement(SERVICE_NAMES);
  const suffix = faker.string.alphanumeric(8).toLowerCase();

  // Special naming for S3 buckets (must be globally unique)
  if (resourceType.subType.includes('S3 Bucket')) {
    const purpose = faker.helpers.arrayElement(S3_BUCKET_PURPOSES);
    return `${orgPrefix}-${environment}-${purpose}-${suffix}`;
  }

  // Special naming for IAM roles
  if (resourceType.subType.includes('IAM Role')) {
    return faker.helpers.arrayElement(IAM_ROLE_NAMES);
  }

  // Default naming pattern
  return `${resourceType.namePrefix}${serviceName}-${environment}-${suffix}`;
};

/**
 * Generate resource ID based on provider format
 */
const generateResourceId = (provider: CloudProvider, subType: string): string => {
  switch (provider) {
    case 'aws':
      if (subType.includes('EC2 Instance')) return `i-${faker.string.alphanumeric(17)}`;
      if (subType.includes('S3 Bucket'))
        return `arn:aws:s3:::${faker.word.noun()}-${faker.string.alphanumeric(8)}`;
      if (subType.includes('RDS')) return `db-${faker.string.alphanumeric(26).toUpperCase()}`;
      if (subType.includes('Lambda'))
        return `arn:aws:lambda:us-east-1:${faker.string.numeric(12)}:function:${faker.word.noun()}`;
      if (subType.includes('EKS')) return faker.string.uuid();
      if (subType.includes('VPC')) return `vpc-${faker.string.alphanumeric(17)}`;
      if (subType.includes('EBS')) return `vol-${faker.string.alphanumeric(17)}`;
      if (subType.includes('SNS'))
        return `arn:aws:sns:us-east-1:${faker.string.numeric(12)}:${faker.word.noun()}`;
      if (subType.includes('Load Balancer'))
        return `arn:aws:elasticloadbalancing:us-east-1:${faker.string.numeric(12)}:loadbalancer/${faker.string.alphanumeric(12)}`;
      if (subType.includes('IAM Role'))
        return `arn:aws:iam::${faker.string.numeric(12)}:role/${faker.word.noun()}`;
      if (subType.includes('IAM Policy'))
        return `arn:aws:iam::${faker.string.numeric(12)}:policy/${faker.word.noun()}`;
      return `arn:aws:${faker.word.noun()}:us-east-1:${faker.string.numeric(12)}:${faker.string.alphanumeric(12)}`;

    case 'gcp':
      return `projects/${faker.word.noun()}/locations/${faker.helpers.arrayElement(['us-central1', 'us-east1', 'europe-west1'])}/${faker.string.alphanumeric(12)}`;

    case 'azure':
      return `/subscriptions/${faker.string.uuid()}/resourceGroups/${faker.word.noun()}/providers/Microsoft.Compute/${faker.string.alphanumeric(12)}`;

    default:
      return faker.string.uuid();
  }
};

/**
 * Generate cloud IAM users linked to employees with AWS access
 */
const generateCloudIamUsers = (employees: Employee[], accounts: CloudAccount[]): CloudIamUser[] => {
  const iamUsers: CloudIamUser[] = [];
  const awsAccounts = accounts.filter((a) => a.provider === 'aws');

  if (awsAccounts.length === 0) return iamUsers;

  // Get employees with AWS access (Product & Engineering)
  const awsEmployees = employees.filter((e) => e.hasAwsAccess);

  // Use the production account for federated users
  const prodAccount = awsAccounts.find((a) => a.environment === 'production') || awsAccounts[0];

  for (const employee of awsEmployees) {
    iamUsers.push({
      id: faker.string.alphanumeric(21).toUpperCase(),
      arn: `arn:aws:iam::${prodAccount.id}:user/${employee.userName}`,
      userName: employee.userName,
      provider: 'aws',
      accountId: prodAccount.id,
      isFederated: true,
      oktaUserId: employee.oktaUserId,
      createdAt: faker.date.past({ years: 2 }).toISOString(),
    });
  }

  // Add some service accounts (non-federated)
  const serviceAccountNames = [
    'terraform-automation',
    'ci-cd-pipeline',
    'monitoring-service',
    'backup-service',
    'log-shipper',
  ];

  for (const accountName of serviceAccountNames) {
    iamUsers.push({
      id: faker.string.alphanumeric(21).toUpperCase(),
      arn: `arn:aws:iam::${prodAccount.id}:user/${accountName}`,
      userName: accountName,
      provider: 'aws',
      accountId: prodAccount.id,
      isFederated: false,
      createdAt: faker.date.past({ years: 1 }).toISOString(),
    });
  }

  return iamUsers;
};

/**
 * Generate GitHub organization with repositories
 */
const generateGitHubOrg = (orgPrefix: string, size: string): GitHubOrg => {
  const repoCount = size === 'john_doe' || size === 'small' ? 5 : size === 'medium' ? 12 : 20;

  const repoTemplates = [
    { name: 'backend-api', lang: 'TypeScript', vis: 'private' as const },
    { name: 'frontend-app', lang: 'TypeScript', vis: 'private' as const },
    { name: 'mobile-app', lang: 'Swift', vis: 'private' as const },
    { name: 'infrastructure', lang: 'HCL', vis: 'private' as const },
    { name: 'data-pipeline', lang: 'Python', vis: 'private' as const },
    { name: 'docs', lang: 'Markdown', vis: 'internal' as const },
    { name: 'design-system', lang: 'TypeScript', vis: 'internal' as const },
    { name: 'sdk-node', lang: 'TypeScript', vis: 'public' as const },
    { name: 'sdk-python', lang: 'Python', vis: 'public' as const },
    { name: 'helm-charts', lang: 'YAML', vis: 'private' as const },
    { name: 'monitoring', lang: 'Go', vis: 'private' as const },
    { name: 'auth-service', lang: 'Go', vis: 'private' as const },
    { name: 'notification-service', lang: 'TypeScript', vis: 'private' as const },
    { name: 'billing-service', lang: 'TypeScript', vis: 'private' as const },
    { name: 'analytics-service', lang: 'Python', vis: 'private' as const },
    { name: 'ci-cd-pipelines', lang: 'YAML', vis: 'private' as const },
    { name: 'security-policies', lang: 'Rego', vis: 'private' as const },
    { name: 'ml-models', lang: 'Python', vis: 'private' as const },
    { name: 'integration-tests', lang: 'TypeScript', vis: 'private' as const },
    { name: 'landing-page', lang: 'TypeScript', vis: 'private' as const },
  ];

  const repos: GitHubRepo[] = repoTemplates.slice(0, repoCount).map((t) => ({
    id: faker.string.numeric(9),
    name: t.name,
    fullName: `${orgPrefix}/${t.name}`,
    visibility: t.vis,
    language: t.lang,
    defaultBranch: 'main',
  }));

  return { name: orgPrefix, repos };
};

/**
 * Generate Cloudflare zones for the organization's domains
 */
const generateCloudflareZones = (domain: string, size: string): CloudflareZone[] => {
  const zones: CloudflareZone[] = [];
  const baseDomain = domain;

  zones.push({
    id: faker.string.numeric(16),
    name: baseDomain,
    accountId: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
    accountName: baseDomain.split('.')[0],
    subdomains: ['api', 'app', 'www', 'docs', 'status'],
  });

  if (size === 'medium' || size === 'enterprise') {
    zones.push({
      id: faker.string.numeric(16),
      name: `${baseDomain.split('.')[0]}.io`,
      accountId: zones[0].accountId,
      accountName: zones[0].accountName,
      subdomains: ['developers', 'community'],
    });
  }

  if (size === 'enterprise') {
    zones.push({
      id: faker.string.numeric(16),
      name: `${baseDomain.split('.')[0]}-internal.com`,
      accountId: zones[0].accountId,
      accountName: zones[0].accountName,
      subdomains: ['vpn', 'wiki', 'jira', 'confluence'],
    });
  }

  return zones;
};

/**
 * Generate 1Password vaults for the organization
 */
const generateOnePasswordVaults = (): OnePasswordVault[] => {
  return [
    {
      id: faker.string.uuid(),
      name: 'Shared',
      description: 'Organization-wide shared credentials',
      type: 'shared',
    },
    {
      id: faker.string.uuid(),
      name: 'Engineering',
      description: 'Engineering team credentials and API keys',
      type: 'department',
    },
    {
      id: faker.string.uuid(),
      name: 'Infrastructure',
      description: 'Infrastructure and cloud provider credentials',
      type: 'infrastructure',
    },
    {
      id: faker.string.uuid(),
      name: 'Sales & Marketing',
      description: 'Sales and marketing tool credentials',
      type: 'department',
    },
    {
      id: faker.string.uuid(),
      name: 'Executive',
      description: 'Executive team secure credentials',
      type: 'department',
    },
    {
      id: faker.string.uuid(),
      name: 'Operations',
      description: 'Operations and HR tool credentials',
      type: 'department',
    },
  ];
};

/**
 * Get employee count for a given size
 */
export const getEmployeeCountForSize = (size: OrganizationSize, seed?: number): number => {
  if (seed !== undefined) {
    faker.seed(seed);
  }
  const sizeConfig = SIZE_CONFIGS[size];
  return faker.number.int({
    min: sizeConfig.employeeRange.min,
    max: sizeConfig.employeeRange.max,
  });
};

/**
 * Get organization summary for logging
 */
export const getOrganizationSummary = (org: Organization): string => {
  const awsEmployees = org.employees.filter((e) => e.hasAwsAccess).length;
  const resourcesByProvider = org.cloudResources.reduce(
    (acc, r) => {
      acc[r.provider] = (acc[r.provider] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return `
Organization: ${org.name}
Domain: ${org.domain}
Size: ${org.size}

Employees: ${org.employees.length}
  - With AWS Access: ${awsEmployees}
  - By Department:
${org.departments.map((d) => `    - ${d.name}: ${org.employees.filter((e) => e.department === d.name).length}`).join('\n')}

Devices: ${org.employees.reduce((sum, e) => sum + e.devices.length, 0)}

Hosts: ${org.hosts.length}

Cloud Accounts: ${org.cloudAccounts.length}

Cloud Resources: ${org.cloudResources.length}
  - By Provider:
${Object.entries(resourcesByProvider)
  .map(([p, c]) => `    - ${p.toUpperCase()}: ${c}`)
  .join('\n')}

IAM Users: ${org.cloudIamUsers.length}
  - Federated: ${org.cloudIamUsers.filter((u) => u.isFederated).length}
  - Service Accounts: ${org.cloudIamUsers.filter((u) => !u.isFederated).length}

Okta Groups: ${org.oktaGroups.length}

Entra ID Groups: ${org.entraIdGroups.length}
  - Department: ${org.entraIdGroups.filter((g) => g.type === 'department').length}
  - Access: ${org.entraIdGroups.filter((g) => g.type === 'access').length}
  - Device: ${org.entraIdGroups.filter((g) => g.type === 'device').length}

GitHub Organization: ${org.githubOrg.name}
  - Repositories: ${org.githubOrg.repos.length}
  - Employees with GitHub access: ${org.employees.filter((e) => e.githubUsername).length}

Cloudflare Zones: ${org.cloudflareZones.length}
  - Domains: ${org.cloudflareZones.map((z) => z.name).join(', ')}

1Password Vaults: ${org.onePasswordVaults.length}

Productivity Suite: ${org.productivitySuite === 'microsoft' ? 'Microsoft 365' : 'Google Workspace'}
`.trim();
};
