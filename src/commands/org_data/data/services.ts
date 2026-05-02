/**
 * Service catalog: platform services, SaaS apps, and org-owned microservice
 * templates used by `generateServices()` in `org_data_generator.ts`.
 *
 * Cloud platform service identifiers mirror the actual eventSource / serviceName
 * strings emitted by AWS CloudTrail, GCP Audit Logs, and Azure Activity Logs so
 * the cloudtrail/gcp/azure integrations can look services up by these IDs.
 */

import { type CloudProvider, type ProductivitySuite, type ServiceKind } from '../types.ts';

/**
 * Template used to seed `Service` entities in the org. The generator decorates
 * these with `entityId` and (for org_service) `ownerEmployeeId` / `hostIds`.
 */
export interface ServiceTemplate {
  id: string;
  name: string;
  kind: ServiceKind;
  provider?: CloudProvider;
}

/**
 * Cloud platform services keyed by provider. The `id` matches the actual
 * eventSource string emitted by each provider's audit log so a single Map
 * lookup by eventSource resolves the service entity at integration time.
 */
export const CLOUD_PLATFORM_SERVICES: Record<CloudProvider, ServiceTemplate[]> = {
  aws: [
    { id: 'ec2.amazonaws.com', name: 'Amazon EC2', kind: 'cloud_platform', provider: 'aws' },
    { id: 's3.amazonaws.com', name: 'Amazon S3', kind: 'cloud_platform', provider: 'aws' },
    { id: 'rds.amazonaws.com', name: 'Amazon RDS', kind: 'cloud_platform', provider: 'aws' },
    { id: 'lambda.amazonaws.com', name: 'AWS Lambda', kind: 'cloud_platform', provider: 'aws' },
    { id: 'iam.amazonaws.com', name: 'AWS IAM', kind: 'cloud_platform', provider: 'aws' },
    { id: 'sts.amazonaws.com', name: 'AWS STS', kind: 'cloud_platform', provider: 'aws' },
    {
      id: 'cloudtrail.amazonaws.com',
      name: 'AWS CloudTrail',
      kind: 'cloud_platform',
      provider: 'aws',
    },
    { id: 'kms.amazonaws.com', name: 'AWS KMS', kind: 'cloud_platform', provider: 'aws' },
    {
      id: 'ssm.amazonaws.com',
      name: 'AWS Systems Manager',
      kind: 'cloud_platform',
      provider: 'aws',
    },
    {
      id: 'ec2-instance-connect.amazonaws.com',
      name: 'AWS EC2 Instance Connect',
      kind: 'cloud_platform',
      provider: 'aws',
    },
    {
      id: 'signin.amazonaws.com',
      name: 'AWS Console Sign-in',
      kind: 'cloud_platform',
      provider: 'aws',
    },
  ],
  gcp: [
    {
      id: 'compute.googleapis.com',
      name: 'Compute Engine',
      kind: 'cloud_platform',
      provider: 'gcp',
    },
    {
      id: 'storage.googleapis.com',
      name: 'Cloud Storage',
      kind: 'cloud_platform',
      provider: 'gcp',
    },
    { id: 'iam.googleapis.com', name: 'Cloud IAM', kind: 'cloud_platform', provider: 'gcp' },
    {
      id: 'cloudresourcemanager.googleapis.com',
      name: 'Resource Manager',
      kind: 'cloud_platform',
      provider: 'gcp',
    },
    { id: 'bigquery.googleapis.com', name: 'BigQuery', kind: 'cloud_platform', provider: 'gcp' },
    {
      id: 'container.googleapis.com',
      name: 'Kubernetes Engine',
      kind: 'cloud_platform',
      provider: 'gcp',
    },
    { id: 'sqladmin.googleapis.com', name: 'Cloud SQL', kind: 'cloud_platform', provider: 'gcp' },
    {
      id: 'logging.googleapis.com',
      name: 'Cloud Logging',
      kind: 'cloud_platform',
      provider: 'gcp',
    },
  ],
  azure: [
    { id: 'Microsoft.Compute', name: 'Azure Compute', kind: 'cloud_platform', provider: 'azure' },
    { id: 'Microsoft.Storage', name: 'Azure Storage', kind: 'cloud_platform', provider: 'azure' },
    {
      id: 'Microsoft.KeyVault',
      name: 'Azure Key Vault',
      kind: 'cloud_platform',
      provider: 'azure',
    },
    { id: 'Microsoft.Sql', name: 'Azure SQL', kind: 'cloud_platform', provider: 'azure' },
    { id: 'Microsoft.Network', name: 'Azure Network', kind: 'cloud_platform', provider: 'azure' },
    {
      id: 'Microsoft.Authorization',
      name: 'Azure RBAC',
      kind: 'cloud_platform',
      provider: 'azure',
    },
  ],
};

