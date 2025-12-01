import { ComparisonReport, ComparisonResult } from '../metrics_comparison';

/**
 * Helper function to determine appropriate decimal places
 */
const getDecimalPlaces = (baseline: number, current: number): number => {
  // For very small values (< 1), use more precision
  if (Math.abs(baseline) < 1 || Math.abs(current) < 1) {
    // Check if values are very close - if so, need more precision to show difference
    const diff = Math.abs(current - baseline);
    if (diff < 0.01 && baseline !== 0) {
      return 4; // Show 4 decimal places for small differences
    }
    return 3; // Show 3 decimal places for small values
  }
  return 2; // Default to 2 decimal places
};

/**
 * Helper function to format values - integers without decimals, others with adaptive precision
 */
const formatValue = (value: number, metric: string, baseline: number, current: number): string => {
  // Check if this is an integer metric
  const isIntegerMetric =
    metric.includes('Documents Processed') ||
    metric.includes('Documents Indexed') ||
    metric.includes('Pages Processed') ||
    metric.includes('Trigger Count') ||
    metric.includes('Transform States') ||
    metric.includes('Search Failures') ||
    metric.includes('Index Failures') ||
    metric.includes('Total Failures');

  if (isIntegerMetric) {
    // Format as integer (round to nearest integer)
    return Math.round(value).toString();
  }

  // Check if this is a MB metric (memory metrics)
  const isMBMetric = metric.includes('MB');

  if (isMBMetric) {
    // Format MB values with 2 decimal places for readability
    return value.toFixed(2);
  }

  // For non-integer metrics, use adaptive precision
  const decimalPlaces = getDecimalPlaces(baseline, current);
  return value.toFixed(decimalPlaces);
};

/**
 * Format comparison report as a table
 */
export const formatComparisonReport = (report: ComparisonReport): string => {
  const lines: string[] = [];

  lines.push('\n' + '='.repeat(100));
  lines.push('PERFORMANCE COMPARISON REPORT');
  lines.push('='.repeat(100));
  lines.push(`Baseline: ${report.baselineName}`);
  lines.push(`Current:  ${report.currentName}`);
  lines.push(`Generated: ${report.timestamp}`);
  lines.push('');
  lines.push('SUMMARY:');
  lines.push(`  ✅ Improvements: ${report.summary.improvements}`);
  lines.push(`  ⚠️  Warnings: ${report.summary.warnings}`);
  lines.push(`  ❌ Degradations: ${report.summary.degradations}`);
  lines.push(`  ➖ Stable: ${report.summary.stable}`);
  lines.push(`  📊 Insufficient Data: ${report.summary.insufficientData}`);
  lines.push('');
  lines.push('='.repeat(100));
  lines.push('DETAILED METRICS');
  lines.push('='.repeat(100));
  lines.push('');

  // Header
  lines.push(
    'Metric'.padEnd(45) +
      'Baseline'.padStart(15) +
      'Current'.padStart(15) +
      'Diff %'.padStart(12) +
      'Status'.padStart(20)
  );
  lines.push('-'.repeat(100));

  // Group results by category
  const categories: Record<string, ComparisonResult[]> = {
    'Search Latency': report.results.filter(
      (r) => r.metric.startsWith('Search Latency') && !r.metric.includes(' - ')
    ),
    'Intake Latency': report.results.filter(
      (r) => r.metric.startsWith('Intake Latency') && !r.metric.includes(' - ')
    ),
    'Processing Latency': report.results.filter(
      (r) => r.metric.startsWith('Processing Latency') && !r.metric.includes(' - ')
    ),
    CPU: report.results.filter((r) => r.metric.startsWith('CPU')),
    Memory: report.results.filter((r) => r.metric.startsWith('Memory')),
    Throughput: report.results.filter((r) => r.metric.startsWith('Throughput')),
    'Index Efficiency': report.results.filter((r) => r.metric.startsWith('Index Efficiency')),
    'Pages Processed': report.results.filter((r) => r.metric.startsWith('Pages Processed')),
    'Trigger Count': report.results.filter((r) => r.metric.startsWith('Trigger Count')),
    'Exponential Averages': report.results.filter((r) => r.metric.startsWith('Exp Avg')),
    'Transform States': report.results.filter((r) => r.metric.startsWith('Transform States')),
    'Per-Entity-Type (Host)': report.results.filter((r) => r.metric.startsWith('host - ')),
    'Per-Entity-Type (User)': report.results.filter((r) => r.metric.startsWith('user - ')),
    'Per-Entity-Type (Service)': report.results.filter((r) => r.metric.startsWith('service - ')),
    'Per-Entity-Type (Generic)': report.results.filter((r) => r.metric.startsWith('generic - ')),
    Errors: report.results.filter(
      (r) =>
        r.metric.startsWith('Search Failures') ||
        r.metric.startsWith('Index Failures') ||
        r.metric.startsWith('Total Failures')
    ),
    'Kibana Event Loop': report.results.filter((r) => r.metric.startsWith('Kibana Event Loop')),
    'Kibana ES Client': report.results.filter((r) => r.metric.startsWith('Kibana ES Client')),
    'Kibana Response Times': report.results.filter((r) =>
      r.metric.startsWith('Kibana Response Time')
    ),
    'Kibana Memory': report.results.filter(
      (r) => r.metric.startsWith('Kibana') && r.metric.includes('Memory')
    ),
    'Kibana Requests': report.results.filter((r) => r.metric.startsWith('Kibana Request')),
    'Kibana OS Load': report.results.filter((r) => r.metric.startsWith('Kibana OS Load')),
  };

  for (const [category, categoryResults] of Object.entries(categories)) {
    if (categoryResults.length === 0) continue;

    lines.push(`\n${category}:`);
    for (const result of categoryResults) {
      const statusIcon =
        result.status === 'improvement'
          ? '✅'
          : result.status === 'degradation'
            ? '❌'
            : result.status === 'warning'
              ? '⚠️ '
              : result.status === 'insufficient'
                ? '📊'
                : result.status === 'info'
                  ? 'ℹ️ '
                  : '➖';

      const diffStr =
        result.diffPercent >= 0
          ? `+${result.diffPercent.toFixed(1)}%`
          : `${result.diffPercent.toFixed(1)}%`;

      lines.push(
        `  ${result.metric}`.padEnd(45) +
          formatValue(result.baseline, result.metric, result.baseline, result.current).padStart(
            15
          ) +
          formatValue(result.current, result.metric, result.baseline, result.current).padStart(15) +
          diffStr.padStart(12) +
          ` ${statusIcon} ${result.status}`.padStart(20)
      );
    }
  }

  lines.push('');
  lines.push('='.repeat(100));

  return lines.join('\n');
};
