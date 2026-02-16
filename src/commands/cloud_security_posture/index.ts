import { faker } from '@faker-js/faker';
import moment from 'moment';
import { ingest } from '../utils/indices';
import { installPackage } from '../../utils/kibana_api';
import { generateNewSeed } from '../../constants';
import {
  generateCSPMAccounts,
  generateKSPMClusters,
  CSPMAccount,
  MISCONFIGURATION_INDEX,
  VULNERABILITY_INDEX,
  CSP_SCORES_INDEX,
  WIZ_MISCONFIGURATION_INDEX,
  WIZ_VULNERABILITY_INDEX,
  QUALYS_VULNERABILITY_INDEX,
  TENABLE_VULNERABILITY_INDEX,
  AWS_MISCONFIGURATION_INDEX,
} from './csp_utils';
import createCSPMMisconfiguration from './create_cspm_misconfigurations';
import createKSPMMisconfiguration from './create_kspm_misconfigurations';
import createCNVMVulnerability from './create_cnvm_vulnerabilities';
import createCSPScores, {
  aggregateMisconfigurationStats,
  aggregateVulnerabilityStats,
  createVulnMgmtScores,
  VulnerabilityStats,
} from './create_csp_scores';
import createWizMisconfiguration from './create_wiz_misconfigurations';
import createWizVulnerability from './create_wiz_vulnerabilities';
import createQualysVulnerability from './create_qualys_vulnerabilities';
import createTenableVulnerability from './create_tenable_vulnerabilities';
import createAwsSecurityHubMisconfiguration from './create_aws_securityhub_misconfigurations';

// Individual data sources
export const ALL_DATA_SOURCES = [
  // Native Elastic
  'elastic_cspm_aws',
  'elastic_cspm_gcp',
  'elastic_cspm_azure',
  'elastic_kspm_vanilla',
  'elastic_kspm_eks',
  'elastic_cnvm',
  // Wiz
  'wiz_misconfigs',
  'wiz_vulnerabilities',
  // Qualys
  'qualys_vulnerabilities',
  // Tenable
  'tenable_vulnerabilities',
  // AWS Security Hub (aws package, ASFF)
  'aws_misconfigs',
] as const;

export type DataSource = (typeof ALL_DATA_SOURCES)[number];

// Shortcuts
const ELASTIC_DATA_SOURCES: DataSource[] = [
  'elastic_cspm_aws',
  'elastic_cspm_gcp',
  'elastic_cspm_azure',
  'elastic_kspm_vanilla',
  'elastic_kspm_eks',
  'elastic_cnvm',
];

const SHORTCUTS: Record<string, DataSource[]> = {
  all: [...ALL_DATA_SOURCES],
  elastic_all: ELASTIC_DATA_SOURCES,
};

export interface GenerateCSPParams {
  seed?: number;
  dataSources: DataSource[];
  findingsCount: number;
  generateCspScores?: boolean;
}

/**
 * Resolve user input (which may contain shortcuts) into a flat list of data sources.
 */
export function resolveDataSources(input: string[]): DataSource[] {
  const resolved = new Set<DataSource>();

  for (const item of input) {
    if (item in SHORTCUTS) {
      for (const ds of SHORTCUTS[item]) resolved.add(ds);
    } else if ((ALL_DATA_SOURCES as readonly string[]).includes(item)) {
      resolved.add(item as DataSource);
    } else {
      console.error(`Unknown data source: ${item}`);
      console.error(`Valid options: all, elastic_all, ${ALL_DATA_SOURCES.join(', ')}`);
      process.exit(1);
    }
  }

  return [...resolved];
}

