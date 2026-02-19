import { TransformStatsData } from '../types';
import { computePercentileMetrics } from '../utils';

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
  const searchLatency = computePercentileMetrics(transformData.searchLatencies);
  const intakeLatency = computePercentileMetrics(transformData.indexLatencies);
  const processingLatency = computePercentileMetrics(transformData.processingLatencies);

  return {
    searchLatency,
    intakeLatency,
    processingLatency,
  };
};
