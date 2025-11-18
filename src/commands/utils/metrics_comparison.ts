import { BaselineMetrics } from './baseline_metrics';

export interface ComparisonResult {
  metric: string;
  baseline: number;
  current: number;
  diff: number;
  diffPercent: number;
  status: 'improvement' | 'degradation' | 'warning' | 'stable';
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
  const results: ComparisonResult[] = [];

  // Helper to create comparison result
  const createResult = (
    metric: string,
    baselineValue: number,
    currentValue: number,
    lowerIsBetter: boolean = false
  ): ComparisonResult => {
    const diff = currentValue - baselineValue;
    const diffPercent = baselineValue !== 0 ? (diff / baselineValue) * 100 : 0;
    
    // For metrics where lower is better (latency, errors), flip the logic
    const effectiveDiffPercent = lowerIsBetter ? -diffPercent : diffPercent;
    
    let status: ComparisonResult['status'] = 'stable';
    
    // For lowerIsBetter metrics (latency, errors):
    // - Negative effectiveDiffPercent means current > baseline (worse) = degradation
    // - Positive effectiveDiffPercent means current < baseline (better) = improvement
    // For higherIsBetter metrics (throughput, efficiency):
    // - Positive effectiveDiffPercent means current > baseline (better) = improvement
    // - Negative effectiveDiffPercent means current < baseline (worse) = degradation
    if (lowerIsBetter) {
      // Lower is better: negative effectiveDiffPercent = worse (degradation)
      if (effectiveDiffPercent < -thresholds.degradationThreshold) {
        status = 'degradation';
      } else if (effectiveDiffPercent < -thresholds.warningThreshold) {
        status = 'warning';
      } else if (effectiveDiffPercent > thresholds.improvementThreshold) {
        status = 'improvement';
      } else {
        status = 'stable';
      }
    } else {
      // Higher is better: positive effectiveDiffPercent = better (improvement)
      // Negative effectiveDiffPercent = worse (degradation)
      if (effectiveDiffPercent < -thresholds.degradationThreshold) {
        status = 'degradation';
      } else if (effectiveDiffPercent < -thresholds.warningThreshold) {
        status = 'warning';
      } else if (effectiveDiffPercent > thresholds.improvementThreshold) {
        status = 'improvement';
      } else {
        status = 'stable';
      }
    }

    return {
      metric,
      baseline: baselineValue,
      current: currentValue,
      diff,
      diffPercent: effectiveDiffPercent,
      status,
    };
  };

  // Search Latency metrics
  results.push(createResult('Search Latency (avg)', baseline.metrics.searchLatency.avg, current.metrics.searchLatency.avg, true));
  results.push(createResult('Search Latency (p50)', baseline.metrics.searchLatency.p50, current.metrics.searchLatency.p50, true));
  results.push(createResult('Search Latency (p95)', baseline.metrics.searchLatency.p95, current.metrics.searchLatency.p95, true));
  results.push(createResult('Search Latency (p99)', baseline.metrics.searchLatency.p99, current.metrics.searchLatency.p99, true));
  results.push(createResult('Search Latency (max)', baseline.metrics.searchLatency.max, current.metrics.searchLatency.max, true));

  // Intake Latency metrics
  results.push(createResult('Intake Latency (avg)', baseline.metrics.intakeLatency.avg, current.metrics.intakeLatency.avg, true));
  results.push(createResult('Intake Latency (p50)', baseline.metrics.intakeLatency.p50, current.metrics.intakeLatency.p50, true));
  results.push(createResult('Intake Latency (p95)', baseline.metrics.intakeLatency.p95, current.metrics.intakeLatency.p95, true));
  results.push(createResult('Intake Latency (p99)', baseline.metrics.intakeLatency.p99, current.metrics.intakeLatency.p99, true));
  results.push(createResult('Intake Latency (max)', baseline.metrics.intakeLatency.max, current.metrics.intakeLatency.max, true));

  // Processing Latency metrics
  results.push(
    createResult(
      'Processing Latency (avg)',
      baseline.metrics.processingLatency.avg,
      current.metrics.processingLatency.avg,
      true
    )
  );
  results.push(
    createResult(
      'Processing Latency (p50)',
      baseline.metrics.processingLatency.p50,
      current.metrics.processingLatency.p50,
      true
    )
  );
  results.push(
    createResult(
      'Processing Latency (p95)',
      baseline.metrics.processingLatency.p95,
      current.metrics.processingLatency.p95,
      true
    )
  );
  results.push(
    createResult(
      'Processing Latency (p99)',
      baseline.metrics.processingLatency.p99,
      current.metrics.processingLatency.p99,
      true
    )
  );
  results.push(
    createResult(
      'Processing Latency (max)',
      baseline.metrics.processingLatency.max,
      current.metrics.processingLatency.max,
      true
    )
  );

