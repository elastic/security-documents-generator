import { BaselineMetrics } from '../baseline_metrics';
import { ComparisonResult } from '../metrics_comparison';
import { createResult } from './comparison_helpers';
import { ComparisonThresholds } from '../metrics_comparison';

/**
 * Compare system metrics (CPU, Memory, Throughput, etc.) between baseline and current
 */
export const compareSystemMetrics = (
  baseline: BaselineMetrics,
  current: BaselineMetrics,
  thresholds: ComparisonThresholds
): ComparisonResult[] => {
  const results: ComparisonResult[] = [];

  // CPU metrics
  results.push(
    createResult('CPU (avg)', baseline.metrics.cpu.avg, current.metrics.cpu.avg, false, thresholds)
  );
  results.push(
    createResult('CPU (peak)', baseline.metrics.cpu.peak, current.metrics.cpu.peak, false, thresholds)
  );

  // Memory metrics
  results.push(
    createResult(
      'Memory Heap % (avg)',
      baseline.metrics.memory.avgHeapPercent,
      current.metrics.memory.avgHeapPercent,
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Memory Heap % (peak)',
      baseline.metrics.memory.peakHeapPercent,
      current.metrics.memory.peakHeapPercent,
      false,
      thresholds
    )
  );

  // Throughput metrics (higher is better, so lowerIsBetter = false)
  results.push(
    createResult(
      'Throughput (avg docs/sec)',
      baseline.metrics.throughput.avgDocumentsPerSecond,
      current.metrics.throughput.avgDocumentsPerSecond,
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Throughput (peak docs/sec)',
      baseline.metrics.throughput.peakDocumentsPerSecond,
      current.metrics.throughput.peakDocumentsPerSecond,
      false,
      thresholds
    )
  );

  // Index Efficiency metrics
  results.push(
    createResult(
      'Index Efficiency (ratio)',
      baseline.metrics.indexEfficiency.avgRatio,
      current.metrics.indexEfficiency.avgRatio,
      false, // Higher ratio means better efficiency
      thresholds
    )
  );
  results.push(
    createResult(
      'Index Efficiency (total indexed)',
      baseline.metrics.indexEfficiency.totalDocumentsIndexed,
      current.metrics.indexEfficiency.totalDocumentsIndexed,
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Index Efficiency (total processed)',
      baseline.metrics.indexEfficiency.totalDocumentsProcessed,
      current.metrics.indexEfficiency.totalDocumentsProcessed,
      false,
      thresholds
    )
  );

  // Pages Processed metrics
  results.push(
    createResult(
      'Pages Processed (total)',
      baseline.metrics.pagesProcessed.total,
      current.metrics.pagesProcessed.total,
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Pages Processed (avg per sample)',
      baseline.metrics.pagesProcessed.avgPerSample,
      current.metrics.pagesProcessed.avgPerSample,
      false,
      thresholds
    )
  );

  // Trigger Count metrics
  results.push(
    createResult(
      'Trigger Count (total)',
      baseline.metrics.triggerCount.total,
      current.metrics.triggerCount.total,
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Trigger Count (avg per transform)',
      baseline.metrics.triggerCount.avgPerTransform,
      current.metrics.triggerCount.avgPerTransform,
      false,
      thresholds
    )
  );

  // Exponential Averages metrics
  results.push(
    createResult(
      'Exp Avg Checkpoint Duration',
      baseline.metrics.exponentialAverages.checkpointDuration,
      current.metrics.exponentialAverages.checkpointDuration,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Exp Avg Documents Indexed',
      baseline.metrics.exponentialAverages.documentsIndexed,
      current.metrics.exponentialAverages.documentsIndexed,
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Exp Avg Documents Processed',
      baseline.metrics.exponentialAverages.documentsProcessed,
      current.metrics.exponentialAverages.documentsProcessed,
      false,
      thresholds
    )
  );

  // Transform States metrics
  results.push(
    createResult(
      'Transform States (indexing)',
      baseline.metrics.transformStates.indexing,
      current.metrics.transformStates.indexing,
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Transform States (started)',
      baseline.metrics.transformStates.started,
      current.metrics.transformStates.started,
      false,
      thresholds
    )
  );

  return results;
};

