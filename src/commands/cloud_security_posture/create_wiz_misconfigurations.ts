import { faker } from '@faker-js/faker';
import moment from 'moment';
import { pickEvaluation, CSPMAccount, CloudProvider } from './csp_utils';

export interface CreateWizMisconfigurationParams {
  account?: CSPMAccount;
}

// Wiz cloud configuration finding rules with proper shortIds
const WIZ_RULES = [
  {
    id: faker.string.uuid(),
    shortId: 'S3-001',
    name: 'S3 Bucket Public Access Enabled',
    description: 'S3 bucket allows public access which may expose sensitive data',
    resourceType: 'BUCKET',
    nativeType: 'AWS::S3::Bucket',
    provider: 'aws',
    cloudPlatform: 'S3',
  },
  {
    id: faker.string.uuid(),
    shortId: 'EC2-002',
    name: 'EC2 Instance Has Public IP Address',
    description: 'EC2 instance has a public IP address exposing it to the internet',
    resourceType: 'VIRTUAL_MACHINE',
    nativeType: 'AWS::EC2::Instance',
    provider: 'aws',
    cloudPlatform: 'EC2',
  },
  {
    id: faker.string.uuid(),
    shortId: 'IAM-006',
    name: 'Root account access keys should not exist',
    description: 'Root account has access keys which is a security risk',
    resourceType: 'USER_ACCOUNT',
    nativeType: 'rootUser',
    provider: 'aws',
    cloudPlatform: 'IAM',
  },
  {
    id: faker.string.uuid(),
    shortId: 'IAM-003',
    name: 'IAM User MFA Not Enabled',
    description: 'IAM user does not have MFA enabled',
    resourceType: 'USER_ACCOUNT',
    nativeType: 'AWS::IAM::User',
    provider: 'aws',
    cloudPlatform: 'IAM',
  },
  {
    id: faker.string.uuid(),
    shortId: 'SG-001',
    name: 'Security Group Allows Unrestricted Access',
    description: 'Security group allows unrestricted access from the internet',
    resourceType: 'SECURITY_GROUP',
    nativeType: 'AWS::EC2::SecurityGroup',
    provider: 'aws',
    cloudPlatform: 'EC2',
  },
  {
    id: faker.string.uuid(),
    shortId: 'EKS-001',
    name: 'EKS Cluster Public Endpoint Enabled',
    description: 'EKS cluster has public endpoint enabled',
    resourceType: 'KUBERNETES_CLUSTER',
    nativeType: 'AWS::EKS::Cluster',
    provider: 'aws',
    cloudPlatform: 'EKS',
  },
  {
    id: faker.string.uuid(),
    shortId: 'AZ-STG-001',
    name: 'Storage Account Public Access Enabled',
    description: 'Azure Storage Account allows public access',
    resourceType: 'BUCKET',
    nativeType: 'Microsoft.Storage/storageAccounts',
    provider: 'azure',
    cloudPlatform: 'Storage',
  },
  {
    id: faker.string.uuid(),
    shortId: 'AZ-VM-001',
    name: 'Virtual Machine Has Public IP',
    description: 'Virtual Machine has a public IP address',
    resourceType: 'VIRTUAL_MACHINE',
    nativeType: 'Microsoft.Compute/virtualMachines',
    provider: 'azure',
    cloudPlatform: 'Compute',
  },
  {
    id: faker.string.uuid(),
    shortId: 'GCP-GCS-001',
    name: 'GCS Bucket Public Access Enabled',
    description: 'GCS bucket allows public access',
    resourceType: 'BUCKET',
    nativeType: 'storage.googleapis.com/Bucket',
    provider: 'gcp',
    cloudPlatform: 'Storage',
  },
  {
    id: faker.string.uuid(),
    shortId: 'GCP-GCE-001',
    name: 'Compute Instance Has Public IP',
    description: 'GCE instance has a public IP address',
    resourceType: 'VIRTUAL_MACHINE',
    nativeType: 'compute.googleapis.com/Instance',
    provider: 'gcp',
    cloudPlatform: 'Compute',
  },
];

