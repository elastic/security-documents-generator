import { faker } from '@faker-js/faker';
import moment from 'moment';
import { pickEvaluation, CSPMAccount } from './csp_utils';

export interface CreateAwsSecurityHubMisconfigurationParams {
  account?: CSPMAccount;
}

// AWS Security Hub security controls (ASFF format)
const SECURITY_HUB_CONTROLS = [
  {
    controlId: 'S3.1',
    title: 'S3 general purpose buckets should have block public access settings enabled',
    description:
      'This control checks whether the preceding Amazon S3 block public access settings are configured at the bucket level.',
    resourceType: 'AwsS3Bucket',
    generatorId: 'security-control/S3.1',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/S3.1/remediation',
    requirements: [
      'PCI DSS 2.0/1.2.1',
      'PCI DSS 2.0/1.3.1',
      'CIS AWS Foundations Benchmark v1.4.0/2.1.5',
    ],
  },
  {
    controlId: 'S3.5',
    title: 'S3 general purpose buckets should require requests to use SSL',
    description:
      'This control checks whether S3 general purpose buckets have policies that require requests to use SSL.',
    resourceType: 'AwsS3Bucket',
    generatorId: 'security-control/S3.5',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/S3.5/remediation',
    requirements: ['CIS AWS Foundations Benchmark v1.4.0/2.1.2', 'NIST 800-53 Rev 5/SC-8'],
  },
  {
    controlId: 'S3.8',
    title: 'S3 general purpose buckets should block public access at the bucket level',
    description:
      'This control checks whether an Amazon S3 general purpose bucket blocks public access at the bucket level.',
    resourceType: 'AwsS3Bucket',
    generatorId: 'security-control/S3.8',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/S3.8/remediation',
    requirements: ['CIS AWS Foundations Benchmark v1.4.0/2.1.5'],
  },
  {
    controlId: 'EC2.2',
    title: 'VPC default security groups should not allow inbound or outbound traffic',
    description:
      'This control checks whether the default security group for a VPC allows inbound or outbound traffic.',
    resourceType: 'AwsEc2SecurityGroup',
    generatorId: 'security-control/EC2.2',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/EC2.2/remediation',
    requirements: [
      'CIS AWS Foundations Benchmark v1.4.0/5.3',
      'PCI DSS 2.0/1.2.1',
      'PCI DSS 2.0/2.1',
    ],
  },
  {
    controlId: 'EC2.18',
    title: 'Security groups should only allow unrestricted incoming traffic for authorized ports',
    description:
      'This control checks whether the security groups allow unrestricted incoming traffic.',
    resourceType: 'AwsEc2SecurityGroup',
    generatorId: 'security-control/EC2.18',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/EC2.18/remediation',
    requirements: ['NIST 800-53 Rev 5/AC-4', 'NIST 800-53 Rev 5/SC-7'],
  },
  {
    controlId: 'EC2.19',
    title: 'Security groups should not allow unrestricted access to ports with high risk',
    description:
      'This control checks whether unrestricted incoming traffic for security groups is accessible to the specified ports that have the highest risk.',
    resourceType: 'AwsEc2SecurityGroup',
    generatorId: 'security-control/EC2.19',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/EC2.19/remediation',
    requirements: ['NIST 800-53 Rev 5/AC-4', 'PCI DSS 2.0/1.3.1'],
  },
  {
    controlId: 'IAM.4',
    title: 'IAM root user access key should not exist',
    description: 'This control checks whether the root user access key is available.',
    resourceType: 'AwsAccount',
    generatorId: 'security-control/IAM.4',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/IAM.4/remediation',
    requirements: [
      'CIS AWS Foundations Benchmark v1.4.0/1.4',
      'PCI DSS 2.0/2.1',
      'PCI DSS 2.0/7.2.1',
    ],
  },
  {
    controlId: 'IAM.6',
    title: 'Hardware MFA should be enabled for the root user',
    description:
      'This control checks whether your AWS account is enabled to use a hardware multi-factor authentication (MFA) device to sign in with root user credentials.',
    resourceType: 'AwsAccount',
    generatorId: 'security-control/IAM.6',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/IAM.6/remediation',
    requirements: ['CIS AWS Foundations Benchmark v1.4.0/1.6', 'PCI DSS 2.0/8.3.1'],
  },
  {
    controlId: 'RDS.2',
    title:
      'RDS DB instances should prohibit public access, determined by the PubliclyAccessible configuration',
    description:
      'This control checks whether Amazon RDS instances are publicly accessible by evaluating the PubliclyAccessible field in the instance configuration.',
    resourceType: 'AwsRdsDbInstance',
    generatorId: 'security-control/RDS.2',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/RDS.2/remediation',
    requirements: ['PCI DSS 2.0/1.2.1', 'PCI DSS 2.0/1.3.1', 'NIST 800-53 Rev 5/AC-4'],
  },
  {
    controlId: 'CloudTrail.1',
    title: 'CloudTrail should be enabled and configured with at least one multi-Region trail',
    description: 'This control checks that there is at least one multi-region CloudTrail trail.',
    resourceType: 'AwsAccount',
    generatorId: 'security-control/CloudTrail.1',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/CloudTrail.1/remediation',
    requirements: [
      'CIS AWS Foundations Benchmark v1.4.0/3.1',
      'PCI DSS 2.0/10.1',
      'NIST 800-53 Rev 5/AU-2',
    ],
  },
  {
    controlId: 'KMS.4',
    title: 'AWS KMS key rotation should be enabled',
    description: 'This control checks whether key rotation is enabled for AWS KMS keys.',
    resourceType: 'AwsKmsKey',
    generatorId: 'security-control/KMS.4',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/KMS.4/remediation',
    requirements: ['CIS AWS Foundations Benchmark v1.4.0/3.8', 'PCI DSS 2.0/3.6.4'],
  },
  {
    controlId: 'Lambda.1',
    title: 'Lambda function policies should prohibit public access',
    description:
      'This control checks whether the Lambda function resource-based policy prohibits public access.',
    resourceType: 'AwsLambdaFunction',
    generatorId: 'security-control/Lambda.1',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/Lambda.1/remediation',
    requirements: ['NIST 800-53 Rev 5/AC-4', 'NIST 800-53 Rev 5/SC-7'],
  },
  {
    controlId: 'SQS.3',
    title: 'SQS queue access policies should not allow public access',
    description:
      'This control checks whether an Amazon SQS access policy allows public access to an SQS queue.',
    resourceType: 'AwsSqsQueue',
    generatorId: 'security-control/SQS.3',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/SQS.3/remediation',
    requirements: ['NIST 800-53 Rev 5/AC-3', 'NIST 800-53 Rev 5/AC-4'],
  },
  {
    controlId: 'EBS.1',
    title: 'EBS snapshots should not be publicly restorable',
    description:
      'This control checks whether Amazon Elastic Block Store snapshots are not publicly restorable.',
    resourceType: 'AwsEc2Volume',
    generatorId: 'security-control/EBS.1',
    remediationUrl: 'https://docs.aws.amazon.com/console/securityhub/EBS.1/remediation',
    requirements: ['PCI DSS 2.0/1.2.1', 'PCI DSS 2.0/1.3.1'],
  },
];

const AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
];

export default function createAwsSecurityHubMisconfiguration({
  account,
}: CreateAwsSecurityHubMisconfigurationParams = {}) {
  const now = moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const createdAt = moment()
    .subtract(faker.number.int({ min: 1, max: 72 }), 'hours')
    .toISOString();
  const evaluation = pickEvaluation();
  const complianceStatus = evaluation === 'passed' ? 'PASSED' : 'FAILED';
  const eventOutcome = evaluation === 'passed' ? 'success' : 'failure';

  const accountId = account?.id || faker.string.numeric(12);
  const region = faker.helpers.arrayElement(AWS_REGIONS);
  const control = faker.helpers.arrayElement(SECURITY_HUB_CONTROLS);

  const resourceId = generateResourceId(control.resourceType, accountId, region);
  const resourceName = extractResourceName(resourceId, control.resourceType);
  const findingId = `arn:aws:securityhub:${region}:${accountId}:security-control/${control.controlId}/finding/${faker.string.uuid()}`;

  const severityLabel = faker.helpers.arrayElement([
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW',
    'INFORMATIONAL',
  ]);

  return {
    '@timestamp': now,
    data_stream: {
      namespace: 'default',
      type: 'logs',
      dataset: 'aws.securityhub_findings_full_posture',
    },
    ecs: {
      version: '8.11.0',
    },
    event: {
      kind: 'state',
      category: ['configuration'],
      type: ['info'],
      dataset: 'aws.securityhub_findings_full_posture',
      id: findingId,
      created: createdAt,
      outcome: eventOutcome,
    },
    observer: {
      vendor: 'AWS Security Hub CSPM',
    },
    organization: {
      name: 'AWS',
    },
    cloud: {
      provider: 'aws',
      account: {
        id: accountId,
      },
      region,
    },
    resource: {
      id: resourceId,
      name: resourceName,
      type: control.resourceType,
    },
    result: {
      evaluation,
    },
    rule: {
      id: control.generatorId,
      name: control.title,
      description: control.description,
      reference: control.remediationUrl,
      remediation: `For information on how to correct this issue, consult the AWS Security Hub controls documentation.\r\n${control.remediationUrl}`,
      ruleset: control.requirements,
    },
    tags: ['preserve_original_event', 'forwarded', 'aws_securityhub_findings_full_posture'],
    aws: {
      securityhub_findings_full_posture: {
        aws_account_id: accountId,
        company: { name: 'AWS' },
        compliance: {
          status: complianceStatus,
          security_control_id: control.controlId,
          related_requirements: control.requirements,
        },
        description: control.description,
        generator: { id: control.generatorId },
        product: {
          arn: `arn:aws:securityhub:${region}::product/aws/securityhub`,
          name: 'Security Hub',
        },
        record_state: 'ACTIVE',
        region,
        remediation: {
          recommendation: {
            text: 'For information on how to correct this issue, consult the AWS Security Hub controls documentation.',
            url: control.remediationUrl,
          },
        },
        resources: [
          {
            Id: resourceId,
            Type: control.resourceType,
            Partition: 'aws',
            Region: region,
          },
        ],
        schema: { version: '2018-10-08' },
        severity: {
          label: severityLabel,
          original: severityLabel,
        },
        title: control.title,
        types: ['Software and Configuration Checks/Industry and Regulatory Standards'],
        updated_at: now,
        workflow: {
          status: evaluation === 'passed' ? 'RESOLVED' : 'NEW',
          state: evaluation === 'passed' ? 'RESOLVED' : 'NEW',
        },
      },
    },
  };
}

