/**
 * Types for SaaS Organization Security Integration Simulation
 */

// Organization size options
export type OrganizationSize = 'john_doe' | 'small' | 'medium' | 'enterprise';

// Cloud provider types
export type CloudProvider = 'aws' | 'gcp' | 'azure';

// Device platform types
export type LaptopPlatform = 'mac' | 'windows' | 'linux';
export type MobilePlatform = 'android' | 'ios';
export type DevicePlatform = LaptopPlatform | MobilePlatform;
export type DeviceType = 'laptop' | 'mobile';

// Department names as a union type for type safety
export type DepartmentName =
  | 'Product & Engineering'
  | 'Sales & Marketing'
  | 'Customer Success'
  | 'Operations'
  | 'Executive';

// Productivity suite type (Microsoft 365 vs Google Workspace)
export type ProductivitySuite = 'microsoft' | 'google';

/**
 * Device assigned to an employee
 */
export interface Device {
  id: string;
  type: DeviceType;
  platform: DevicePlatform;
  serialNumber: string;
  displayName: string;
  registered: boolean;
  diskEncryptionEnabled: boolean;
  crowdstrikeAgentId: string;
  crowdstrikeDeviceId: string;
  macAddress: string;
  ipAddress: string;
}

/**
 * Employee in the organization
 */
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  department: DepartmentName;
  role: string;
  country: string;
  countryCode: string;
  city: string;
  timezone: string;
  devices: Device[];
  hasAwsAccess: boolean;
  managerId?: string;
  oktaUserId: string;
  entraIdUserId: string;
  employeeNumber: string;
  githubUsername?: string; // Only for Engineering + Executive departments
  duoUserId: string;
  onePasswordUuid: string;
  windowsSid: string;
  unixUid: number;
}

/**
 * Department definition with employee distribution
 */
export interface Department {
  name: DepartmentName;
  percentage: number; // Percentage of total employees
  roles: string[];
  hasCloudAccess: boolean;
}

/**
 * Host/server in the organization's infrastructure
 */
export interface Host {
  id: string;
  name: string;
  type: 'server' | 'container' | 'virtual_machine';
  cloudProvider: CloudProvider;
  region: string;
  purpose: string;
  os: {
    name: string;
    version: string;
    family: string;
  };
}

/**
 * Cloud account configuration
 */
export interface CloudAccount {
  id: string;
  name: string;
  provider: CloudProvider;
  environment: 'production' | 'staging' | 'development';
}

/**
 * Cloud resource in the organization's infrastructure
 */
export interface CloudResource {
  id: string;
  name: string;
  type: string;
  subType: string;
  provider: CloudProvider;
  region: string;
  accountId: string;
  accountName: string;
  tags?: Record<string, string>;
}

/**
 * IAM User in cloud provider (correlated with Okta users)
 */
export interface CloudIamUser {
  id: string;
  arn: string;
  userName: string;
  provider: CloudProvider;
  accountId: string;
  isFederated: boolean;
  oktaUserId?: string; // Link to Okta user for federated users
  createdAt: string;
}

/**
 * GitHub repository in the organization
 */
export interface GitHubRepo {
  id: string;
  name: string;
  fullName: string; // org/repo format
  visibility: 'private' | 'internal' | 'public';
  language: string;
  defaultBranch: string;
}

/**
 * Cloudflare zone (protected domain)
 */
export interface CloudflareZone {
  id: string;
  name: string; // domain name
  accountId: string;
  accountName: string;
  subdomains: string[]; // e.g. ['api', 'app', 'www', 'docs']
}

/**
 * 1Password vault
 */
export interface OnePasswordVault {
  id: string;
  name: string;
  description: string;
  type: 'shared' | 'department' | 'infrastructure';
}

/**
 * GitHub organization info
 */
export interface GitHubOrg {
  name: string;
  repos: GitHubRepo[];
}

/**
 * Organization configuration
 */
export interface OrganizationConfig {
  name: string;
  domain: string;
  size: OrganizationSize;
  seed?: number;
  productivitySuite?: ProductivitySuite;
}

/**
 * Complete organization model
 */
