/**
 * Cloud resource definitions for AWS, GCP, and Azure
 * Used for generating realistic cloud asset inventory data
 */

import { type CloudProvider } from '../types.ts';

export interface CloudResourceType {
  type: string;
  subType: string;
  provider: CloudProvider;
  namePrefix: string;
  description: string;
  baseCount: number; // Base count for small org, scales with size multiplier
  regions: string[];
}

/**
 * AWS resource types commonly found in SaaS organizations
 * Type/subType values match cloudbeat's AssetClassification taxonomy
 * (see cloudbeat/internal/inventory/asset.go)
 */
export const AWS_RESOURCES: CloudResourceType[] = [
  // Compute
  {
    type: 'Host',
    subType: 'AWS EC2 Instance',
    provider: 'aws',
    namePrefix: 'i-',
    description: 'EC2 Instance',
    baseCount: 10,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'],
  },
  {
    type: 'FaaS',
    subType: 'AWS Lambda Function',
    provider: 'aws',
    namePrefix: 'lambda-',
    description: 'Lambda Function',
    baseCount: 15,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },
  {
    type: 'Infrastructure',
    subType: 'AWS ECS Service',
    provider: 'aws',
    namePrefix: 'ecs-service-',
    description: 'ECS Service',
    baseCount: 5,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },

  // Kubernetes
  {
    type: 'Infrastructure',
    subType: 'AWS EKS Cluster',
    provider: 'aws',
    namePrefix: 'eks-',
    description: 'EKS Cluster',
    baseCount: 2,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },
  {
    type: 'Infrastructure',
    subType: 'AWS EKS Node Group',
    provider: 'aws',
    namePrefix: 'ng-',
    description: 'EKS Node Group',
    baseCount: 4,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },

  // Storage
  {
    type: 'Storage Bucket',
    subType: 'AWS S3 Bucket',
    provider: 'aws',
    namePrefix: '',
    description: 'S3 Bucket',
    baseCount: 20,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1'],
  },
  {
    type: 'Volume',
    subType: 'AWS EBS Volume',
    provider: 'aws',
    namePrefix: 'vol-',
    description: 'EBS Volume',
    baseCount: 15,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },

  // Database
  {
    type: 'Database',
    subType: 'AWS RDS Instance',
    provider: 'aws',
    namePrefix: 'rds-',
    description: 'RDS Instance',
    baseCount: 5,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },
  {
    type: 'Infrastructure',
    subType: 'AWS DynamoDB Table',
    provider: 'aws',
    namePrefix: '',
    description: 'DynamoDB Table',
    baseCount: 10,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },
  {
    type: 'Infrastructure',
    subType: 'AWS ElastiCache Cluster',
    provider: 'aws',
    namePrefix: 'cache-',
    description: 'ElastiCache Cluster',
    baseCount: 3,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },

  // Networking
  {
    type: 'Networking',
    subType: 'AWS VPC',
    provider: 'aws',
    namePrefix: 'vpc-',
    description: 'VPC',
    baseCount: 3,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },
  {
    type: 'Load Balancer',
    subType: 'AWS Elastic Load Balancer v2',
    provider: 'aws',
    namePrefix: 'alb-',
    description: 'Application Load Balancer',
    baseCount: 5,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },
  {
    type: 'Infrastructure',
    subType: 'AWS CloudFront Distribution',
    provider: 'aws',
    namePrefix: 'cf-',
    description: 'CloudFront Distribution',
    baseCount: 2,
    regions: ['us-east-1'], // CloudFront is global but created in us-east-1
  },

  // Security & IAM
  {
    type: 'Identity',
    subType: 'AWS IAM User',
    provider: 'aws',
    namePrefix: '',
    description: 'IAM User',
    baseCount: 0, // Will be generated based on employees with cloud access
    regions: ['us-east-1'], // IAM is global
  },
  {
    type: 'Service Account',
    subType: 'AWS IAM Role',
    provider: 'aws',
    namePrefix: '',
    description: 'IAM Role',
    baseCount: 0, // Generated from the IAM model (access_graph_generator.ts)
    regions: ['us-east-1'], // IAM is global
  },
  {
    type: 'Access Management',
    subType: 'AWS IAM Policy',
    provider: 'aws',
    namePrefix: '',
    description: 'IAM Policy',
    baseCount: 0, // Generated from the IAM model (access_graph_generator.ts)
    regions: ['us-east-1'], // IAM is global
  },
  {
    type: 'Infrastructure',
    subType: 'AWS KMS Key',
    provider: 'aws',
    namePrefix: 'key-',
    description: 'KMS Key',
    baseCount: 5,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },

  // Messaging & Queues
  {
    type: 'Infrastructure',
    subType: 'AWS SQS Queue',
    provider: 'aws',
    namePrefix: '',
    description: 'SQS Queue',
    baseCount: 10,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },
  {
    type: 'Messaging Service',
    subType: 'AWS SNS Topic',
    provider: 'aws',
    namePrefix: '',
    description: 'SNS Topic',
    baseCount: 8,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  },
];