export const generateCloudSecurityPosture = async ({
  seed = generateNewSeed(),
  dataSources,
  findingsCount,
  generateCspScores = true,
}: GenerateCSPParams) => {
  faker.seed(seed);

  console.log(`Generating CSP data with seed: ${seed}`);
  console.log(`Data sources: ${dataSources.join(', ')}`);
  console.log(`Findings count per source: ${findingsCount}`);

  // Derive which providers/distributions are needed from selected data sources
  const cspmProviders = new Set<'aws' | 'gcp' | 'azure'>();
  if (dataSources.includes('elastic_cspm_aws')) cspmProviders.add('aws');
  if (dataSources.includes('elastic_cspm_gcp')) cspmProviders.add('gcp');
  if (dataSources.includes('elastic_cspm_azure')) cspmProviders.add('azure');

  const kspmDistributions = new Set<'vanilla' | 'eks'>();
  if (dataSources.includes('elastic_kspm_vanilla')) kspmDistributions.add('vanilla');
  if (dataSources.includes('elastic_kspm_eks')) kspmDistributions.add('eks');

  // CNVM needs an AWS account
  if (dataSources.includes('elastic_cnvm') && !cspmProviders.has('aws')) {
    cspmProviders.add('aws');
  }

  // AWS Security Hub misconfigs need AWS accounts
  if (dataSources.includes('aws_misconfigs') && !cspmProviders.has('aws')) {
    cspmProviders.add('aws');
  }
  // 3rd party sources that support multi-cloud: if no providers selected, default to AWS
  const needs3pAccounts =
    dataSources.includes('wiz_misconfigs') ||
    dataSources.includes('wiz_vulnerabilities') ||
    dataSources.includes('qualys_vulnerabilities') ||
    dataSources.includes('tenable_vulnerabilities');
  if (needs3pAccounts && cspmProviders.size === 0) {
    cspmProviders.add('aws');
  }

  // Generate accounts and clusters
  const accounts = cspmProviders.size > 0 ? generateCSPMAccounts([...cspmProviders]) : [];
  const clusters = kspmDistributions.size > 0 ? generateKSPMClusters([...kspmDistributions]) : [];

  if (accounts.length > 0) {
    console.log(
      `Generated ${accounts.length} account(s): ${accounts.map((a) => `${a.provider}:${a.id}`).join(', ')}`
    );
  }
  if (clusters.length > 0) {
    console.log(
      `Generated ${clusters.length} cluster(s): ${clusters.map((c) => `${c.distribution}:${c.id.slice(0, 8)}`).join(', ')}`
    );
  }

  // Collect native elastic data for CSP scores aggregation
  const cspmMisconfigs: object[] = [];
  const kspmMisconfigs: object[] = [];
  const cnvmVulnerabilities: object[] = [];

  // ------- Native Elastic: CSPM -------
  const hasAnyCspm =
    cspmProviders.size > 0 && dataSources.some((ds) => ds.startsWith('elastic_cspm_'));
  if (hasAnyCspm) {
    await installPackage({ packageName: 'cloud_security_posture' });

    for (const provider of cspmProviders) {
      if (!dataSources.includes(`elastic_cspm_${provider}` as DataSource)) continue;

      const providerAccounts = accounts.filter((a) => a.provider === provider);
      console.log(`\n--- Generating Elastic CSPM ${provider.toUpperCase()} ---`);

      for (const account of providerAccounts) {
        const docs = faker.helpers.multiple(
          () => createCSPMMisconfiguration({ provider: account.provider, account }),
          { count: findingsCount }
        );
        cspmMisconfigs.push(...docs);
      }

      console.log(
        `Generated ${providerAccounts.length * findingsCount} CSPM ${provider} misconfigurations`
      );
    }

    await ingest(MISCONFIGURATION_INDEX, cspmMisconfigs);
  }

  // ------- Native Elastic: KSPM -------
  const hasAnyKspm =
    kspmDistributions.size > 0 && dataSources.some((ds) => ds.startsWith('elastic_kspm_'));
  if (hasAnyKspm) {
    await installPackage({ packageName: 'cloud_security_posture' });

    for (const distribution of kspmDistributions) {
      if (!dataSources.includes(`elastic_kspm_${distribution}` as DataSource)) continue;

      const distClusters = clusters.filter((c) => c.distribution === distribution);
      console.log(`\n--- Generating Elastic KSPM ${distribution} ---`);

      for (const cluster of distClusters) {
        const docs = faker.helpers.multiple(
          () => createKSPMMisconfiguration({ distribution: cluster.distribution, cluster }),
          { count: findingsCount }
        );
        kspmMisconfigs.push(...docs);
      }

      console.log(
        `Generated ${distClusters.length * findingsCount} KSPM ${distribution} misconfigurations`
      );
    }

    await ingest(MISCONFIGURATION_INDEX, kspmMisconfigs);
  }

  // ------- Native Elastic: CNVM -------
  if (dataSources.includes('elastic_cnvm')) {
    await installPackage({ packageName: 'cloud_security_posture' });

    const awsAccounts = accounts.filter((a) => a.provider === 'aws');
    console.log('\n--- Generating Elastic CNVM vulnerabilities ---');

    for (const account of awsAccounts) {
      const docs = faker.helpers.multiple(() => createCNVMVulnerability({ account }), {
        count: findingsCount,
      });
      cnvmVulnerabilities.push(...docs);
    }

    console.log(`Generated ${cnvmVulnerabilities.length} CNVM vulnerabilities`);
    await ingest(VULNERABILITY_INDEX, cnvmVulnerabilities);
  }

  // ------- 3rd Party: Wiz -------
  if (dataSources.includes('wiz_misconfigs') || dataSources.includes('wiz_vulnerabilities')) {
    await installPackage({ packageName: 'wiz' });
  }

  if (dataSources.includes('wiz_misconfigs')) {
    console.log('\n--- Generating Wiz misconfigurations ---');
    const docs = generateDocs(accounts, findingsCount, (account) =>
      createWizMisconfiguration({ account })
    );
    console.log(`Generated ${docs.length} Wiz misconfigurations`);
    await ingest(WIZ_MISCONFIGURATION_INDEX, docs);
  }

  if (dataSources.includes('wiz_vulnerabilities')) {
    console.log('\n--- Generating Wiz vulnerabilities ---');
    const docs = generateDocs(accounts, findingsCount, (account) =>
      createWizVulnerability({ account })
    );
    console.log(`Generated ${docs.length} Wiz vulnerabilities`);
    await ingest(WIZ_VULNERABILITY_INDEX, docs);
  }

  // ------- 3rd Party: Qualys -------
  if (dataSources.includes('qualys_vulnerabilities')) {
    console.log('\n--- Generating Qualys VMDR vulnerabilities ---');
    await installPackage({ packageName: 'qualys_vmdr' });
    const docs = generateDocs(accounts, findingsCount, (account) =>
      createQualysVulnerability({ account })
    );
    console.log(`Generated ${docs.length} Qualys vulnerabilities`);
    await ingest(QUALYS_VULNERABILITY_INDEX, docs);
  }

  // ------- 3rd Party: Tenable -------
  if (dataSources.includes('tenable_vulnerabilities')) {
    console.log('\n--- Generating Tenable.io vulnerabilities ---');
    await installPackage({ packageName: 'tenable_io' });
    const docs = generateDocs(accounts, findingsCount, (account) =>
      createTenableVulnerability({ account })
    );
    console.log(`Generated ${docs.length} Tenable vulnerabilities`);
    await ingest(TENABLE_VULNERABILITY_INDEX, docs);
  }

  // ------- 3rd Party: AWS Security Hub (aws package, ASFF) -------
  if (dataSources.includes('aws_misconfigs')) {
    console.log('\n--- Generating AWS Security Hub misconfigurations (ASFF) ---');
    await installPackage({ packageName: 'aws' });
    const awsAccounts = accounts.filter((a) => a.provider === 'aws');

    const docs: object[] = [];
    for (const account of awsAccounts) {
      const accountDocs = faker.helpers.multiple(
        () => createAwsSecurityHubMisconfiguration({ account }),
        { count: findingsCount }
      );
      docs.push(...accountDocs);
    }

    console.log(`Generated ${docs.length} AWS Security Hub misconfigurations`);
    await ingest(AWS_MISCONFIGURATION_INDEX, docs);
  }

  // ------- CSP Scores (trend data: every 5 min over the last 24h) -------
  if (generateCspScores) {
    const allElasticMisconfigs = [...cspmMisconfigs, ...kspmMisconfigs];

    if (hasAnyCspm && cspmMisconfigs.length > 0) {
      console.log('\n--- Generating CSP Scores trend (CSPM) ---');
      const misconfigStats = aggregateMisconfigurationStats(cspmMisconfigs, 'cspm');
      const vulnStats = aggregateVulnerabilityStats(cnvmVulnerabilities);

      const docs = generateScoresTrend({
        policyTemplate: 'cspm',
        misconfigStats,
        vulnStats,
      });

      await ingest(CSP_SCORES_INDEX, docs);
      console.log(
        `CSPM scores: ${docs.length} trend points, ` +
          `${Math.round((misconfigStats.passedFindings / misconfigStats.totalFindings) * 100)}% passed (latest)`
      );
    }

    if (hasAnyKspm && kspmMisconfigs.length > 0) {
      console.log('\n--- Generating CSP Scores trend (KSPM) ---');
      const misconfigStats = aggregateMisconfigurationStats(kspmMisconfigs, 'kspm');

      const docs = generateScoresTrend({
        policyTemplate: 'kspm',
        misconfigStats,
      });

      await ingest(CSP_SCORES_INDEX, docs);
      console.log(
        `KSPM scores: ${docs.length} trend points, ` +
          `${Math.round((misconfigStats.passedFindings / misconfigStats.totalFindings) * 100)}% passed (latest)`
      );
    }

    if (cnvmVulnerabilities.length > 0) {
      console.log('\n--- Generating CSP Scores trend (CNVM / vuln_mgmt) ---');
      const vulnStats = aggregateVulnerabilityStats(cnvmVulnerabilities);

      const docs = generateVulnMgmtScoresTrend(vulnStats);

      await ingest(CSP_SCORES_INDEX, docs);
      const totalVulns = vulnStats.reduce(
        (sum, s) => sum + s.critical + s.high + s.medium + s.low,
        0
      );
      console.log(`CNVM scores: ${docs.length} trend points, ${totalVulns} total vulnerabilities`);
    }

    if (allElasticMisconfigs.length === 0 && dataSources.some((ds) => ds.startsWith('elastic_'))) {
      console.log('\nNo elastic misconfigurations generated - skipping CSP scores');
    }
  }

  console.log('\nCloud Security Posture data generation complete!');
};

