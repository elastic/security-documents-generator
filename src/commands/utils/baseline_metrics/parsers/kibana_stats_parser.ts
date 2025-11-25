import { readFileSafely } from '../utils';

/**
 * Parse Kibana stats log and extract metrics
 */
export const parseKibanaStats = (
  logPath: string
): {
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
  timestamps: number[];
  timeSpan: number;
} => {
  const content = readFileSafely(logPath, 'Kibana stats log file');
  const lines = content.split('\n').filter((line) => line.trim());

  const eventLoopDelays: number[] = [];
  const eventLoopDelayPercentiles = {
    p50: [] as number[],
    p95: [] as number[],
    p99: [] as number[],
  };
  const eventLoopUtilizations: number[] = [];
  const esClientActiveSockets: number[] = [];
  const esClientIdleSockets: number[] = [];
  const esClientQueuedRequests: number[] = [];
  const responseTimes: number[] = [];
  const maxResponseTimes: number[] = [];
  const heapBytes: number[] = [];
  const rssBytes: number[] = [];
  const requestTotals: number[] = [];
  const requestErrorCounts: number[] = [];
  const requestDisconnects: number[] = [];
  const osLoad1m: number[] = [];
  const osLoad5m: number[] = [];
  const osLoad15m: number[] = [];
  const timestamps: number[] = [];

  for (const line of lines) {
    try {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+-\s+(.+)$/);
      if (!match) continue;

      const timestamp = new Date(match[1]).getTime();
      timestamps.push(timestamp);

      const data = JSON.parse(match[2]);

      // Event loop metrics
      if (data.process?.event_loop_delay !== undefined) {
        eventLoopDelays.push(data.process.event_loop_delay);
      }
      if (data.process?.event_loop_delay_histogram?.percentiles) {
        const percentiles = data.process.event_loop_delay_histogram.percentiles;
        if (percentiles['50'] !== undefined) {
          eventLoopDelayPercentiles.p50.push(percentiles['50']);
        }
        if (percentiles['95'] !== undefined) {
          eventLoopDelayPercentiles.p95.push(percentiles['95']);
        }
        if (percentiles['99'] !== undefined) {
          eventLoopDelayPercentiles.p99.push(percentiles['99']);
        }
      }
      if (data.process?.event_loop_utilization?.utilization !== undefined) {
        eventLoopUtilizations.push(data.process.event_loop_utilization.utilization);
      }

      // Elasticsearch client metrics
      if (data.elasticsearch_client) {
        if (data.elasticsearch_client.total_active_sockets !== undefined) {
          esClientActiveSockets.push(data.elasticsearch_client.total_active_sockets);
        }
        if (data.elasticsearch_client.total_idle_sockets !== undefined) {
          esClientIdleSockets.push(data.elasticsearch_client.total_idle_sockets);
        }
        if (data.elasticsearch_client.total_queued_requests !== undefined) {
          esClientQueuedRequests.push(data.elasticsearch_client.total_queued_requests);
        }
      }

      // Response times
      if (data.response_times) {
        if (data.response_times.avg_ms !== undefined) {
          responseTimes.push(data.response_times.avg_ms);
        }
        if (data.response_times.max_ms !== undefined) {
          maxResponseTimes.push(data.response_times.max_ms);
        }
      }

      // Memory metrics
      if (data.process?.memory?.heap?.used_bytes !== undefined) {
        heapBytes.push(data.process.memory.heap.used_bytes);
      }
      if (data.process?.memory?.resident_set_size_bytes !== undefined) {
        rssBytes.push(data.process.memory.resident_set_size_bytes);
      }

      // Request metrics
      if (data.requests) {
        if (data.requests.total !== undefined) {
          requestTotals.push(data.requests.total);
        }
        if (data.requests.disconnects !== undefined) {
          requestDisconnects.push(data.requests.disconnects);
        }
        // Calculate error rate from status codes
        if (data.requests.status_codes) {
          let errorCount = 0;
          const totalRequests = data.requests.total || 0;
          for (const [code, count] of Object.entries(data.requests.status_codes)) {
            const statusCode = parseInt(code, 10);
            if (statusCode >= 400) {
              errorCount += count as number;
            }
          }
          requestErrorCounts.push(totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0);
        }
      }

      // OS load metrics
      if (data.os?.load) {
        if (data.os.load['1m'] !== undefined) {
          osLoad1m.push(data.os.load['1m']);
        }
        if (data.os.load['5m'] !== undefined) {
          osLoad5m.push(data.os.load['5m']);
        }
        if (data.os.load['15m'] !== undefined) {
          osLoad15m.push(data.os.load['15m']);
        }
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  const timeSpan =
    timestamps.length > 1 ? (Math.max(...timestamps) - Math.min(...timestamps)) / 1000 : 1;

  return {
    eventLoopDelays,
    eventLoopDelayPercentiles,
    eventLoopUtilizations,
    esClientActiveSockets,
    esClientIdleSockets,
    esClientQueuedRequests,
    responseTimes,
    maxResponseTimes,
    heapBytes,
    rssBytes,
    requestTotals,
    requestErrorCounts,
    requestDisconnects,
    osLoad1m,
    osLoad5m,
    osLoad15m,
    timestamps,
    timeSpan,
  };
};
