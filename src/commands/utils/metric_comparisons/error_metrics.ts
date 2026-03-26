import { type BaselineMetrics } from '../baseline_metrics/index.ts';
import { type ComparisonResult } from '../metrics_comparison.ts';
import { createResult } from './comparison_helpers.ts';
import { type ComparisonThresholds } from '../metrics_comparison.ts';

/**
 * Compare error metrics between baseline and current
 */
export const compareErrorMetrics = (
  baseline: BaselineMetrics,
  current: BaselineMetrics,
  thresholds: ComparisonThresholds,
): ComparisonResult[] => {
  const results: ComparisonResult[] = [];

  results.push(
    createResult(
      'Search Failures',
      baseline.metrics.errors.searchFailures,
      current.metrics.errors.searchFailures,
      true,
      thresholds,
    ),
  );
  results.push(
    createResult(
      'Index Failures',
      baseline.metrics.errors.indexFailures,
      current.metrics.errors.indexFailures,
      true,
      thresholds,
    ),
  );
  results.push(
    createResult(
      'Total Failures',
      baseline.metrics.errors.totalFailures,
      current.metrics.errors.totalFailures,
      true,
      thresholds,
    ),
  );

  return results;
};
