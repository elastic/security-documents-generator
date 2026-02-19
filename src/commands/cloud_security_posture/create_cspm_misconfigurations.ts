import { faker } from '@faker-js/faker';
import moment from 'moment';
import {
  CloudProvider,
  CSP_AGENT_VERSION,
  CSPM_PROVIDERS,
  getRandomCisRule,
  getRandomResourceType,
  generateResourceId,
  cloudServiceFromResourceType,
  pickEvaluation,
  CSPMAccount,
} from './csp_utils';

export interface CreateCSPMMisconfigurationParams {
  provider: CloudProvider;
  account?: CSPMAccount;
}

export default function createCSPMMisconfiguration({
  provider,
  account,
}: CreateCSPMMisconfigurationParams) {
  const now = moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const benchmark = CSPM_PROVIDERS[provider];
  const cisRule = getRandomCisRule(provider);
  const resourceType = getRandomResourceType(provider);
  const evaluation = pickEvaluation();
  const accountId = account?.id || faker.string.numeric(12);
  const accountName = account?.name || `${provider}-account-${faker.word.noun()}`;
  const resourceId = generateResourceId(provider, resourceType, accountId);
  const agentId = faker.string.uuid();

  // Provider-specific cloud metadata (derived from the same resourceType)
  const cloudMetadata = generateCloudMetadata(provider, accountId, accountName, resourceType);

  return {
    '@timestamp': now,
    agent: {
      name: `elastic-agent-cspm-${provider}`,
      id: agentId,
      type: 'cloudbeat',
      ephemeral_id: faker.string.uuid(),
      version: CSP_AGENT_VERSION,
    },
    resource: {
      account_id: accountId,
      sub_type: resourceType,
      account_name: accountName,
      name: `${resourceType}-${faker.word.noun()}-${faker.string.alphanumeric(6)}`,
      id: resourceId,
      type: mapResourceTypeToCategory(resourceType),
    },
    cloud_security_posture: {
      package_policy: {
        id: faker.string.uuid(),
        revision: faker.number.int({ min: 1, max: 20 }),
      },
    },
    elastic_agent: {
      id: agentId,
      version: CSP_AGENT_VERSION,
      snapshot: false,
    },
    rule: {
      references: generateRuleReferences(provider, cisRule.id),
      impact: `Non-compliance with ${cisRule.name} may expose the ${provider.toUpperCase()} environment to security risks.`,
      description: `This rule checks whether ${cisRule.name.toLowerCase()}.`,
      default_value: '',
      section: cisRule.section,
      rationale: `Ensuring ${cisRule.name.toLowerCase()} helps maintain a secure ${provider.toUpperCase()} environment according to CIS benchmarks.`,
      version: '1.0',
      benchmark: {
        name: benchmark.name,
        rule_number: cisRule.id,
        id: benchmark.benchmarkId,
        version: benchmark.version,
        posture_type: 'cspm',
      },
      tags: ['CIS', provider.toUpperCase(), `CIS ${cisRule.id}`, cisRule.section],
      remediation: generateRemediation(provider, cisRule),
      audit: generateAudit(provider, cisRule),
      name: cisRule.name,
      id: faker.string.uuid(),
      profile_applicability: faker.helpers.arrayElement(['* Level 1', '* Level 2']),
    },
    message: `Rule "${cisRule.name}": ${evaluation}`,
    result: {
      evaluation,
      evidence: now,
      expected: null,
    },
    cloud: cloudMetadata,
    observer: {
      vendor: 'Elastic',
    },
    cloudbeat: {
      commit_time: '0001-01-01T00:00:00Z',
      version: CSP_AGENT_VERSION,
      policy: {
        commit_time: '0001-01-01T00:00:00Z',
        version: CSP_AGENT_VERSION,
      },
    },
    ecs: {
      version: '8.6.0',
    },
    related: {
      entity: [resourceId],
    },
    data_stream: {
      namespace: 'default',
      type: 'logs',
      dataset: 'cloud_security_posture.findings',
    },
    event: {
      agent_id_status: 'verified',
      sequence: faker.number.int({ min: 1000000000, max: 9999999999 }),
      created: now,
      kind: 'state',
      id: faker.string.uuid(),
      category: ['configuration'],
      type: ['info'],
      dataset: 'cloud_security_posture.findings',
      outcome: 'success',
    },
  };
}

