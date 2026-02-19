import { EntityTypeMetrics, EntityTypeData, TransformStatsData } from '../types';
import { computePercentileMetrics, max } from '../utils';
import { EntityType } from '../../../../types/entities';

/**
 * Calculate entity type metrics from entity data
 */
const calculateEntityTypeMetrics = (entityData: EntityTypeData): EntityTypeMetrics => {
  return {
    searchLatency: computePercentileMetrics(entityData.searchLatencies),
    intakeLatency: computePercentileMetrics(entityData.indexLatencies),
    processingLatency: computePercentileMetrics(entityData.processingLatencies),
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
): Record<EntityType, EntityTypeMetrics> => {
  return {
    host: calculateEntityTypeMetrics(transformData.perEntityType.host),
    user: calculateEntityTypeMetrics(transformData.perEntityType.user),
    service: calculateEntityTypeMetrics(transformData.perEntityType.service),
    generic: calculateEntityTypeMetrics(transformData.perEntityType.generic),
  };
};