/**
 * Generate documents for 3rd party integrations that support multi-cloud accounts.
 * If accounts are available, generates `count` docs per account.
 * If no accounts, generates `count` docs without account context.
 */
function generateDocs(
  accounts: CSPMAccount[],
  count: number,
  factory: (account?: CSPMAccount) => object
): object[] {
  const docs: object[] = [];

  if (accounts.length === 0) {
    docs.push(...faker.helpers.multiple(() => factory(), { count }));
  } else {
    for (const account of accounts) {
      docs.push(...faker.helpers.multiple(() => factory(account), { count }));
    }
  }

  return docs;
}

/**
 * Generate CSP scores trend data over the last 24 hours (every 5 minutes).
 * Each data point has slightly varied pass/fail counts to simulate realistic drift.
 */
function generateScoresTrend({
  policyTemplate,
  misconfigStats,
  vulnStats,
}: {
  policyTemplate: 'cspm' | 'kspm';
  misconfigStats: ReturnType<typeof aggregateMisconfigurationStats>;
  vulnStats?: VulnerabilityStats[];
}): object[] {
  const docs: object[] = [];
  const intervalMinutes = 5;
  const hoursBack = 24;
  const totalPoints = (hoursBack * 60) / intervalMinutes; // 288

  for (let i = totalPoints; i >= 0; i--) {
    const timestamp = moment()
      .subtract(i * intervalMinutes, 'minutes')
      .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');

    // Add small random drift to pass/fail counts (±5% of total)
    const driftRange = Math.max(1, Math.floor(misconfigStats.totalFindings * 0.05));
    const drift = faker.number.int({ min: -driftRange, max: driftRange });
    const passed = Math.max(
      0,
      Math.min(misconfigStats.totalFindings, misconfigStats.passedFindings + drift)
    );
    const failed = misconfigStats.totalFindings - passed;

    // Apply same drift ratio to benchmark and account/cluster scores
    const driftedBenchmarks = misconfigStats.benchmarkScores.map((b) => {
      const bDrift = faker.number.int({
        min: -Math.max(1, Math.floor(b.totalFindings * 0.05)),
        max: Math.max(1, Math.floor(b.totalFindings * 0.05)),
      });
      const bPassed = Math.max(0, Math.min(b.totalFindings, b.passedFindings + bDrift));
      return { ...b, passedFindings: bPassed, failedFindings: b.totalFindings - bPassed };
    });

    const doc = createCSPScores({
      policyTemplate,
      totalFindings: misconfigStats.totalFindings,
      passedFindings: passed,
      failedFindings: failed,
      benchmarkScores: driftedBenchmarks,
      accountScores: misconfigStats.accountScores,
      clusterScores: misconfigStats.clusterScores,
      vulnerabilityStats: vulnStats,
      timestamp,
    });

    docs.push(doc);
  }

  return docs;
}