export default function createWizMisconfiguration({
  account,
}: CreateWizMisconfigurationParams = {}) {
  const now = moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const analyzedAt = moment()
    .subtract(faker.number.int({ min: 0, max: 24 }), 'hours')
    .toISOString();
  const evaluation = pickEvaluation();
  const result = evaluation === 'passed' ? 'PASS' : 'FAIL';
  const eventOutcome = evaluation === 'passed' ? 'success' : 'failure';
  const provider =
    account?.provider || (faker.helpers.arrayElement(['aws', 'azure', 'gcp']) as CloudProvider);
  const accountId = account?.id || faker.string.numeric(12);
  const accountName = account?.name || `${provider}-account-${faker.word.noun()}`;

  // Pick a rule matching the provider
  const matchingRules = WIZ_RULES.filter((r) => r.provider === provider);
  const rule = faker.helpers.arrayElement(matchingRules.length > 0 ? matchingRules : WIZ_RULES);

  const findingId = faker.string.uuid();
  const resourceInternalId = faker.string.uuid();
  const providerId = generateProviderId(provider, rule.nativeType, accountId);
  const resourceName = generateResourceName(rule.resourceType);
  const region = getRegionForProvider(provider);

  // Generate evidence
  const evidence = {
    currentValue: faker.helpers.arrayElement([
      'true',
      'false',
      'enabled',
      'disabled',
      'public',
      'private',
    ]),
    expectedValue: faker.helpers.arrayElement(['false', 'disabled', 'private', 'restricted']),
    configurationPath: `${rule.nativeType.toLowerCase()}.${faker.word.noun()}`,
    cloudConfigurationLink: generateCloudConfigLink(provider, region, providerId),
  };

  // Build document matching the actual Wiz integration schema
  const doc: Record<string, unknown> = {
    '@timestamp': now,
    data_stream: {
      namespace: 'default',
      type: 'logs',
      dataset: 'wiz.cloud_configuration_finding_full_posture',
    },
    ecs: {
      version: '8.11.0',
    },
    event: {
      created: analyzedAt,
      kind: 'state',
      id: findingId,
      category: ['configuration'],
      type: ['info'],
      outcome: eventOutcome,
      dataset: 'wiz.cloud_configuration_finding_full_posture',
    },
    // Message from rule name (per pipeline)
    message: rule.name,
    observer: {
      vendor: 'Wiz',
    },
    // Cloud fields
    cloud: {
      provider: provider.toLowerCase(), // lowercase per pipeline
      account: {
        id: accountId,
        name: accountName,
      },
      region,
      service: {
        name: rule.cloudPlatform.toLowerCase(), // lowercase of cloudPlatform
      },
    },
    // Resource fields
    resource: {
      id: providerId,
      name: resourceName,
      type: rule.resourceType,
      sub_type: rule.nativeType,
    },
    // Rule fields
    rule: {
      uuid: rule.id,
      id: rule.shortId,
      name: rule.name,
      description: rule.description,
      remediation: `Review and remediate the ${rule.name.toLowerCase()} finding.`,
      reference: evidence.cloudConfigurationLink,
    },
    // Result fields with evidence
    result: {
      evaluation,
      evidence: {
        current_value: evidence.currentValue,
        expected_value: evidence.expectedValue,
        configuration_path: evidence.configurationPath,
        cloud_configuration_link: evidence.cloudConfigurationLink,
      },
    },
    // Wiz-specific fields matching the actual integration schema
    wiz: {
      cloud_configuration_finding_full_posture: {
        id: findingId,
        name: rule.name,
        analyzed_at: analyzedAt,
        result,
        status: result === 'PASS' ? 'RESOLVED' : 'OPEN',
        resource: {
          id: resourceInternalId,
          name: resourceName,
          type: rule.resourceType,
          native_type: rule.nativeType,
          provider_id: providerId,
          region,
          cloud_platform: rule.cloudPlatform,
          subscription: {
            id: faker.string.uuid(),
            name: accountName,
            external_id: accountId,
            cloud_provider: provider.toUpperCase(),
          },
        },
        rule: {
          id: rule.id,
          short_id: rule.shortId,
          name: rule.name,
          description: rule.description,
          remediation_instructions: `Review and remediate the ${rule.name.toLowerCase()} finding.`,
        },
        evidence: {
          current_value: evidence.currentValue,
          expected_value: evidence.expectedValue,
          configuration_path: evidence.configurationPath,
          cloud_configuration_link: evidence.cloudConfigurationLink,
        },
      },
    },
  };

  // Conditional user fields for USER_ACCOUNT resources
  if (rule.resourceType === 'USER_ACCOUNT') {
    doc.user = {
      id: providerId,
      name: resourceName,
    };
  }

  // Conditional host fields for VIRTUAL_MACHINE resources
  if (rule.resourceType === 'VIRTUAL_MACHINE') {
    doc.host = {
      name: resourceName.toLowerCase(),
    };
  }

  return doc;
}