/**
 * SaaS apps every modeled org subscribes to. These are the apps that appear
 * as service principals in Azure sign-in logs and SAML applications in
 * Google Workspace SAML logs.
 */
export const SAAS_APP_CATALOG: ServiceTemplate[] = [
  { id: 'salesforce', name: 'Salesforce', kind: 'saas_app' },
  { id: 'github', name: 'GitHub Enterprise', kind: 'saas_app' },
  { id: 'slack', name: 'Slack', kind: 'saas_app' },
  { id: 'zoom', name: 'Zoom', kind: 'saas_app' },
  { id: 'snowflake', name: 'Snowflake', kind: 'saas_app' },
  { id: 'atlassian', name: 'Atlassian Cloud', kind: 'saas_app' },
  { id: 'servicenow', name: 'ServiceNow', kind: 'saas_app' },
  { id: 'workday', name: 'Workday', kind: 'saas_app' },
  { id: 'box', name: 'Box', kind: 'saas_app' },
];

/**
 * Productivity-suite SaaS app. Swaps based on `productivitySuite`.
 */
export const PRODUCTIVITY_SAAS_APPS: Record<ProductivitySuite, ServiceTemplate> = {
  microsoft: { id: 'microsoft-365', name: 'Microsoft 365', kind: 'saas_app' },
  google: { id: 'google-workspace', name: 'Google Workspace', kind: 'saas_app' },
};

/**
 * Identity provider templates. Org gets exactly one identity provider service,
 * matched to the productivity suite by convention (Entra ID + M365, Okta + Google).
 */
export const IDP_TEMPLATES: Record<ProductivitySuite, ServiceTemplate> = {
  microsoft: { id: 'entra_id', name: 'Microsoft Entra ID', kind: 'identity_provider' },
  google: { id: 'okta', name: 'Okta', kind: 'identity_provider' },
};

/**
 * Org-owned microservice templates. Only instantiated for medium/enterprise orgs.
 * `ownedByDepartment` hints at the team that owns the service so the generator
 * can pick a sensible owner employee.
 */
export interface OrgServiceTemplate extends ServiceTemplate {
  kind: 'org_service';
  ownedByDepartment: 'Product & Engineering' | 'Operations';
}

export const ORG_SERVICE_TEMPLATES: OrgServiceTemplate[] = [
  {
    id: 'checkout-api',
    name: 'Checkout API',
    kind: 'org_service',
    ownedByDepartment: 'Product & Engineering',
  },
  {
    id: 'payments-svc',
    name: 'Payments Service',
    kind: 'org_service',
    ownedByDepartment: 'Product & Engineering',
  },
  {
    id: 'auth-gateway',
    name: 'Auth Gateway',
    kind: 'org_service',
    ownedByDepartment: 'Product & Engineering',
  },
  {
    id: 'data-pipeline',
    name: 'Data Pipeline',
    kind: 'org_service',
    ownedByDepartment: 'Product & Engineering',
  },
  {
    id: 'notification-svc',
    name: 'Notification Service',
    kind: 'org_service',
    ownedByDepartment: 'Product & Engineering',
  },
  {
    id: 'monitoring-platform',
    name: 'Monitoring Platform',
    kind: 'org_service',
    ownedByDepartment: 'Operations',
  },
  {
    id: 'vpn-gateway',
    name: 'VPN Gateway',
    kind: 'org_service',
    ownedByDepartment: 'Operations',
  },
  {
    id: 'internal-portal',
    name: 'Internal Portal',
    kind: 'org_service',
    ownedByDepartment: 'Operations',
  },
];

/**
 * Build a deterministic entity ID for a service. The format mirrors the
 * convention used elsewhere for typed entities (user.entity.id / host.entity.id):
 * `service:<kind>:<id>` for global services, with `@<orgname>` appended for
 * org-owned services so two different orgs don't collide on `checkout-api`.
 */
export const buildServiceEntityId = (kind: ServiceKind, id: string, orgName: string): string => {
  if (kind === 'org_service') {
    const suffix = orgName.toLowerCase().replace(/\s+/g, '-');
    return `service:org_service:${id}@${suffix}`;
  }
  return `service:${kind}:${id}`;
};
