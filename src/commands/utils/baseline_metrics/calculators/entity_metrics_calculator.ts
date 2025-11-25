import { EntityTypeMetrics, EntityTypeData, TransformStatsData } from '../types';
import { percentile } from '../utils';

/**
 * Calculate entity type metrics from entity data
 */
const calculateEntityTypeMetrics = (entityData: EntityTypeData): EntityTypeMetrics => {
  const sortedSearch = [...entityData.searchLatencies].sort((a, b) => a - b);
  const sortedIndex = [...entityData.indexLatencies].sort((a, b) => a - b);
  const sortedProcessing = [...entityData.processingLatencies].sort((a, b) => a - b);

  return {
    searchLatency: {
      avg:
        entityData.searchLatencies.length > 0
          ? entityData.searchLatencies.reduce((a, b) => a + b, 0) /
            entityData.searchLatencies.length
          : 0,
      p50: percentile(sortedSearch, 50),
      p95: percentile(sortedSearch, 95),
      p99: percentile(sortedSearch, 99),
      max: entityData.searchLatencies.length > 0 ? Math.max(...entityData.searchLatencies) : 0,
    },
    intakeLatency: {
      avg:
        entityData.indexLatencies.length > 0
          ? entityData.indexLatencies.reduce((a, b) => a + b, 0) / entityData.indexLatencies.length
          : 0,
      p50: percentile(sortedIndex, 50),
      p95: percentile(sortedIndex, 95),
      p99: percentile(sortedIndex, 99),
      max: entityData.indexLatencies.length > 0 ? Math.max(...entityData.indexLatencies) : 0,
    },
    processingLatency: {
      avg:
        entityData.processingLatencies.length > 0
          ? entityData.processingLatencies.reduce((a, b) => a + b, 0) /
            entityData.processingLatencies.length
          : 0,
      p50: percentile(sortedProcessing, 50),
      p95: percentile(sortedProcessing, 95),
      p99: percentile(sortedProcessing, 99),
      max:
        entityData.processingLatencies.length > 0 ? Math.max(...entityData.processingLatencies) : 0,
    },
    // Use MAX values (final cumulative values) instead of summing
    documentsProcessed:
      entityData.documentsProcessed.length > 0 ? Math.max(...entityData.documentsProcessed) : 0,
    documentsIndexed:
      entityData.documentsIndexed.length > 0 ? Math.max(...entityData.documentsIndexed) : 0,
    pagesProcessed:
      entityData.pagesProcessed.length > 0 ? Math.max(...entityData.pagesProcessed) : 0,
    triggerCount: entityData.triggerCounts.length > 0 ? Math.max(...entityData.triggerCounts) : 0,
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
