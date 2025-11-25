import { BaselineMetrics } from '../baseline_metrics';
import { ComparisonResult } from '../metrics_comparison';
import { createResult, createInfoResult, bytesToMB } from './comparison_helpers';
import { ComparisonThresholds } from '../metrics_comparison';

/**
 * Compare Kibana metrics between baseline and current
 */
export const compareKibanaMetrics = (
  baseline: BaselineMetrics,
  current: BaselineMetrics,
  thresholds: ComparisonThresholds
): ComparisonResult[] => {
  const results: ComparisonResult[] = [];

  // Event Loop metrics
  results.push(
    createResult(
      'Kibana Event Loop Delay (avg)',
      baseline.metrics.kibana.eventLoop.delay.avg,
      current.metrics.kibana.eventLoop.delay.avg,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana Event Loop Delay (p50)',
      baseline.metrics.kibana.eventLoop.delay.p50,
      current.metrics.kibana.eventLoop.delay.p50,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana Event Loop Delay (p95)',
      baseline.metrics.kibana.eventLoop.delay.p95,
      current.metrics.kibana.eventLoop.delay.p95,
      true,
      thresholds
    )
  );
  results.push(
    createInfoResult(
      'Kibana Event Loop Delay (p99)',
      baseline.metrics.kibana.eventLoop.delay.p99,
      current.metrics.kibana.eventLoop.delay.p99
    )
  );
  results.push(
    createInfoResult(
      'Kibana Event Loop Delay (max)',
      baseline.metrics.kibana.eventLoop.delay.max,
      current.metrics.kibana.eventLoop.delay.max
    )
  );
  results.push(
    createResult(
      'Kibana Event Loop Utilization (avg)',
      baseline.metrics.kibana.eventLoop.utilization.avg,
      current.metrics.kibana.eventLoop.utilization.avg,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana Event Loop Utilization (peak)',
      baseline.metrics.kibana.eventLoop.utilization.peak,
      current.metrics.kibana.eventLoop.utilization.peak,
      true,
      thresholds
    )
  );

  // Elasticsearch Client metrics
  results.push(
    createInfoResult(
      'Kibana ES Client Active Sockets (avg)',
      baseline.metrics.kibana.elasticsearchClient.avgActiveSockets,
      current.metrics.kibana.elasticsearchClient.avgActiveSockets
    )
  );
  results.push(
    createResult(
      'Kibana ES Client Idle Sockets (avg)',
      baseline.metrics.kibana.elasticsearchClient.avgIdleSockets,
      current.metrics.kibana.elasticsearchClient.avgIdleSockets,
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana ES Client Queued Requests (peak)',
      baseline.metrics.kibana.elasticsearchClient.peakQueuedRequests,
      current.metrics.kibana.elasticsearchClient.peakQueuedRequests,
      true,
      thresholds
    )
  );

  // Response Times metrics
  results.push(
    createResult(
      'Kibana Response Time (avg)',
      baseline.metrics.kibana.responseTimes.avg,
      current.metrics.kibana.responseTimes.avg,
      true,
      thresholds
    )
  );
  results.push(
    createInfoResult(
      'Kibana Response Time (max)',
      baseline.metrics.kibana.responseTimes.max,
      current.metrics.kibana.responseTimes.max
    )
  );

  // Memory metrics
  results.push(
    createResult(
      'Kibana Heap Memory (avg MB)',
      bytesToMB(baseline.metrics.kibana.memory.avgHeapBytes),
      bytesToMB(current.metrics.kibana.memory.avgHeapBytes),
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana Heap Memory (peak MB)',
      bytesToMB(baseline.metrics.kibana.memory.peakHeapBytes),
      bytesToMB(current.metrics.kibana.memory.peakHeapBytes),
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana RSS Memory (avg MB)',
      bytesToMB(baseline.metrics.kibana.memory.avgRssBytes),
      bytesToMB(current.metrics.kibana.memory.avgRssBytes),
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana RSS Memory (peak MB)',
      bytesToMB(baseline.metrics.kibana.memory.peakRssBytes),
      bytesToMB(current.metrics.kibana.memory.peakRssBytes),
      false,
      thresholds
    )
  );

  // Request metrics
  results.push(
    createResult(
      'Kibana Requests (total)',
      baseline.metrics.kibana.requests.total,
      current.metrics.kibana.requests.total,
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana Requests (avg per second)',
      baseline.metrics.kibana.requests.avgPerSecond,
      current.metrics.kibana.requests.avgPerSecond,
      false,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana Request Error Rate (%)',
      baseline.metrics.kibana.requests.errorRate,
      current.metrics.kibana.requests.errorRate,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana Request Disconnects',
      baseline.metrics.kibana.requests.disconnects,
      current.metrics.kibana.requests.disconnects,
      true,
      thresholds
    )
  );

  // OS Load metrics
  results.push(
    createResult(
      'Kibana OS Load 1m (avg)',
      baseline.metrics.kibana.osLoad.avg1m,
      current.metrics.kibana.osLoad.avg1m,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana OS Load 5m (avg)',
      baseline.metrics.kibana.osLoad.avg5m,
      current.metrics.kibana.osLoad.avg5m,
      true,
      thresholds
    )
  );
  results.push(
    createResult(
      'Kibana OS Load 15m (avg)',
      baseline.metrics.kibana.osLoad.avg15m,
      current.metrics.kibana.osLoad.avg15m,
      true,
      thresholds
    )
  );
  results.push(
    createInfoResult(
      'Kibana OS Load 1m (peak)',
      baseline.metrics.kibana.osLoad.peak1m,
      current.metrics.kibana.osLoad.peak1m
    )
  );

  return results;
};