export interface Organization {
  name: string;
  domain: string;
  size: OrganizationSize;
  departments: Department[];
  employees: Employee[];
  hosts: Host[];
  cloudAccounts: CloudAccount[];
  cloudResources: CloudResource[];
  cloudIamUsers: CloudIamUser[];
  oktaGroups: OktaGroup[];
  entraIdGroups: EntraIdGroup[];
  githubOrg: GitHubOrg;
  cloudflareZones: CloudflareZone[];
  onePasswordVaults: OnePasswordVault[];
  productivitySuite: ProductivitySuite;
}

/**
 * Okta group (maps to departments + special access groups)
 */
export interface OktaGroup {
  id: string;
  name: string;
  description: string;
  type: 'department' | 'access';
}

/**
 * Entra ID group (maps to departments + special access groups)
 */
export interface EntraIdGroup {
  id: string;
  name: string;
  description: string;
  type: 'department' | 'access' | 'device';
}

/**
 * Size-based configuration
 */
export interface SizeConfig {
  employeeRange: { min: number; max: number };
  hostRange: { min: number; max: number };
  cloudAccounts: number;
  cloudProviders: CloudProvider[];
  resourceMultiplier: number;
}

/**
 * Size configurations map
 */
export const SIZE_CONFIGS: Record<OrganizationSize, SizeConfig> = {
  john_doe: {
    employeeRange: { min: 1, max: 1 },
    hostRange: { min: 5, max: 15 },
    cloudAccounts: 1,
    cloudProviders: ['aws'],
    resourceMultiplier: 1,
  },
  small: {
    employeeRange: { min: 10, max: 50 },
    hostRange: { min: 5, max: 15 },
    cloudAccounts: 1,
    cloudProviders: ['aws'],
    resourceMultiplier: 1,
  },
  medium: {
    employeeRange: { min: 51, max: 200 },
    hostRange: { min: 15, max: 50 },
    cloudAccounts: 3,
    cloudProviders: ['aws'],
    resourceMultiplier: 2,
  },
  enterprise: {
    employeeRange: { min: 201, max: 1000 },
    hostRange: { min: 50, max: 200 },
    cloudAccounts: 6,
    cloudProviders: ['aws', 'gcp', 'azure'],
    resourceMultiplier: 5,
  },
};

/**
 * Integration document types
 */
export interface OktaUserDocument {
  [key: string]: unknown;
  '@timestamp': string;
  event: {
    action: string;
    kind: string;
    dataset: string;
    category?: string[];
    type?: string[];
  };
  entityanalytics_okta: {
    user: {
      id: string;
      status: string;
      created?: string;
      activated?: string;
      status_changed?: string;
      last_login?: string;
      last_updated?: string;
      password_changed?: string;
      type?: Record<string, unknown>;
      transitioning_to_status?: string;
      profile: {
        login: string;
        email: string;
        first_name: string;
        last_name: string;
        middle_name?: string;
        nick_name?: string;
        display_name?: string;
        second_email?: string;
        primary_phone?: string;
        mobile_phone?: string;
        street_address?: string;
        city?: string;
        state?: string;
        zip_code?: string;
        postal_address?: string;
        country_code?: string;
        preferred_language?: string;
        locale?: string;
        timezone?: string;
        user_type?: string;
        employee_number?: string;
        cost_center?: string;
        organization?: string;
        division?: string;
        department?: string;
        title?: string;
        honorific?: {
          prefix?: string;
          suffix?: string;
        };
        url?: string;
        manager?: {
          id?: string;
          name?: string;
        };
      };
      credentials?: {
        provider: {
          type: string;
          name: string;
        };
        recovery_question?: {
          is_set: boolean;
        };
      };
      _links?: {
        self: {
          href: string;
        };
      };
      _embedded?: Record<string, unknown>;
    };
    groups?: Array<{
      id: string;
      profile: {
        name: string;
        description?: string;
      };
    }>;
    roles?: Array<{
      id: string;
      label: string;
      type: string;
      status: string;
      assignment_type: string;
      created?: string;
      last_updated?: string;
    }>;
    factors?: Array<{
      id: string;
      factorType: string;
      provider: string;
      vendorName: string;
      status: string;
      created?: string;
      lastUpdated?: string;
      profile?: Record<string, unknown>;
    }>;
  };
  user: {
    id: string;
    name: string;
    email: string;
    full_name?: string;
    roles?: string[];
    profile?: {
      department?: string;
      job_title?: string;
      first_name?: string;
      last_name?: string;
      status?: string;
      id?: string;
      type?: string;
      mobile_phone?: string;
      primaryPhone?: string;
      other_identities?: string;
      secondEmail?: string;
      manager?: string;
    };
    account?: {
      create_date?: string;
      activated_date?: string;
      change_date?: string;
      password_change_date?: string;
      status?: {
        password_expired?: boolean;
        deprovisioned?: boolean;
        locked_out?: boolean;
        recovery?: boolean;
        suspended?: boolean;
      };
    };
    geo?: {
      name?: string;
      city_name?: string;
      region_name?: string;
      postal_code?: string;
      country_iso_code?: string;
      timezone?: string;
    };
    organization?: {
      name?: string;
    };
    group?: {
      name?: string[];
      id?: string[];
    };
  };
  asset?: {
    id: string;
    category: string;
    type: string;
    status: string;
    name?: string;
    vendor?: string;
    costCenter?: string;
    create_date?: string;
    last_updated?: string;
    last_seen?: string;
    last_status_change_date?: string;
  };
  labels: {
    identity_source: string;
  };
  related?: {
    user?: string[];
  };
  data_stream?: {
    namespace: string;
    type: string;
    dataset: string;
  };
  host?: {
    name?: string;
  };
  tags?: string[];
}

