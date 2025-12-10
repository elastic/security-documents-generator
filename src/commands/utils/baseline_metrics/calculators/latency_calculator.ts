import { TransformStatsData } from '../types';
import { percentile, avg, max } from '../utils';

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
    avg: avg(transformData.searchLatencies),
    p50: percentile(sortedSearchLatencies, 50),
    p95: percentile(sortedSearchLatencies, 95),
    p99: percentile(sortedSearchLatencies, 99),
    max: max(transformData.searchLatencies),
  };

  // Calculate index latency metrics
  const sortedIndexLatencies = [...transformData.indexLatencies].sort((a, b) => a - b);
  const intakeLatency = {
    avg: avg(transformData.indexLatencies),
    p50: percentile(sortedIndexLatencies, 50),
    p95: percentile(sortedIndexLatencies, 95),
    p99: percentile(sortedIndexLatencies, 99),
    max: max(transformData.indexLatencies),
  };

  // Calculate processing latency metrics
  const sortedProcessingLatencies = [...transformData.processingLatencies].sort((a, b) => a - b);
  const processingLatency = {
    avg: avg(transformData.processingLatencies),
    p50: percentile(sortedProcessingLatencies, 50),
    p95: percentile(sortedProcessingLatencies, 95),
    p99: percentile(sortedProcessingLatencies, 99),
    max: max(transformData.processingLatencies),
  };

  return {
    searchLatency,
    intakeLatency,
    processingLatency,
  };
};
