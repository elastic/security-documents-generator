import { TransformStatsData, EntityTypeMetrics } from '../types';
import { avg, max } from '../utils';

export interface SystemMetrics {
  cpu: {
    avg: number;
    peak: number;
    avgPerNode: Record<string, number>;
  };
  memory: {
    avgHeapPercent: number;
    peakHeapPercent: number;
    avgHeapBytes: number;
    peakHeapBytes: number;
  };
  throughput: {
    avgDocumentsPerSecond: number;
    peakDocumentsPerSecond: number;
  };
  indexEfficiency: {
    avgRatio: number;
    totalDocumentsIndexed: number;
    totalDocumentsProcessed: number;
  };
  pagesProcessed: {
    total: number;
    avgPerSample: number;
  };
  triggerCount: {
    total: number;
    avgPerTransform: number;
  };
  exponentialAverages: {
    checkpointDuration: number;
    documentsIndexed: number;
    documentsProcessed: number;
  };
}

interface NodeStatsData {
  cpuPercentages: number[];
  heapPercentages: number[];
  heapBytes: number[];
  cpuPerNode: Record<string, number[]>;
}

/**
 * Calculate system metrics from transform and node stats data
 */
export const calculateSystemMetrics = (
  transformData: TransformStatsData,
  nodeData: NodeStatsData,
  perEntityType: {
    host: EntityTypeMetrics;
    user: EntityTypeMetrics;
    service: EntityTypeMetrics;
    generic: EntityTypeMetrics;
  }
): SystemMetrics => {
  // Calculate CPU metrics
  const avgCpuPerNode: Record<string, number> = {};
  for (const [nodeName, cpuValues] of Object.entries(nodeData.cpuPerNode)) {
    avgCpuPerNode[nodeName] = avg(cpuValues);
  }

  const cpu = {
    avg: avg(nodeData.cpuPercentages),
    peak: max(nodeData.cpuPercentages),
    avgPerNode: avgCpuPerNode,
  };

  // Calculate memory metrics
  const memory = {
    avgHeapPercent: avg(nodeData.heapPercentages),
    peakHeapPercent: max(nodeData.heapPercentages),
    avgHeapBytes: avg(nodeData.heapBytes),
    peakHeapBytes: max(nodeData.heapBytes),
  };

  // Calculate throughput
  // Sum the MAX values from each entity type (cumulative totals)
  const timeSpan =
    transformData.timestamps.length > 1
      ? (max(transformData.timestamps) - Math.min(...transformData.timestamps)) / 1000
      : 1;
  const totalDocuments =
    perEntityType.host.documentsProcessed +
    perEntityType.user.documentsProcessed +
    perEntityType.service.documentsProcessed +
    perEntityType.generic.documentsProcessed;
  const avgDocumentsPerSecond = timeSpan > 0 ? totalDocuments / timeSpan : 0;
  const peakDocumentsPerSecond =
    transformData.documentsProcessed.length > 0 && timeSpan > 0
      ? max(transformData.documentsProcessed) / (timeSpan / transformData.documentsProcessed.length)
      : 0;

  // Calculate index efficiency
  // Sum the MAX values from each entity type (cumulative totals)
  const totalDocumentsIndexed =
    perEntityType.host.documentsIndexed +
    perEntityType.user.documentsIndexed +
    perEntityType.service.documentsIndexed +
    perEntityType.generic.documentsIndexed;
  const totalDocumentsProcessed =
    perEntityType.host.documentsProcessed +
    perEntityType.user.documentsProcessed +
    perEntityType.service.documentsProcessed +
    perEntityType.generic.documentsProcessed;
  const indexEfficiency = {
    avgRatio: totalDocumentsProcessed > 0 ? totalDocumentsIndexed / totalDocumentsProcessed : 0,
    totalDocumentsIndexed,
    totalDocumentsProcessed,
  };

  // Calculate pages processed metrics
  // Sum the MAX values from each entity type (cumulative totals)
  const totalPagesProcessed =
    perEntityType.host.pagesProcessed +
    perEntityType.user.pagesProcessed +
    perEntityType.service.pagesProcessed +
    perEntityType.generic.pagesProcessed;
  const pagesProcessed = {
    total: totalPagesProcessed,
    avgPerSample:
      transformData.pagesProcessed.length > 0
        ? totalPagesProcessed / transformData.pagesProcessed.length
        : 0,
  };

  // Calculate trigger count metrics
  // Sum the MAX values from each entity type (cumulative totals)
  const totalTriggerCount =
    perEntityType.host.triggerCount +
    perEntityType.user.triggerCount +
    perEntityType.service.triggerCount +
    perEntityType.generic.triggerCount;
  const triggerCount = {
    total: totalTriggerCount,
    avgPerTransform:
      transformData.triggerCounts.length > 0
        ? totalTriggerCount / transformData.triggerCounts.length
        : 0,
  };

  // Calculate exponential averages (use last non-zero value)
  const exponentialAverages = {
    checkpointDuration:
      transformData.exponentialAverages.checkpointDuration.length > 0
        ? transformData.exponentialAverages.checkpointDuration[
            transformData.exponentialAverages.checkpointDuration.length - 1
          ]
        : 0,
    documentsIndexed:
      transformData.exponentialAverages.documentsIndexed.length > 0
        ? transformData.exponentialAverages.documentsIndexed[
            transformData.exponentialAverages.documentsIndexed.length - 1
          ]
        : 0,
    documentsProcessed:
      transformData.exponentialAverages.documentsProcessed.length > 0
        ? transformData.exponentialAverages.documentsProcessed[
            transformData.exponentialAverages.documentsProcessed.length - 1
          ]
        : 0,
  };

  return {
    cpu,
    memory,
    throughput: {
      avgDocumentsPerSecond,
      peakDocumentsPerSecond,
    },
    indexEfficiency,
    pagesProcessed,
    triggerCount,
    exponentialAverages,
  };
};
