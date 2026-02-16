import { faker } from '@faker-js/faker';
import moment from 'moment';
import {
  KSPMDistribution,
  KSPM_DISTRIBUTIONS,
  getRandomCisRule,
  getRandomResourceType,
  pickEvaluation,
  KSPMCluster,
} from './csp_utils';

export interface CreateKSPMMisconfigurationParams {
  distribution: KSPMDistribution;
  cluster?: KSPMCluster;
}

export default function createKSPMMisconfiguration({
  distribution,
  cluster,
}: CreateKSPMMisconfigurationParams) {
  const now = moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const benchmark = KSPM_DISTRIBUTIONS[distribution];
  const ruleType = distribution === 'eks' ? 'eks' : 'k8s';
  const cisRule = getRandomCisRule(ruleType);
  const resourceType = getRandomResourceType('k8s');
  const evaluation = pickEvaluation();
  const clusterId = cluster?.id || faker.string.uuid();
  const clusterName = cluster?.name || `${distribution}-cluster-${faker.word.noun()}`;
  const agentId = faker.string.uuid();

  // Generate namespace and resource info
  const namespace = faker.helpers.arrayElement([
    'default',
    'kube-system',
    'kube-public',
    'monitoring',
    'logging',
    'production',
    'staging',
  ]);
  const resourceName = `${resourceType.replace('k8s-', '')}-${faker.word.noun()}-${faker.string.alphanumeric(5)}`;
  const resourceId = `${namespace}/${resourceName}`;

  // EKS-specific cloud metadata
  const cloudMetadata = distribution === 'eks' ? generateEKSCloudMetadata() : undefined;

  const baseDoc = {
    '@timestamp': now,
    agent: {
      name: `elastic-agent-kspm-${distribution}`,
      id: agentId,
      type: 'cloudbeat',
      ephemeral_id: faker.string.uuid(),
      version: '9.0.0',
    },
    resource: {
      sub_type: resourceType,
      name: resourceName,
      id: resourceId,
      type: mapK8sResourceTypeToCategory(resourceType),
    },
    cloud_security_posture: {
      package_policy: {
        id: faker.string.uuid(),
        revision: faker.number.int({ min: 1, max: 20 }),
      },
    },
    elastic_agent: {
      id: agentId,
      version: '9.0.0',
      snapshot: false,
    },
    rule: {
      references: generateRuleReferences(distribution, cisRule.id),
      impact: `Non-compliance with ${cisRule.name} may expose the Kubernetes cluster to security risks.`,
      description: `This rule checks whether ${cisRule.name.toLowerCase()}.`,
      default_value: '',
      section: cisRule.section,
      rationale: `Ensuring ${cisRule.name.toLowerCase()} helps maintain a secure Kubernetes environment according to CIS benchmarks.`,
      version: '1.0',
      benchmark: {
        name: benchmark.name,
        rule_number: cisRule.id,
        id: benchmark.benchmarkId,
        version: benchmark.version,
        posture_type: 'kspm',
      },
      tags: ['CIS', 'Kubernetes', `CIS ${cisRule.id}`, cisRule.section],
      remediation: generateRemediation(cisRule),
      audit: generateAudit(cisRule),
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
    orchestrator: {
      cluster: {
        id: clusterId,
        name: clusterName,
      },
      type: 'kubernetes',
      namespace,
      resource: {
        type: resourceType.replace('k8s-', ''),
        name: resourceName,
      },
    },
    observer: {
      vendor: 'Elastic',
    },
    cloudbeat: {
      commit_time: '0001-01-01T00:00:00Z',
      version: '9.0.0',
      policy: {
        commit_time: '0001-01-01T00:00:00Z',
        version: '9.0.0',
      },
    },
    ecs: {
      version: '8.6.0',
    },
    related: {
      entity: [resourceId, clusterId],
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

  // Add cloud metadata for EKS
  if (cloudMetadata) {
    return {
      ...baseDoc,
      cloud: cloudMetadata,
    };
  }

  return baseDoc;
}

function generateEKSCloudMetadata(): object {
  const accountId = faker.string.numeric(12);
  return {
    provider: 'aws',
    account: {
      id: accountId,
      name: `aws-eks-account-${faker.word.noun()}`,
    },
    region: faker.helpers.arrayElement([
      'us-east-1',
      'us-west-2',
      'eu-west-1',
      'eu-central-1',
      'ap-southeast-1',
    ]),
    service: {
      name: 'AWS EKS',
    },
    instance: {
      id: faker.string.uuid(),
    },
  };
}

function mapK8sResourceTypeToCategory(resourceType: string): string {
  if (resourceType.includes('pod') || resourceType.includes('deployment')) {
    return 'k8s-workload';
  }
  if (resourceType.includes('service') || resourceType.includes('networkpolicy')) {
    return 'k8s-network';
  }
  if (resourceType.includes('secret') || resourceType.includes('configmap')) {
    return 'k8s-config';
  }
  if (
    resourceType.includes('role') ||
    resourceType.includes('serviceaccount') ||
    resourceType.includes('clusterrole')
  ) {
    return 'k8s-rbac';
  }
  if (resourceType.includes('namespace')) {
    return 'k8s-namespace';
  }
  return 'k8s-resource';
}

function generateRuleReferences(distribution: KSPMDistribution, ruleId: string): string {
  const baseUrls: Record<KSPMDistribution, string> = {
    vanilla: 'https://kubernetes.io/docs/concepts/security/',
    eks: 'https://docs.aws.amazon.com/eks/latest/userguide/security.html',
  };

  const cisDoc = distribution === 'eks' ? 'CIS Amazon EKS Benchmark' : 'CIS Kubernetes Benchmark';

  return `1. ${baseUrls[distribution]}\n2. ${cisDoc} ${ruleId}`;
}

function generateRemediation(cisRule: { id: string; name: string; section: string }): string {
  return `**Using kubectl**\n\n1. Review the current configuration:\n   \`\`\`\n   kubectl get <resource-type> -A -o yaml\n   \`\`\`\n\n2. Apply the recommended configuration to ensure ${cisRule.name.toLowerCase()}\n\n3. Verify the change:\n   \`\`\`\n   kubectl describe <resource-type> <resource-name>\n   \`\`\`\n\n**Using YAML manifests**\n\nUpdate your deployment manifests according to CIS rule ${cisRule.id} and apply changes.`;
}

function generateAudit(cisRule: { id: string; name: string; section: string }): string {
  return `**Using kubectl**\n\n1. Run the following command to check the ${cisRule.section} configuration:\n   \`\`\`\n   kubectl get <resource-type> -A -o yaml | grep -E '<relevant-field>'\n   \`\`\`\n\n2. Verify that ${cisRule.name.toLowerCase()}\n\n**Using API**\n\nQuery the Kubernetes API to audit CIS rule ${cisRule.id}.`;
}