/**
 * Generate vuln_mgmt scores trend data over the last 30 days (hourly).
 * The CNVM dashboard queries with 30-day range and daily calendar_interval buckets,
 * picking the last doc per day via top_hits. Hourly resolution is sufficient.
 */
function generateVulnMgmtScoresTrend(vulnStats: VulnerabilityStats[]): object[] {
  const docs: object[] = [];
  const intervalMinutes = 60;
  const daysBack = 30;
  const totalPoints = (daysBack * 24 * 60) / intervalMinutes;

  for (let i = totalPoints; i >= 0; i--) {
    const timestamp = moment()
      .subtract(i * intervalMinutes, 'minutes')
      .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');

    // Add small random drift to severity counts (±5%)
    const driftedStats = vulnStats.map((s) => {
      const total = s.critical + s.high + s.medium + s.low;
      const driftRange = Math.max(1, Math.floor(total * 0.05));
      return {
        ...s,
        critical: Math.max(0, s.critical + faker.number.int({ min: -driftRange, max: driftRange })),
        high: Math.max(0, s.high + faker.number.int({ min: -driftRange, max: driftRange })),
        medium: Math.max(0, s.medium + faker.number.int({ min: -driftRange, max: driftRange })),
        low: Math.max(0, s.low + faker.number.int({ min: -driftRange, max: driftRange })),
      };
    });

    docs.push(createVulnMgmtScores({ vulnStats: driftedStats, timestamp }));
  }

  return docs;
}