export interface OktaDeviceDocument {
  [key: string]: unknown;
  '@timestamp': string;
  event: {
    action: string;
    kind: string;
    dataset: string;
    category?: string[];
    type?: string[];
  };
  entityanalytics_okta: {
    device: {
      id: string;
      status: string;
      created?: string;
      activated?: string;
      status_changed?: string;
      last_updated?: string;
      transitioning_to_status?: string;
      resourceAlternateID?: string;
      resourceDisplayName?: {
        sensitive: boolean;
        value: string;
      };
      resourceID?: string;
      resourceType?: string;
      profile: {
        display_name?: string;
        displayName?: string;
        platform: string;
        serialNumber?: string;
        sid?: string;
        disk_encryption_type?: string;
        diskEncryptionType?: string;
        registered?: boolean;
        secure_hardware_present?: boolean;
        secureHardwarePresent?: boolean;
      };
      users?: Array<{
        id: string;
        status: string;
        profile: {
          login: string;
          email: string;
          firstName: string;
          lastName: string;
          displayName?: string;
          nickName?: string;
        };
      }>;
      _links?: Record<string, unknown>;
      _embedded?: Record<string, unknown>;
    };
  };
  os?: {
    platform?: string;
  };
  device: {
    id: string;
    serial_number?: string;
  };
  asset?: {
    id: string;
    category: string;
    type: string;
    status: string;
    name?: string;
    create_date?: string;
    last_updated?: string;
    last_status_change_date?: string;
  };
  labels: {
    identity_source: string;
  };
  related?: {
    user?: string[];
  };
  data_stream?: {
    namespace: string;
    type: string;
    dataset: string;
  };
  tags?: string[];
}

export interface OktaSyncMarkerDocument {
  [key: string]: unknown;
  '@timestamp': string;
  event: {
    action: 'started' | 'completed';
    kind: string;
    dataset: string;
    start?: string;
    end?: string;
  };
  labels: {
    identity_source: string;
  };
}

/**
 * Entra ID User Document
 *
 * Indexed through the entity data stream. Contains only the raw fields that
 * real Filebeat publishUser() outputs. The entity ingest pipeline handles
 * ECS enrichment (event.kind, event.category, event.type, etc.), field
 * renaming (azure_ad -> entityanalytics_entra_id.user), and rerouting to
 * the user data stream.
 */
export interface EntraIdUserDocument {
  [key: string]: unknown;
  '@timestamp': string;
  azure_ad: {
    userPrincipalName: string;
    mail: string;
    displayName: string;
    givenName: string;
    surname: string;
    jobTitle?: string;
    department?: string;
    officeLocation?: string;
    mobilePhone?: string;
    businessPhones?: string[];
    accountEnabled: boolean;
  };
  event: {
    action: string;
  };
  user: {
    id: string;
    group?: Array<{
      id: string;
      name: string;
    }>;
  };
  labels: {
    identity_source: string;
  };
  tags?: string[];
}

