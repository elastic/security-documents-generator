import fs from 'fs';
import path from 'path';

interface EntityTypeMetrics {
  searchLatency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  intakeLatency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  processingLatency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
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
    searchLatency: {
      avg: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
    };
    intakeLatency: {
      avg: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
    };
    processingLatency: {
      avg: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
    };
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
    perEntityType: {
      host: EntityTypeMetrics;
      user: EntityTypeMetrics;
      service: EntityTypeMetrics;
      generic: EntityTypeMetrics;
    };
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
  };
}

const BASELINES_DIR = path.join(process.cwd(), 'baselines');

// Ensure baselines directory exists
if (!fs.existsSync(BASELINES_DIR)) {
  fs.mkdirSync(BASELINES_DIR, { recursive: true });
}

/**
 * Calculate percentile from sorted array
 */
const percentile = (sortedArray: number[], percentile: number): number => {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, index)];
};

/**
 * Parse transform stats log and extract metrics
 */
const parseTransformStats = (
  logPath: string
): {
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
  perEntityType: {
    host: {
      searchLatencies: number[];
      indexLatencies: number[];
      processingLatencies: number[];
      documentsProcessed: number[];
      documentsIndexed: number[];
      pagesProcessed: number[];
      triggerCounts: number[];
    };
    user: {
      searchLatencies: number[];
      indexLatencies: number[];
      processingLatencies: number[];
      documentsProcessed: number[];
      documentsIndexed: number[];
      pagesProcessed: number[];
      triggerCounts: number[];
    };
    service: {
      searchLatencies: number[];
      indexLatencies: number[];
      processingLatencies: number[];
      documentsProcessed: number[];
      documentsIndexed: number[];
      pagesProcessed: number[];
      triggerCounts: number[];
    };
    generic: {
      searchLatencies: number[];
      indexLatencies: number[];
      processingLatencies: number[];
      documentsProcessed: number[];
      documentsIndexed: number[];
      pagesProcessed: number[];
      triggerCounts: number[];
    };
  };
} => {
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());

  const searchLatencies: number[] = [];
  const indexLatencies: number[] = [];
  const processingLatencies: number[] = [];
  const documentsProcessed: number[] = [];
  const documentsIndexed: number[] = [];
  const pagesProcessed: number[] = [];
  const triggerCounts: number[] = [];
  let searchFailures = 0;
  let indexFailures = 0;
  const timestamps: number[] = [];
  const exponentialAverages = {
    checkpointDuration: [] as number[],
    documentsIndexed: [] as number[],
    documentsProcessed: [] as number[],
  };
  const transformStates = {
    indexing: 0,
    started: 0,
  };

  const perEntityType = {
    host: {
      searchLatencies: [] as number[],
      indexLatencies: [] as number[],
      processingLatencies: [] as number[],
      documentsProcessed: [] as number[],
      documentsIndexed: [] as number[],
      pagesProcessed: [] as number[],
      triggerCounts: [] as number[],
    },
    user: {
      searchLatencies: [] as number[],
      indexLatencies: [] as number[],
      processingLatencies: [] as number[],
      documentsProcessed: [] as number[],
      documentsIndexed: [] as number[],
      pagesProcessed: [] as number[],
      triggerCounts: [] as number[],
    },
    service: {
      searchLatencies: [] as number[],
      indexLatencies: [] as number[],
      processingLatencies: [] as number[],
      documentsProcessed: [] as number[],
      documentsIndexed: [] as number[],
      pagesProcessed: [] as number[],
      triggerCounts: [] as number[],
    },
    generic: {
      searchLatencies: [] as number[],
      indexLatencies: [] as number[],
      processingLatencies: [] as number[],
      documentsProcessed: [] as number[],
      documentsIndexed: [] as number[],
      pagesProcessed: [] as number[],
      triggerCounts: [] as number[],
    },
  };

  // Track previous values per transform for incremental latency calculation
  const prevValues: Record<
    string,
    {
      searchTime: number;
      searchTotal: number;
      indexTime: number;
      indexTotal: number;
      processingTime: number;
      processingTotal: number;
    }
  > = {};

  // First pass: Collect timestamps to detect sampling interval
  // Group timestamps by sampling batch (transforms are logged together sequentially)
  const sampleTimestamps: number[] = [];
  let lastBatchTime: number | null = null;
  const BATCH_TOLERANCE_MS = 100; // Consider entries within 100ms as same batch

  for (const line of lines) {
    try {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+-\s+Transform\s+(.+?)\s+stats:\s+(.+)$/
      );
      if (match) {
        const timestamp = new Date(match[1]).getTime();

        // Only add timestamp if it's from a new batch (not within tolerance of last batch)
        // This handles the case where 4 transforms are logged sequentially in quick succession
        if (lastBatchTime === null || Math.abs(timestamp - lastBatchTime) > BATCH_TOLERANCE_MS) {
          sampleTimestamps.push(timestamp);
          lastBatchTime = timestamp;
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Detect average sampling interval from timestamps
  let avgSamplingInterval = 5000; // Default to 5 seconds
  if (sampleTimestamps.length > 1) {
    const intervals: number[] = [];
    for (let i = 1; i < sampleTimestamps.length; i++) {
      const interval = sampleTimestamps[i] - sampleTimestamps[i - 1];
      if (interval > 0 && interval < 60000) {
        // Only consider intervals between 0 and 60 seconds (reasonable range)
        intervals.push(interval);
      }
    }
    if (intervals.length > 0) {
      // Use median interval to avoid outliers
      intervals.sort((a, b) => a - b);
      avgSamplingInterval = intervals[Math.floor(intervals.length / 2)];
    }
  }

  // Adjust thresholds based on sampling interval (normalize to 5-second baseline)
  // For 1-second sampling (0.2x), thresholds should be 0.2x of baseline
  // For 5-second sampling (1.0x), thresholds remain at baseline
  const intervalMultiplier = avgSamplingInterval / 5000; // 1.0 for 5s, 0.2 for 1s
  const searchThreshold = Math.max(1, Math.floor(5 * intervalMultiplier));
  const indexThreshold = Math.max(1, Math.floor(10 * intervalMultiplier));
  const processingThreshold = Math.max(1, Math.floor(5 * intervalMultiplier));

  // Second pass: Process data with adaptive thresholds
  for (const line of lines) {
    try {
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+-\s+Transform\s+(.+?)\s+stats:\s+(.+)$/
      );
      if (!match) continue;

      const timestamp = new Date(match[1]).getTime();
      timestamps.push(timestamp);

      const transformId = match[2];
      const jsonStr = match[3];
      if (!jsonStr) continue;

      const data = JSON.parse(jsonStr);
      const transform = data.transforms?.[0];
      if (!transform || !transform.stats) continue;

      const stats = transform.stats;

      // Determine entity type from transform ID
      let entityType: 'host' | 'user' | 'service' | 'generic' | null = null;
      if (transformId.includes('host')) {
        entityType = 'host';
      } else if (transformId.includes('user')) {
        entityType = 'user';
      } else if (transformId.includes('service')) {
        entityType = 'service';
      } else if (transformId.includes('generic')) {
        entityType = 'generic';
      }

      // Track transform state
      if (transform.state === 'indexing') {
        transformStates.indexing++;
      } else if (transform.state === 'started') {
        transformStates.started++;
      }

      // Initialize previous values for this transform if not exists
      if (!prevValues[transformId]) {
        prevValues[transformId] = {
          searchTime: stats.search_time_in_ms || 0,
          searchTotal: stats.search_total || 0,
          indexTime: stats.index_time_in_ms || 0,
          indexTotal: stats.index_total || 0,
          processingTime: stats.processing_time_in_ms || 0,
          processingTotal: stats.processing_total || 0,
        };
        // Skip first sample as we need previous values for incremental calculation
        continue;
      }

      // Calculate incremental search latency
      // Use adaptive threshold based on sampling interval
      const incrementalSearchTime =
        (stats.search_time_in_ms || 0) - prevValues[transformId].searchTime;
      const incrementalSearchTotal =
        (stats.search_total || 0) - prevValues[transformId].searchTotal;
      if (incrementalSearchTotal >= searchThreshold && incrementalSearchTime >= 0) {
        const incrementalSearchLatency = incrementalSearchTime / incrementalSearchTotal;
        searchLatencies.push(incrementalSearchLatency);
        if (entityType) {
          perEntityType[entityType].searchLatencies.push(incrementalSearchLatency);
        }
      }

      // Calculate incremental index latency
      // Use adaptive threshold based on sampling interval
      const incrementalIndexTime =
        (stats.index_time_in_ms || 0) - prevValues[transformId].indexTime;
      const incrementalIndexTotal = (stats.index_total || 0) - prevValues[transformId].indexTotal;
      if (incrementalIndexTotal >= indexThreshold && incrementalIndexTime >= 0) {
        const incrementalIndexLatency = incrementalIndexTime / incrementalIndexTotal;
        indexLatencies.push(incrementalIndexLatency);
        if (entityType) {
          perEntityType[entityType].indexLatencies.push(incrementalIndexLatency);
        }
      }

      // Calculate incremental processing latency
      // Use adaptive threshold based on sampling interval
      const incrementalProcessingTime =
        (stats.processing_time_in_ms || 0) - prevValues[transformId].processingTime;
      const incrementalProcessingTotal =
        (stats.processing_total || 0) - prevValues[transformId].processingTotal;
      if (incrementalProcessingTotal >= processingThreshold && incrementalProcessingTime >= 0) {
        const incrementalProcessingLatency = incrementalProcessingTime / incrementalProcessingTotal;
        processingLatencies.push(incrementalProcessingLatency);
        if (entityType) {
          perEntityType[entityType].processingLatencies.push(incrementalProcessingLatency);
        }
      }

      // Update previous values for next iteration
      prevValues[transformId] = {
        searchTime: stats.search_time_in_ms || 0,
        searchTotal: stats.search_total || 0,
        indexTime: stats.index_time_in_ms || 0,
        indexTotal: stats.index_total || 0,
        processingTime: stats.processing_time_in_ms || 0,
        processingTotal: stats.processing_total || 0,
      };

      // Track documents processed
      if (stats.documents_processed !== undefined) {
        documentsProcessed.push(stats.documents_processed);
        if (entityType) {
          perEntityType[entityType].documentsProcessed.push(stats.documents_processed);
        }
      }

      // Track documents indexed
      if (stats.documents_indexed !== undefined) {
        documentsIndexed.push(stats.documents_indexed);
        if (entityType) {
          perEntityType[entityType].documentsIndexed.push(stats.documents_indexed);
        }
      }

      // Track pages processed
      if (stats.pages_processed !== undefined) {
        pagesProcessed.push(stats.pages_processed);
        if (entityType) {
          perEntityType[entityType].pagesProcessed.push(stats.pages_processed);
        }
      }

      // Track trigger count
      if (stats.trigger_count !== undefined) {
        triggerCounts.push(stats.trigger_count);
        if (entityType) {
          perEntityType[entityType].triggerCounts.push(stats.trigger_count);
        }
      }

      // Track exponential averages (use final non-zero values)
      if (
        stats.exponential_avg_checkpoint_duration_ms !== undefined &&
        stats.exponential_avg_checkpoint_duration_ms > 0
      ) {
        exponentialAverages.checkpointDuration.push(stats.exponential_avg_checkpoint_duration_ms);
      }
      if (
        stats.exponential_avg_documents_indexed !== undefined &&
        stats.exponential_avg_documents_indexed > 0
      ) {
        exponentialAverages.documentsIndexed.push(stats.exponential_avg_documents_indexed);
      }
      if (
        stats.exponential_avg_documents_processed !== undefined &&
        stats.exponential_avg_documents_processed > 0
      ) {
        exponentialAverages.documentsProcessed.push(stats.exponential_avg_documents_processed);
      }

      // Track failures
      if (stats.search_failures) {
        searchFailures += stats.search_failures;
      }
      if (stats.index_failures) {
        indexFailures += stats.index_failures;
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return {
    searchLatencies,
    indexLatencies,
    processingLatencies,
    documentsProcessed,
    documentsIndexed,
    pagesProcessed,
    triggerCounts,
    searchFailures,
    indexFailures,
    timestamps,
    exponentialAverages,
    transformStates,
    perEntityType,
  };
};

/**
 * Parse node stats log and extract CPU and memory metrics
 */
const parseNodeStats = (
  logPath: string
): {
  cpuPercentages: number[];
  heapPercentages: number[];
  heapBytes: number[];
  cpuPerNode: Record<string, number[]>;
  timestamps: number[];
} => {
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());

  const cpuPercentages: number[] = [];
  const heapPercentages: number[] = [];
  const heapBytes: number[] = [];
  const cpuPerNode: Record<string, number[]> = {};
  const timestamps: number[] = [];

  for (const line of lines) {
    try {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+-\s+(.+)$/);
      if (!match) continue;

      const timestamp = new Date(match[1]).getTime();
      timestamps.push(timestamp);

      const data = JSON.parse(match[2]);
      if (!data.nodes || !Array.isArray(data.nodes)) continue;

      for (const node of data.nodes) {
        const nodeName = node.node_name || node.node_id || 'unknown';

        if (node.cpu?.percent !== undefined) {
          cpuPercentages.push(node.cpu.percent);
          if (!cpuPerNode[nodeName]) {
            cpuPerNode[nodeName] = [];
          }
          cpuPerNode[nodeName].push(node.cpu.percent);
        }

        if (node.jvm?.mem?.heap_used_percent !== undefined) {
          heapPercentages.push(node.jvm.mem.heap_used_percent);
        }

        if (node.jvm?.mem?.heap_used_in_bytes !== undefined) {
          heapBytes.push(node.jvm.mem.heap_used_in_bytes);
        }
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return {
    cpuPercentages,
    heapPercentages,
    heapBytes,
    cpuPerNode,
    timestamps,
  };
};

/**
 * Parse cluster health log
 */
const parseClusterHealth = (
  logPath: string
): {
  statuses: string[];
  activeShards: number[];
  unassignedShards: number[];
} => {
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());

  const statuses: string[] = [];
  const activeShards: number[] = [];
  const unassignedShards: number[] = [];

  for (const line of lines) {
    try {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+-\s+(.+)$/);
      if (!match) continue;

      const data = JSON.parse(match[2]);

      if (data.status) {
        statuses.push(data.status);
      }
      if (data.active_shards !== undefined) {
        activeShards.push(data.active_shards);
      }
      if (data.unassigned_shards !== undefined) {
        unassignedShards.push(data.unassigned_shards);
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return { statuses, activeShards, unassignedShards };
};

/**
 * Extract baseline metrics from log files
 */
export const extractBaselineMetrics = async (
  logPrefix: string,
  testConfig: {
    entityCount: number;
    logsPerEntity: number;
    uploadCount?: number;
    intervalMs?: number;
  }
): Promise<BaselineMetrics> => {
  const logsDir = path.join(process.cwd(), 'logs');

  // Find log files with the given prefix
  const files = fs.readdirSync(logsDir);
  const clusterHealthLog = files.find(
    (f) => f.startsWith(logPrefix) && f.includes('cluster-health')
  );
  const nodeStatsLog = files.find((f) => f.startsWith(logPrefix) && f.includes('node-stats'));
  const transformStatsLog = files.find(
    (f) => f.startsWith(logPrefix) && f.includes('transform-stats')
  );

  if (!clusterHealthLog || !nodeStatsLog || !transformStatsLog) {
    throw new Error(
      `Could not find all required log files with prefix "${logPrefix}". Found: ${JSON.stringify({ clusterHealthLog, nodeStatsLog, transformStatsLog })}`
    );
  }

  console.log(`Parsing logs: ${clusterHealthLog}, ${nodeStatsLog}, ${transformStatsLog}`);

  // Parse all logs
  const transformData = parseTransformStats(path.join(logsDir, transformStatsLog));
  const nodeData = parseNodeStats(path.join(logsDir, nodeStatsLog));
  const clusterData = parseClusterHealth(path.join(logsDir, clusterHealthLog));

  // Calculate search latency metrics
  const sortedSearchLatencies = [...transformData.searchLatencies].sort((a, b) => a - b);
  const searchLatency = {
    avg:
      transformData.searchLatencies.length > 0
        ? transformData.searchLatencies.reduce((a, b) => a + b, 0) /
          transformData.searchLatencies.length
        : 0,
    p50: percentile(sortedSearchLatencies, 50),
    p95: percentile(sortedSearchLatencies, 95),
    p99: percentile(sortedSearchLatencies, 99),
    max: sortedSearchLatencies.length > 0 ? Math.max(...transformData.searchLatencies) : 0,
  };

  // Calculate index latency metrics
  const sortedIndexLatencies = [...transformData.indexLatencies].sort((a, b) => a - b);
  const intakeLatency = {
    avg:
      transformData.indexLatencies.length > 0
        ? transformData.indexLatencies.reduce((a, b) => a + b, 0) /
          transformData.indexLatencies.length
        : 0,
    p50: percentile(sortedIndexLatencies, 50),
    p95: percentile(sortedIndexLatencies, 95),
    p99: percentile(sortedIndexLatencies, 99),
    max: sortedIndexLatencies.length > 0 ? Math.max(...transformData.indexLatencies) : 0,
  };

  // Calculate processing latency metrics
  const sortedProcessingLatencies = [...transformData.processingLatencies].sort((a, b) => a - b);
  const processingLatency = {
    avg:
      transformData.processingLatencies.length > 0
        ? transformData.processingLatencies.reduce((a, b) => a + b, 0) /
          transformData.processingLatencies.length
        : 0,
    p50: percentile(sortedProcessingLatencies, 50),
    p95: percentile(sortedProcessingLatencies, 95),
    p99: percentile(sortedProcessingLatencies, 99),
    max: sortedProcessingLatencies.length > 0 ? Math.max(...transformData.processingLatencies) : 0,
  };

  // Calculate CPU metrics
  const avgCpuPerNode: Record<string, number> = {};
  for (const [nodeName, cpuValues] of Object.entries(nodeData.cpuPerNode)) {
    avgCpuPerNode[nodeName] =
      cpuValues.length > 0 ? cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length : 0;
  }

  const cpu = {
    avg:
      nodeData.cpuPercentages.length > 0
        ? nodeData.cpuPercentages.reduce((a, b) => a + b, 0) / nodeData.cpuPercentages.length
        : 0,
    peak: nodeData.cpuPercentages.length > 0 ? Math.max(...nodeData.cpuPercentages) : 0,
    avgPerNode: avgCpuPerNode,
  };

  // Calculate memory metrics
  const memory = {
    avgHeapPercent:
      nodeData.heapPercentages.length > 0
        ? nodeData.heapPercentages.reduce((a, b) => a + b, 0) / nodeData.heapPercentages.length
        : 0,
    peakHeapPercent:
      nodeData.heapPercentages.length > 0 ? Math.max(...nodeData.heapPercentages) : 0,
    avgHeapBytes:
      nodeData.heapBytes.length > 0
        ? nodeData.heapBytes.reduce((a, b) => a + b, 0) / nodeData.heapBytes.length
        : 0,
    peakHeapBytes: nodeData.heapBytes.length > 0 ? Math.max(...nodeData.heapBytes) : 0,
  };

  // Calculate per-entity-type metrics first (needed for totals)
  // Helper function to calculate entity type metrics
  const calculateEntityTypeMetrics = (entityData: {
    searchLatencies: number[];
    indexLatencies: number[];
    processingLatencies: number[];
    documentsProcessed: number[];
    documentsIndexed: number[];
    pagesProcessed: number[];
    triggerCounts: number[];
  }): EntityTypeMetrics => {
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
            ? entityData.indexLatencies.reduce((a, b) => a + b, 0) /
              entityData.indexLatencies.length
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
          entityData.processingLatencies.length > 0
            ? Math.max(...entityData.processingLatencies)
            : 0,
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

  // Calculate per-entity-type metrics
  const perEntityType = {
    host: calculateEntityTypeMetrics(transformData.perEntityType.host),
    user: calculateEntityTypeMetrics(transformData.perEntityType.user),
    service: calculateEntityTypeMetrics(transformData.perEntityType.service),
    generic: calculateEntityTypeMetrics(transformData.perEntityType.generic),
  };

  // Calculate throughput
  // Sum the MAX values from each entity type (cumulative totals)
  const timeSpan =
    transformData.timestamps.length > 1
      ? (Math.max(...transformData.timestamps) - Math.min(...transformData.timestamps)) / 1000
      : 1;
  const totalDocuments =
    perEntityType.host.documentsProcessed +
    perEntityType.user.documentsProcessed +
    perEntityType.service.documentsProcessed +
    perEntityType.generic.documentsProcessed;
  const avgDocumentsPerSecond = totalDocuments / timeSpan || 0;
  const peakDocumentsPerSecond =
    transformData.documentsProcessed.length > 0
      ? Math.max(...transformData.documentsProcessed) /
          (timeSpan / transformData.documentsProcessed.length) || 0
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

  // Calculate errors
  const errors = {
    searchFailures: transformData.searchFailures,
    indexFailures: transformData.indexFailures,
    totalFailures: transformData.searchFailures + transformData.indexFailures,
  };

  // Cluster health
  const clusterHealth = {
    status:
      clusterData.statuses.length > 0
        ? clusterData.statuses[clusterData.statuses.length - 1]
        : 'unknown',
    avgActiveShards:
      clusterData.activeShards.length > 0
        ? clusterData.activeShards.reduce((a, b) => a + b, 0) / clusterData.activeShards.length
        : 0,
    unassignedShards:
      clusterData.unassignedShards.length > 0 ? Math.max(...clusterData.unassignedShards) : 0,
  };

  const baseline: BaselineMetrics = {
    testName: logPrefix,
    timestamp: new Date().toISOString(),
    testConfig,
    metrics: {
      searchLatency,
      intakeLatency,
      processingLatency,
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
      perEntityType,
      transformStates: transformData.transformStates,
      errors,
      clusterHealth,
    },
  };

  return baseline;
};

/**
 * Save baseline to file
 */
export const saveBaseline = (baseline: BaselineMetrics): string => {
  const filename = `${baseline.testName}-${baseline.timestamp.replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(BASELINES_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(baseline, null, 2));
  console.log(`Baseline saved to: ${filepath}`);

  return filepath;
};

/**
 * Load baseline from file
 */
export const loadBaseline = (baselinePath: string): BaselineMetrics => {
  const content = fs.readFileSync(baselinePath, 'utf-8');
  return JSON.parse(content) as BaselineMetrics;
};

/**
 * List all available baselines
 */
export const listBaselines = (): string[] => {
  if (!fs.existsSync(BASELINES_DIR)) {
    return [];
  }

  return fs
    .readdirSync(BASELINES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(BASELINES_DIR, f))
    .sort()
    .reverse(); // Most recent first
};

/**
 * Find baseline file by pattern (supports prefix matching)
 * If multiple files match, returns the latest modified one
 */
export const findBaselineByPattern = (pattern: string): string | null => {
  if (!fs.existsSync(BASELINES_DIR)) {
    return null;
  }

  // Normalize pattern - remove .json extension if present, handle paths
  let searchPattern = pattern;
  if (searchPattern.endsWith('.json')) {
    searchPattern = searchPattern.slice(0, -5);
  }

  // Remove baselines/ prefix if present (for convenience)
  if (searchPattern.startsWith('baselines/')) {
    searchPattern = searchPattern.slice(10);
  }

  // Handle absolute paths
  if (path.isAbsolute(searchPattern)) {
    const baselinesDirName = path.basename(BASELINES_DIR);
    if (searchPattern.includes(baselinesDirName)) {
      searchPattern = path.basename(searchPattern, '.json');
    }
  }

  // Get all baseline files
  const allFiles = fs
    .readdirSync(BASELINES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(BASELINES_DIR, f));

  // Find files matching the pattern (starts with pattern)
  const matchingFiles = allFiles.filter((filepath) => {
    const filename = path.basename(filepath, '.json');
    return filename.startsWith(searchPattern);
  });

  if (matchingFiles.length === 0) {
    return null;
  }

  // If exact match exists, use it
  const exactMatch = matchingFiles.find((filepath) => {
    const filename = path.basename(filepath, '.json');
    return filename === searchPattern;
  });
  if (exactMatch) {
    return exactMatch;
  }

  // If multiple matches, return the latest modified file
  if (matchingFiles.length > 1) {
    const filesWithStats = matchingFiles.map((filepath) => ({
      filepath,
      mtime: fs.statSync(filepath).mtime.getTime(),
    }));
    filesWithStats.sort((a, b) => b.mtime - a.mtime); // Sort by modification time, newest first
    return filesWithStats[0].filepath;
  }

  return matchingFiles[0];
};

/**
 * Load baseline by pattern or path, with fallback to latest
 */
export const loadBaselineWithPattern = (
  baselinePattern?: string
): { baseline: BaselineMetrics; path: string } => {
  let baselinePath: string;
  let baseline: BaselineMetrics;

  if (baselinePattern) {
    // Try to find by pattern first
    const matchedPath = findBaselineByPattern(baselinePattern);
    if (!matchedPath) {
      // If pattern matching fails, try direct path
      if (fs.existsSync(baselinePattern)) {
        baselinePath = baselinePattern;
        baseline = loadBaseline(baselinePath);
        console.log(`Using baseline: ${baselinePath}`);
      } else {
        console.error(`❌ Baseline not found: ${baselinePattern}`);
        console.error(`   Tried pattern matching and direct path, but no matches found.`);
        process.exit(1);
      }
    } else {
      baselinePath = matchedPath;
      baseline = loadBaseline(baselinePath);
      console.log(`Using baseline: ${baselinePath} (matched pattern: ${baselinePattern})`);
    }
  } else {
    // Use latest baseline
    const baselines = listBaselines();
    if (baselines.length === 0) {
      console.error('❌ No baselines found. Create one first with create-baseline command.');
      process.exit(1);
    }
    baselinePath = baselines[0];
    baseline = loadBaseline(baselinePath);
    console.log(`Using latest baseline: ${baselinePath}`);
  }

  return { baseline, path: baselinePath };
};
