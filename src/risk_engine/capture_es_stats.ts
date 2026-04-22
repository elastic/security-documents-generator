import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger.ts';
import { getEsClient } from '../commands/utils/indices.ts';

export interface EsStatsSnapshot {
  capturedAt: string;
  clusterHealth: {
    status: string;
    numberOfNodes: number;
    numberOfDataNodes: number;
    activeShards: number;
    relocatingShards: number;
    initializingShards: number;
    unassignedShards: number;
    activeShardsPercentAsNumber: number;
  };
  nodeStats: {
    jvm: {
      heapUsedInBytes: number;
      heapMaxInBytes: number;
      heapUsedPercent: number;
    };
    circuitBreakers: Record<
      string,
      { limitSizeInBytes: number; estimatedSizeInBytes: number; trippedCount: number }
    >;
    threadPool: {
      search: {
        threads: number;
        queue: number;
        active: number;
        rejected: number;
        completed: number;
      };
      write: {
        threads: number;
        queue: number;
        active: number;
        rejected: number;
        completed: number;
      };
    };
  };
  indexStats: Record<
    string,
    {
      docsCount: number;
      docsDeleted: number;
      storeSizeInBytes: number;
      indexingTotal: number;
      searchQueryTotal: number;
    }
  >;
  monitoringSnapshot: MonitoringSnapshot | null;
}

interface MonitoringSnapshot {
  timestamp: string;
  elasticsearch: {
    jvmHeapUsedBytes: number;
    jvmHeapMaxBytes: number;
    jvmHeapUsedPct: number;
    searchQueueRejected: number;
    writeQueueRejected: number;
    indexingTotal: number;
  } | null;
  kibana: {
    heapUsedBytes: number;
    heapSizeLimit: number;
    eventLoopDelayMs: number;
    eventLoopUtilization: number;
    responseTimeAvgMs: number;
    responseTimeMaxMs: number;
    concurrentConnections: number;
  } | null;
}

const TRACKED_INDICES = [
  '.alerts-security.alerts-default',
  'risk-score.risk-score-default',
  '.entity_analytics.risk_score.lookup-default',
  '.entities.v2.latest.security_default',
  'entities-latest-default',
];

const MONITORING_ES_INDEX_PATTERN = '.ds-.monitoring-es-8-mb-*';
const MONITORING_KIBANA_INDEX_PATTERN = '.ds-.monitoring-kibana-8-mb-*';

const getNestedValue = (obj: unknown, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, obj);
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
};

const getLatestMonitoringDoc = async (
  es: ReturnType<typeof getEsClient>,
  index: string,
  dataset: string,
): Promise<Record<string, unknown> | null> => {
  const response = await es.search(
    {
      index,
      size: 1,
      ignore_unavailable: true,
      allow_no_indices: true,
      expand_wildcards: ['open', 'hidden'],
      sort: [
        { timestamp: { order: 'desc', unmapped_type: 'date' } },
        { '@timestamp': { order: 'desc', unmapped_type: 'date' } },
      ],
      query: {
        term: {
          'event.dataset': dataset,
        },
      },
    },
    { ignore: [404] },
  );
  const firstHit = response.hits?.hits?.[0]?._source;
  return (firstHit as Record<string, unknown> | undefined) ?? null;
};

