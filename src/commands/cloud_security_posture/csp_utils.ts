import { faker } from '@faker-js/faker';

// CSPM: Cloud providers and their CIS benchmarks (versions from actual ES data)
export const CSPM_PROVIDERS = {
  aws: { benchmarkId: 'cis_aws', name: 'CIS Amazon Web Services Foundations', version: 'v1.5.0' },
  azure: {
    benchmarkId: 'cis_azure',
    name: 'CIS Microsoft Azure Foundations',
    version: 'v2.0.0',
  },
  gcp: {
    benchmarkId: 'cis_gcp',
    name: 'CIS Google Cloud Platform Foundation',
    version: 'v2.0.0',
  },
} as const;

// KSPM: Kubernetes distributions (only vanilla and EKS supported)
export const KSPM_DISTRIBUTIONS = {
  vanilla: { benchmarkId: 'cis_k8s', name: 'CIS Kubernetes', version: 'v1.0.1' },
  eks: { benchmarkId: 'cis_eks', name: 'CIS Amazon EKS', version: 'v1.0.1' },
} as const;

export type CloudProvider = keyof typeof CSPM_PROVIDERS;
export type KSPMDistribution = keyof typeof KSPM_DISTRIBUTIONS;
export type PostureType = 'cspm' | 'kspm';

// Agent/cloudbeat version used across all native CSP generators
export const CSP_AGENT_VERSION = '9.1.2';

// Target indices
export const MISCONFIGURATION_INDEX =
  'security_solution-cloud_security_posture.misconfiguration_latest';
export const VULNERABILITY_INDEX = 'logs-cloud_security_posture.vulnerabilities_latest-default';
export const CSP_SCORES_INDEX = 'logs-cloud_security_posture.scores-default';

// 3rd party target indices
export const WIZ_MISCONFIGURATION_INDEX = 'security_solution-wiz.misconfiguration_latest';
export const WIZ_VULNERABILITY_INDEX = 'security_solution-wiz.vulnerability_latest';
export const QUALYS_VULNERABILITY_INDEX = 'security_solution-qualys_vmdr.vulnerability_latest';
export const TENABLE_VULNERABILITY_INDEX = 'security_solution-tenable_io.vulnerability_latest';
export const AWS_MISCONFIGURATION_INDEX = 'security_solution-aws.misconfiguration_latest';

// Severity levels
export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Severity = (typeof SEVERITIES)[number];

