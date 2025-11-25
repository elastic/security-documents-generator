import { BaselineMetrics } from '../baseline_metrics';
import { ComparisonResult } from '../metrics_comparison';
import { createResult, createInfoResult } from './comparison_helpers';
import { ComparisonThresholds } from '../metrics_comparison';

/**
 * Compare latency metrics (Search, Intake, Processing) between baseline and current
 */
export const compareLatencyMetrics = (
  baseline: BaselineMetrics,
  current: BaselineMetrics,
  thresholds: ComparisonThresholds
): ComparisonResult[] => {
  const results: ComparisonResult[] = [];

  // Search Latency metrics
  results.push(
    createResult(
      'Search Latency (avg)',
      baseline.metrics.searchLatency.avg,
      current.metrics.searchLatency.avg,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Search Latency (p50)',
      baseline.metrics.searchLatency.p50,
      current.metrics.searchLatency.p50,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Search Latency (p95)',
      baseline.metrics.searchLatency.p95,
      current.metrics.searchLatency.p95,
      true,
      thresholds
    )
  );
  results.push(
    createInfoResult(
      'Search Latency (p99)',
      baseline.metrics.searchLatency.p99,
      current.metrics.searchLatency.p99
    )
  );
  results.push(
    createInfoResult(
      'Search Latency (max)',
      baseline.metrics.searchLatency.max,
      current.metrics.searchLatency.max
    )
  );

  // Intake Latency metrics
  results.push(
    createResult(
      'Intake Latency (avg)',
      baseline.metrics.intakeLatency.avg,
      current.metrics.intakeLatency.avg,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Intake Latency (p50)',
      baseline.metrics.intakeLatency.p50,
      current.metrics.intakeLatency.p50,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Intake Latency (p95)',
      baseline.metrics.intakeLatency.p95,
      current.metrics.intakeLatency.p95,
      true,
      thresholds
    )
  );
  results.push(
    createInfoResult(
      'Intake Latency (p99)',
      baseline.metrics.intakeLatency.p99,
      current.metrics.intakeLatency.p99
    )
  );
  results.push(
    createInfoResult(
      'Intake Latency (max)',
      baseline.metrics.intakeLatency.max,
      current.metrics.intakeLatency.max
    )
  );

  // Processing Latency metrics
  results.push(
    createResult(
      'Processing Latency (avg)',
      baseline.metrics.processingLatency.avg,
      current.metrics.processingLatency.avg,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Processing Latency (p50)',
      baseline.metrics.processingLatency.p50,
      current.metrics.processingLatency.p50,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Processing Latency (p95)',
      baseline.metrics.processingLatency.p95,
      current.metrics.processingLatency.p95,
      true,
      thresholds
    )
  );
  results.push(
    createInfoResult(
      'Processing Latency (p99)',
      baseline.metrics.processingLatency.p99,
      current.metrics.processingLatency.p99
    )
  );
  results.push(
    createInfoResult(
      'Processing Latency (max)',
      baseline.metrics.processingLatency.max,
      current.metrics.processingLatency.max
    )
  );

  return results;
};