const captureMonitoringSnapshot = async (
  es: ReturnType<typeof getEsClient>,
  capturedAt: string,
): Promise<MonitoringSnapshot | null> => {
  const [latestEsDoc, latestKibanaDoc] = await Promise.all([
    getLatestMonitoringDoc(es, MONITORING_ES_INDEX_PATTERN, 'elasticsearch.node.stats'),
    getLatestMonitoringDoc(es, MONITORING_KIBANA_INDEX_PATTERN, 'kibana.stats'),
  ]);

  const elasticsearchMetrics = latestEsDoc
    ? (() => {
        const jvmHeapUsedBytes =
          toNumber(
            getNestedValue(latestEsDoc, 'elasticsearch.node.stats.jvm.mem.heap.used.bytes'),
          ) ?? 0;
        const jvmHeapMaxBytes =
          toNumber(
            getNestedValue(latestEsDoc, 'elasticsearch.node.stats.jvm.mem.heap.max.bytes'),
          ) ?? 0;
        const jvmHeapUsedPct =
          jvmHeapMaxBytes > 0 ? Number(((jvmHeapUsedBytes / jvmHeapMaxBytes) * 100).toFixed(1)) : 0;
        return {
          jvmHeapUsedBytes,
          jvmHeapMaxBytes,
          jvmHeapUsedPct,
          searchQueueRejected:
            toNumber(
              getNestedValue(
                latestEsDoc,
                'elasticsearch.node.stats.thread_pool.search.rejected.count',
              ),
            ) ?? 0,
          writeQueueRejected:
            toNumber(
              getNestedValue(
                latestEsDoc,
                'elasticsearch.node.stats.thread_pool.write.rejected.count',
              ),
            ) ?? 0,
          indexingTotal:
            toNumber(
              getNestedValue(
                latestEsDoc,
                'elasticsearch.node.stats.indices.indexing.index_total.count',
              ),
            ) ?? 0,
        };
      })()
    : null;

  const kibanaMetrics = latestKibanaDoc
    ? {
        heapUsedBytes:
          toNumber(
            getNestedValue(latestKibanaDoc, 'kibana.stats.process.memory.heap.used.bytes'),
          ) ?? 0,
        heapSizeLimit:
          toNumber(
            getNestedValue(latestKibanaDoc, 'kibana.stats.process.memory.heap.size_limit.bytes'),
          ) ?? 0,
        eventLoopDelayMs:
          toNumber(getNestedValue(latestKibanaDoc, 'kibana.stats.process.event_loop_delay.ms')) ??
          0,
        eventLoopUtilization:
          toNumber(
            getNestedValue(latestKibanaDoc, 'kibana.stats.process.event_loop_utilization.active'),
          ) ?? 0,
        responseTimeAvgMs:
          toNumber(getNestedValue(latestKibanaDoc, 'kibana.stats.response_time.avg.ms')) ?? 0,
        responseTimeMaxMs:
          toNumber(getNestedValue(latestKibanaDoc, 'kibana.stats.response_time.max.ms')) ?? 0,
        concurrentConnections:
          toNumber(getNestedValue(latestKibanaDoc, 'kibana.stats.concurrent_connections')) ?? 0,
      }
    : null;

  if (!elasticsearchMetrics && !kibanaMetrics) {
    return null;
  }

  const elasticsearchTimestamp = latestEsDoc
    ? toNumber(getNestedValue(latestEsDoc, 'timestamp'))
      ? new Date(Number(getNestedValue(latestEsDoc, 'timestamp'))).toISOString()
      : (getNestedValue(latestEsDoc, '@timestamp') as string | undefined)
    : undefined;
  const kibanaTimestamp = latestKibanaDoc
    ? toNumber(getNestedValue(latestKibanaDoc, 'timestamp'))
      ? new Date(Number(getNestedValue(latestKibanaDoc, 'timestamp'))).toISOString()
      : (getNestedValue(latestKibanaDoc, '@timestamp') as string | undefined)
    : undefined;

  const snapshotTimestamp =
    [elasticsearchTimestamp, kibanaTimestamp]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .sort()
      .at(-1) ?? capturedAt;

  return {
    timestamp: snapshotTimestamp,
    elasticsearch: elasticsearchMetrics,
    kibana: kibanaMetrics,
  };
};