// CIS rules for different providers
export const CIS_RULES = {
  aws: [
    {
      id: '1.4',
      name: 'Ensure no root account access key exists',
      section: 'Identity and Access Management',
    },
    {
      id: '1.5',
      name: 'Ensure MFA is enabled for the root user account',
      section: 'Identity and Access Management',
    },
    {
      id: '1.10',
      name: 'Ensure multi-factor authentication (MFA) is enabled for all IAM users',
      section: 'Identity and Access Management',
    },
    {
      id: '2.1.1',
      name: 'Ensure all S3 buckets employ encryption-at-rest',
      section: 'Storage',
    },
    {
      id: '2.1.2',
      name: 'Ensure S3 Bucket Policy is set to deny HTTP requests',
      section: 'Storage',
    },
    {
      id: '2.2.1',
      name: 'Ensure EBS volume encryption is enabled',
      section: 'Storage',
    },
    {
      id: '3.1',
      name: 'Ensure CloudTrail is enabled in all regions',
      section: 'Logging',
    },
    {
      id: '3.4',
      name: 'Ensure CloudTrail trails are integrated with CloudWatch Logs',
      section: 'Logging',
    },
    {
      id: '4.1',
      name: 'Ensure no security groups allow ingress from 0.0.0.0/0 to port 22',
      section: 'Networking',
    },
    {
      id: '4.2',
      name: 'Ensure no security groups allow ingress from 0.0.0.0/0 to port 3389',
      section: 'Networking',
    },
  ],
  azure: [
    {
      id: '1.1.1',
      name: 'Ensure Security Defaults is enabled on Azure Active Directory',
      section: 'Identity and Access Management',
    },
    {
      id: '1.1.3',
      name: 'Ensure that MFA is enabled for all privileged users',
      section: 'Identity and Access Management',
    },
    {
      id: '2.1.1',
      name: 'Ensure that Microsoft Defender for Cloud is set to On for Servers',
      section: 'Microsoft Defender for Cloud',
    },
    {
      id: '3.1',
      name: 'Ensure that Secure transfer required is set to Enabled',
      section: 'Storage Accounts',
    },
    {
      id: '3.7',
      name: 'Ensure that Public access level is disabled for storage accounts',
      section: 'Storage Accounts',
    },
    {
      id: '4.1.1',
      name: 'Ensure that auditing is set to On for SQL servers',
      section: 'Database Services',
    },
    {
      id: '5.1.1',
      name: 'Ensure that a Diagnostic Setting exists',
      section: 'Logging and Monitoring',
    },
    {
      id: '6.1',
      name: 'Ensure that RDP access is restricted from the internet',
      section: 'Networking',
    },
    {
      id: '6.2',
      name: 'Ensure that SSH access is restricted from the internet',
      section: 'Networking',
    },
    {
      id: '7.1',
      name: 'Ensure Virtual Machines are utilizing Managed Disks',
      section: 'Virtual Machines',
    },
  ],
  gcp: [
    {
      id: '1.1',
      name: 'Ensure that corporate login credentials are used',
      section: 'Identity and Access Management',
    },
    {
      id: '1.4',
      name: 'Ensure that there are only GCP-managed service account keys for each service account',
      section: 'Identity and Access Management',
    },
    {
      id: '1.7',
      name: 'Ensure User-Managed/External Keys for Service Accounts Are Rotated Every 90 Days or Fewer',
      section: 'Identity and Access Management',
    },
    {
      id: '2.1',
      name: 'Ensure that Cloud Audit Logging is configured properly across all services',
      section: 'Logging and Monitoring',
    },
    {
      id: '2.12',
      name: 'Ensure that Cloud DNS logging is enabled for all VPC networks',
      section: 'Logging and Monitoring',
    },
    {
      id: '3.1',
      name: 'Ensure that the default network does not exist in a project',
      section: 'Networking',
    },
    {
      id: '3.6',
      name: 'Ensure that SSH access is restricted from the internet',
      section: 'Networking',
    },
    {
      id: '4.1',
      name: 'Ensure that instances are not configured to use default service accounts',
      section: 'Virtual Machines',
    },
    {
      id: '5.1',
      name: 'Ensure that Cloud Storage bucket is not anonymously or publicly accessible',
      section: 'Storage',
    },
    {
      id: '6.1.1',
      name: 'Ensure that a MySQL database instance does not allow anyone to connect with admin privileges',
      section: 'Cloud SQL Database Services',
    },
  ],
  k8s: [
    {
      id: '1.1.1',
      name: 'Ensure that the API server pod specification file permissions are set to 644 or more restrictive',
      section: 'Control Plane Node Configuration Files',
    },
    {
      id: '1.2.1',
      name: 'Ensure that the --anonymous-auth argument is set to false',
      section: 'API Server',
    },
    {
      id: '1.2.6',
      name: 'Ensure that the --kubelet-certificate-authority argument is set as appropriate',
      section: 'API Server',
    },
    {
      id: '2.1',
      name: 'Ensure that the --cert-file and --key-file arguments are set as appropriate',
      section: 'etcd',
    },
    {
      id: '3.2.1',
      name: 'Ensure that a minimal audit policy is created',
      section: 'Control Plane Configuration',
    },
    {
      id: '4.1.1',
      name: 'Ensure that the kubelet service file permissions are set to 644 or more restrictive',
      section: 'Worker Node Configuration Files',
    },
    {
      id: '4.2.1',
      name: 'Ensure that the --anonymous-auth argument is set to false',
      section: 'Kubelet',
    },
    {
      id: '5.1.1',
      name: 'Ensure that the cluster-admin role is only used where required',
      section: 'RBAC and Service Accounts',
    },
    {
      id: '5.2.1',
      name: 'Ensure that the cluster has at least one active policy control mechanism in place',
      section: 'Pod Security Standards',
    },
    {
      id: '5.7.1',
      name: 'Create administrative boundaries between resources using namespaces',
      section: 'General Policies',
    },
  ],
  eks: [
    {
      id: '1.1',
      name: 'Ensure EKS Cluster is configured with Control Plane Logging',
      section: 'Control Plane Logging',
    },
    {
      id: '2.1.1',
      name: 'Enable audit logs for the cluster',
      section: 'Logging',
    },
    {
      id: '3.1.1',
      name: 'Ensure that the kubeconfig file permissions are set to 644',
      section: 'Worker Node Configuration',
    },
    {
      id: '4.1.1',
      name: 'Ensure that the cluster-admin role is only used where required',
      section: 'RBAC and Service Accounts',
    },
    {
      id: '4.2.1',
      name: 'Minimize the admission of privileged containers',
      section: 'Pod Security Policies',
    },
    {
      id: '5.1.1',
      name: 'Restrict network traffic between workloads using network policies',
      section: 'Network Policies and CNI',
    },
    {
      id: '5.2.1',
      name: 'Prefer using secrets as files over secrets as environment variables',
      section: 'Secrets Management',
    },
    {
      id: '5.3.1',
      name: 'Ensure that encryption is configured for EKS secrets',
      section: 'Encryption',
    },
    {
      id: '5.4.1',
      name: 'Consider using dedicated nodes for the control plane',
      section: 'General Security',
    },
    {
      id: '5.4.2',
      name: 'Apply security context to pods and containers',
      section: 'General Security',
    },
  ],
} as const;