function generateCloudMetadata(
  provider: CloudProvider,
  accountId: string,
  accountName: string,
  resourceType: string
): object {
  const baseMetadata = {
    provider,
    account: {
      id: accountId,
      name: accountName,
    },
    service: {
      name: cloudServiceFromResourceType(provider, resourceType),
    },
  };

  switch (provider) {
    case 'aws':
      return {
        ...baseMetadata,
        region: faker.helpers.arrayElement([
          'us-east-1',
          'us-west-2',
          'eu-west-1',
          'eu-central-1',
          'ap-southeast-1',
        ]),
      };
    case 'azure':
      return {
        ...baseMetadata,
        region: faker.helpers.arrayElement([
          'eastus',
          'westus2',
          'westeurope',
          'northeurope',
          'southeastasia',
        ]),
      };
    case 'gcp':
      return {
        ...baseMetadata,
        Organization: {
          id: faker.string.numeric(12),
        },
        region: faker.helpers.arrayElement([
          'us-central1',
          'us-east1',
          'europe-west1',
          'europe-west3',
          'asia-southeast1',
        ]),
      };
    default:
      return baseMetadata;
  }
}

function mapResourceTypeToCategory(resourceType: string): string {
  if (
    resourceType.includes('storage') ||
    resourceType.includes('s3') ||
    resourceType.includes('bucket')
  ) {
    return 'cloud-storage';
  }
  if (
    resourceType.includes('iam') ||
    resourceType.includes('user') ||
    resourceType.includes('role')
  ) {
    return 'identity-management';
  }
  if (
    resourceType.includes('security-group') ||
    resourceType.includes('firewall') ||
    resourceType.includes('network')
  ) {
    return 'cloud-network';
  }
  if (
    resourceType.includes('ec2') ||
    resourceType.includes('vm') ||
    resourceType.includes('instance')
  ) {
    return 'cloud-compute';
  }
  if (
    resourceType.includes('rds') ||
    resourceType.includes('sql') ||
    resourceType.includes('database')
  ) {
    return 'cloud-database';
  }
  return 'cloud-config';
}

function generateRuleReferences(provider: CloudProvider, ruleId: string): string {
  const baseUrls: Record<CloudProvider, string> = {
    aws: 'https://docs.aws.amazon.com/securityhub/latest/userguide/',
    azure: 'https://docs.microsoft.com/en-us/azure/security/',
    gcp: 'https://cloud.google.com/docs/security/',
  };

  return `1. ${baseUrls[provider]}cis-${provider}-benchmark\n2. CIS ${provider.toUpperCase()} Benchmark ${ruleId}`;
}

function generateRemediation(
  provider: CloudProvider,
  cisRule: { id: string; name: string; section: string }
): string {
  return `**From ${provider.toUpperCase()} Console**\n\n1. Navigate to the ${cisRule.section} section\n2. Locate the affected resource\n3. Apply the recommended configuration to ensure ${cisRule.name.toLowerCase()}\n4. Verify the change has been applied successfully\n\n**Using CLI**\n\nRefer to ${provider.toUpperCase()} documentation for CLI commands to remediate CIS rule ${cisRule.id}.`;
}

function generateAudit(
  provider: CloudProvider,
  cisRule: { id: string; name: string; section: string }
): string {
  return `**From ${provider.toUpperCase()} Console**\n\n1. Sign in to the ${provider.toUpperCase()} Console\n2. Navigate to ${cisRule.section}\n3. Review the configuration settings\n4. Verify that ${cisRule.name.toLowerCase()}\n\n**Using CLI**\n\nRefer to ${provider.toUpperCase()} documentation for CLI commands to audit CIS rule ${cisRule.id}.`;
}