/**
 * Entra ID Device Document
 *
 * Indexed through the entity data stream. Contains only the raw fields that
 * real Filebeat publishDevice() outputs. The entity ingest pipeline handles
 * ECS enrichment and rerouting to the device data stream.
 */
export interface EntraIdDeviceDocument {
  [key: string]: unknown;
  '@timestamp': string;
  azure_ad: {
    accountEnabled: boolean;
    displayName: string;
    operatingSystem: string;
    operatingSystemVersion: string;
    manufacturer?: string;
    model?: string;
    isManaged?: boolean;
    isCompliant?: boolean;
    trustType?: string;
    deviceId?: string;
    registrationDateTime?: string;
    approximateLastSignInDateTime?: string;
    onPremisesSyncEnabled?: boolean;
    physicalIds?: string[];
    extensionAttributes?: Record<string, unknown>;
    alternativeSecurityIds?: Array<{ type: number; identityProvider?: string; key?: string }>;
  };
  event: {
    action: string;
  };
  device: {
    id: string;
    group?: Array<{
      id: string;
      name: string;
    }>;
    registered_owners?: Array<{
      id: string;
      userPrincipalName: string;
      mail: string;
      displayName: string;
      givenName: string;
      surname: string;
      jobTitle?: string;
      mobilePhone?: string;
      businessPhones?: string[];
    }>;
    registered_users?: Array<{
      id: string;
      userPrincipalName: string;
      mail: string;
      displayName: string;
      givenName: string;
      surname: string;
      jobTitle?: string;
      mobilePhone?: string;
      businessPhones?: string[];
    }>;
  };
  labels: {
    identity_source: string;
  };
  tags?: string[];
}

/**
 * Entra ID Sync Marker Document
 */
export interface EntraIdSyncMarkerDocument {
  [key: string]: unknown;
  '@timestamp': string;
  event: {
    action: 'started' | 'completed';
    kind: string;
    dataset: string;
    start?: string;
    end?: string;
  };
  labels: {
    identity_source: string;
  };
}

/**
 * Cloud Asset Document matching cloudbeat's AssetEvent structure
 * (see cloudbeat/internal/inventory/asset.go and inventory.go)
 */
export interface CloudAssetDocument {
  [key: string]: unknown;
  '@timestamp': string;
  event: {
    kind: string; // Always "asset" in cloudbeat
  };
  cloud?: {
    provider: string;
    region?: string;
    availability_zone?: string;
    account?: {
      id: string;
      name: string;
    };
    instance?: {
      id?: string;
      name?: string;
    };
    machine?: {
      type?: string;
    };
    service?: {
      name?: string;
    };
    project?: {
      id?: string;
      name?: string;
    };
  };
  entity: {
    id: string;
    name: string;
    type: string; // AssetType category (e.g., "Host", "Storage Bucket", "Database")
    sub_type: string; // AssetSubType (e.g., "AWS EC2 Instance", "GCP Bucket")
    source?: string; // Cloud provider ("aws", "gcp", "azure")
  };
  host?: {
    id?: string;
    name?: string;
    architecture?: string;
    type?: string;
    ip?: string;
    mac?: string[];
  };
  network?: {
    name?: string;
    direction?: string;
    type?: string;
  };
  user?: {
    id?: string;
    name?: string;
    email?: string;
    roles?: string[];
  };
  organization?: {
    id?: string;
    name?: string;
  };
  orchestrator?: {
    'cluster.id'?: string;
    'cluster.name'?: string;
    type?: string;
  };
  container?: {
    id?: string;
    name?: string;
    'image.name'?: string;
  };
  fass?: {
    name?: string;
    version?: string;
  };
  url?: {
    full?: string;
  };
  group?: {
    id?: string;
    name?: string;
    domain?: string;
  };
  labels?: Record<string, string>;
  tags?: string[];
  related?: {
    entity: string[];
  };
  data_stream?: {
    dataset: string;
    namespace: string;
    type: string;
  };
}

/**
 * Okta System Log Document (okta.system data stream)
 * Represents authentication and activity events from Okta
 */
