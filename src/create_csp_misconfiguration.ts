import moment from 'moment';
import { faker } from '@faker-js/faker';

export interface CreateCspMisconfigurationParams {
  ruleId: string;
  resourceId: string;
  space?: string;
  hostname?: string;
  username?: string;
}

// CIS Benchmark templates for cloud security posture
// Note: version must be prefixed with 'v' for Kibana UI compatibility
const CIS_BENCHMARKS = [
  {
    id: 'cis_aws',
    name: 'CIS Amazon Web Services Foundations',
    version: 'v1.5.0',
    posture_type: 'cspm',
  },
  {
    id: 'cis_gcp',
    name: 'CIS Google Cloud Platform Foundation',
    version: 'v1.3.0',
    posture_type: 'cspm',
  },
  {
    id: 'cis_azure',
    name: 'CIS Microsoft Azure Foundations',
    version: 'v1.5.0',
    posture_type: 'cspm',
  },
  {
    id: 'cis_k8s',
    name: 'CIS Kubernetes',
    version: 'v1.6.0',
    posture_type: 'kspm',
  },
  {
    id: 'cis_eks',
    name: 'CIS Amazon Elastic Kubernetes Service (EKS)',
    version: 'v1.1.0',
    posture_type: 'kspm',
  },
];

// Security rule templates for CSP misconfigurations (aligned with Kibana CspBenchmarkRuleMetadata schema)
const CSP_MISCONFIGURATION_RULES = [
  {
    id: 'cis_1_1',
    rego_rule_id: 'cis_1_1',
    rule_number: '1.1',
    name: 'Ensure MFA is enabled for the root user account',
    description:
      'The root user account is the most privileged user in an account. MFA adds an extra layer of protection on top of a user name and password.',
    profile_applicability: '* Level 1',
    rationale:
      'The root user account is the most privileged user in an AWS account. MFA adds an extra layer of security beyond username and password.',
    audit:
      'Perform the following to determine if the root user account has MFA enabled:\n\nRun the following command:\n```\naws iam get-account-summary | grep AccountMFAEnabled\n```',
    remediation:
      'Enable MFA for the root user using a virtual MFA device, U2F security key, or hardware MFA device.',
    impact: '',
    default_value: 'MFA is not enabled by default for the root user account.',
    references: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html',
    section: 'Identity and Access Management',
    tags: ['CIS', 'AWS', 'CIS 1.1', 'Identity and Access Management'],
  },
  {
    id: 'cis_1_4',
    rego_rule_id: 'cis_1_4',
    rule_number: '1.4',
    name: 'Ensure no root user account access key exists',
    description:
      'The root user account is the most privileged user in an AWS account. AWS Access Keys provide programmatic access to a given AWS account.',
    profile_applicability: '* Level 1',
    rationale:
      'Removing access keys associated with the root user account limits vectors by which the account can be compromised.',
    audit:
      'Run the following command:\n```\naws iam get-account-summary | grep AccountAccessKeysPresent\n```',
    remediation: 'Delete all access keys associated with the root user account.',
    impact: 'You will need to use console access for root operations.',
    default_value: 'By default, root user account access keys may exist.',
    references: 'https://docs.aws.amazon.com/general/latest/gr/aws-access-keys-best-practices.html',
    section: 'Identity and Access Management',
    tags: ['CIS', 'AWS', 'CIS 1.4', 'Identity and Access Management'],
  },
  {
    id: 'cis_2_1_1',
    rego_rule_id: 'cis_2_1_1',
    rule_number: '2.1.1',
    name: 'Ensure S3 Bucket Policy is set to deny HTTP requests',
    description:
      'At the Amazon S3 bucket level, you can configure permissions through a bucket policy making the objects accessible only through HTTPS.',
    profile_applicability: '* Level 2',
    rationale:
      'By default, Amazon S3 allows both HTTP and HTTPS requests. To achieve only allowing access to Amazon S3 objects through HTTPS you need to explicitly deny access to HTTP requests.',
    audit: 'Review the bucket policy for each S3 bucket and ensure it denies HTTP requests.',
    remediation: 'Add a bucket policy that explicitly denies HTTP requests.',
    impact: 'Applications using HTTP will need to be updated to use HTTPS.',
    default_value: 'By default, no bucket policy is configured.',
    references:
      'https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html',
    section: 'Storage',
    tags: ['CIS', 'AWS', 'CIS 2.1.1', 'Storage'],
  },
  {
    id: 'cis_2_1_2',
    rego_rule_id: 'cis_2_1_2',
    rule_number: '2.1.2',
    name: 'Ensure MFA Delete is enabled on S3 buckets',
    description:
      'Once MFA Delete is enabled on your sensitive and classified S3 bucket it requires the user to have two forms of authentication.',
    profile_applicability: '* Level 1',
    rationale:
      'Adding MFA delete to an S3 bucket, requires additional authentication when changing the version state of your bucket or deleting an object version.',
    audit: 'Review the versioning configuration for each S3 bucket.',
    remediation: 'Enable MFA Delete on sensitive S3 buckets.',
    impact: 'Additional authentication will be required for delete operations.',
    default_value: 'MFA Delete is disabled by default.',
    references:
      'https://docs.aws.amazon.com/AmazonS3/latest/userguide/MultiFactorAuthenticationDelete.html',
    section: 'Storage',
    tags: ['CIS', 'AWS', 'CIS 2.1.2', 'Storage'],
  },
  {
    id: 'cis_3_1',
    rego_rule_id: 'cis_3_1',
    rule_number: '3.1',
    name: 'Ensure CloudTrail is enabled in all regions',
    description:
      'AWS CloudTrail is a web service that records AWS API calls for your account and delivers log files to you.',
    profile_applicability: '* Level 1',
    rationale:
      'CloudTrail provides a history of AWS API calls for your account, including API calls made via the Management Console, SDKs, command line tools.',
    audit: 'Verify that CloudTrail is enabled in all regions.',
    remediation: 'Create a multi-region CloudTrail trail and enable logging.',
    impact: 'S3 storage costs will be incurred for storing CloudTrail logs.',
    default_value: 'CloudTrail is not enabled by default.',
    references:
      'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-getting-started.html',
    section: 'Logging',
    tags: ['CIS', 'AWS', 'CIS 3.1', 'Logging'],
  },
  {
    id: 'cis_4_1',
    rego_rule_id: 'cis_4_1',
    rule_number: '4.1',
    name: 'Ensure no security groups allow ingress from 0.0.0.0/0 to port 22',
    description:
      'Security groups provide stateful filtering of ingress/egress network traffic to AWS resources.',
    profile_applicability: '* Level 1',
    rationale:
      'Removing unfettered connectivity to remote console services, such as SSH, reduces a servers exposure to risk.',
    audit: 'Review all security groups and their inbound rules for port 22.',
    remediation: 'Restrict SSH access to specific IP ranges or remove the rule.',
    impact: 'Access to instances via SSH will be restricted.',
    default_value: 'By default, the default security group allows all outbound traffic.',
    references: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html',
    section: 'Networking',
    tags: ['CIS', 'AWS', 'CIS 4.1', 'Networking'],
  },
  {
    id: 'cis_4_2',
    rego_rule_id: 'cis_4_2',
    rule_number: '4.2',
    name: 'Ensure no security groups allow ingress from 0.0.0.0/0 to port 3389',
    description:
      'Security groups provide stateful filtering of ingress/egress network traffic to AWS resources.',
    profile_applicability: '* Level 1',
    rationale:
      'Removing unfettered connectivity to remote console services, such as RDP, reduces a servers exposure to risk.',
    audit: 'Review all security groups and their inbound rules for port 3389.',
    remediation: 'Restrict RDP access to specific IP ranges or remove the rule.',
    impact: 'Access to instances via RDP will be restricted.',
    default_value: 'By default, the default security group allows all outbound traffic.',
    references: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html',
    section: 'Networking',
    tags: ['CIS', 'AWS', 'CIS 4.2', 'Networking'],
  },
  {
    id: 'cis_5_1',
    rego_rule_id: 'cis_5_1',
    rule_number: '5.1',
    name: 'Ensure EBS volume encryption is enabled',
    description:
      'Elastic Compute Cloud (EC2) supports encryption at rest when using the Elastic Block Store (EBS) service.',
    profile_applicability: '* Level 1',
    rationale:
      'Encrypting data at rest reduces the likelihood that it is unintentionally exposed and can nullify the impact of disclosure if the encryption remains unbroken.',
    audit: 'Review the EBS encryption settings for your account.',
    remediation: 'Enable EBS encryption by default in the EC2 settings.',
    impact: 'Encryption and decryption operations will add latency.',
    default_value: 'EBS encryption is not enabled by default.',
    references: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html',
    section: 'Encryption',
    tags: ['CIS', 'AWS', 'CIS 5.1', 'Encryption'],
  },
];

