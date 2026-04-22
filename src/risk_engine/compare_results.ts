import fs from 'fs';
import { log } from '../utils/logger.ts';
import type { ScenarioResults, Tier1Metrics, Tier2Metrics } from './collect_results.ts';

interface MetricComparison {
  metric: string;
  baseline: number | undefined;
  current: number | undefined;
  delta: number | undefined;
  pctChange: number | undefined;
  status: 'pass' | 'regressed' | 'improved' | 'new' | 'missing' | 'zero_baseline';
}

interface ComparisonReport {
  baselineScenario: string;
  currentScenario: string;
  baselineCollectedAt: string;
  currentCollectedAt: string;
  regressionThresholdPct: number;
  hasRegressions: boolean;
  summary: {
    totalMetrics: number;
    regressions: number;
    improvements: number;
    unchanged: number;
    new: number;
    missing: number;
  };
  metrics: MetricComparison[];
  hardFailures: string[];
}

const REGRESSION_THRESHOLD_PCT = 20;

const compareMetric = (
  name: string,
  baseline: number | undefined,
  current: number | undefined,
  threshold = REGRESSION_THRESHOLD_PCT,
  lowerIsBetter = true,
): MetricComparison => {
  if (baseline === undefined && current === undefined) {
    return {
      metric: name,
      baseline,
      current,
      delta: undefined,
      pctChange: undefined,
      status: 'missing',
    };
  }
  if (baseline === undefined) {
    return {
      metric: name,
      baseline,
      current,
      delta: undefined,
      pctChange: undefined,
      status: 'new',
    };
  }
  if (current === undefined) {
    return {
      metric: name,
      baseline,
      current,
      delta: undefined,
      pctChange: undefined,
      status: 'missing',
    };
  }
  if (baseline === 0) {
    return {
      metric: name,
      baseline,
      current,
      delta: current - baseline,
      pctChange: undefined,
      status: 'zero_baseline',
    };
  }

  const delta = current - baseline;
  const pctChange = (delta / baseline) * 100;

  let status: MetricComparison['status'];
  if (lowerIsBetter) {
    if (pctChange > threshold) status = 'regressed';
    else if (pctChange < -5) status = 'improved';
    else status = 'pass';
  } else {
    if (pctChange < -threshold) status = 'regressed';
    else if (pctChange > 5) status = 'improved';
    else status = 'pass';
  }

  return { metric: name, baseline, current, delta, pctChange, status };
};

const flattenTier1 = (t: Tier1Metrics): Record<string, number | undefined> => ({
  'tier1.totalDurationMs': t.totalDurationMs,
  'tier1.totalScoresWritten': t.totalScoresWritten,
  'tier1.entityTypesProcessed': t.entityTypesProcessed,
  'tier1.userDurationMs': t.userDurationMs,
  'tier1.hostDurationMs': t.hostDurationMs,
  'tier1.userScoresWritten': t.userScoresWritten,
  'tier1.hostScoresWritten': t.hostScoresWritten,
  'tier1.userPagesProcessed': t.userPagesProcessed,
  'tier1.hostPagesProcessed': t.hostPagesProcessed,
});

const flattenTier2 = (t: Tier2Metrics): Record<string, number | undefined> => ({
  'tier2.scoringThroughputPerSec': t.scoringThroughputPerSec,
  'tier2.avgPageDurationMs': t.avgPageDurationMs,
  'tier2.resolutionOverheadRatio': t.resolutionOverheadRatio,
  'tier2.writeEfficiencyPct': t.writeEfficiencyPct,
});

const HIGHER_IS_BETTER = new Set([
  'tier2.scoringThroughputPerSec',
  'tier2.writeEfficiencyPct',
  'tier1.totalScoresWritten',
  'tier1.userScoresWritten',
  'tier1.hostScoresWritten',
]);

