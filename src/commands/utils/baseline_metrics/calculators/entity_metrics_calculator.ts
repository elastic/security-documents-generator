import { EntityTypeMetrics, EntityTypeData, TransformStatsData } from '../types';
import { percentile, avg, max } from '../utils';

/**
 * Calculate entity type metrics from entity data
 */
const calculateEntityTypeMetrics = (entityData: EntityTypeData): EntityTypeMetrics => {
  const sortedSearch = [...entityData.searchLatencies].sort((a, b) => a - b);
  const sortedIndex = [...entityData.indexLatencies].sort((a, b) => a - b);
  const sortedProcessing = [...entityData.processingLatencies].sort((a, b) => a - b);

  return {
    searchLatency: {
      avg: avg(entityData.searchLatencies),
      p50: percentile(sortedSearch, 50),
      p95: percentile(sortedSearch, 95),
      p99: percentile(sortedSearch, 99),
      max: max(entityData.searchLatencies),
    },
    intakeLatency: {
      avg: avg(entityData.indexLatencies),
      p50: percentile(sortedIndex, 50),
      p95: percentile(sortedIndex, 95),
      p99: percentile(sortedIndex, 99),
      max: max(entityData.indexLatencies),
    },
    processingLatency: {
      avg: avg(entityData.processingLatencies),
      p50: percentile(sortedProcessing, 50),
      p95: percentile(sortedProcessing, 95),
      p99: percentile(sortedProcessing, 99),
      max: max(entityData.processingLatencies),
    },
    // Use MAX values (final cumulative values) instead of summing
    documentsProcessed: max(entityData.documentsProcessed),
    documentsIndexed: max(entityData.documentsIndexed),
    pagesProcessed: max(entityData.pagesProcessed),
    triggerCount: max(entityData.triggerCounts),
    sampleCounts: {
      search: entityData.searchLatencies.length,
      index: entityData.indexLatencies.length,
      processing: entityData.processingLatencies.length,
    },
  };
};

/**
 * Calculate per-entity-type metrics from transform stats data
 */
export const calculateEntityMetrics = (
  transformData: TransformStatsData
): {
  host: EntityTypeMetrics;
  user: EntityTypeMetrics;
  service: EntityTypeMetrics;
  generic: EntityTypeMetrics;
} => {
  return {
    host: calculateEntityTypeMetrics(transformData.perEntityType.host),
    user: calculateEntityTypeMetrics(transformData.perEntityType.user),
    service: calculateEntityTypeMetrics(transformData.perEntityType.service),
    generic: calculateEntityTypeMetrics(transformData.perEntityType.generic),
  };
};
