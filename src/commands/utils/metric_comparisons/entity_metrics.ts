import { BaselineMetrics } from '../baseline_metrics';
import { ComparisonResult } from '../metrics_comparison';
import { createResult } from './comparison_helpers';
import { ComparisonThresholds } from '../metrics_comparison';

// Minimum number of samples required for reliable metric comparison
// Increased to 10 for more reliable percentile calculations (especially p95)
const MIN_SAMPLES_FOR_RELIABLE_METRICS = 10;

// Service entities have lower sample counts due to 1% distribution in standard tests
// Use a lower threshold for service to allow comparison with fewer samples
const MIN_SAMPLES_FOR_SERVICE_ENTITY = 3;

/**
 * Get the minimum sample threshold for an entity type
 */
const getMinSamplesForEntity = (entityType: string): number => {
  return entityType === 'service'
    ? MIN_SAMPLES_FOR_SERVICE_ENTITY
    : MIN_SAMPLES_FOR_RELIABLE_METRICS;
};

/**
 * Compare per-entity-type metrics between baseline and current
 */
export const compareEntityMetrics = (
  baseline: BaselineMetrics,
  current: BaselineMetrics,
  thresholds: ComparisonThresholds
): ComparisonResult[] => {
  const results: ComparisonResult[] = [];

  const entityTypes = ['host', 'user', 'service', 'generic'] as const;
  for (const entityType of entityTypes) {
    const baselineEntity = baseline.metrics.perEntityType[entityType];
    const currentEntity = current.metrics.perEntityType[entityType];
    const minSamplesRequired = getMinSamplesForEntity(entityType);

    // Search Latency per entity - only compare if both have sufficient samples
    const baselineSearchSamples = baselineEntity.sampleCounts?.search || 0;
    const currentSearchSamples = currentEntity.sampleCounts?.search || 0;
    if (baselineSearchSamples >= minSamplesRequired && currentSearchSamples >= minSamplesRequired) {
      results.push(
        createResult(
          `${entityType} - Search Latency (avg)`,
          baselineEntity.searchLatency.avg,
          currentEntity.searchLatency.avg,
          true,
          thresholds
        )
      );
      results.push(
        createResult(
          `${entityType} - Search Latency (p95)`,
          baselineEntity.searchLatency.p95,
          currentEntity.searchLatency.p95,
          true,
          thresholds
        )
      );
    } else {
      // Mark as insufficient_data if insufficient samples (to avoid false positives)
      // But still calculate the actual difference for visibility
      const diffAvg = currentEntity.searchLatency.avg - baselineEntity.searchLatency.avg;
      const diffPercentAvg =
        baselineEntity.searchLatency.avg !== 0
          ? (diffAvg / baselineEntity.searchLatency.avg) * 100
          : 0;
      results.push({
        metric: `${entityType} - Search Latency (avg)`,
        baseline: baselineEntity.searchLatency.avg,
        current: currentEntity.searchLatency.avg,
        diff: diffAvg,
        diffPercent: diffPercentAvg,
        status: 'insufficient',
      });
      const diffP95 = currentEntity.searchLatency.p95 - baselineEntity.searchLatency.p95;
      const diffPercentP95 =
        baselineEntity.searchLatency.p95 !== 0
          ? (diffP95 / baselineEntity.searchLatency.p95) * 100
          : 0;
      results.push({
        metric: `${entityType} - Search Latency (p95)`,
        baseline: baselineEntity.searchLatency.p95,
        current: currentEntity.searchLatency.p95,
        diff: diffP95,
        diffPercent: diffPercentP95,
        status: 'insufficient',
      });
    }

    // Intake Latency per entity - only compare if both have sufficient samples
    const baselineIndexSamples = baselineEntity.sampleCounts?.index || 0;
    const currentIndexSamples = currentEntity.sampleCounts?.index || 0;
    if (baselineIndexSamples >= minSamplesRequired && currentIndexSamples >= minSamplesRequired) {
      results.push(
        createResult(
          `${entityType} - Intake Latency (avg)`,
          baselineEntity.intakeLatency.avg,
          currentEntity.intakeLatency.avg,
          true,
          thresholds
        )
      );
      results.push(
        createResult(
          `${entityType} - Intake Latency (p95)`,
          baselineEntity.intakeLatency.p95,
          currentEntity.intakeLatency.p95,
          true,
          thresholds
        )
      );
    } else {
      // Mark as insufficient_data if insufficient samples
      // But still calculate the actual difference for visibility
      const diffAvg = currentEntity.intakeLatency.avg - baselineEntity.intakeLatency.avg;
      const diffPercentAvg =
        baselineEntity.intakeLatency.avg !== 0
          ? (diffAvg / baselineEntity.intakeLatency.avg) * 100
          : 0;
      results.push({
        metric: `${entityType} - Intake Latency (avg)`,
        baseline: baselineEntity.intakeLatency.avg,
        current: currentEntity.intakeLatency.avg,
        diff: diffAvg,
        diffPercent: diffPercentAvg,
        status: 'insufficient',
      });
      const diffP95 = currentEntity.intakeLatency.p95 - baselineEntity.intakeLatency.p95;
      const diffPercentP95 =
        baselineEntity.intakeLatency.p95 !== 0
          ? (diffP95 / baselineEntity.intakeLatency.p95) * 100
          : 0;
      results.push({
        metric: `${entityType} - Intake Latency (p95)`,
        baseline: baselineEntity.intakeLatency.p95,
        current: currentEntity.intakeLatency.p95,
        diff: diffP95,
        diffPercent: diffPercentP95,
        status: 'insufficient',
      });
    }

    // Processing Latency per entity - only compare if both have sufficient samples
    const baselineProcessingSamples = baselineEntity.sampleCounts?.processing || 0;
    const currentProcessingSamples = currentEntity.sampleCounts?.processing || 0;
    if (
      baselineProcessingSamples >= minSamplesRequired &&
      currentProcessingSamples >= minSamplesRequired
    ) {
      results.push(
        createResult(
          `${entityType} - Processing Latency (avg)`,
          baselineEntity.processingLatency.avg,
          currentEntity.processingLatency.avg,
          true,
          thresholds
        )
      );
      results.push(
        createResult(
          `${entityType} - Processing Latency (p95)`,
          baselineEntity.processingLatency.p95,
          currentEntity.processingLatency.p95,
          true,
          thresholds
        )
      );
    } else {
      // Mark as insufficient_data if insufficient samples
      // But still calculate the actual difference for visibility
      const diffAvg = currentEntity.processingLatency.avg - baselineEntity.processingLatency.avg;
      const diffPercentAvg =
        baselineEntity.processingLatency.avg !== 0
          ? (diffAvg / baselineEntity.processingLatency.avg) * 100
          : 0;
      results.push({
        metric: `${entityType} - Processing Latency (avg)`,
        baseline: baselineEntity.processingLatency.avg,
        current: currentEntity.processingLatency.avg,
        diff: diffAvg,
        diffPercent: diffPercentAvg,
        status: 'insufficient',
      });
      const diffP95 = currentEntity.processingLatency.p95 - baselineEntity.processingLatency.p95;
      const diffPercentP95 =
        baselineEntity.processingLatency.p95 !== 0
          ? (diffP95 / baselineEntity.processingLatency.p95) * 100
          : 0;
      results.push({
        metric: `${entityType} - Processing Latency (p95)`,
        baseline: baselineEntity.processingLatency.p95,
        current: currentEntity.processingLatency.p95,
        diff: diffP95,
        diffPercent: diffPercentP95,
        status: 'insufficient',
      });
    }

    // Documents metrics per entity
    results.push(
      createResult(
        `${entityType} - Documents Processed`,
        baselineEntity.documentsProcessed,
        currentEntity.documentsProcessed,
        false,
        thresholds
      )
    );
    results.push(
      createResult(
        `${entityType} - Documents Indexed`,
        baselineEntity.documentsIndexed,
        currentEntity.documentsIndexed,
        false,
        thresholds
      )
    );
    results.push(
      createResult(
        `${entityType} - Pages Processed`,
        baselineEntity.pagesProcessed,
        currentEntity.pagesProcessed,
        false,
        thresholds
      )
    );
    results.push(
      createResult(
        `${entityType} - Trigger Count`,
        baselineEntity.triggerCount,
        currentEntity.triggerCount,
        false,
        thresholds
      )
    );
  }

  return results;
};

