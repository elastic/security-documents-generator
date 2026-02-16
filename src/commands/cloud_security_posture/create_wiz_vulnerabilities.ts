import { faker } from '@faker-js/faker';
import moment from 'moment';
import { getRandomCve, pickSeverity, CSPMAccount, CloudProvider } from './csp_utils';

export interface CreateWizVulnerabilityParams {
  account?: CSPMAccount;
}

export default function createWizVulnerability({ account }: CreateWizVulnerabilityParams = {}) {
  const now = moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const cve = getRandomCve();
  const severity = pickSeverity();
  const provider =
    account?.provider || (faker.helpers.arrayElement(['aws', 'azure', 'gcp']) as CloudProvider);
  const accountId = account?.id || faker.string.numeric(12);
  const accountName = account?.name || `${provider}-account-${faker.word.noun()}`;

  const findingId = faker.string.uuid();
  const assetId = faker.string.uuid();
  const providerUniqueId = generateProviderUniqueId(provider, accountId);
  const assetName = `${faker.word.noun()}-${faker.string.alphanumeric(4)}`;
  const assetType = faker.helpers.arrayElement([
    'VIRTUAL_MACHINE',
    'CONTAINER_IMAGE',
    'SERVERLESS',
  ]);
  const region = getRegionForProvider(provider);

  const packageVersion = `${faker.number.int({ min: 1, max: 5 })}.${faker.number.int({ min: 0, max: 30 })}.${faker.number.int({ min: 0, max: 99 })}`;
  const score = severityToScore(severity);
  const detectionMethod = faker.helpers.arrayElement([
    'PACKAGE',
    'OS',
    'LIBRARY',
    'INSTALLED_PROGRAM',
    'FILE_PATH',
  ]);

  const ipAddresses = [faker.internet.ipv4(), faker.internet.ipv4()];

  const description = `The package \`${cve.package}\` version \`${packageVersion}\` was detected in \`${detectionMethod}\` on a machine running \`Linux\` is vulnerable to \`${cve.id}\`, which exists in versions \`<${cve.fixedVersion}\`.\n\nThe vulnerability can be remediated by updating the package to version \`${cve.fixedVersion}\` or higher.`;

  const link = `https://nvd.nist.gov/vuln/detail/${cve.id}`;

  // Build the document matching the actual Wiz integration schema
  return {
    '@timestamp': now,
    data_stream: {
      namespace: 'default',
      type: 'logs',
      dataset: 'wiz.vulnerability',
    },
    ecs: {
      version: '8.11.0',
    },
    event: {
      created: now,
      kind: 'alert', // Wiz vulnerabilities are alerts, not state
      id: findingId,
      category: ['vulnerability'],
      type: ['info'],
      dataset: 'wiz.vulnerability',
    },
    // Top-level message from description
    message: description,
    // Device ID from vulnerable asset
    device: {
      id: assetId,
    },
    // Vulnerability ECS fields
    vulnerability: {
      id: cve.id,
      title: `Vulnerability found - ${cve.id}`,
      description: cve.title,
      severity,
      cwe: cve.id, // Same as vulnerability.id per pipeline
      reference: link,
      score: {
        base: score,
      },
      package: {
        name: cve.package,
        version: packageVersion,
        fixed_version: cve.fixedVersion,
      },
    },
    // Package ECS fields (top-level)
    package: {
      name: cve.package,
      version: packageVersion,
      fixed_version: cve.fixedVersion,
    },
    // Related IPs
    related: {
      ip: ipAddresses,
    },
    // Resource fields
    resource: {
      id: providerUniqueId,
      name: assetName,
    },
    // Host fields (for VIRTUAL_MACHINE type)
    host:
      assetType === 'VIRTUAL_MACHINE'
        ? {
            name: assetName.toLowerCase(),
            os: {
              family: 'Linux',
            },
          }
        : undefined,
    // Container fields (for CONTAINER_IMAGE type)
    container:
      assetType === 'CONTAINER_IMAGE'
        ? {
            image: {
              name: assetName,
            },
          }
        : undefined,
    // Cloud fields
    cloud: {
      provider: provider.toUpperCase(), // Must be uppercase: AWS, Azure, GCP
      region,
      account: {
        name: accountName,
      },
    },
    // Observer vendor
    observer: {
      vendor: 'Wiz',
    },
    // Wiz-specific fields matching the actual integration schema
    wiz: {
      vulnerability: {
        id: findingId,
        name: cve.id,
        description,
        cve_description: cve.title,
        cvss_severity: severity,
        score,
        exploitability_score: faker.number.float({ min: 0, max: 4, fractionDigits: 1 }),
        impact_score: faker.number.float({ min: 0, max: 6, fractionDigits: 1 }),
        has_exploit: faker.datatype.boolean(),
        has_cisa_kev_exploit: faker.datatype.boolean(),
        first_detected_at: moment()
          .subtract(faker.number.int({ min: 1, max: 180 }), 'days')
          .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
        last_detected_at: now,
        status: faker.helpers.arrayElement(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
        remedation: `Upgrade ${cve.package} to version ${cve.fixedVersion} or later.`, // Note: typo matches actual schema
        resolution_reason: faker.helpers.arrayElement(['FIXED', 'WONT_FIX', 'ACCEPTED_RISK', null]),
        resolved_at: faker.datatype.boolean()
          ? moment()
              .subtract(faker.number.int({ min: 1, max: 30 }), 'days')
              .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ')
          : null,
        detailed_name: cve.package,
        detection_method: detectionMethod,
        version: packageVersion,
        fixed_version: cve.fixedVersion,
        vendor_severity: severity,
        data_source_name: 'NVD',
        link,
        portal_url: `https://app.wiz.io/explorer/vulnerability-findings#~(entity~(~'${findingId}*2cSECURITY_TOOL_FINDING))`,
        location_path: `/usr/lib/${cve.package}`,
        validated_in_runtime: faker.datatype.boolean(),
        epss: {
          percentile: faker.number.float({ min: 0, max: 100, fractionDigits: 1 }),
          probability: faker.number.float({ min: 0, max: 1, fractionDigits: 4 }),
          severity: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
        },
        layer_metadata: {
          id: faker.string.uuid(),
          details: faker.lorem.sentence(),
          is_base_layer: faker.datatype.boolean(),
        },
        ignore_rules: faker.datatype.boolean()
          ? {
              enabled: true,
              id: faker.string.alphanumeric(10),
              name: faker.word.noun(),
              expired_at: moment()
                .add(faker.number.int({ min: 30, max: 365 }), 'days')
                .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
            }
          : undefined,
        projects: [
          {
            id: faker.string.uuid(),
            name: `Project-${faker.word.noun()}`,
            slug: faker.helpers.slugify(`project-${faker.word.noun()}`).toLowerCase(),
            business_unit: faker.helpers.arrayElement(['Dev', 'Prod', 'QA', '']),
            risk_profile: {
              business_impact: faker.helpers.arrayElement(['MBI', 'LBI', 'HBI']),
            },
          },
        ],
        // vulnerable_asset structure matching the actual integration
        vulnerable_asset: {
          id: assetId,
          name: assetName,
          type: assetType,
          status: 'Active',
          provider_unique_id: providerUniqueId,
          ip_addresses: ipAddresses,
          operating_system: 'Linux',
          region,
          cloud: {
            platform: provider.toUpperCase(),
            provider_url: generateCloudProviderUrl(provider, region, accountId),
          },
          subscription: {
            id: faker.string.uuid(),
            name: accountName,
            external_id: accountId,
          },
          has_limited_internet_exposure: faker.datatype.boolean(),
          has_wide_internet_exposure: faker.datatype.boolean(),
          is_accessible_from: {
            other_subscriptions: faker.datatype.boolean(),
            other_vnets: faker.datatype.boolean(),
            vpn: faker.datatype.boolean(),
          },
          tags: {
            name: assetName,
          },
        },
      },
    },
  };
}

function severityToScore(severity: string): number {
  switch (severity) {
    case 'CRITICAL':
      return faker.number.float({ min: 9.0, max: 10.0, fractionDigits: 1 });
    case 'HIGH':
      return faker.number.float({ min: 7.0, max: 8.9, fractionDigits: 1 });
    case 'MEDIUM':
      return faker.number.float({ min: 4.0, max: 6.9, fractionDigits: 1 });
    case 'LOW':
      return faker.number.float({ min: 0.1, max: 3.9, fractionDigits: 1 });
    default:
      return 5.0;
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

function generateProviderUniqueId(provider: CloudProvider, accountId: string): string {
  switch (provider) {
    case 'aws':
      return `arn:aws:ec2:us-east-1:${accountId}:instance/i-${faker.string.alphanumeric(17)}`;
    case 'azure':
      return `/subscriptions/${accountId}/resourceGroups/rg-${faker.word.noun()}/providers/Microsoft.Compute/virtualMachines/vm-${faker.string.alphanumeric(8)}`;
    case 'gcp':
      return `projects/${accountId}/zones/us-central1-a/instances/instance-${faker.string.alphanumeric(8)}`;
    default:
      return faker.string.uuid();
  }
}

function generateCloudProviderUrl(
  provider: CloudProvider,
  region: string,
  accountId: string
): string {
  switch (provider) {
    case 'aws':
      return `https://${region}.console.aws.amazon.com/ec2/v2/home?region=${region}#InstanceDetails:instanceId=i-${faker.string.alphanumeric(17)}`;
    case 'azure':
      return `https://portal.azure.com/#@/resource/subscriptions/${accountId}/resourceGroups/rg-${faker.word.noun()}/providers/Microsoft.Compute/virtualMachines/vm-${faker.string.alphanumeric(8)}`;
    case 'gcp':
      return `https://console.cloud.google.com/compute/instancesDetail/zones/${region}-a/instances/instance-${faker.string.alphanumeric(8)}?project=${accountId}`;
    default:
      return '';
  }
}