  // CPU metrics
  results.push(createResult('CPU (avg)', baseline.metrics.cpu.avg, current.metrics.cpu.avg));
  results.push(createResult('CPU (peak)', baseline.metrics.cpu.peak, current.metrics.cpu.peak));

  // Memory metrics
  results.push(createResult('Memory Heap % (avg)', baseline.metrics.memory.avgHeapPercent, current.metrics.memory.avgHeapPercent));
  results.push(createResult('Memory Heap % (peak)', baseline.metrics.memory.peakHeapPercent, current.metrics.memory.peakHeapPercent));

  // Throughput metrics (higher is better, so lowerIsBetter = false)
  results.push(
    createResult(
      'Throughput (avg docs/sec)',
      baseline.metrics.throughput.avgDocumentsPerSecond,
      current.metrics.throughput.avgDocumentsPerSecond,
      false
    )
  );
  results.push(
    createResult(
      'Throughput (peak docs/sec)',
      baseline.metrics.throughput.peakDocumentsPerSecond,
      current.metrics.throughput.peakDocumentsPerSecond,
      false
    )
  );

  // Index Efficiency metrics
  results.push(
    createResult(
      'Index Efficiency (ratio)',
      baseline.metrics.indexEfficiency.avgRatio,
      current.metrics.indexEfficiency.avgRatio
    )
  );
  results.push(
    createResult(
      'Index Efficiency (total indexed)',
      baseline.metrics.indexEfficiency.totalDocumentsIndexed,
      current.metrics.indexEfficiency.totalDocumentsIndexed
    )
  );
  results.push(
    createResult(
      'Index Efficiency (total processed)',
      baseline.metrics.indexEfficiency.totalDocumentsProcessed,
      current.metrics.indexEfficiency.totalDocumentsProcessed
    )
  );

  // Pages Processed metrics
  results.push(
    createResult(
      'Pages Processed (total)',
      baseline.metrics.pagesProcessed.total,
      current.metrics.pagesProcessed.total
    )
  );
  results.push(
    createResult(
      'Pages Processed (avg per sample)',
      baseline.metrics.pagesProcessed.avgPerSample,
      current.metrics.pagesProcessed.avgPerSample
    )
  );

  // Trigger Count metrics
  results.push(
    createResult(
      'Trigger Count (total)',
      baseline.metrics.triggerCount.total,
      current.metrics.triggerCount.total
    )
  );
  results.push(
    createResult(
      'Trigger Count (avg per transform)',
      baseline.metrics.triggerCount.avgPerTransform,
      current.metrics.triggerCount.avgPerTransform
    )
  );

  // Exponential Averages metrics
  results.push(
    createResult(
      'Exp Avg Checkpoint Duration',
      baseline.metrics.exponentialAverages.checkpointDuration,
      current.metrics.exponentialAverages.checkpointDuration,
      true
    )
  );
  results.push(
    createResult(
      'Exp Avg Documents Indexed',
      baseline.metrics.exponentialAverages.documentsIndexed,
      current.metrics.exponentialAverages.documentsIndexed
    )
  );
  results.push(
    createResult(
      'Exp Avg Documents Processed',
      baseline.metrics.exponentialAverages.documentsProcessed,
      current.metrics.exponentialAverages.documentsProcessed
    )
  );

  // Transform States metrics
  results.push(
    createResult(
      'Transform States (indexing)',
      baseline.metrics.transformStates.indexing,
      current.metrics.transformStates.indexing
    )
  );
  results.push(
    createResult(
      'Transform States (started)',
      baseline.metrics.transformStates.started,
      current.metrics.transformStates.started
    )
  );

  // Per-Entity-Type metrics
  const entityTypes = ['host', 'user', 'service', 'generic'] as const;
  for (const entityType of entityTypes) {
    const baselineEntity = baseline.metrics.perEntityType[entityType];
    const currentEntity = current.metrics.perEntityType[entityType];

    // Search Latency per entity
    results.push(
      createResult(
        `${entityType} - Search Latency (avg)`,
        baselineEntity.searchLatency.avg,
        currentEntity.searchLatency.avg,
        true
      )
    );
    results.push(
      createResult(
        `${entityType} - Search Latency (p95)`,
        baselineEntity.searchLatency.p95,
        currentEntity.searchLatency.p95,
        true
      )
    );

    // Intake Latency per entity
    results.push(
      createResult(
        `${entityType} - Intake Latency (avg)`,
        baselineEntity.intakeLatency.avg,
        currentEntity.intakeLatency.avg,
        true
      )
    );
    results.push(
      createResult(
        `${entityType} - Intake Latency (p95)`,
        baselineEntity.intakeLatency.p95,
        currentEntity.intakeLatency.p95,
        true
      )
    );

    // Processing Latency per entity
    results.push(
      createResult(
        `${entityType} - Processing Latency (avg)`,
        baselineEntity.processingLatency.avg,
        currentEntity.processingLatency.avg,
        true
      )
    );
    results.push(
      createResult(
        `${entityType} - Processing Latency (p95)`,
        baselineEntity.processingLatency.p95,
        currentEntity.processingLatency.p95,
        true
      )
    );

    // Documents metrics per entity
    results.push(
      createResult(
        `${entityType} - Documents Processed`,
        baselineEntity.documentsProcessed,
        currentEntity.documentsProcessed
      )
    );
    results.push(
      createResult(
        `${entityType} - Documents Indexed`,
        baselineEntity.documentsIndexed,
        currentEntity.documentsIndexed
      )
    );
    results.push(
      createResult(
        `${entityType} - Pages Processed`,
        baselineEntity.pagesProcessed,
        currentEntity.pagesProcessed
      )
    );
    results.push(
      createResult(
        `${entityType} - Trigger Count`,
        baselineEntity.triggerCount,
        currentEntity.triggerCount
      )
    );
  }