/**
 * GCP resource types
 * Type/subType values match cloudbeat's AssetClassification taxonomy
 * (see cloudbeat/internal/inventory/asset.go)
 */
export const GCP_RESOURCES: CloudResourceType[] = [
  // Compute
  {
    type: 'Host',
    subType: 'GCP Compute Instance',
    provider: 'gcp',
    namePrefix: 'gce-',
    description: 'Compute Engine Instance',
    baseCount: 8,
    regions: ['us-central1', 'us-east1', 'europe-west1'],
  },
  {
    type: 'FaaS',
    subType: 'GCP Cloud Function',
    provider: 'gcp',
    namePrefix: 'func-',
    description: 'Cloud Function',
    baseCount: 10,
    regions: ['us-central1', 'us-east1', 'europe-west1'],
  },
  {
    type: 'Container Service',
    subType: 'GCP Cloud Run Service',
    provider: 'gcp',
    namePrefix: 'run-',
    description: 'Cloud Run Service',
    baseCount: 5,
    regions: ['us-central1', 'us-east1', 'europe-west1'],
  },

  // Kubernetes
  {
    type: 'Orchestrator',
    subType: 'GCP Kubernetes Engine (GKE) Cluster',
    provider: 'gcp',
    namePrefix: 'gke-',
    description: 'GKE Cluster',
    baseCount: 2,
    regions: ['us-central1', 'us-east1', 'europe-west1'],
  },

  // Storage
  {
    type: 'Storage Bucket',
    subType: 'GCP Bucket',
    provider: 'gcp',
    namePrefix: '',
    description: 'Cloud Storage Bucket',
    baseCount: 15,
    regions: ['us-central1', 'us-east1', 'europe-west1', 'us'],
  },

  // Database
  {
    type: 'Database',
    subType: 'GCP Cloud SQL Instance',
    provider: 'gcp',
    namePrefix: 'sql-',
    description: 'Cloud SQL Instance',
    baseCount: 4,
    regions: ['us-central1', 'us-east1', 'europe-west1'],
  },
  {
    type: 'Database',
    subType: 'GCP Firestore Database',
    provider: 'gcp',
    namePrefix: '',
    description: 'Firestore Database',
    baseCount: 2,
    regions: ['us-central1', 'europe-west1'],
  },
  {
    type: 'Database',
    subType: 'GCP Bigtable Instance',
    provider: 'gcp',
    namePrefix: 'bt-',
    description: 'Bigtable Instance',
    baseCount: 1,
    regions: ['us-central1'],
  },

  // Networking
  {
    type: 'Networking',
    subType: 'GCP VPC Network',
    provider: 'gcp',
    namePrefix: 'vpc-',
    description: 'VPC Network',
    baseCount: 2,
    regions: ['global'],
  },
  {
    type: 'Load Balancer',
    subType: 'GCP Load Balancing Forwarding Rule',
    provider: 'gcp',
    namePrefix: 'lb-',
    description: 'Load Balancer',
    baseCount: 3,
    regions: ['us-central1', 'us-east1', 'europe-west1'],
  },

  // Messaging
  {
    type: 'Messaging Service',
    subType: 'GCP Pub/Sub Topic',
    provider: 'gcp',
    namePrefix: '',
    description: 'Pub/Sub Topic',
    baseCount: 8,
    regions: ['us-central1', 'us-east1', 'europe-west1'],
  },
];

/**
 * Azure resource types
 * Type/subType values match cloudbeat's AssetClassification taxonomy
 * (see cloudbeat/internal/inventory/asset.go)
 */