export interface OktaSystemLogDocument {
  [key: string]: unknown;
  '@timestamp': string;
  event: {
    action: string;
    category: string[];
    type: string[];
    outcome: 'success' | 'failure' | 'unknown';
    id: string;
    kind: string;
    dataset: string;
  };
  okta: {
    actor: {
      id: string;
      type: string;
      alternate_id: string;
      display_name: string;
    };
    event_type: string;
    display_message: string;
    outcome: {
      result: string;
      reason?: string;
    };
    severity: string;
    client: {
      ip: string;
      device: string;
      user_agent: {
        browser: string;
        os: string;
        raw_user_agent: string;
      };
      zone: string;
    };
    authentication_context: {
      authentication_step: number;
      external_session_id: string;
      credential_type?: string;
      credential_provider?: string;
    };
    debug_context?: {
      debug_data: {
        request_id: string;
        request_uri: string;
        url: string;
        device_fingerprint?: string;
        threat_suspected?: string;
      };
    };
    transaction: {
      id: string;
      type: string;
    };
    uuid: string;
    target?: Array<{
      id: string;
      type: string;
      alternate_id?: string;
      display_name?: string;
    }>;
  };
  client: {
    ip: string;
    geo: {
      city_name: string;
      country_name: string;
      region_name: string;
      location: {
        lat: number;
        lon: number;
      };
    };
    user: {
      id: string;
      name: string;
      email: string;
      full_name: string;
    };
  };
  source: {
    ip: string;
    user: {
      id: string;
      name: string;
      email: string;
      full_name: string;
    };
  };
  user: {
    name: string;
    email: string;
    full_name: string;
  };
  user_agent: {
    original: string;
    name: string;
    os: {
      name: string;
      full?: string;
      version?: string;
    };
    device?: {
      name: string;
    };
    version?: string;
  };
  related: {
    ip: string[];
    user: string[];
  };
  data_stream: {
    namespace: string;
    type: string;
    dataset: string;
  };
  tags: string[];
}

/**
 * AWS CloudTrail Document (aws.cloudtrail data stream)
 * Represents API calls and events from AWS CloudTrail
 */
export interface CloudTrailDocument {
  [key: string]: unknown;
  '@timestamp': string;
  event: {
    action: string;
    provider: string;
    category: string[];
    type: string[];
    outcome: 'success' | 'failure' | 'unknown';
    kind: string;
    dataset: string;
  };
  aws: {
    cloudtrail: {
      event_version: string;
      user_identity: {
        type: string;
        principal_id?: string;
        arn?: string;
        account_id: string;
        access_key_id?: string;
        user_name?: string;
        session_context?: {
          attributes?: {
            mfa_authenticated?: string;
            creation_date?: string;
          };
          session_issuer?: {
            type?: string;
            principal_id?: string;
            arn?: string;
            account_id?: string;
            user_name?: string;
          };
        };
      };
      event_source: string;
      event_name: string;
      event_id: string;
      event_type: string;
      aws_region: string;
      source_ip_address: string;
      user_agent: string;
      request_parameters?: Record<string, unknown>;
      response_elements?: Record<string, unknown>;
      additional_eventdata?: Record<string, unknown>;
      error_code?: string;
      error_message?: string;
      resources?: Array<{
        arn?: string;
        account_id?: string;
        type?: string;
      }>;
      recipient_account_id: string;
    };
  };
  cloud: {
    provider: 'aws';
    account: {
      id: string;
      name?: string;
    };
    region: string;
    service?: {
      name: string;
    };
  };
  user?: {
    name?: string;
    id?: string;
  };
  source: {
    ip: string;
    address: string;
    geo?: {
      city_name?: string;
      country_name?: string;
      country_iso_code?: string;
      region_name?: string;
      location?: {
        lat: number;
        lon: number;
      };
    };
  };
  user_agent: {
    original: string;
    name?: string;
    os?: {
      name?: string;
    };
  };
  related: {
    user: string[];
    ip?: string[];
    entity?: string[];
  };
  data_stream: {
    namespace: string;
    type: string;
    dataset: string;
  };
  tags: string[];
}

/**
 * CloudTrail user identity types
 */
export type CloudTrailUserIdentityType =
  | 'IAMUser'
  | 'AssumedRole'
  | 'FederatedUser'
  | 'Root'
  | 'AWSService';