// Resource types matching cloudbeat schema
const RESOURCE_TYPES = [
  { type: 'cloud-compute', sub_type: 'aws-ec2' },
  { type: 'cloud-storage', sub_type: 'aws-s3' },
  { type: 'identity-management', sub_type: 'aws-iam' },
  { type: 'identity-management', sub_type: 'aws-iam-user' },
  { type: 'cloud-database', sub_type: 'aws-rds' },
  { type: 'cloud-compute', sub_type: 'aws-security-group' },
  { type: 'key-management', sub_type: 'aws-kms' },
  { type: 'logging', sub_type: 'aws-trail' },
];

/**
 * Creates a CSP (Cloud Security Posture) misconfiguration document compatible with the
 * Kibana CspFinding interface and CspBenchmarkRuleMetadata schema.
 * Based on the cloud_security_posture transform: security_solution-cloud_security_posture.misconfiguration_latest
 *
 * Uniqueness is determined by: rule.id, resource.id, data_stream.namespace
 */
export function createCspMisconfiguration({
  ruleId,
  resourceId,
  space = 'default',
  hostname,
  username,
}: CreateCspMisconfigurationParams) {
  const now = moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const eventCreated = moment()
    .subtract(faker.number.int({ min: 0, max: 24 }), 'hours')
    .toISOString();
  const dataset = 'cloud_security_posture.findings';

  const hostName = hostname || faker.internet.domainName();
  const hostId = faker.string.uuid();
  const userName = username || faker.internet.username();
  const accountId = faker.string.numeric(12);
  const accountName = faker.company.name().toLowerCase().replace(/\s+/g, '-');
  const region = faker.helpers.arrayElement([
    'us-east-1',
    'us-west-2',
    'eu-west-1',
    'ap-southeast-1',
    'eu-central-1',
  ]);
  const cloudProvider = faker.helpers.arrayElement(['aws', 'gcp', 'azure']);
  const evaluation = faker.helpers.arrayElement(['passed', 'failed']) as 'passed' | 'failed';

  const ruleTemplate = faker.helpers.arrayElement(CSP_MISCONFIGURATION_RULES);
  const benchmark = faker.helpers.arrayElement(CIS_BENCHMARKS);
  const resourceType = faker.helpers.arrayElement(RESOURCE_TYPES);
  const resourceName = faker.helpers.arrayElement([
    userName,
    hostName,
    `${faker.lorem.slug()}-bucket`,
    `sg-${faker.string.alphanumeric(17)}`,
    `i-${faker.string.alphanumeric(17)}`,
  ]);

  const findingId = faker.string.uuid();
  const packagePolicyId = faker.string.uuid();
  const clusterId = benchmark.posture_type === 'kspm' ? faker.string.uuid() : undefined;
  const eventSequence = faker.number.int({ min: 1, max: 1000000 });

  // Build orchestrator fields for KSPM
  const orchestrator =
    benchmark.posture_type === 'kspm'
      ? {
          cluster: {
            id: clusterId,
            name: `${faker.word.adjective()}-cluster`,
          },
        }
      : undefined;

  // Build the raw resource data (cloudbeat includes this)
  const rawResource = {
    id: resourceId,
    name: resourceName,
    type: resourceType.type,
    sub_type: resourceType.sub_type,
    region: region,
    account_id: accountId,
  };

  // Generate host IPs and MACs (required by CspFindingHost)
  const hostIps = [faker.internet.ipv4(), faker.internet.ipv4()];
  const hostMacs = [faker.internet.mac(), faker.internet.mac()];

  return {
    '@timestamp': now,
    // Agent fields (required by CspFindingAgent)
    agent: {
      id: faker.string.uuid(),
      name: `elastic-agent-${faker.string.alphanumeric(5)}`,
      type: 'cloudbeat',
      version: '8.18.0',
    },
    // Cloud fields (required by CspFindingCloud)
    cloud: {
      account: {
        id: accountId,
        name: accountName,
      },
      provider: cloudProvider,
      region: region,
    },
    cloud_security_posture: {
      package_policy: {
        id: packagePolicyId,
        revision: faker.number.int({ min: 1, max: 10 }),
      },
    },
    cluster_id: clusterId,
    // Data stream (required by EcsDataStream)
    data_stream: {
      dataset,
      namespace: space,
      type: 'logs',
    },
    // ECS version
    ecs: {
      version: '8.11.0',
    },
    // Event fields (required by EcsEvent)
    event: {
      agent_id_status: 'verified',
      category: ['configuration'],
      created: eventCreated,
      id: findingId,
      ingested: now,
      kind: 'state',
      outcome: evaluation === 'passed' ? 'success' : 'failure',
      sequence: eventSequence,
      type: ['info'],
    },
    // Host fields (required by CspFindingHost - all these fields are required!)
    host: {
      id: hostId,
      name: hostName,
      hostname: hostName,
      architecture: faker.helpers.arrayElement(['x86_64', 'arm64']),
      containerized: false,
      ip: hostIps,
      mac: hostMacs,
      os: {
        codename: faker.helpers.arrayElement(['focal', 'jammy', 'bionic']),
        family: faker.helpers.arrayElement(['debian', 'redhat']),
        kernel: `${faker.number.int({ min: 4, max: 6 })}.${faker.number.int({ min: 0, max: 20 })}.${faker.number.int({ min: 0, max: 100 })}`,
        name: faker.helpers.arrayElement(['Ubuntu', 'Amazon Linux', 'CentOS']),
        platform: faker.helpers.arrayElement(['ubuntu', 'amzn', 'centos']),
        type: 'linux',
        version: faker.helpers.arrayElement(['20.04', '22.04', '2', '7']),
      },
    },
    message: `Rule "${ruleTemplate.name}": ${evaluation}`,
    // Observer (required by EcsObserver)
    observer: {
      vendor: 'Elastic',
    },
    ...(orchestrator && { orchestrator }),
    related: {
      entity: [resourceId, accountId, resourceName].filter(Boolean),
    },
    // Resource fields (required by CspFindingResource)
    resource: {
      id: resourceId,
      type: resourceType.type,
      sub_type: resourceType.sub_type,
      name: resourceName,
      raw: rawResource,
    },
    // Result fields (required by CspFindingResult - evidence is REQUIRED, not optional!)
    result: {
      evaluation,
      expected:
        evaluation === 'failed'
          ? { source: { configured_value: ruleTemplate.default_value || 'N/A' } }
          : undefined,
      // evidence is REQUIRED per CspFindingResult interface
      evidence:
        evaluation === 'failed'
          ? {
              finding: faker.lorem.sentence(),
            }
          : {},
    },
    // Rule fields (required by CspBenchmarkRuleMetadata - all required fields must be present!)
    rule: {
      // Required fields
      id: ruleId,
      name: ruleTemplate.name,
      description: ruleTemplate.description,
      audit: ruleTemplate.audit,
      profile_applicability: ruleTemplate.profile_applicability,
      rationale: ruleTemplate.rationale,
      remediation: ruleTemplate.remediation,
      section: ruleTemplate.section,
      rego_rule_id: ruleTemplate.rego_rule_id, // REQUIRED field!
      tags: ruleTemplate.tags,
      version: '1.0.0',
      // Benchmark object (required with required subfields)
      benchmark: {
        id: benchmark.id,
        name: benchmark.name,
        version: benchmark.version, // Must be prefixed with 'v' like 'v1.5.0'
        rule_number: ruleTemplate.rule_number,
        posture_type: benchmark.posture_type,
      },
      // Optional fields
      impact: ruleTemplate.impact || undefined,
      default_value: ruleTemplate.default_value || undefined,
      references: ruleTemplate.references || undefined,
    },
    tags: ['preserve_original_event', 'forwarded', 'cloud_security_posture-findings'],
    user: {
      id: resourceId,
      name: userName,
    },
  };
}
