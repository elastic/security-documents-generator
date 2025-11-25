import { TransformStatsData } from '../types';
import { percentile } from '../utils';

export interface LatencyMetrics {
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
}

/**
 * Calculate latency metrics from transform stats data
 */
export const calculateLatencyMetrics = (transformData: TransformStatsData): LatencyMetrics => {
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

  return {
    searchLatency,
    intakeLatency,
    processingLatency,
  };
};

