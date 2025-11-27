import { percentile, avg, max } from '../utils';

interface KibanaStatsData {
  eventLoopDelays: number[];
  eventLoopDelayPercentiles: {
    p50: number[];
    p95: number[];
    p99: number[];
  };
  eventLoopUtilizations: number[];
  esClientActiveSockets: number[];
  esClientIdleSockets: number[];
  esClientQueuedRequests: number[];
  responseTimes: number[];
  maxResponseTimes: number[];
  heapBytes: number[];
  rssBytes: number[];
  requestTotals: number[];
  requestErrorCounts: number[];
  requestDisconnects: number[];
  osLoad1m: number[];
  osLoad5m: number[];
  osLoad15m: number[];
  timeSpan: number;
}

export interface KibanaMetrics {
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
}

/**
 * Calculate Kibana metrics from Kibana stats data
 */
export const calculateKibanaMetrics = (kibanaData: KibanaStatsData | null): KibanaMetrics => {
  if (!kibanaData) {
    return {
      eventLoop: {
        delay: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
        utilization: { avg: 0, peak: 0 },
      },
      elasticsearchClient: {
        avgActiveSockets: 0,
        avgIdleSockets: 0,
        peakQueuedRequests: 0,
      },
      responseTimes: { avg: 0, max: 0 },
      memory: {
        avgHeapBytes: 0,
        peakHeapBytes: 0,
        avgRssBytes: 0,
        peakRssBytes: 0,
      },
      requests: {
        total: 0,
        avgPerSecond: 0,
        errorRate: 0,
        disconnects: 0,
      },
      osLoad: {
        avg1m: 0,
        avg5m: 0,
        avg15m: 0,
        peak1m: 0,
      },
    };
  }

  return {
    eventLoop: {
      delay: {
        avg: avg(kibanaData.eventLoopDelays),
        p50: percentile(
          [...kibanaData.eventLoopDelayPercentiles.p50].sort((a, b) => a - b),
          50
        ),
        p95: percentile(
          [...kibanaData.eventLoopDelayPercentiles.p95].sort((a, b) => a - b),
          95
        ),
        p99: percentile(
          [...kibanaData.eventLoopDelayPercentiles.p99].sort((a, b) => a - b),
          99
        ),
        max: max(kibanaData.eventLoopDelays),
      },
      utilization: {
        avg: avg(kibanaData.eventLoopUtilizations),
        peak: max(kibanaData.eventLoopUtilizations),
      },
    },
    elasticsearchClient: {
      avgActiveSockets: avg(kibanaData.esClientActiveSockets),
      avgIdleSockets: avg(kibanaData.esClientIdleSockets),
      peakQueuedRequests: max(kibanaData.esClientQueuedRequests),
    },
    responseTimes: {
      avg: avg(kibanaData.responseTimes),
      max: max(kibanaData.maxResponseTimes),
    },
    memory: {
      avgHeapBytes: avg(kibanaData.heapBytes),
      peakHeapBytes: max(kibanaData.heapBytes),
      avgRssBytes: avg(kibanaData.rssBytes),
      peakRssBytes: max(kibanaData.rssBytes),
    },
    requests: {
      total: max(kibanaData.requestTotals),
      avgPerSecond:
        kibanaData.requestTotals.length > 0 && kibanaData.timeSpan > 0
          ? max(kibanaData.requestTotals) / kibanaData.timeSpan
          : 0,
      errorRate: avg(kibanaData.requestErrorCounts),
      disconnects: max(kibanaData.requestDisconnects),
    },
    osLoad: {
      avg1m: avg(kibanaData.osLoad1m),
      avg5m: avg(kibanaData.osLoad5m),
      avg15m: avg(kibanaData.osLoad15m),
      peak1m: max(kibanaData.osLoad1m),
    },
  };
};