function generateProviderId(
  provider: CloudProvider,
  nativeType: string,
  accountId: string
): string {
  switch (provider) {
    case 'aws':
      if (nativeType.includes('IAM') || nativeType === 'rootUser') {
        return `arn:aws:iam::${accountId}:${nativeType === 'rootUser' ? 'root' : `user/${faker.internet.username()}`}`;
      }
      if (nativeType.includes('S3')) {
        return `arn:aws:s3:::${faker.word.noun()}-bucket-${faker.string.alphanumeric(8)}`;
      }
      if (nativeType.includes('EC2')) {
        return `arn:aws:ec2:us-east-1:${accountId}:instance/i-${faker.string.alphanumeric(17)}`;
      }
      if (nativeType.includes('EKS')) {
        return `arn:aws:eks:us-east-1:${accountId}:cluster/${faker.word.noun()}-cluster`;
      }
      return `arn:aws:${nativeType.split('::')[1]?.toLowerCase() || 'resource'}:us-east-1:${accountId}:${faker.word.noun()}`;
    case 'azure':
      return `/subscriptions/${faker.string.uuid()}/resourceGroups/${faker.word.noun()}-rg/providers/${nativeType}/${faker.word.noun()}`;
    case 'gcp':
      return `projects/${accountId}/locations/global/${nativeType.split('/')[1]?.toLowerCase() || 'resource'}/${faker.word.noun()}`;
    default:
      return faker.string.uuid();
  }
}

function generateResourceName(resourceType: string): string {
  switch (resourceType) {
    case 'USER_ACCOUNT':
      return faker.helpers.arrayElement([
        'Root user',
        `${faker.person.firstName().toLowerCase()}.${faker.person.lastName().toLowerCase()}`,
        faker.internet.username(),
      ]);
    case 'VIRTUAL_MACHINE':
      return `${faker.word.noun()}-${faker.string.alphanumeric(4)}`;
    case 'BUCKET':
      return `${faker.word.noun()}-bucket-${faker.string.alphanumeric(8)}`;
    case 'SECURITY_GROUP':
      return `sg-${faker.word.noun()}-${faker.string.alphanumeric(4)}`;
    case 'KUBERNETES_CLUSTER':
      return `${faker.word.noun()}-cluster`;
    default:
      return `${faker.word.noun()}-${faker.string.alphanumeric(4)}`;
  }
}

function getRegionForProvider(provider: CloudProvider): string {
  switch (provider) {
    case 'aws':
      return faker.helpers.arrayElement(['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']);
    case 'azure':
      return faker.helpers.arrayElement(['eastus', 'westus2', 'westeurope', 'southeastasia']);
    case 'gcp':
      return faker.helpers.arrayElement([
        'us-central1',
        'us-east1',
        'europe-west1',
        'asia-southeast1',
      ]);
    default:
      return 'us-east-1';
  }
}

function generateCloudConfigLink(
  provider: CloudProvider,
  region: string,
  resourceId: string
): string {
  switch (provider) {
    case 'aws':
      return `https://${region}.console.aws.amazon.com/config/home?region=${region}#/resources/${encodeURIComponent(resourceId)}`;
    case 'azure':
      return `https://portal.azure.com/#@/resource${resourceId}`;
    case 'gcp':
      return `https://console.cloud.google.com/security/command-center/findings?project=${resourceId.split('/')[1]}`;
    default:
      return '';
  }
}
