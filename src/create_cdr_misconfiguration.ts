import moment from 'moment';
import { faker } from '@faker-js/faker';

export interface CreateCdrMisconfigurationParams {
  ruleUuid: string;
  resourceId: string;
  space?: string;
  hostname?: string;
  username?: string;
}

// Common security rule templates for misconfigurations
const MISCONFIGURATION_RULES = [
  {
    shortId: 'IAM-001',
    name: 'Root account access keys should not exist',
    description:
      'AWS access keys provide programmatic access to a given AWS account. It is recommended that all access keys associated with the root user be deleted.',
    remediation: 'Delete root account access keys from the IAM console or CLI.',
    section: 'Identity and Access Management',
  },
  {
    shortId: 'IAM-002',
    name: 'MFA should be enabled for the root user',
    description:
      'The root user is the most privileged user in an AWS account. Multi-factor authentication (MFA) adds an extra layer of protection on top of a username and password.',
    remediation: 'Enable MFA for the root user through the IAM console.',
    section: 'Identity and Access Management',
  },
  {
    shortId: 'S3-001',
    name: 'S3 buckets should not be publicly accessible',
    description:
      'S3 bucket policies and ACLs should not allow public access. Public access to S3 buckets can lead to unauthorized access to sensitive data.',
    remediation: 'Update the bucket policy and ACL to remove public access.',
    section: 'Storage',
  },
  {
    shortId: 'EC2-001',
    name: 'Security groups should not allow unrestricted SSH access',
    description:
      'Security groups should not allow unrestricted inbound SSH traffic (0.0.0.0/0 on port 22).',
    remediation: 'Restrict SSH access to specific IP ranges or use a bastion host.',
    section: 'Compute',
  },
  {
    shortId: 'KMS-001',
    name: 'KMS keys should have rotation enabled',
    description:
      'AWS KMS keys should have automatic annual rotation enabled to reduce the risk of key compromise.',
    remediation: 'Enable automatic key rotation in the KMS console.',
    section: 'Encryption',
  },
  {
    shortId: 'LOG-001',
    name: 'CloudTrail should be enabled in all regions',
    description:
      'CloudTrail provides a history of AWS API calls for your account. It should be enabled in all regions for comprehensive logging.',
    remediation: 'Create a multi-region CloudTrail trail.',
    section: 'Logging and Monitoring',
  },
  {
    shortId: 'NET-001',
    name: 'VPC flow logs should be enabled',
    description:
      'VPC Flow Logs capture information about the IP traffic going to and from network interfaces in your VPC.',
    remediation: 'Enable VPC flow logs for all VPCs.',
    section: 'Networking',
  },
  {
    shortId: 'DB-001',
    name: 'RDS instances should not be publicly accessible',
    description:
      'RDS database instances should not have public accessibility enabled to prevent unauthorized access.',
    remediation: 'Modify the RDS instance to disable public accessibility.',
    section: 'Database',
  },
];

const RESOURCE_TYPES = [
  { type: 'USER_ACCOUNT', subType: 'rootUser', nativeType: 'rootUser' },
  { type: 'BUCKET', subType: 's3-bucket', nativeType: 's3Bucket' },
  { type: 'VIRTUAL_MACHINE', subType: 'ec2-instance', nativeType: 'ec2Instance' },
  { type: 'SECURITY_GROUP', subType: 'security-group', nativeType: 'securityGroup' },
  { type: 'KMS_KEY', subType: 'kms-key', nativeType: 'kmsKey' },
  { type: 'VPC', subType: 'vpc', nativeType: 'vpc' },
  { type: 'DATABASE', subType: 'rds-instance', nativeType: 'rdsInstance' },
];

/**
 * Creates a CDR misconfiguration document compatible with the wiz cloud_configuration_finding_full_posture schema.
 * Based on the wiz integration transform: security_solution-wiz.misconfiguration_latest
 *
 * Uniqueness is determined by: rule.uuid, resource.id, data_stream.namespace
 */
