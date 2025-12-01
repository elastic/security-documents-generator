import { BaselineMetrics } from './baseline_metrics';
import { compareKibanaMetrics } from './metric_comparisons/kibana_metrics';
import { compareLatencyMetrics } from './metric_comparisons/latency_metrics';
import { compareSystemMetrics } from './metric_comparisons/system_metrics';
import { compareEntityMetrics } from './metric_comparisons/entity_metrics';
import { compareErrorMetrics } from './metric_comparisons/error_metrics';

export interface ComparisonResult {
  metric: string;
  baseline: number;
  current: number;
  diff: number;
  diffPercent: number;
  status: 'improvement' | 'degradation' | 'warning' | 'stable' | 'insufficient' | 'info';
}

export interface ComparisonReport {
  baselineName: string;
  currentName: string;
  timestamp: string;
  results: ComparisonResult[];
  summary: {
    improvements: number;
    degradations: number;
    warnings: number;
    stable: number;
    insufficientData: number;
  };
}

export interface ComparisonThresholds {
  degradationThreshold: number; // Percentage worse to be considered degradation (default: 20)
  warningThreshold: number; // Percentage worse to be considered warning (default: 10)
  improvementThreshold: number; // Percentage better to be considered improvement (default: 10)
}

const DEFAULT_THRESHOLDS: ComparisonThresholds = {
  degradationThreshold: 20,
  warningThreshold: 10,
  improvementThreshold: 10,
};

/**
 * Compare current metrics against baseline
 */
export const compareMetrics = (
  baseline: BaselineMetrics,
  current: BaselineMetrics,
  thresholds: ComparisonThresholds = DEFAULT_THRESHOLDS
): ComparisonReport => {
  const results: ComparisonResult[] = [
    ...compareLatencyMetrics(baseline, current, thresholds),
    ...compareSystemMetrics(baseline, current, thresholds),
    ...compareEntityMetrics(baseline, current, thresholds),
    ...compareErrorMetrics(baseline, current, thresholds),
    ...compareKibanaMetrics(baseline, current, thresholds),
  ];

  // Calculate summary
  // Note: 'info' status metrics (p99, max) are excluded from summary counts
  const summary = {
    improvements: results.filter((r) => r.status === 'improvement').length,
    degradations: results.filter((r) => r.status === 'degradation').length,
    warnings: results.filter((r) => r.status === 'warning').length,
    stable: results.filter((r) => r.status === 'stable').length,
    insufficientData: results.filter((r) => r.status === 'insufficient').length,
  };

  return {
    baselineName: baseline.testName,
    currentName: current.testName,
    timestamp: new Date().toISOString(),
    results,
    summary,
  };
};

// Re-export formatComparisonReport from report_formatter
export { formatComparisonReport } from './metric_comparisons/report_formatter';

/**
 * Build comparison thresholds from options
 */
export const buildComparisonThresholds = (options: {
  degradationThreshold?: number;
  warningThreshold?: number;
  improvementThreshold?: number;
}): ComparisonThresholds => {
  return {
    degradationThreshold: options.degradationThreshold || DEFAULT_THRESHOLDS.degradationThreshold,
    warningThreshold: options.warningThreshold || DEFAULT_THRESHOLDS.warningThreshold,
    improvementThreshold: options.improvementThreshold || DEFAULT_THRESHOLDS.improvementThreshold,
  };
};
