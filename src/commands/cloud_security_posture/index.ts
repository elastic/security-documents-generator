import { faker } from '@faker-js/faker';
import moment from 'moment';
import { ingest, getEsClient } from '../utils/indices';
import {
  installPackage,
  getPackageInfo,
  createAgentPolicy,
  getPackagePolicies,
  createPackagePolicy,
} from '../../utils/kibana_api';
import { generateNewSeed } from '../../constants';
import {
  generateCSPMAccounts,
  generateKSPMClusters,
  CSPMAccount,
  MISCONFIGURATION_SOURCE_INDEX,
  VULNERABILITY_INDEX,
  CSP_SCORES_INDEX,
  WIZ_MISCONFIGURATION_SOURCE_INDEX,
  WIZ_VULNERABILITY_SOURCE_INDEX,
  QUALYS_VULNERABILITY_SOURCE_INDEX,
  TENABLE_VULNERABILITY_SOURCE_INDEX,
  AWS_MISCONFIGURATION_SOURCE_INDEX,
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

const CSP_PACKAGE_NAME = 'cloud_security_posture';
const CSP_SCORES_INDEX_NAME = 'logs-cloud_security_posture.scores-default';

/**
 * Install the CSP integration and ensure a package policy exists.
 *
 * The Kibana CSP plugin creates the scores index template, ingest pipeline,
 * and empty scores index during its `initialize()` method, which is triggered
 * by the `packagePolicyPostCreate` Fleet callback. Simply installing the EPM
 * package is not enough — a package policy must be created.
 *
 * This function:
 * 1. Installs the cloud_security_posture EPM package
 * 2. Checks if a CSP package policy already exists
 * 3. If not, creates an agent policy + CSP package policy to trigger initialization
 * 4. Waits for the scores index to be created by the plugin
 */
async function installCspIntegration(): Promise<void> {
  await installPackage({ packageName: CSP_PACKAGE_NAME });

  // Check if the scores index already exists (plugin already initialized)
  const esClient = getEsClient();
  const scoresExists = await esClient.indices.exists({ index: CSP_SCORES_INDEX_NAME });
  if (scoresExists) return;

  // Check if a CSP package policy already exists
  const { items: policies } = await getPackagePolicies({ packageName: CSP_PACKAGE_NAME });
  if (policies.length > 0) {
    // Policy exists but index doesn't — may need a Kibana restart.
    // Wait briefly for the initialization to complete (it may be in progress).
    console.log('CSP package policy exists, waiting for plugin initialization...');
    await waitForScoresIndex(esClient);
    return;
  }

  // No package policy — create one to trigger the CSP plugin's initialize()
  console.log('Creating CSP package policy to trigger plugin initialization...');

  const { item: pkgInfo } = await getPackageInfo({ packageName: CSP_PACKAGE_NAME });

  const agentPolicy = await createAgentPolicy({
    name: 'CSP Generator Policy',
  });

  await createPackagePolicy({
    name: 'csp-generator',
    agentPolicyIds: [agentPolicy.item.id],
    packageName: CSP_PACKAGE_NAME,
    packageVersion: pkgInfo.version,
    inputs: {
      'cspm-cloudbeat/cis_aws': {
        enabled: true,
        streams: {
          'cloud_security_posture.findings': {
            enabled: true,
            vars: {
              'aws.credentials.type': 'assume_role',
              'aws.account_type': 'single-account',
              role_arn: 'arn:aws:iam::000000000000:role/csp-generator',
            },
          },
        },
      },
    },
    vars: {
      posture: 'cspm',
      deployment: 'aws',
    },
  });

  // Wait for the plugin initialization to create the scores index
  await waitForScoresIndex(esClient);
}

async function waitForScoresIndex(esClient: ReturnType<typeof getEsClient>): Promise<void> {
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    const exists = await esClient.indices.exists({ index: CSP_SCORES_INDEX_NAME });
    if (exists) {
      console.log('CSP scores index created successfully');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log('Warning: CSP scores index was not created within timeout');
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

/**
 * Find transforms that read from a given source index pattern.
 * Returns the matching transform IDs.
 */
async function findTransformsForSource(sourceIndex: string): Promise<string[]> {
  const esClient = getEsClient();
  const ids: string[] = [];
  try {
    const resp = await esClient.transform.getTransform({ transform_id: '*', size: 100 });
    for (const t of resp.transforms) {
      const sources = (t.source.index as string[]) || [];
      if (
        sources.some((pattern) => sourceIndex.match(new RegExp('^' + pattern.replace('*', '.*'))))
      ) {
        ids.push(t.id);
      }
    }
  } catch {
    // Transform API not available
  }
  return ids;
}

/**
 * Trigger transforms to process data immediately and wait for completion.
 * All transforms are started and scheduled in parallel, then polled together.
 *
 * Transforms have a sync.time.delay (typically 60s) that excludes recently-ingested docs.
 * We re-schedule periodically during polling so the data gets picked up once
 * the delay window passes.
 */
async function triggerAndWaitForTransforms(transformIds: string[]): Promise<void> {
  if (transformIds.length === 0) return;
  const esClient = getEsClient();

  // 1. Start all stopped transforms, record baseline checkpoints, and schedule
  const checkpoints = new Map<string, number>();
  for (const id of transformIds) {
    try {
      const stats = await esClient.transform.getTransformStats({ transform_id: id });
      const state = stats.transforms[0]?.state;
      if (state === 'stopped') {
        await esClient.transform.startTransform({ transform_id: id });
        console.log(`Started transform '${id}'`);
      }
      checkpoints.set(id, stats.transforms[0]?.checkpointing?.last?.checkpoint ?? 0);
      await esClient.transform.scheduleNowTransform({ transform_id: id });
    } catch (err) {
      console.log(`Warning: failed to trigger transform '${id}':`, err);
    }
  }

  console.log(`Waiting for ${transformIds.length} transform(s) to complete...`);

  // 2. Poll all transforms, re-scheduling periodically to handle sync delay
  const pending = new Set(checkpoints.keys());
  const maxWaitMs = 180_000;
  const rescheduleIntervalMs = 15_000;
  const startTime = Date.now();
  let lastReschedule = startTime;

  while (pending.size > 0 && Date.now() - startTime < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Re-schedule pending transforms periodically so they pick up data
    // after the sync delay window (typically 60s) has passed
    if (Date.now() - lastReschedule > rescheduleIntervalMs) {
      for (const id of pending) {
        try {
          await esClient.transform.scheduleNowTransform({ transform_id: id });
        } catch {
          // Ignore
        }
      }
      lastReschedule = Date.now();
    }

    for (const id of [...pending]) {
      try {
        const current = await esClient.transform.getTransformStats({ transform_id: id });
        const currentCheckpoint = current.transforms[0]?.checkpointing?.last?.checkpoint ?? 0;
        if (currentCheckpoint > (checkpoints.get(id) ?? 0)) {
          console.log(`Transform '${id}' completed checkpoint ${currentCheckpoint}`);
          pending.delete(id);
        }
      } catch {
        // Ignore polling errors, will retry
      }
    }
  }

  if (pending.size > 0) {
    console.log(`Warning: transforms did not complete within timeout: ${[...pending].join(', ')}`);
  }
}

export const generateCloudSecurityPosture = async ({
  seed = generateNewSeed(),
  dataSources,
  findingsCount,
  generateCspScores = false,
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

  // Track source indices that received data — transforms will be triggered in a single batch at the end
  const sourceIndicesForTransforms = new Set<string>();

  // Collect native elastic data for CSP scores aggregation
  const cspmMisconfigs: object[] = [];
  const kspmMisconfigs: object[] = [];
  const cnvmVulnerabilities: object[] = [];

  // Install CSP integration once if any native elastic data source is selected.
  // This also creates a package policy to trigger the Kibana CSP plugin initialization
  // (which creates the scores index template, ingest pipeline, and empty scores index).
  const hasAnyCspm =
    cspmProviders.size > 0 && dataSources.some((ds) => ds.startsWith('elastic_cspm_'));
  const hasAnyKspm =
    kspmDistributions.size > 0 && dataSources.some((ds) => ds.startsWith('elastic_kspm_'));
  const hasAnyCnvm = dataSources.includes('elastic_cnvm');

  if (hasAnyCspm || hasAnyKspm || hasAnyCnvm) {
    await installCspIntegration();
  }

  // ------- Native Elastic: CSPM -------
  if (hasAnyCspm) {
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

    await ingest(MISCONFIGURATION_SOURCE_INDEX, cspmMisconfigs);
    sourceIndicesForTransforms.add(MISCONFIGURATION_SOURCE_INDEX);
  }

  // ------- Native Elastic: KSPM -------
  if (hasAnyKspm) {
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

    await ingest(MISCONFIGURATION_SOURCE_INDEX, kspmMisconfigs);
    sourceIndicesForTransforms.add(MISCONFIGURATION_SOURCE_INDEX);
  }

  // ------- Native Elastic: CNVM -------
  if (hasAnyCnvm) {
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

  // 3P generators produce pre-processed documents (final structure).
  // Use pipeline: '_none' to skip the integration's default ingest pipeline
  // (which expects raw JSON input from the agent). The final_pipeline still
  // runs regardless, setting event.ingested for transform sync.
  const skipPipeline = { pipeline: '_none' };

  if (dataSources.includes('wiz_misconfigs')) {
    console.log('\n--- Generating Wiz misconfigurations ---');
    const docs = generateDocs(accounts, findingsCount, (account) =>
      createWizMisconfiguration({ account })
    );
    console.log(`Generated ${docs.length} Wiz misconfigurations`);
    await ingest(WIZ_MISCONFIGURATION_SOURCE_INDEX, docs, skipPipeline);
    sourceIndicesForTransforms.add(WIZ_MISCONFIGURATION_SOURCE_INDEX);
  }

  if (dataSources.includes('wiz_vulnerabilities')) {
    console.log('\n--- Generating Wiz vulnerabilities ---');
    const docs = generateDocs(accounts, findingsCount, (account) =>
      createWizVulnerability({ account })
    );
    console.log(`Generated ${docs.length} Wiz vulnerabilities`);
    await ingest(WIZ_VULNERABILITY_SOURCE_INDEX, docs, skipPipeline);
    sourceIndicesForTransforms.add(WIZ_VULNERABILITY_SOURCE_INDEX);
  }

  // ------- 3rd Party: Qualys -------
  if (dataSources.includes('qualys_vulnerabilities')) {
    console.log('\n--- Generating Qualys VMDR vulnerabilities ---');
    await installPackage({ packageName: 'qualys_vmdr' });
    const docs = generateDocs(accounts, findingsCount, (account) =>
      createQualysVulnerability({ account })
    );
    console.log(`Generated ${docs.length} Qualys vulnerabilities`);
    await ingest(QUALYS_VULNERABILITY_SOURCE_INDEX, docs, skipPipeline);
    sourceIndicesForTransforms.add(QUALYS_VULNERABILITY_SOURCE_INDEX);
  }

  // ------- 3rd Party: Tenable -------
  if (dataSources.includes('tenable_vulnerabilities')) {
    console.log('\n--- Generating Tenable.io vulnerabilities ---');
    await installPackage({ packageName: 'tenable_io' });
    const docs = generateDocs(accounts, findingsCount, (account) =>
      createTenableVulnerability({ account })
    );
    console.log(`Generated ${docs.length} Tenable vulnerabilities`);
    await ingest(TENABLE_VULNERABILITY_SOURCE_INDEX, docs, skipPipeline);
    sourceIndicesForTransforms.add(TENABLE_VULNERABILITY_SOURCE_INDEX);
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
    await ingest(AWS_MISCONFIGURATION_SOURCE_INDEX, docs, skipPipeline);
    sourceIndicesForTransforms.add(AWS_MISCONFIGURATION_SOURCE_INDEX);
  }

  // ------- Trigger all transforms in parallel -------
  if (sourceIndicesForTransforms.size > 0) {
    console.log('\n--- Triggering transforms ---');
    const allTransformIds = new Set<string>();
    for (const sourceIndex of sourceIndicesForTransforms) {
      const ids = await findTransformsForSource(sourceIndex);
      ids.forEach((id) => allTransformIds.add(id));
    }
    await triggerAndWaitForTransforms([...allTransformIds]);
  }

  // ------- CSP Scores (trend data: every 5 min over the last 24h) -------
  // Scores are normally generated by a Kibana background task every ~5 min.
  // This opt-in flag generates historical trend data for dashboard demos.
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

      // Use pipeline: '_none' to bypass the default pipeline that overwrites @timestamp
      // with _ingest.timestamp (which would collapse all trend points to the current time)
      await ingest(CSP_SCORES_INDEX, docs, { pipeline: '_none' });
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

      await ingest(CSP_SCORES_INDEX, docs, { pipeline: '_none' });
      console.log(
        `KSPM scores: ${docs.length} trend points, ` +
          `${Math.round((misconfigStats.passedFindings / misconfigStats.totalFindings) * 100)}% passed (latest)`
      );
    }

    if (cnvmVulnerabilities.length > 0) {
      console.log('\n--- Generating CSP Scores trend (CNVM / vuln_mgmt) ---');
      const vulnStats = aggregateVulnerabilityStats(cnvmVulnerabilities);

      const docs = generateVulnMgmtScoresTrend(vulnStats);

      await ingest(CSP_SCORES_INDEX, docs, { pipeline: '_none' });
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

    // Apply same drift to benchmark, account, and cluster scores
    const applyDrift = <T extends { totalFindings: number; passedFindings: number }>(
      items: T[]
    ): T[] =>
      items.map((item) => {
        const d = faker.number.int({
          min: -Math.max(1, Math.floor(item.totalFindings * 0.05)),
          max: Math.max(1, Math.floor(item.totalFindings * 0.05)),
        });
        const p = Math.max(0, Math.min(item.totalFindings, item.passedFindings + d));
        return { ...item, passedFindings: p, failedFindings: item.totalFindings - p };
      });

    const doc = createCSPScores({
      policyTemplate,
      totalFindings: misconfigStats.totalFindings,
      passedFindings: passed,
      failedFindings: failed,
      benchmarkScores: applyDrift(misconfigStats.benchmarkScores),
      accountScores: misconfigStats.accountScores && applyDrift(misconfigStats.accountScores),
      clusterScores: misconfigStats.clusterScores && applyDrift(misconfigStats.clusterScores),
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