function generateResourceId(resourceType: string, accountId: string, region: string): string {
  switch (resourceType) {
    case 'AwsS3Bucket':
      return `arn:aws:s3:::${faker.word.noun()}-${faker.string.alphanumeric(8)}`;
    case 'AwsEc2SecurityGroup':
      return `arn:aws:ec2:${region}:${accountId}:security-group/sg-${faker.string.alphanumeric(17)}`;
    case 'AwsEc2Volume':
      return `arn:aws:ec2:${region}:${accountId}:volume/vol-${faker.string.alphanumeric(17)}`;
    case 'AwsRdsDbInstance':
      return `arn:aws:rds:${region}:${accountId}:db:${faker.word.noun()}-db-${faker.string.alphanumeric(6)}`;
    case 'AwsKmsKey':
      return `arn:aws:kms:${region}:${accountId}:key/${faker.string.uuid()}`;
    case 'AwsLambdaFunction':
      return `arn:aws:lambda:${region}:${accountId}:function:${faker.word.noun()}-${faker.string.alphanumeric(6)}`;
    case 'AwsSqsQueue':
      return `arn:aws:sqs:${region}:${accountId}:${faker.word.noun()}-queue-${faker.string.alphanumeric(6)}`;
    case 'AwsAccount':
      return `AWS::::Account:${accountId}/${faker.string.alphanumeric(8)}`;
    default:
      return `arn:aws:unknown:${region}:${accountId}:${faker.string.alphanumeric(12)}`;
  }
}

function extractResourceName(resourceId: string, resourceType: string): string {
  if (resourceType === 'AwsAccount') {
    return resourceId.split(':').pop() || resourceId;
  }
  // Extract the last part of the ARN after the last / or :
  const parts = resourceId.split(/[/:]/);
  return parts[parts.length - 1] || resourceId;
}