// Common CVEs for vulnerability generation
export const COMMON_CVES = [
  {
    id: 'CVE-2024-21626',
    severity: 'CRITICAL',
    title: 'runc container breakout',
    package: 'runc',
    fixedVersion: '1.1.12',
  },
  {
    id: 'CVE-2024-3094',
    severity: 'CRITICAL',
    title: 'XZ Utils backdoor',
    package: 'xz-utils',
    fixedVersion: '5.6.1',
  },
  {
    id: 'CVE-2023-44487',
    severity: 'HIGH',
    title: 'HTTP/2 Rapid Reset Attack',
    package: 'golang',
    fixedVersion: '1.21.3',
  },
  {
    id: 'CVE-2023-38545',
    severity: 'HIGH',
    title: 'curl SOCKS5 heap buffer overflow',
    package: 'curl',
    fixedVersion: '8.4.0',
  },
  {
    id: 'CVE-2023-4911',
    severity: 'HIGH',
    title: 'glibc buffer overflow in ld.so',
    package: 'glibc',
    fixedVersion: '2.38-4',
  },
  {
    id: 'CVE-2024-0567',
    severity: 'MEDIUM',
    title: 'GnuTLS certificate verification bypass',
    package: 'gnutls',
    fixedVersion: '3.8.3',
  },
  {
    id: 'CVE-2023-52425',
    severity: 'MEDIUM',
    title: 'libexpat XML parsing vulnerability',
    package: 'expat',
    fixedVersion: '2.6.0',
  },
  {
    id: 'CVE-2023-5678',
    severity: 'MEDIUM',
    title: 'OpenSSL key generation flaw',
    package: 'openssl',
    fixedVersion: '3.1.5',
  },
  {
    id: 'CVE-2024-22195',
    severity: 'LOW',
    title: 'Jinja2 sandbox escape',
    package: 'python-jinja2',
    fixedVersion: '3.1.3',
  },
  {
    id: 'CVE-2023-48795',
    severity: 'LOW',
    title: 'SSH Terrapin attack',
    package: 'openssh',
    fixedVersion: '9.6',
  },
] as const;

// Utility functions
export function generateAccountId(provider: CloudProvider): string {
  switch (provider) {
    case 'aws':
      return faker.string.numeric(12);
    case 'azure':
      return faker.string.uuid();
    case 'gcp':
      return faker.string.alphanumeric({ length: 21, casing: 'lower' });
    default:
      return faker.string.uuid();
  }
}

export function generateClusterId(): string {
  return faker.string.uuid();
}

export function generateClusterName(): string {
  return `${faker.word.adjective()}-${faker.word.noun()}-cluster`;
}

export function generateAccountName(provider: CloudProvider): string {
  const prefix =
    provider === 'aws' ? 'aws' : provider === 'azure' ? 'azure' : provider === 'gcp' ? 'gcp' : '';
  return `${prefix}-${faker.word.adjective()}-${faker.word.noun()}`;
}

export function distributeSeverities(count: number): {
  critical: number;
  high: number;
  medium: number;
  low: number;
} {
  // Distribution: ~5% critical, ~20% high, ~45% medium, ~30% low
  const critical = Math.max(1, Math.floor(count * 0.05));
  const high = Math.max(1, Math.floor(count * 0.2));
  const medium = Math.max(1, Math.floor(count * 0.45));
  const low = count - critical - high - medium;

  return { critical, high, medium, low: Math.max(1, low) };
}