/**
 * Okta system log event types
 */
export type OktaSystemEventType =
  | 'user.session.start'
  | 'user.session.end'
  | 'user.authentication.sso'
  | 'user.authentication.auth_via_mfa'
  | 'policy.evaluate_sign_on'
  | 'group.user_membership.add'
  | 'application.user_membership.add';

/**
 * Command options for organization
 */
export interface OrganizationOptions {
  size: OrganizationSize;
  name: string;
  space: string;
  seed?: number;
  integrations: string;
  employeeCount?: number;
  productivitySuite?: ProductivitySuite;
  all?: boolean;
  detectionRules?: boolean;
}

/**
 * Integration names supported
 */
export type IntegrationName =
  | 'okta'
  | 'cloud_asset'
  | 'okta_system'
  | 'cloudtrail'
  | 'entra_id'
  | 'crowdstrike'
  | 'o365'
  | 'github'
  | 'cisco_duo'
  | '1password'
  | 'google_workspace'
  | 'cloudflare_logpush'
  | 'zscaler_zia'
  | 'ti_abusech'
  | 'jamf_pro'
  | 'active_directory'
  | 'servicenow'
  | 'slack'
  | 'sailpoint'
  | 'ping_one'
  | 'workday'
  | 'ping_directory'
  | 'system'
  | 'endpoint';

/**
 * @deprecated Legacy type from entityanalytics_jamf integration.
 * The jamf_pro integration now uses inline IntegrationDocument types.
 */
export interface JamfDeviceDocument {
  [key: string]: unknown;
  '@timestamp': string;
  jamf: {
    location?: {
      username?: string;
      realName?: string;
      emailAddress?: string;
      position?: string;
      phoneNumber?: string;
      department?: string;
      building?: string;
      room?: string;
    };
    site?: string;
    name?: string;
    udid?: string;
    serialNumber?: string;
    operatingSystemVersion?: string;
    operatingSystemBuild?: string;
    operatingSystemSupplementalBuildVersion?: string;
    operatingSystemRapidSecurityResponse?: string;
    macAddress?: string;
    assetTag?: string;
    modelIdentifier?: string;
    mdmAccessRights?: number;
    lastContactDate?: string;
    lastReportDate?: string;
    lastEnrolledDate?: string;
    ipAddress?: string;
    managementId?: string;
    isManaged?: boolean;
  };
  event: {
    action: string;
    kind?: string;
    category?: string[];
    type?: string[];
  };
  device: {
    id: string;
  };
  labels: {
    identity_source: string;
  };
  data_stream?: {
    namespace: string;
    type: string;
    dataset: string;
  };
  tags?: string[];
}

/**
 * Active Directory User/Device Document (entityanalytics_ad.entity data stream)
 * Represents LDAP entries from Active Directory
 */
export interface ActiveDirectoryDocument {
  [key: string]: unknown;
  '@timestamp': string;
  activedirectory: Record<string, unknown>;
  event: {
    action: string;
    kind?: string;
    category?: string[];
    type?: string[];
  };
  user?: {
    id: string;
  };
  device?: {
    id: string;
  };
  labels: {
    identity_source: string;
  };
  data_stream?: {
    namespace: string;
    type: string;
    dataset: string;
  };
  tags?: string[];
}

/**
 * Correlation map for cross-integration data linking
 */
export interface CorrelationMap {
  oktaUserIdToEmployee: Map<string, Employee>;
  employeeIdToOktaUserId: Map<string, string>;
  awsUserToOktaUser: Map<string, string>;
  departmentToOktaGroup: Map<DepartmentName, OktaGroup>;
  entraIdUserIdToEmployee: Map<string, Employee>;
  departmentToEntraIdGroup: Map<DepartmentName, EntraIdGroup>;
  githubUsernameToEmployee: Map<string, Employee>;
  duoUserIdToEmployee: Map<string, Employee>;
  onePasswordUuidToEmployee: Map<string, Employee>;
  crowdstrikeAgentIdToDevice: Map<string, { employee: Employee; device: Device }>;
  jamfUdidToDevice: Map<string, { employee: Employee; device: Device }>;
  adDnToEmployee: Map<string, Employee>;
  windowsSidToEmployee: Map<string, Employee>;
}
