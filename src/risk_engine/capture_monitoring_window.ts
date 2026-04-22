import fs from 'fs';
import path from 'path';
import { getEsClient } from '../commands/utils/indices.ts';
import { log } from '../utils/logger.ts';

const MONITORING_ES_INDEX_PATTERN = '.ds-.monitoring-es-8-mb-*';
const MONITORING_KIBANA_INDEX_PATTERN = '.ds-.monitoring-kibana-8-mb-*';

interface SearchHit {
  _source?: Record<string, unknown>;
}

interface SearchResponse {
  hits?: {
    hits?: SearchHit[];
  };
}

export interface MonitoringWindow {
  window: { start: string; end: string };
  elasticsearch: Array<{
    timestamp: string;
    jvmHeapUsedBytes: number;
    jvmHeapMaxBytes: number;
    jvmHeapUsedPct: number;
    searchQueueRejected: number;
    writeQueueRejected: number;
    indexingTotal: number;
    searchTotal: number;
  }>;
  kibana: Array<{
    timestamp: string;
    heapUsedBytes: number;
    heapSizeLimit: number;
    eventLoopDelayMs: number;
    eventLoopUtilization: number;
    responseTimeAvgMs: number;
    responseTimeMaxMs: number;
    concurrentConnections: number;
  }>;
}

const getNestedValue = (obj: unknown, dottedPath: string): unknown =>
  dottedPath.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, obj);

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
};

const toIsoTimestamp = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return undefined;
};

const queryMonitoringDocs = async (
  indexPattern: string,
  dataset: string,
  start: string,
  end: string,
  sourceFields: string[],
): Promise<SearchHit[]> => {
  const es = getEsClient();
  try {
    const response = (await es.search(
      {
        index: indexPattern,
        ignore_unavailable: true,
        allow_no_indices: true,
        expand_wildcards: ['open', 'hidden'],
        query: {
          bool: {
            filter: [
              { term: { 'event.dataset': dataset } },
              { range: { '@timestamp': { gte: start, lte: end } } },
            ],
          },
        },
        sort: [{ '@timestamp': { order: 'asc' } }],
        size: 10000,
        _source: sourceFields,
      },
      { ignore: [404] },
    )) as SearchResponse;

    return response.hits?.hits ?? [];
  } catch (error) {
    log.warn(`Monitoring query failed for ${dataset}:`, error);
    return [];
  }
};

export const captureMonitoringWindow = async (
  start: string,
  end: string,
): Promise<MonitoringWindow> => {
  const [esHits, kibanaHits] = await Promise.all([
    queryMonitoringDocs(MONITORING_ES_INDEX_PATTERN, 'elasticsearch.node.stats', start, end, [
      '@timestamp',
      'elasticsearch.node.stats.jvm.mem.heap.used.bytes',
      'elasticsearch.node.stats.jvm.mem.heap.max.bytes',
      'elasticsearch.node.stats.thread_pool.search.rejected.count',
      'elasticsearch.node.stats.thread_pool.write.rejected.count',
      'elasticsearch.node.stats.indices.indexing.index_total.count',
      'elasticsearch.node.stats.indices.search.query_total.count',
    ]),
    queryMonitoringDocs(MONITORING_KIBANA_INDEX_PATTERN, 'kibana.stats', start, end, [
      '@timestamp',
      'kibana.stats.process.memory.heap.used.bytes',
      'kibana.stats.process.memory.heap.size_limit.bytes',
      'kibana.stats.process.event_loop_delay.ms',
      'kibana.stats.process.event_loop_utilization.active',
      'kibana.stats.response_time.avg.ms',
      'kibana.stats.response_time.max.ms',
      'kibana.stats.concurrent_connections',
    ]),
  ]);

  const elasticsearch = esHits
    .map((hit) => {
      const source = hit._source ?? {};
      const timestamp = toIsoTimestamp(getNestedValue(source, '@timestamp'));
      if (!timestamp) {
        return null;
      }
      const jvmHeapUsedBytes =
        toFiniteNumber(
          getNestedValue(source, 'elasticsearch.node.stats.jvm.mem.heap.used.bytes'),
        ) ?? 0;
      const jvmHeapMaxBytes =
        toFiniteNumber(getNestedValue(source, 'elasticsearch.node.stats.jvm.mem.heap.max.bytes')) ??
        0;
      return {
        timestamp,
        jvmHeapUsedBytes,
        jvmHeapMaxBytes,
        jvmHeapUsedPct:
          jvmHeapMaxBytes > 0 ? Number(((jvmHeapUsedBytes / jvmHeapMaxBytes) * 100).toFixed(1)) : 0,
        searchQueueRejected:
          toFiniteNumber(
            getNestedValue(source, 'elasticsearch.node.stats.thread_pool.search.rejected.count'),
          ) ?? 0,
        writeQueueRejected:
          toFiniteNumber(
            getNestedValue(source, 'elasticsearch.node.stats.thread_pool.write.rejected.count'),
          ) ?? 0,
        indexingTotal:
          toFiniteNumber(
            getNestedValue(source, 'elasticsearch.node.stats.indices.indexing.index_total.count'),
          ) ?? 0,
        searchTotal:
          toFiniteNumber(
            getNestedValue(source, 'elasticsearch.node.stats.indices.search.query_total.count'),
          ) ?? 0,
      };
    })
    .filter((row): row is MonitoringWindow['elasticsearch'][number] => row !== null);

  const kibana = kibanaHits
    .map((hit) => {
      const source = hit._source ?? {};
      const timestamp = toIsoTimestamp(getNestedValue(source, '@timestamp'));
      if (!timestamp) {
        return null;
      }
      return {
        timestamp,
        heapUsedBytes:
          toFiniteNumber(getNestedValue(source, 'kibana.stats.process.memory.heap.used.bytes')) ??
          0,
        heapSizeLimit:
          toFiniteNumber(
            getNestedValue(source, 'kibana.stats.process.memory.heap.size_limit.bytes'),
          ) ?? 0,
        eventLoopDelayMs:
          toFiniteNumber(getNestedValue(source, 'kibana.stats.process.event_loop_delay.ms')) ?? 0,
        eventLoopUtilization:
          toFiniteNumber(
            getNestedValue(source, 'kibana.stats.process.event_loop_utilization.active'),
          ) ?? 0,
        responseTimeAvgMs:
          toFiniteNumber(getNestedValue(source, 'kibana.stats.response_time.avg.ms')) ?? 0,
        responseTimeMaxMs:
          toFiniteNumber(getNestedValue(source, 'kibana.stats.response_time.max.ms')) ?? 0,
        concurrentConnections:
          toFiniteNumber(getNestedValue(source, 'kibana.stats.concurrent_connections')) ?? 0,
      };
    })
    .filter((row): row is MonitoringWindow['kibana'][number] => row !== null);

  return {
    window: { start, end },
    elasticsearch,
    kibana,
  };
};

export const captureAndWriteMonitoringWindow = async (
  start: string,
  end: string,
  outputPath: string,
): Promise<MonitoringWindow> => {
  const result = await captureMonitoringWindow(start, end);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  log.info(
    `Monitoring window written to ${outputPath} (elasticsearch=${result.elasticsearch.length}, kibana=${result.kibana.length})`,
  );
  return result;
};
