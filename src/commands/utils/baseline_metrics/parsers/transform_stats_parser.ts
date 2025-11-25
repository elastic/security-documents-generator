import { TransformStatsData } from '../types';
import { readFileSafely, MAX_REASONABLE_SAMPLING_INTERVAL_MS } from '../utils';

/**
 * Parse transform stats log and extract metrics
 */
export const parseTransformStats = (logPath: string): TransformStatsData => {
  const content = readFileSafely(logPath, 'Transform stats log file');
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
      if (interval > 0 && interval < MAX_REASONABLE_SAMPLING_INTERVAL_MS) {
        // Only consider intervals between 0 and MAX_REASONABLE_SAMPLING_INTERVAL_MS (5 minutes, reasonable range)
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
 * Create empty transform stats data structure
 */
export const createEmptyTransformData = (): TransformStatsData => {
  return {
    searchLatencies: [],
    indexLatencies: [],
    processingLatencies: [],
    documentsProcessed: [],
    documentsIndexed: [],
    pagesProcessed: [],
    triggerCounts: [],
    searchFailures: 0,
    indexFailures: 0,
    timestamps: [],
    exponentialAverages: {
      checkpointDuration: [],
      documentsIndexed: [],
      documentsProcessed: [],
    },
    transformStates: {
      indexing: 0,
      started: 0,
    },
    perEntityType: {
      host: {
        searchLatencies: [],
        indexLatencies: [],
        processingLatencies: [],
        documentsProcessed: [],
        documentsIndexed: [],
        pagesProcessed: [],
        triggerCounts: [],
      },
      user: {
        searchLatencies: [],
        indexLatencies: [],
        processingLatencies: [],
        documentsProcessed: [],
        documentsIndexed: [],
        pagesProcessed: [],
        triggerCounts: [],
      },
      service: {
        searchLatencies: [],
        indexLatencies: [],
        processingLatencies: [],
        documentsProcessed: [],
        documentsIndexed: [],
        pagesProcessed: [],
        triggerCounts: [],
      },
      generic: {
        searchLatencies: [],
        indexLatencies: [],
        processingLatencies: [],
        documentsProcessed: [],
        documentsIndexed: [],
        pagesProcessed: [],
        triggerCounts: [],
      },
    },
  };
};