export const AZURE_RESOURCES: CloudResourceType[] = [
  // Compute
  {
    type: 'Host',
    subType: 'Azure Virtual Machine',
    provider: 'azure',
    namePrefix: 'vm-',
    description: 'Virtual Machine',
    baseCount: 8,
    regions: ['eastus', 'westus2', 'westeurope', 'northeurope'],
  },
  {
    type: 'FaaS',
    subType: 'Azure Function App',
    provider: 'azure',
    namePrefix: 'func-',
    description: 'Function App',
    baseCount: 10,
    regions: ['eastus', 'westus2', 'westeurope'],
  },
  {
    type: 'Web Service',
    subType: 'Azure App Service',
    provider: 'azure',
    namePrefix: 'app-',
    description: 'App Service Web App',
    baseCount: 5,
    regions: ['eastus', 'westus2', 'westeurope'],
  },

  // Kubernetes
  {
    type: 'Orchestrator',
    subType: 'Azure AKS Cluster',
    provider: 'azure',
    namePrefix: 'aks-',
    description: 'AKS Cluster',
    baseCount: 2,
    regions: ['eastus', 'westus2', 'westeurope'],
  },

  // Storage
  {
    type: 'Private Endpoint',
    subType: 'Azure Storage Account',
    provider: 'azure',
    namePrefix: 'st',
    description: 'Storage Account',
    baseCount: 10,
    regions: ['eastus', 'westus2', 'westeurope', 'northeurope'],
  },
  {
    type: 'Storage Bucket',
    subType: 'Azure Storage Blob Container',
    provider: 'azure',
    namePrefix: '',
    description: 'Blob Container',
    baseCount: 15,
    regions: ['eastus', 'westus2', 'westeurope'],
  },

  // Database
  {
    type: 'Database',
    subType: 'Azure SQL Database',
    provider: 'azure',
    namePrefix: 'sqldb-',
    description: 'SQL Database',
    baseCount: 4,
    regions: ['eastus', 'westus2', 'westeurope'],
  },
  {
    type: 'Infrastructure',
    subType: 'Azure Cosmos DB Account',
    provider: 'azure',
    namePrefix: 'cosmos-',
    description: 'Cosmos DB Account',
    baseCount: 2,
    regions: ['eastus', 'westeurope'],
  },
  {
    type: 'Database',
    subType: 'Azure Cache for Redis',
    provider: 'azure',
    namePrefix: 'redis-',
    description: 'Azure Cache for Redis',
    baseCount: 2,
    regions: ['eastus', 'westus2', 'westeurope'],
  },

  // Networking
  {
    type: 'Networking',
    subType: 'Azure Virtual Network',
    provider: 'azure',
    namePrefix: 'vnet-',
    description: 'Virtual Network',
    baseCount: 3,
    regions: ['eastus', 'westus2', 'westeurope'],
  },
  {
    type: 'Load Balancer',
    subType: 'Azure Load Balancer',
    provider: 'azure',
    namePrefix: 'lb-',
    description: 'Load Balancer',
    baseCount: 3,
    regions: ['eastus', 'westus2', 'westeurope'],
  },
  {
    type: 'Gateway',
    subType: 'Azure Front Door',
    provider: 'azure',
    namePrefix: 'afd-',
    description: 'Front Door',
    baseCount: 1,
    regions: ['global'],
  },

  // Messaging
  {
    type: 'Messaging Service',
    subType: 'Azure Service Bus Namespace',
    provider: 'azure',
    namePrefix: 'sb-',
    description: 'Service Bus Namespace',
    baseCount: 3,
    regions: ['eastus', 'westus2', 'westeurope'],
  },
  {
    type: 'Messaging Service',
    subType: 'Azure Event Hub Namespace',
    provider: 'azure',
    namePrefix: 'eh-',
    description: 'Event Hub Namespace',
    baseCount: 2,
    regions: ['eastus', 'westeurope'],
  },
];

/**
 * Get all resources for a specific provider
 */
export const getResourcesForProvider = (provider: CloudProvider): CloudResourceType[] => {
  switch (provider) {
    case 'aws':
      return AWS_RESOURCES;
    case 'gcp':
      return GCP_RESOURCES;
    case 'azure':
      return AZURE_RESOURCES;
    default:
      return [];
  }
};

/**
 * Get all available resources
 */
export const getAllResources = (): CloudResourceType[] => {
  return [...AWS_RESOURCES, ...GCP_RESOURCES, ...AZURE_RESOURCES];
};

/**
 * S3 bucket name prefixes for realistic naming
 */
export const S3_BUCKET_PURPOSES = [
  'data',
  'logs',
  'backups',
  'artifacts',
  'assets',
  'uploads',
  'exports',
  'analytics',
  'reports',
  'config',
  'terraform-state',
  'cloudtrail',
  'vpc-flow-logs',
  'elb-logs',
];

/**
 * Service roles found in most AWS accounts, with the service principal that may assume
 * them and the AWS-managed policies they carry. Service-linked roles live under
 * /aws-service-role/.
 */