  // Error metrics
  results.push(createResult('Search Failures', baseline.metrics.errors.searchFailures, current.metrics.errors.searchFailures, true));
  results.push(createResult('Index Failures', baseline.metrics.errors.indexFailures, current.metrics.errors.indexFailures, true));
  results.push(createResult('Total Failures', baseline.metrics.errors.totalFailures, current.metrics.errors.totalFailures, true));

  // Calculate summary
  const summary = {
    improvements: results.filter((r) => r.status === 'improvement').length,
    degradations: results.filter((r) => r.status === 'degradation').length,
    warnings: results.filter((r) => r.status === 'warning').length,
    stable: results.filter((r) => r.status === 'stable').length,
  };

  return {
    baselineName: baseline.testName,
    currentName: current.testName,
    timestamp: new Date().toISOString(),
    results,
    summary,
  };
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
  lines.push('');
  lines.push('='.repeat(100));
  lines.push('DETAILED METRICS');
  lines.push('='.repeat(100));
  lines.push('');
  
  // Header
  lines.push(
    'Metric'.padEnd(35) +
    'Baseline'.padStart(15) +
    'Current'.padStart(15) +
    'Diff %'.padStart(12) +
    'Status'.padStart(15)
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
    'CPU': report.results.filter((r) => r.metric.startsWith('CPU')),
    'Memory': report.results.filter((r) => r.metric.startsWith('Memory')),
    'Throughput': report.results.filter((r) => r.metric.startsWith('Throughput')),
    'Index Efficiency': report.results.filter((r) => r.metric.startsWith('Index Efficiency')),
    'Pages Processed': report.results.filter((r) => r.metric.startsWith('Pages Processed')),
    'Trigger Count': report.results.filter((r) => r.metric.startsWith('Trigger Count')),
    'Exponential Averages': report.results.filter((r) => r.metric.startsWith('Exp Avg')),
    'Transform States': report.results.filter((r) => r.metric.startsWith('Transform States')),
    'Per-Entity-Type (Host)': report.results.filter((r) => r.metric.startsWith('host - ')),
    'Per-Entity-Type (User)': report.results.filter((r) => r.metric.startsWith('user - ')),
    'Per-Entity-Type (Service)': report.results.filter((r) => r.metric.startsWith('service - ')),
    'Per-Entity-Type (Generic)': report.results.filter((r) => r.metric.startsWith('generic - ')),
    'Errors': report.results.filter(
      (r) =>
        r.metric.startsWith('Search Failures') ||
        r.metric.startsWith('Index Failures') ||
        r.metric.startsWith('Total Failures')
    ),
  };

  // Helper function to determine appropriate decimal places
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

  // Helper function to format values - integers without decimals, others with adaptive precision
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

    // For non-integer metrics, use adaptive precision
    const decimalPlaces = getDecimalPlaces(baseline, current);
    return value.toFixed(decimalPlaces);
  };

  for (const [category, categoryResults] of Object.entries(categories)) {
    if (categoryResults.length === 0) continue;

    lines.push(`\n${category}:`);
    for (const result of categoryResults) {
      const statusIcon =
        result.status === 'improvement' ? '✅' :
        result.status === 'degradation' ? '❌' :
        result.status === 'warning' ? '⚠️ ' :
        '➖';

      const diffStr = result.diffPercent >= 0
        ? `+${result.diffPercent.toFixed(1)}%`
        : `${result.diffPercent.toFixed(1)}%`;

      lines.push(
        `  ${result.metric}`.padEnd(35) +
        formatValue(result.baseline, result.metric, result.baseline, result.current).padStart(15) +
        formatValue(result.current, result.metric, result.baseline, result.current).padStart(15) +
        diffStr.padStart(12) +
        `${statusIcon} ${result.status}`.padStart(15)
      );
    }
  }

  lines.push('');
  lines.push('='.repeat(100));
  
  return lines.join('\n');
};

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