export const captureEsStats = async (): Promise<EsStatsSnapshot> => {
  const es = getEsClient();
  const capturedAt = new Date().toISOString();

  const [healthResp, nodesResp, indicesResp] = await Promise.all([
    es.cluster.health(),
    es.nodes.stats({
      metric: ['jvm', 'breaker', 'thread_pool'],
    }),
    es.indices.stats(
      {
        index: TRACKED_INDICES.join(','),
        metric: ['docs', 'store', 'indexing', 'search'],
        expand_wildcards: ['open'],
      },
      { ignore: [404] },
    ),
  ]);

  const nodeEntries = Object.values(nodesResp.nodes ?? {});
  const aggJvm = nodeEntries.reduce(
    (acc, node) => {
      const nodeRec = node as Record<string, unknown>;
      const jvmRec = nodeRec.jvm as Record<string, Record<string, number>> | undefined;
      const mem = jvmRec?.mem ?? {};
      return {
        heapUsedInBytes: acc.heapUsedInBytes + (mem.heap_used_in_bytes ?? 0),
        heapMaxInBytes: acc.heapMaxInBytes + (mem.heap_max_in_bytes ?? 0),
      };
    },
    { heapUsedInBytes: 0, heapMaxInBytes: 0 },
  );
  const heapUsedPercent =
    aggJvm.heapMaxInBytes > 0
      ? Math.round((aggJvm.heapUsedInBytes / aggJvm.heapMaxInBytes) * 100)
      : 0;

  const aggBreakers: EsStatsSnapshot['nodeStats']['circuitBreakers'] = {};
  for (const node of nodeEntries) {
    const nodeRec2 = node as Record<string, unknown>;
    const breakers = (nodeRec2.breakers ?? {}) as Record<string, Record<string, number>>;
    for (const [name, data] of Object.entries(breakers)) {
      if (!aggBreakers[name]) {
        aggBreakers[name] = {
          limitSizeInBytes: 0,
          estimatedSizeInBytes: 0,
          trippedCount: 0,
        };
      }
      aggBreakers[name].limitSizeInBytes += data.limit_size_in_bytes ?? 0;
      aggBreakers[name].estimatedSizeInBytes += data.estimated_size_in_bytes ?? 0;
      aggBreakers[name].trippedCount += data.tripped ?? 0;
    }
  }

  const aggThreadPool = nodeEntries.reduce(
    (acc, node) => {
      const nodeRec3 = node as Record<string, unknown>;
      const tp = (nodeRec3.thread_pool ?? {}) as Record<string, Record<string, number>>;
      const search = tp.search ?? {};
      const write = tp.write ?? {};
      return {
        search: {
          threads: acc.search.threads + (search.threads ?? 0),
          queue: acc.search.queue + (search.queue ?? 0),
          active: acc.search.active + (search.active ?? 0),
          rejected: acc.search.rejected + (search.rejected ?? 0),
          completed: acc.search.completed + (search.completed ?? 0),
        },
        write: {
          threads: acc.write.threads + (write.threads ?? 0),
          queue: acc.write.queue + (write.queue ?? 0),
          active: acc.write.active + (write.active ?? 0),
          rejected: acc.write.rejected + (write.rejected ?? 0),
          completed: acc.write.completed + (write.completed ?? 0),
        },
      };
    },
    {
      search: { threads: 0, queue: 0, active: 0, rejected: 0, completed: 0 },
      write: { threads: 0, queue: 0, active: 0, rejected: 0, completed: 0 },
    },
  );

  const indexStats: EsStatsSnapshot['indexStats'] = {};
  const indicesData =
    ((indicesResp as unknown as Record<string, unknown>).indices as Record<
      string,
      Record<string, Record<string, Record<string, number>>>
    >) ?? {};
  for (const [indexName, data] of Object.entries(indicesData)) {
    const primaries = data.primaries ?? {};
    indexStats[indexName] = {
      docsCount: primaries.docs?.count ?? 0,
      docsDeleted: primaries.docs?.deleted ?? 0,
      storeSizeInBytes: primaries.store?.size_in_bytes ?? 0,
      indexingTotal: primaries.indexing?.index_total ?? 0,
      searchQueryTotal: primaries.search?.query_total ?? 0,
    };
  }

  const monitoringSnapshot = await captureMonitoringSnapshot(es, capturedAt);

  return {
    capturedAt,
    clusterHealth: {
      status: healthResp.status,
      numberOfNodes: healthResp.number_of_nodes,
      numberOfDataNodes: healthResp.number_of_data_nodes,
      activeShards: healthResp.active_shards,
      relocatingShards: healthResp.relocating_shards,
      initializingShards: healthResp.initializing_shards,
      unassignedShards: healthResp.unassigned_shards,
      activeShardsPercentAsNumber: healthResp.active_shards_percent_as_number,
    },
    nodeStats: {
      jvm: {
        heapUsedInBytes: aggJvm.heapUsedInBytes,
        heapMaxInBytes: aggJvm.heapMaxInBytes,
        heapUsedPercent,
      },
      circuitBreakers: aggBreakers,
      threadPool: aggThreadPool,
    },
    indexStats,
    monitoringSnapshot,
  };
};

export const captureAndWriteEsStats = async (outputPath: string): Promise<EsStatsSnapshot> => {
  const snapshot = await captureEsStats();
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
  log.info(`ES stats written to ${outputPath}`);
  return snapshot;
};
