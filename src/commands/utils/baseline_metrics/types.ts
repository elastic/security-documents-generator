import { EntityType } from '../../../types/entities';
import { PercentileMetrics } from './utils';

export interface EntityTypeMetrics {
  searchLatency: PercentileMetrics;
  intakeLatency: PercentileMetrics;
  processingLatency: PercentileMetrics;
  documentsProcessed: number;
  documentsIndexed: number;
  pagesProcessed: number;
  triggerCount: number;
  sampleCounts?: {
    search: number;
    index: number;
    processing: number;
  };
}

export interface BaselineMetrics {
  testName: string;
  timestamp: string;
  testConfig: {
    entityCount: number;
    logsPerEntity: number;
    uploadCount?: number;
    intervalMs?: number;
  };
  metrics: {
    searchLatency: PercentileMetrics;
    intakeLatency: PercentileMetrics;
    processingLatency: PercentileMetrics;
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
    perEntityType: Record<EntityType, EntityTypeMetrics>;
    transformStates: {
      indexing: number;
      started: number;
    };
    errors: {
      searchFailures: number;
      indexFailures: number;
      totalFailures: number;
    };
    clusterHealth: {
      status: string;
      avgActiveShards: number;
      unassignedShards: number;
    };
    kibana: {
      eventLoop: {
        delay: {
          avg: number;
          p50: number;
          p95: number;
          p99: number;
          max: number;
        };
        utilization: {
          avg: number;
          peak: number;
        };
      };
      elasticsearchClient: {
        avgActiveSockets: number;
        avgIdleSockets: number;
        peakQueuedRequests: number;
      };
      responseTimes: {
        avg: number;
        max: number;
      };
      memory: {
        avgHeapBytes: number;
        peakHeapBytes: number;
        avgRssBytes: number;
        peakRssBytes: number;
      };
      requests: {
        total: number;
        avgPerSecond: number;
        errorRate: number;
        disconnects: number;
      };
      osLoad: {
        avg1m: number;
        avg5m: number;
        avg15m: number;
        peak1m: number;
      };
    };
  };
}

export interface EntityTypeData {
  searchLatencies: number[];
  indexLatencies: number[];
  processingLatencies: number[];
  documentsProcessed: number[];
  documentsIndexed: number[];
  pagesProcessed: number[];
  triggerCounts: number[];
}

export interface TransformStatsData {
  searchLatencies: number[];
  indexLatencies: number[];
  processingLatencies: number[];
  documentsProcessed: number[];
  documentsIndexed: number[];
  pagesProcessed: number[];
  triggerCounts: number[];
  searchFailures: number;
  indexFailures: number;
  timestamps: number[];
  exponentialAverages: {
    checkpointDuration: number[];
    documentsIndexed: number[];
    documentsProcessed: number[];
  };
  transformStates: {
    indexing: number;
    started: number;
  };
  perEntityType: Record<EntityType, EntityTypeData>;
}