export const compareResults = (
  baselineResults: ScenarioResults,
  currentResults: ScenarioResults,
  regressionThresholdPct = REGRESSION_THRESHOLD_PCT,
): ComparisonReport => {
  const baselineTier1 = flattenTier1(baselineResults.tier1);
  const currentTier1 = flattenTier1(currentResults.tier1);
  const baselineTier2 = flattenTier2(baselineResults.tier2);
  const currentTier2 = flattenTier2(currentResults.tier2);

  const allKeys = new Set([
    ...Object.keys(baselineTier1),
    ...Object.keys(currentTier1),
    ...Object.keys(baselineTier2),
    ...Object.keys(currentTier2),
  ]);

  const metrics: MetricComparison[] = [];
  const hardFailures: string[] = [];

  for (const key of allKeys) {
    const baseline =
      (baselineTier1 as Record<string, number | undefined>)[key] ??
      (baselineTier2 as Record<string, number | undefined>)[key];
    const current =
      (currentTier1 as Record<string, number | undefined>)[key] ??
      (currentTier2 as Record<string, number | undefined>)[key];
    const lowerIsBetter = !HIGHER_IS_BETTER.has(key);

    const comparison = compareMetric(key, baseline, current, regressionThresholdPct, lowerIsBetter);
    metrics.push(comparison);
  }

  const baselineCircuitBreakers =
    baselineResults.esStatsPre?.nodeStats.circuitBreakers.parent?.trippedCount ?? 0;
  const currentCircuitBreakers =
    currentResults.esStatsPost?.nodeStats.circuitBreakers.parent?.trippedCount ?? 0;

  if (currentCircuitBreakers > baselineCircuitBreakers) {
    hardFailures.push(
      `Circuit breaker tripped ${currentCircuitBreakers - baselineCircuitBreakers} times (baseline: ${baselineCircuitBreakers}, current: ${currentCircuitBreakers})`,
    );
  }

  const regressions = metrics.filter((m) => m.status === 'regressed');
  const improvements = metrics.filter((m) => m.status === 'improved');
  const unchanged = metrics.filter((m) => m.status === 'pass');
  const newMetrics = metrics.filter((m) => m.status === 'new');
  const missing = metrics.filter((m) => m.status === 'missing');

  return {
    baselineScenario: baselineResults.scenario,
    currentScenario: currentResults.scenario,
    baselineCollectedAt: baselineResults.collectedAt,
    currentCollectedAt: currentResults.collectedAt,
    regressionThresholdPct,
    hasRegressions: regressions.length > 0 || hardFailures.length > 0,
    summary: {
      totalMetrics: metrics.length,
      regressions: regressions.length,
      improvements: improvements.length,
      unchanged: unchanged.length,
      new: newMetrics.length,
      missing: missing.length,
    },
    metrics,
    hardFailures,
  };
};

export const compareResultFiles = (
  baselinePath: string,
  currentPath: string,
  regressionThresholdPct = REGRESSION_THRESHOLD_PCT,
): ComparisonReport => {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Baseline results file not found: ${baselinePath}`);
  }
  if (!fs.existsSync(currentPath)) {
    throw new Error(`Current results file not found: ${currentPath}`);
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as ScenarioResults;
  const current = JSON.parse(fs.readFileSync(currentPath, 'utf-8')) as ScenarioResults;

  return compareResults(baseline, current, regressionThresholdPct);
};

export const printComparisonReport = (report: ComparisonReport): void => {
  const fmt = (v: number | undefined, suffix = '') =>
    v !== undefined ? `${v.toFixed(1)}${suffix}` : 'N/A';

  log.info(`\n=== Comparison: ${report.baselineScenario} → ${report.currentScenario} ===`);
  log.info(
    `Summary: ${report.summary.regressions} regressions, ${report.summary.improvements} improvements, ` +
      `${report.summary.unchanged} unchanged, threshold=${report.regressionThresholdPct}%`,
  );

  if (report.hardFailures.length > 0) {
    log.error('HARD FAILURES:');
    for (const failure of report.hardFailures) {
      log.error(`  ✗ ${failure}`);
    }
  }

  const regressions = report.metrics.filter((m) => m.status === 'regressed');
  if (regressions.length > 0) {
    log.warn('REGRESSIONS:');
    for (const m of regressions) {
      log.warn(
        `  ✗ ${m.metric}: ${fmt(m.baseline)} → ${fmt(m.current)} (${fmt(m.pctChange, '%')})`,
      );
    }
  }

  const improvements = report.metrics.filter((m) => m.status === 'improved');
  if (improvements.length > 0) {
    log.info('Improvements:');
    for (const m of improvements) {
      log.info(
        `  ✓ ${m.metric}: ${fmt(m.baseline)} → ${fmt(m.current)} (${fmt(m.pctChange, '%')})`,
      );
    }
  }

  log.info(`\nHas regressions: ${report.hasRegressions}`);
};