export function getRandomCisRule(provider: CloudProvider | 'k8s' | 'eks') {
  const rules = CIS_RULES[provider] as readonly { id: string; name: string; section: string }[];
  return faker.helpers.arrayElement(rules);
}

export function getRandomCve() {
  return faker.helpers.arrayElement(COMMON_CVES);
}

export function pickSeverity(): Severity {
  // Weighted distribution: more medium/low, fewer critical
  const weights = { CRITICAL: 5, HIGH: 20, MEDIUM: 45, LOW: 30 };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = faker.number.int({ min: 0, max: total - 1 });

  for (const [severity, weight] of Object.entries(weights)) {
    random -= weight;
    if (random < 0) {
      return severity as Severity;
    }
  }
  return 'MEDIUM';
}

export function pickEvaluation(): 'passed' | 'failed' {
  // ~40% passed, ~60% failed for realistic findings
  return faker.number.int({ min: 0, max: 100 }) < 40 ? 'passed' : 'failed';
}

// Account/Cluster generation for correlation
export interface CSPMAccount {
  id: string;
  name: string;
  provider: CloudProvider;
}

export interface KSPMCluster {
  id: string;
  name: string;
  distribution: KSPMDistribution;
}

export function generateCSPMAccounts(
  providers: CloudProvider[],
  accountsPerProvider: number = 1
): CSPMAccount[] {
  const accounts: CSPMAccount[] = [];

  for (const provider of providers) {
    for (let i = 0; i < accountsPerProvider; i++) {
      accounts.push({
        id: generateAccountId(provider),
        name: generateAccountName(provider),
        provider,
      });
    }
  }

  return accounts;
}

export function generateKSPMClusters(
  distributions: KSPMDistribution[],
  clustersPerDistribution: number = 1
): KSPMCluster[] {
  const clusters: KSPMCluster[] = [];

  for (const distribution of distributions) {
    for (let i = 0; i < clustersPerDistribution; i++) {
      clusters.push({
        id: generateClusterId(),
        name: generateClusterName(),
        distribution,
      });
    }
  }

  return clusters;
}

// Resource types by provider
export const RESOURCE_TYPES = {
  aws: [
    'aws-s3',
    'aws-ec2',
    'aws-iam-user',
    'aws-iam-role',
    'aws-security-group',
    'aws-rds',
    'aws-cloudtrail',
    'aws-kms',
    'aws-lambda',
    'aws-ebs',
  ],
  azure: [
    'azure-storage-account',
    'azure-vm',
    'azure-key-vault',
    'azure-sql-server',
    'azure-network-security-group',
    'azure-app-service',
    'azure-cosmos-db',
    'azure-aks',
    'azure-function',
    'azure-disk',
  ],
  gcp: [
    'gcp-storage-bucket',
    'gcp-compute-instance',
    'gcp-iam-service-account',
    'gcp-cloud-sql',
    'gcp-firewall',
    'gcp-gke-cluster',
    'gcp-pubsub-topic',
    'gcp-bigquery-dataset',
    'gcp-cloud-function',
    'gcp-disk',
  ],
  k8s: [
    'k8s-pod',
    'k8s-deployment',
    'k8s-service',
    'k8s-configmap',
    'k8s-secret',
    'k8s-namespace',
    'k8s-serviceaccount',
    'k8s-role',
    'k8s-clusterrole',
    'k8s-networkpolicy',
  ],
} as const;

export function getRandomResourceType(provider: CloudProvider | 'k8s'): string {
  const types = RESOURCE_TYPES[provider];
  return faker.helpers.arrayElement(types);
}

