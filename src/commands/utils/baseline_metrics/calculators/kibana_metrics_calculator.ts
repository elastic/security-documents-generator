import { percentile } from '../utils';

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
        avg:
          kibanaData.eventLoopDelays.length > 0
            ? kibanaData.eventLoopDelays.reduce((a, b) => a + b, 0) /
              kibanaData.eventLoopDelays.length
            : 0,
        p50:
          kibanaData.eventLoopDelayPercentiles.p50.length > 0
            ? percentile(
                [...kibanaData.eventLoopDelayPercentiles.p50].sort((a, b) => a - b),
                50
              )
            : 0,
        p95:
          kibanaData.eventLoopDelayPercentiles.p95.length > 0
            ? percentile(
                [...kibanaData.eventLoopDelayPercentiles.p95].sort((a, b) => a - b),
                95
              )
            : 0,
        p99:
          kibanaData.eventLoopDelayPercentiles.p99.length > 0
            ? percentile(
                [...kibanaData.eventLoopDelayPercentiles.p99].sort((a, b) => a - b),
                99
              )
            : 0,
        max: kibanaData.eventLoopDelays.length > 0 ? Math.max(...kibanaData.eventLoopDelays) : 0,
      },
      utilization: {
        avg:
          kibanaData.eventLoopUtilizations.length > 0
            ? kibanaData.eventLoopUtilizations.reduce((a, b) => a + b, 0) /
              kibanaData.eventLoopUtilizations.length
            : 0,
        peak:
          kibanaData.eventLoopUtilizations.length > 0
            ? Math.max(...kibanaData.eventLoopUtilizations)
            : 0,
      },
    },
    elasticsearchClient: {
      avgActiveSockets:
        kibanaData.esClientActiveSockets.length > 0
          ? kibanaData.esClientActiveSockets.reduce((a, b) => a + b, 0) /
            kibanaData.esClientActiveSockets.length
          : 0,
      avgIdleSockets:
        kibanaData.esClientIdleSockets.length > 0
          ? kibanaData.esClientIdleSockets.reduce((a, b) => a + b, 0) /
            kibanaData.esClientIdleSockets.length
          : 0,
      peakQueuedRequests:
        kibanaData.esClientQueuedRequests.length > 0
          ? Math.max(...kibanaData.esClientQueuedRequests)
          : 0,
    },
    responseTimes: {
      avg:
        kibanaData.responseTimes.length > 0
          ? kibanaData.responseTimes.reduce((a, b) => a + b, 0) / kibanaData.responseTimes.length
          : 0,
      max: kibanaData.maxResponseTimes.length > 0 ? Math.max(...kibanaData.maxResponseTimes) : 0,
    },
    memory: {
      avgHeapBytes:
        kibanaData.heapBytes.length > 0
          ? kibanaData.heapBytes.reduce((a, b) => a + b, 0) / kibanaData.heapBytes.length
          : 0,
      peakHeapBytes: kibanaData.heapBytes.length > 0 ? Math.max(...kibanaData.heapBytes) : 0,
      avgRssBytes:
        kibanaData.rssBytes.length > 0
          ? kibanaData.rssBytes.reduce((a, b) => a + b, 0) / kibanaData.rssBytes.length
          : 0,
      peakRssBytes: kibanaData.rssBytes.length > 0 ? Math.max(...kibanaData.rssBytes) : 0,
    },
    requests: {
      total: kibanaData.requestTotals.length > 0 ? Math.max(...kibanaData.requestTotals) : 0,
      avgPerSecond:
        kibanaData.requestTotals.length > 0 && kibanaData.timeSpan > 0
          ? Math.max(...kibanaData.requestTotals) / kibanaData.timeSpan
          : 0,
      errorRate:
        kibanaData.requestErrorCounts.length > 0
          ? kibanaData.requestErrorCounts.reduce((a, b) => a + b, 0) /
            kibanaData.requestErrorCounts.length
          : 0,
      disconnects:
        kibanaData.requestDisconnects.length > 0 ? Math.max(...kibanaData.requestDisconnects) : 0,
    },
    osLoad: {
      avg1m:
        kibanaData.osLoad1m.length > 0
          ? kibanaData.osLoad1m.reduce((a, b) => a + b, 0) / kibanaData.osLoad1m.length
          : 0,
      avg5m:
        kibanaData.osLoad5m.length > 0
          ? kibanaData.osLoad5m.reduce((a, b) => a + b, 0) / kibanaData.osLoad5m.length
          : 0,
      avg15m:
        kibanaData.osLoad15m.length > 0
          ? kibanaData.osLoad15m.reduce((a, b) => a + b, 0) / kibanaData.osLoad15m.length
          : 0,
      peak1m: kibanaData.osLoad1m.length > 0 ? Math.max(...kibanaData.osLoad1m) : 0,
    },
  };
};
