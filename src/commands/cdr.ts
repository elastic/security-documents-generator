import { generateNewSeed } from '../constants';
import { faker } from '@faker-js/faker';
import { ingest, indexCheck } from './utils/indices';
import { installPackage } from '../utils/kibana_api';
import { createCdrVulnerability } from '../create_cdr_vulnerability';
import { createCdrMisconfiguration } from '../create_cdr_misconfiguration';
import { createCspMisconfiguration } from '../create_csp_misconfiguration';
import cdrVulnerabilityMappings from '../mappings/cdrVulnerabilityMappings.json' assert { type: 'json' };
import cdrMisconfigurationMappings from '../mappings/cdrMisconfigurationMappings.json' assert { type: 'json' };
import cspMisconfigurationMappings from '../mappings/cspMisconfigurationMappings.json' assert { type: 'json' };
import { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

export const CDR_OPTIONS = {
  misconfigurations: 'misconfigurations',
  csp_misconfigurations: 'csp_misconfigurations',
  vulnerabilities: 'vulnerabilities',
} as const;

export type CdrOption = (typeof CDR_OPTIONS)[keyof typeof CDR_OPTIONS];

// Index patterns matching the transform destinations
export const CDR_VULNERABILITY_INDEX = 'security_solution-wiz.vulnerability_latest';
export const CDR_MISCONFIGURATION_INDEX = 'security_solution-wiz.misconfiguration_latest';
export const CDR_CSP_MISCONFIGURATION_INDEX = 'security_solution-cloud_security_posture.misconfiguration_latest';

const WIZ_PACKAGE = 'wiz';
const CSP_PACKAGE = 'cloud_security_posture';

interface CdrCommandParams {
  options: CdrOption[];
  count: number;
  space: string;
  seed?: number;
}

/**
 * Generate unique vulnerability documents based on uniqueness constraints:
 * vulnerability.id, resource.id, vulnerability.package.name, vulnerability.package.version, data_stream.namespace
 */
const generateUniqueVulnerabilities = (
  count: number,
  space: string
): ReturnType<typeof createCdrVulnerability>[] => {
  const docs: ReturnType<typeof createCdrVulnerability>[] = [];

  // Generate pools of unique values for uniqueness fields
  const cveIds = Array.from({ length: Math.min(count, 50) }, (_, i) => `CVE-2024-${10000 + i}`);
  const resourceIds = Array.from({ length: Math.min(count, 20) }, () =>
    `arn:aws:ec2:us-east-1:${faker.string.numeric(12)}:instance/${faker.string.alphanumeric(17)}`
  );
  const packageNames = [
    'openssl',
    'curl',
    'zlib',
    'libtiff',
    'libpng',
    'nginx',
    'apache',
    'nodejs',
    'python',
    'ruby',
  ];
  const packageVersions = ['1.0.0', '1.1.0', '2.0.0', '2.1.0', '3.0.0'];

  // Track used combinations to ensure uniqueness
  const usedCombinations = new Set<string>();

  let attempts = 0;
  const maxAttempts = count * 10;

  while (docs.length < count && attempts < maxAttempts) {
    attempts++;

    const vulnerabilityId = faker.helpers.arrayElement(cveIds);
    const resourceId = faker.helpers.arrayElement(resourceIds);
    const packageName = faker.helpers.arrayElement(packageNames);
    const packageVersion = faker.helpers.arrayElement(packageVersions);

    const combinationKey = `${vulnerabilityId}|${resourceId}|${packageName}|${packageVersion}|${space}`;

    if (!usedCombinations.has(combinationKey)) {
      usedCombinations.add(combinationKey);
      docs.push(
        createCdrVulnerability({
          vulnerabilityId,
          resourceId,
          packageName,
          packageVersion,
          space,
        })
      );
    }
  }

  return docs;
};

/**
 * Generate unique misconfiguration documents based on uniqueness constraints:
 * rule.uuid, resource.id, data_stream.namespace
 */
const generateUniqueMisconfigurations = (
  count: number,
  space: string
): ReturnType<typeof createCdrMisconfiguration>[] => {
  const docs: ReturnType<typeof createCdrMisconfiguration>[] = [];

  // Generate pools of unique values for uniqueness fields
  const ruleUuids = Array.from({ length: Math.min(count, 30) }, () => faker.string.uuid());
  const resourceIds = Array.from({ length: Math.min(count, 20) }, () =>
    `arn:aws:iam::${faker.string.numeric(12)}:${faker.helpers.arrayElement(['user', 'role', 'policy'])}/${faker.internet.username()}`
  );

  // Track used combinations to ensure uniqueness
  const usedCombinations = new Set<string>();

  let attempts = 0;
  const maxAttempts = count * 10;

  while (docs.length < count && attempts < maxAttempts) {
    attempts++;

    const ruleUuid = faker.helpers.arrayElement(ruleUuids);
    const resourceId = faker.helpers.arrayElement(resourceIds);

    const combinationKey = `${ruleUuid}|${resourceId}|${space}`;

    if (!usedCombinations.has(combinationKey)) {
      usedCombinations.add(combinationKey);
      docs.push(
        createCdrMisconfiguration({
          ruleUuid,
          resourceId,
          space,
        })
      );
    }
  }

  return docs;
};

/**
 * Generate unique CSP (Cloud Security Posture) misconfiguration documents based on uniqueness constraints:
 * rule.id, resource.id, data_stream.namespace
 */
const generateUniqueCspMisconfigurations = (
  count: number,
  space: string
): ReturnType<typeof createCspMisconfiguration>[] => {
  const docs: ReturnType<typeof createCspMisconfiguration>[] = [];

  // Generate pools of unique values for uniqueness fields
  // Use CIS rule IDs like cis_1.1, cis_1.4, etc.
  const ruleIds = Array.from({ length: Math.min(count, 30) }, (_, i) => {
    const section = Math.floor(i / 5) + 1;
    const rule = (i % 5) + 1;
    return `cis_${section}.${rule}`;
  });
  const resourceIds = Array.from({ length: Math.min(count, 20) }, () =>
    `arn:aws:${faker.helpers.arrayElement(['iam', 'ec2', 's3', 'rds'])}::${faker.string.numeric(12)}:${faker.helpers.arrayElement(['user', 'instance', 'bucket', 'db'])}/${faker.string.alphanumeric(12)}`
  );

  // Track used combinations to ensure uniqueness
  const usedCombinations = new Set<string>();

  let attempts = 0;
  const maxAttempts = count * 10;

  while (docs.length < count && attempts < maxAttempts) {
    attempts++;

    const ruleId = faker.helpers.arrayElement(ruleIds);
    const resourceId = faker.helpers.arrayElement(resourceIds);

    const combinationKey = `${ruleId}|${resourceId}|${space}`;

    if (!usedCombinations.has(combinationKey)) {
      usedCombinations.add(combinationKey);
      docs.push(
        createCspMisconfiguration({
          ruleId,
          resourceId,
          space,
        })
      );
    }
  }

  return docs;
};

export const cdrCommand = async ({ options, count, space, seed = generateNewSeed() }: CdrCommandParams) => {
  faker.seed(seed);
  console.log(`Using seed: ${seed}`);

  // Determine which packages to install based on selected options
  const needsWiz =
    options.includes(CDR_OPTIONS.vulnerabilities) || options.includes(CDR_OPTIONS.misconfigurations);
  const needsCsp = options.includes(CDR_OPTIONS.csp_misconfigurations);

  // Install the wiz package if needed
  if (needsWiz) {
    console.log('Installing wiz package...');
    try {
      await installPackage({ packageName: WIZ_PACKAGE, space });
      console.log('Wiz package installed successfully');
    } catch (error) {
      console.log('Wiz package may already be installed, continuing...');
    }
  }

  // Install the cloud_security_posture package if needed
  if (needsCsp) {
    console.log('Installing cloud_security_posture package...');
    try {
      await installPackage({ packageName: CSP_PACKAGE, space });
      console.log('Cloud Security Posture package installed successfully');
    } catch (error) {
      console.log('Cloud Security Posture package may already be installed, continuing...');
    }
  }

  if (options.includes(CDR_OPTIONS.vulnerabilities)) {
    console.log(`\nGenerating ${count} CDR vulnerabilities (Wiz)...`);

    // Ensure index exists with proper mappings
    await indexCheck(CDR_VULNERABILITY_INDEX, {
      mappings: cdrVulnerabilityMappings as MappingTypeMapping,
    });

    const vulnerabilityDocs = generateUniqueVulnerabilities(count, space);
    console.log(`Generated ${vulnerabilityDocs.length} unique vulnerability documents`);

    await ingest(CDR_VULNERABILITY_INDEX, vulnerabilityDocs);
    console.log(`Ingested vulnerabilities to ${CDR_VULNERABILITY_INDEX}`);
  }

  if (options.includes(CDR_OPTIONS.misconfigurations)) {
    console.log(`\nGenerating ${count} CDR misconfigurations (Wiz)...`);

    // Ensure index exists with proper mappings
    await indexCheck(CDR_MISCONFIGURATION_INDEX, {
      mappings: cdrMisconfigurationMappings as MappingTypeMapping,
    });

    const misconfigurationDocs = generateUniqueMisconfigurations(count, space);
    console.log(`Generated ${misconfigurationDocs.length} unique misconfiguration documents`);

    await ingest(CDR_MISCONFIGURATION_INDEX, misconfigurationDocs);
    console.log(`Ingested misconfigurations to ${CDR_MISCONFIGURATION_INDEX}`);
  }

  if (options.includes(CDR_OPTIONS.csp_misconfigurations)) {
    console.log(`\nGenerating ${count} CDR misconfigurations (Elastic CSP)...`);

    // Ensure index exists with proper mappings
    await indexCheck(CDR_CSP_MISCONFIGURATION_INDEX, {
      mappings: cspMisconfigurationMappings as MappingTypeMapping,
    });

    const cspMisconfigurationDocs = generateUniqueCspMisconfigurations(count, space);
    console.log(`Generated ${cspMisconfigurationDocs.length} unique CSP misconfiguration documents`);

    await ingest(CDR_CSP_MISCONFIGURATION_INDEX, cspMisconfigurationDocs);
    console.log(`Ingested CSP misconfigurations to ${CDR_CSP_MISCONFIGURATION_INDEX}`);
  }

  console.log('\nCDR data generation complete!');
};
