import { faker } from '@faker-js/faker';
import moment from 'moment';
import { PostureType } from './csp_utils';

export interface BenchmarkScore {
  benchmarkId: string;
  benchmarkName: string;
  benchmarkVersion: string;
  totalFindings: number;
  passedFindings: number;
  failedFindings: number;
}

export interface AccountScore {
  accountId: string;
  accountName: string;
  totalFindings: number;
  passedFindings: number;
  failedFindings: number;
}

export interface ClusterScore {
  clusterId: string;
  clusterName: string;
  totalFindings: number;
  passedFindings: number;
  failedFindings: number;
}

export interface VulnerabilityStats {
  accountId: string;
  accountName?: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface CreateCSPScoresParams {
  policyTemplate: PostureType;
  totalFindings: number;
  passedFindings: number;
  failedFindings: number;
  benchmarkScores: BenchmarkScore[];
  accountScores?: AccountScore[];
  clusterScores?: ClusterScore[];
  vulnerabilityStats?: VulnerabilityStats[];
  timestamp?: string;
}

export default function createCSPScores({
  policyTemplate,
  totalFindings,
  passedFindings,
  failedFindings,
  benchmarkScores,
  accountScores,
  clusterScores,
  vulnerabilityStats,
  timestamp,
}: CreateCSPScoresParams) {
  const now = timestamp || moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const score = totalFindings > 0 ? Math.round((passedFindings / totalFindings) * 100) : 0;

  // Build score_by_benchmark_id structure
  const scoreByBenchmarkId: Record<string, object> = {};
  for (const benchmark of benchmarkScores) {
    scoreByBenchmarkId[benchmark.benchmarkId] = {
      [benchmark.benchmarkVersion]: {
        total_findings: benchmark.totalFindings,
        passed_findings: benchmark.passedFindings,
        failed_findings: benchmark.failedFindings,
        benchmark_name: benchmark.benchmarkName,
        benchmark_version: benchmark.benchmarkVersion,
      },
    };
  }

  // Build score_by_cluster_id structure (for CSPM this is account IDs, for KSPM it's cluster IDs)
  const scoreByClusterId: Record<string, object> = {};

  if (policyTemplate === 'cspm' && accountScores) {
    for (const account of accountScores) {
      scoreByClusterId[account.accountId] = {
        total_findings: account.totalFindings,
        passed_findings: account.passedFindings,
        failed_findings: account.failedFindings,
        account_name: account.accountName,
      };
    }
  }

  if (policyTemplate === 'kspm' && clusterScores) {
    for (const cluster of clusterScores) {
      scoreByClusterId[cluster.clusterId] = {
        total_findings: cluster.totalFindings,
        passed_findings: cluster.passedFindings,
        failed_findings: cluster.failedFindings,
        cluster_name: cluster.clusterName,
      };
    }
  }

  // Build vulnerabilities_stats_by_cloud_account structure (CSPM only)
  const vulnerabilitiesStatsByCloudAccount: Record<string, object> = {};
  if (vulnerabilityStats && policyTemplate === 'cspm') {
    for (const stat of vulnerabilityStats) {
      vulnerabilitiesStatsByCloudAccount[stat.accountId] = {
        critical: stat.critical,
        high: stat.high,
        medium: stat.medium,
        low: stat.low,
        total: stat.critical + stat.high + stat.medium + stat.low,
      };
    }
  }

  // Calculate severity breakdown from vulnerabilities
  const severityBreakdown = calculateSeverityBreakdown(vulnerabilityStats);

  return {
    '@timestamp': now,
    policy_template: policyTemplate,
    is_enabled_rules_score: true,
    namespace: 'default',
    score,
    total_findings: totalFindings,
    passed_findings: passedFindings,
    failed_findings: failedFindings,
    // Severity counts (from vulnerabilities)
    critical: severityBreakdown.critical,
    high: severityBreakdown.high,
    medium: severityBreakdown.medium,
    low: severityBreakdown.low,
    // Nested scores
    score_by_benchmark_id: scoreByBenchmarkId,
    score_by_cluster_id: scoreByClusterId,
    // Vulnerability stats (CSPM only)
    ...(Object.keys(vulnerabilitiesStatsByCloudAccount).length > 0 && {
      vulnerabilities_stats_by_cloud_account: vulnerabilitiesStatsByCloudAccount,
    }),
    // Additional metadata
    data_stream: {
      namespace: 'default',
      type: 'logs',
      dataset: 'cloud_security_posture.scores',
    },
    ecs: {
      version: '8.6.0',
    },
    event: {
      created: now,
      kind: 'state',
      id: faker.string.uuid(),
      category: ['configuration'],
      type: ['info'],
      dataset: 'cloud_security_posture.scores',
    },
  };
}

function calculateSeverityBreakdown(vulnerabilityStats?: VulnerabilityStats[]): {
  critical: number;
  high: number;
  medium: number;
  low: number;
} {
  if (!vulnerabilityStats || vulnerabilityStats.length === 0) {
    return { critical: 0, high: 0, medium: 0, low: 0 };
  }

  return vulnerabilityStats.reduce(
    (acc, stat) => ({
      critical: acc.critical + stat.critical,
      high: acc.high + stat.high,
      medium: acc.medium + stat.medium,
      low: acc.low + stat.low,
    }),
    { critical: 0, high: 0, medium: 0, low: 0 }
  );
}

// Helper functions for aggregating stats from generated documents
export function aggregateMisconfigurationStats(
  misconfigs: Array<{
    result?: { evaluation?: string };
    cloud?: { account?: { id?: string; name?: string } };
    orchestrator?: { cluster?: { id?: string; name?: string } };
    rule?: { benchmark?: { id?: string; name?: string; version?: string } };
  }>,
  policyTemplate: PostureType
): {
  totalFindings: number;
  passedFindings: number;
  failedFindings: number;
  benchmarkScores: BenchmarkScore[];
  accountScores?: AccountScore[];
  clusterScores?: ClusterScore[];
} {
  const totalFindings = misconfigs.length;
  const passedFindings = misconfigs.filter((m) => m.result?.evaluation === 'passed').length;
  const failedFindings = totalFindings - passedFindings;

  // Aggregate by benchmark
  const benchmarkMap = new Map<string, BenchmarkScore>();
  for (const m of misconfigs) {
    const benchmarkId = m.rule?.benchmark?.id || 'unknown';
    const benchmarkName = m.rule?.benchmark?.name || 'Unknown Benchmark';
    const benchmarkVersion = m.rule?.benchmark?.version || 'v1.0.0';
    const key = `${benchmarkId}:${benchmarkVersion}`;

    if (!benchmarkMap.has(key)) {
      benchmarkMap.set(key, {
        benchmarkId,
        benchmarkName,
        benchmarkVersion,
        totalFindings: 0,
        passedFindings: 0,
        failedFindings: 0,
      });
    }

    const benchmark = benchmarkMap.get(key)!;
    benchmark.totalFindings++;
    if (m.result?.evaluation === 'passed') {
      benchmark.passedFindings++;
    } else {
      benchmark.failedFindings++;
    }
  }

  const benchmarkScores = Array.from(benchmarkMap.values());

  // Aggregate by account (CSPM) or cluster (KSPM)
  if (policyTemplate === 'cspm') {
    const accountMap = new Map<string, AccountScore>();
    for (const m of misconfigs) {
      const accountId = m.cloud?.account?.id || 'unknown';
      const accountName = m.cloud?.account?.name || 'Unknown Account';

      if (!accountMap.has(accountId)) {
        accountMap.set(accountId, {
          accountId,
          accountName,
          totalFindings: 0,
          passedFindings: 0,
          failedFindings: 0,
        });
      }

      const account = accountMap.get(accountId)!;
      account.totalFindings++;
      if (m.result?.evaluation === 'passed') {
        account.passedFindings++;
      } else {
        account.failedFindings++;
      }
    }

    return {
      totalFindings,
      passedFindings,
      failedFindings,
      benchmarkScores,
      accountScores: Array.from(accountMap.values()),
    };
  } else {
    const clusterMap = new Map<string, ClusterScore>();
    for (const m of misconfigs) {
      const clusterId = m.orchestrator?.cluster?.id || 'unknown';
      const clusterName = m.orchestrator?.cluster?.name || 'Unknown Cluster';

      if (!clusterMap.has(clusterId)) {
        clusterMap.set(clusterId, {
          clusterId,
          clusterName,
          totalFindings: 0,
          passedFindings: 0,
          failedFindings: 0,
        });
      }

      const cluster = clusterMap.get(clusterId)!;
      cluster.totalFindings++;
      if (m.result?.evaluation === 'passed') {
        cluster.passedFindings++;
      } else {
        cluster.failedFindings++;
      }
    }

    return {
      totalFindings,
      passedFindings,
      failedFindings,
      benchmarkScores,
      clusterScores: Array.from(clusterMap.values()),
    };
  }
}

export function aggregateVulnerabilityStats(
  vulnerabilities: Array<{
    cloud?: { account?: { id?: string; name?: string } };
    vulnerability?: { severity?: string };
  }>
): VulnerabilityStats[] {
  const accountMap = new Map<string, VulnerabilityStats>();

  for (const v of vulnerabilities) {
    const accountId = v.cloud?.account?.id || 'unknown';
    const accountName = v.cloud?.account?.name || '';
    const severity = v.vulnerability?.severity || 'MEDIUM';

    if (!accountMap.has(accountId)) {
      accountMap.set(accountId, {
        accountId,
        accountName,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      });
    }

    const stats = accountMap.get(accountId)!;
    switch (severity.toUpperCase()) {
      case 'CRITICAL':
        stats.critical++;
        break;
      case 'HIGH':
        stats.high++;
        break;
      case 'MEDIUM':
        stats.medium++;
        break;
      case 'LOW':
        stats.low++;
        break;
    }
  }

  return Array.from(accountMap.values());
}

/**
 * Create a vuln_mgmt scores document for the CNVM severity trend.
 * This is a separate document type from cspm/kspm scores - it only has severity counts.
 */
export function createVulnMgmtScores({
  vulnStats,
  timestamp,
}: {
  vulnStats: VulnerabilityStats[];
  timestamp?: string;
}) {
  const now = timestamp || moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');

  const totals = vulnStats.reduce(
    (acc, s) => ({
      critical: acc.critical + s.critical,
      high: acc.high + s.high,
      medium: acc.medium + s.medium,
      low: acc.low + s.low,
    }),
    { critical: 0, high: 0, medium: 0, low: 0 }
  );

  const vulnerabilitiesStatsByCloudAccount: Record<string, object> = {};
  for (const stat of vulnStats) {
    vulnerabilitiesStatsByCloudAccount[stat.accountId] = {
      cloudAccountId: stat.accountId,
      cloudAccountName: stat.accountName || '',
      critical: stat.critical,
      high: stat.high,
      medium: stat.medium,
      low: stat.low,
    };
  }

  return {
    '@timestamp': now,
    policy_template: 'vuln_mgmt',
    ...totals,
    vulnerabilities_stats_by_cloud_account: vulnerabilitiesStatsByCloudAccount,
  };
}