export const IAM_SERVICE_ROLES: Array<{
  name: string;
  servicePrincipal: string;
  managedPolicyArns: string[];
  serviceLinked?: boolean;
}> = [
  {
    name: 'EKSClusterRole',
    servicePrincipal: 'eks.amazonaws.com',
    managedPolicyArns: ['arn:aws:iam::aws:policy/AmazonEKSClusterPolicy'],
  },
  {
    name: 'EKSNodeGroupRole',
    servicePrincipal: 'ec2.amazonaws.com',
    managedPolicyArns: [
      'arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy',
      'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly',
    ],
  },
  {
    name: 'LambdaExecutionRole',
    servicePrincipal: 'lambda.amazonaws.com',
    managedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
  },
  {
    name: 'ECSTaskExecutionRole',
    servicePrincipal: 'ecs-tasks.amazonaws.com',
    managedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'],
  },
  {
    name: 'RDSMonitoringRole',
    servicePrincipal: 'monitoring.rds.amazonaws.com',
    managedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole'],
  },
  {
    name: 'CloudWatchEventsRole',
    servicePrincipal: 'events.amazonaws.com',
    managedPolicyArns: [
      'arn:aws:iam::aws:policy/service-role/CloudWatchEventsBuiltInTargetExecutionAccess',
    ],
  },
  {
    name: 'CodeBuildServiceRole',
    servicePrincipal: 'codebuild.amazonaws.com',
    managedPolicyArns: ['arn:aws:iam::aws:policy/AWSCodeBuildDeveloperAccess'],
  },
  {
    name: 'CodePipelineServiceRole',
    servicePrincipal: 'codepipeline.amazonaws.com',
    managedPolicyArns: ['arn:aws:iam::aws:policy/AWSCodePipeline_FullAccess'],
  },
  {
    name: 'S3ReplicationRole',
    servicePrincipal: 's3.amazonaws.com',
    managedPolicyArns: ['arn:aws:iam::aws:policy/AmazonS3FullAccess'],
  },
  {
    name: 'AWSServiceRoleForAutoScaling',
    servicePrincipal: 'autoscaling.amazonaws.com',
    managedPolicyArns: ['arn:aws:iam::aws:policy/aws-service-role/AutoScalingServiceRolePolicy'],
    serviceLinked: true,
  },
  {
    name: 'AWSServiceRoleForECS',
    servicePrincipal: 'ecs.amazonaws.com',
    managedPolicyArns: ['arn:aws:iam::aws:policy/aws-service-role/AmazonECSServiceRolePolicy'],
    serviceLinked: true,
  },
  {
    name: 'AWSServiceRoleForRDS',
    servicePrincipal: 'rds.amazonaws.com',
    managedPolicyArns: ['arn:aws:iam::aws:policy/aws-service-role/AmazonRDSServiceRolePolicy'],
    serviceLinked: true,
  },
];

/**
 * EC2 instance roles, assigned to hosts by purpose through an instance profile of the
 * same name. `app-server` is the role the planted access path ends on.
 */
export const IAM_INSTANCE_ROLES: Array<{ name: string; purposes: string[]; description: string }> =
  [
    {
      name: 'ec2-app-server',
      purposes: ['api-server', 'web-server'],
      description: 'Instance role for application servers',
    },
    {
      name: 'ec2-worker',
      purposes: [
        'worker',
        'scheduler',
        'message-queue',
        'database',
        'cache',
        'logging',
        'monitoring',
      ],
      description: 'Instance role for background workers and data services',
    },
    {
      name: 'ec2-ci-runner',
      purposes: ['ci-runner'],
      description: 'Instance role for CI runners',
    },
  ];

/**
 * Okta groups that federate into AWS and the role each one maps to on the AWS federation
 * app. `allAccounts` roles exist in every AWS account; the others only in production.
 */
export const IDP_FEDERATION_GROUPS: Array<{
  groupName: string;
  description: string;
  roleName: string;
  allAccounts: boolean;
}> = [
  {
    groupName: 'AWS-Access',
    description: 'Users with AWS console access via SSO',
    roleName: 'okta-developer',
    allAccounts: true,
  },
  {
    groupName: 'AWS-Prod-Admins',
    description: 'Production AWS administrators (SSO)',
    roleName: 'okta-prod-admin',
    allAccounts: false,
  },
  {
    groupName: 'AWS-Data-Engineers',
    description: 'Data platform engineers with S3 data lake access (SSO)',
    roleName: 'okta-data-engineer',
    allAccounts: false,
  },
];

/**
 * Environment suffixes for resource naming
 */
export const ENVIRONMENTS = ['prod', 'staging', 'dev', 'qa', 'sandbox'];

/**
 * Application/service names for a CRM-like SaaS
 */
export const SERVICE_NAMES = [
  'api',
  'web',
  'mobile-backend',
  'auth',
  'notifications',
  'billing',
  'analytics',
  'search',
  'email',
  'integrations',
  'workflows',
  'reports',
  'scheduler',
  'webhooks',
  'file-service',
  'user-service',
  'contact-service',
  'lead-service',
  'deal-service',
  'task-service',
];