export function generateResourceId(
  provider: CloudProvider | 'k8s',
  resourceType?: string,
  accountId?: string
): string {
  const acctId = accountId || faker.string.numeric(12);

  switch (provider) {
    case 'aws': {
      const service = resourceType ? awsServiceFromResourceType(resourceType) : 'ec2';
      const region = faker.helpers.arrayElement(['us-east-1', 'us-west-2', 'eu-west-1']);
      return `arn:aws:${service}:${region}:${acctId}:${faker.word.noun()}/${faker.string.alphanumeric(8)}`;
    }
    case 'azure': {
      const azProvider = resourceType
        ? azureProviderFromResourceType(resourceType)
        : 'Microsoft.Compute';
      return `/subscriptions/${faker.string.uuid()}/resourceGroups/${faker.word.noun()}-rg/providers/${azProvider}/resources/${faker.word.noun()}`;
    }
    case 'gcp': {
      const zone = faker.helpers.arrayElement(['us-central1-a', 'europe-west1-b']);
      return `//compute.googleapis.com/projects/${faker.word.noun()}-project/zones/${zone}/instances/${faker.word.noun()}-instance`;
    }
    case 'k8s':
      return `${faker.word.noun()}-${faker.string.alphanumeric(5)}`;
    default:
      return faker.string.uuid();
  }
}

function awsServiceFromResourceType(resourceType: string): string {
  if (resourceType.includes('s3')) return 's3';
  if (resourceType.includes('ec2') || resourceType.includes('ebs')) return 'ec2';
  if (resourceType.includes('iam')) return 'iam';
  if (resourceType.includes('rds')) return 'rds';
  if (resourceType.includes('lambda')) return 'lambda';
  if (resourceType.includes('kms')) return 'kms';
  if (resourceType.includes('cloudtrail')) return 'cloudtrail';
  if (resourceType.includes('security-group')) return 'ec2';
  return 'ec2';
}

function azureProviderFromResourceType(resourceType: string): string {
  if (resourceType.includes('storage')) return 'Microsoft.Storage';
  if (resourceType.includes('vm') || resourceType.includes('disk')) return 'Microsoft.Compute';
  if (resourceType.includes('key-vault')) return 'Microsoft.KeyVault';
  if (resourceType.includes('sql')) return 'Microsoft.Sql';
  if (resourceType.includes('network') || resourceType.includes('nsg')) return 'Microsoft.Network';
  if (resourceType.includes('app-service') || resourceType.includes('function'))
    return 'Microsoft.Web';
  if (resourceType.includes('cosmos')) return 'Microsoft.DocumentDB';
  if (resourceType.includes('aks')) return 'Microsoft.ContainerService';
  return 'Microsoft.Compute';
}

// Map resource type to cloud.service.name for consistent metadata
export function cloudServiceFromResourceType(
  provider: CloudProvider,
  resourceType: string
): string {
  switch (provider) {
    case 'aws': {
      const service = awsServiceFromResourceType(resourceType);
      const serviceNames: Record<string, string> = {
        s3: 'AWS S3',
        ec2: 'AWS EC2',
        iam: 'AWS IAM',
        rds: 'AWS RDS',
        lambda: 'AWS Lambda',
        kms: 'AWS KMS',
        cloudtrail: 'AWS CloudTrail',
      };
      return serviceNames[service] || 'AWS EC2';
    }
    case 'azure': {
      const azProvider = azureProviderFromResourceType(resourceType);
      const serviceNames: Record<string, string> = {
        'Microsoft.Storage': 'Azure Storage',
        'Microsoft.Compute': 'Azure VM',
        'Microsoft.KeyVault': 'Azure Key Vault',
        'Microsoft.Sql': 'Azure SQL',
        'Microsoft.Network': 'Azure Network',
        'Microsoft.Web': 'Azure App Service',
        'Microsoft.DocumentDB': 'Azure Cosmos DB',
        'Microsoft.ContainerService': 'Azure AKS',
      };
      return serviceNames[azProvider] || 'Azure VM';
    }
    case 'gcp': {
      if (resourceType.includes('storage') || resourceType.includes('bucket')) return 'GCP Storage';
      if (resourceType.includes('compute') || resourceType.includes('instance'))
        return 'GCP Compute Engine';
      if (resourceType.includes('iam') || resourceType.includes('service-account'))
        return 'GCP IAM';
      if (resourceType.includes('sql')) return 'GCP Cloud SQL';
      if (resourceType.includes('firewall')) return 'GCP VPC Firewall';
      if (resourceType.includes('gke')) return 'GCP GKE';
      if (resourceType.includes('pubsub')) return 'GCP Pub/Sub';
      if (resourceType.includes('bigquery')) return 'GCP BigQuery';
      if (resourceType.includes('function')) return 'GCP Cloud Functions';
      return 'GCP Compute Engine';
    }
    default:
      return '';
  }
}