export function createCdrMisconfiguration({
  ruleUuid,
  resourceId,
  space = 'default',
  hostname,
  username,
}: CreateCdrMisconfigurationParams) {
  const now = moment().toISOString();
  const analyzedAt = moment()
    .subtract(faker.number.int({ min: 0, max: 24 }), 'hours')
    .toISOString();
  const dataset = 'wiz.cloud_configuration_finding_full_posture';

  const hostName = hostname || faker.internet.domainName();
  const userName = username || faker.internet.username();
  const accountId = faker.string.numeric(12);
  const region = faker.helpers.arrayElement([
    'us-east-1',
    'us-west-2',
    'eu-west-1',
    'ap-southeast-1',
    null,
  ]);
  const cloudProvider = faker.helpers.arrayElement(['AWS', 'GCP', 'Azure']);
  const evaluation = faker.helpers.arrayElement(['passed', 'failed']);

  const ruleTemplate = faker.helpers.arrayElement(MISCONFIGURATION_RULES);
  const resourceType = faker.helpers.arrayElement(RESOURCE_TYPES);
  const resourceName = faker.helpers.arrayElement([
    userName,
    hostName,
    `${faker.lorem.slug()}-bucket`,
    `sg-${faker.string.alphanumeric(17)}`,
  ]);

  const wizResourceId = faker.string.uuid();
  const subscriptionId = faker.string.uuid();
  const findingId = faker.string.uuid();

  return {
    '@timestamp': now,
    agent: {
      ephemeral_id: faker.string.uuid(),
      id: faker.string.uuid(),
      name: `elastic-agent-${faker.string.alphanumeric(5)}`,
      type: 'filebeat',
      version: '8.18.0',
    },
    cloud: {
      account: {
        id: accountId,
        name: faker.company.name().toLowerCase().replace(/\s+/g, '-'),
      },
      provider: cloudProvider.toLowerCase(),
      region: region,
      service: {
        name: faker.helpers.arrayElement(['iam', 's3', 'ec2', 'eks', 'kms', 'rds']),
      },
    },
    data_stream: {
      dataset,
      namespace: space,
      type: 'logs',
    },
    ecs: {
      version: '8.11.0',
    },
    elastic_agent: {
      id: faker.string.uuid(),
      snapshot: false,
      version: '8.18.0',
    },
    event: {
      agent_id_status: 'verified',
      category: ['configuration'],
      created: analyzedAt,
      dataset,
      id: findingId,
      ingested: now,
      kind: 'state',
      outcome: evaluation === 'passed' ? 'success' : 'failure',
      type: ['info'],
    },
    host: {
      name: hostName,
    },
    message: `Rule "${ruleTemplate.name}": ${evaluation}`,
    observer: {
      vendor: 'Wiz',
    },
    resource: {
      id: resourceId,
      name: resourceName,
      sub_type: resourceType.subType,
      type: resourceType.type,
    },
    result: {
      evaluation,
      evidence:
        evaluation === 'failed'
          ? {
              current_value: faker.lorem.sentence(),
              expected_value: faker.lorem.sentence(),
              configuration_path: faker.system.filePath(),
            }
          : undefined,
    },
    rule: {
      description: ruleTemplate.description,
      id: ruleTemplate.shortId,
      name: ruleTemplate.name,
      remediation: ruleTemplate.remediation,
      uuid: ruleUuid,
    },
    tags: [
      'preserve_original_event',
      'preserve_duplicate_custom_fields',
      'forwarded',
      'wiz-cloud_configuration_finding_full_posture',
    ],
    user: {
      id: resourceId,
      name: userName,
    },
    wiz: {
      cloud_configuration_finding_full_posture: {
        analyzed_at: analyzedAt,
        id: findingId,
        name: ruleTemplate.name,
        resource: {
          cloud_platform: cloudProvider === 'AWS' ? 'EC2' : cloudProvider,
          id: wizResourceId,
          name: resourceName,
          native_type: resourceType.nativeType,
          provider_id: resourceId,
          region: region,
          subscription: {
            cloud_provider: cloudProvider,
            external_id: accountId,
            id: subscriptionId,
            name: faker.company.name().toLowerCase().replace(/\s+/g, '-'),
          },
          type: resourceType.type,
        },
        result: evaluation === 'passed' ? 'PASS' : 'FAIL',
        rule: {
          description: ruleTemplate.description,
          id: ruleUuid,
          name: ruleTemplate.name,
          remediation_instructions: ruleTemplate.remediation,
          short_id: ruleTemplate.shortId,
        },
        status: faker.helpers.arrayElement(['OPEN', 'RESOLVED', 'IN_PROGRESS']),
        evidence:
          evaluation === 'failed'
            ? {
                current_value: faker.lorem.sentence(),
                expected_value: faker.lorem.sentence(),
                configuration_path: faker.system.filePath(),
                cloud_configuration_link: `https://console.aws.amazon.com/${ruleTemplate.section.toLowerCase().replace(/\s+/g, '-')}`,
              }
            : undefined,
      },
    },
  };
}
