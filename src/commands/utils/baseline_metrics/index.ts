import fs from 'fs';
import path from 'path';
import { BaselineMetrics } from './types';
import { parseTransformStats, createEmptyTransformData } from './parsers/transform_stats_parser';
import { parseNodeStats } from './parsers/node_stats_parser';
import { parseClusterHealth } from './parsers/cluster_health_parser';
import { parseKibanaStats } from './parsers/kibana_stats_parser';
import { calculateLatencyMetrics } from './calculators/latency_calculator';
import { calculateSystemMetrics } from './calculators/system_metrics_calculator';
import { calculateEntityMetrics } from './calculators/entity_metrics_calculator';
import { calculateKibanaMetrics } from './calculators/kibana_metrics_calculator';
import {
  saveBaseline,
  loadBaseline,
  listBaselines,
  findBaselineByPattern,
  loadBaselineWithPattern,
} from './storage';

// Re-export types
export type { BaselineMetrics } from './types';

// Re-export storage functions
export { saveBaseline, loadBaseline, listBaselines, findBaselineByPattern, loadBaselineWithPattern };

/**
 * Extract baseline metrics from log files
 */
export const extractBaselineMetrics = async (
  logPrefix: string,
  testConfig: {
    entityCount: number;
    logsPerEntity: number;
    uploadCount?: number;
    intervalMs?: number;
  }
): Promise<BaselineMetrics> => {
  const logsDir = path.join(process.cwd(), 'logs');

  // Check if logs directory exists
  if (!fs.existsSync(logsDir)) {
    throw new Error(`Logs directory does not exist: ${logsDir}`);
  }

  // Find log files with the given prefix
  let files: string[];
  try {
    files = fs.readdirSync(logsDir);
  } catch (error) {
    throw new Error(
      `Failed to read logs directory ${logsDir}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const clusterHealthLog = files.find(
    (f) => f.startsWith(logPrefix) && f.includes('cluster-health')
  );
  const nodeStatsLog = files.find((f) => f.startsWith(logPrefix) && f.includes('node-stats'));
  const transformStatsLog = files.find(
    (f) => f.startsWith(logPrefix) && f.includes('transform-stats')
  );
  const kibanaStatsLog = files.find((f) => f.startsWith(logPrefix) && f.includes('kibana-stats'));

  // Only require cluster-health and node-stats logs
  // transform-stats and kibana-stats are optional
  if (!clusterHealthLog || !nodeStatsLog) {
    throw new Error(
      `Could not find required log files with prefix "${logPrefix}". Found: ${JSON.stringify({ clusterHealthLog, nodeStatsLog, transformStatsLog, kibanaStatsLog })}`
    );
  }

  const logFiles = [clusterHealthLog, nodeStatsLog];
  if (transformStatsLog) logFiles.push(transformStatsLog);
  if (kibanaStatsLog) logFiles.push(kibanaStatsLog);
  console.log(`Parsing logs: ${logFiles.join(', ')}`);

  // Parse logs - provide empty transform data if transform stats log is missing
  const transformData = transformStatsLog
    ? parseTransformStats(path.join(logsDir, transformStatsLog))
    : createEmptyTransformData();
  const nodeData = parseNodeStats(path.join(logsDir, nodeStatsLog));
  const clusterData = parseClusterHealth(path.join(logsDir, clusterHealthLog));
  const kibanaData = kibanaStatsLog ? parseKibanaStats(path.join(logsDir, kibanaStatsLog)) : null;

  // Calculate per-entity-type metrics first (needed for totals)
  const perEntityType = calculateEntityMetrics(transformData);

  // Calculate latency metrics
  const latencyMetrics = calculateLatencyMetrics(transformData);

  // Calculate system metrics
  const systemMetrics = calculateSystemMetrics(transformData, nodeData, perEntityType);

  // Calculate errors
  const errors = {
    searchFailures: transformData.searchFailures,
    indexFailures: transformData.indexFailures,
    totalFailures: transformData.searchFailures + transformData.indexFailures,
  };

  // Cluster health
  const clusterHealth = {
    status:
      clusterData.statuses.length > 0
        ? clusterData.statuses[clusterData.statuses.length - 1]
        : 'unknown',
    avgActiveShards:
      clusterData.activeShards.length > 0
        ? clusterData.activeShards.reduce((a, b) => a + b, 0) / clusterData.activeShards.length
        : 0,
    unassignedShards:
      clusterData.unassignedShards.length > 0 ? Math.max(...clusterData.unassignedShards) : 0,
  };

  // Calculate Kibana metrics
  const kibana = calculateKibanaMetrics(kibanaData);

  const baseline: BaselineMetrics = {
    testName: logPrefix,
    timestamp: new Date().toISOString(),
    testConfig,
    metrics: {
      searchLatency: latencyMetrics.searchLatency,
      intakeLatency: latencyMetrics.intakeLatency,
      processingLatency: latencyMetrics.processingLatency,
      cpu: systemMetrics.cpu,
      memory: systemMetrics.memory,
      throughput: systemMetrics.throughput,
      indexEfficiency: systemMetrics.indexEfficiency,
      pagesProcessed: systemMetrics.pagesProcessed,
      triggerCount: systemMetrics.triggerCount,
      exponentialAverages: systemMetrics.exponentialAverages,
      perEntityType,
      transformStates: transformData.transformStates,
      errors,
      clusterHealth,
      kibana,
    },
  };

  return baseline;
};

