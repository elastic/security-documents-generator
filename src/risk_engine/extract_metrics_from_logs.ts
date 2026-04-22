import readline from 'readline';
import fs from 'fs';
import { log } from '../utils/logger.ts';
import {
  discoverLogIndex,
  esRequest,
  type EsClientConfig,
  getEsClientConfig,
  searchPathForIndex,
} from '../utils/es_client.ts';
import { getEnvValue, parseEnvFile } from '../utils/env_file.ts';

/** Per-entity-type summary from `run summary` log lines. */
export interface RunSummary {
  entityType: string;
  status: string;
  durationMs: number;
  scoresWrittenBase: number;
  scoresWrittenResolution: number;
  scoresWrittenTotal: number;
  notInStoreCount: number;
  pagesProcessed: number;
  alertsScored?: number;
}

/** Aggregate totals from `maintainer totals` log line. */
export interface MaintainerTotals {
  durationMs: number;
  entityTypesProcessed: number;
  totalScores: number;
  calculationRunId?: string;
}

export interface RiskScoringRunMetrics {
  runSummaries: RunSummary[];
  maintainerTotals?: MaintainerTotals;
  /** ISO timestamp of the first matching log line. */
  startTime?: string;
  /** ISO timestamp of the last matching log line. */
  endTime?: string;
}

const RISK_SCORE_LOG_PREFIX = 'risk_score_maintainer';
const DEFAULT_ES_LOG_PAGE_SIZE = 500;
const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 10 * 1000;

interface RiskScoreLogEntry {
  message: string;
  timestamp?: string;
}

export interface ExtractRiskScoringMetricsFromEsOptions {
  envPath?: string;
  esNode?: string;
  esUser?: string;
  esPassword?: string;
  esApiKey?: string;
  logIndex?: string;
  space?: string;
  triggerMaintainer?: boolean;
  waitForCompletion?: boolean;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface RunRiskScoringMetricsExtractionOptions extends ExtractRiskScoringMetricsFromEsOptions {
  fromEs?: boolean;
  logFilePath?: string;
}

interface SearchHitSource {
  message?: unknown;
  '@timestamp'?: unknown;
}

interface SearchHit {
  _source?: SearchHitSource;
  sort?: Array<string | number>;
}

interface SearchResponse {
  hits?: {
    hits?: SearchHit[];
  };
}

interface WaitHeartbeatResponse {
  hits?: { total?: { value?: number } | number };
  aggregations?: {
    maintainer_totals_count?: { doc_count?: number };
    run_summary_count?: { doc_count?: number };
    newest_risk_score_timestamp?: { value_as_string?: string; value?: number | null };
    risk_score_error_count?: {
      doc_count?: number;
      newest_error_timestamp?: { value_as_string?: string; value?: number | null };
    };
  };
}

interface CountResponse {
  count?: number;
}

interface KibanaClientConfig {
  node: string;
  authHeader: string;
}

interface MaintainerStatusResponse {
  maintainers?: Array<{
    id?: string;
    runs?: number;
    taskStatus?: string;
    nextRunAt?: string;
    lastSuccessTimestamp?: string | null;
    lastErrorTimestamp?: string | null;
  }>;
}

type WaitOutcome = 'completed' | 'partial_success' | 'failed';

interface MaintainerSnapshot {
  runs: number | null;
  taskStatus: string;
  nextRunAt?: string;
  lastSuccessTimestamp?: string;
  lastErrorTimestamp?: string;
}

interface ExtractionAccumulator {
  runs: RiskScoringRunMetrics[];
  current: RiskScoringRunMetrics;
  hasContent: boolean;
}

/** Extract ISO timestamp from a Kibana log line (e.g. [2026-04-15T12:00:00.000Z]). */
const extractTimestamp = (line: string): string | undefined => {
  const m = line.match(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/);
  return m?.[1];
};

/** Attempt to parse JSON from the tail of a log line after a keyword. */
const extractJsonAfter = (line: string, keyword: string): Record<string, unknown> | undefined => {
  const idx = line.indexOf(keyword);
  if (idx === -1) return undefined;
  const tail = line.substring(idx + keyword.length).trim();
  const jsonStart = tail.indexOf('{');
  if (jsonStart === -1) return undefined;
  try {
    return JSON.parse(tail.substring(jsonStart)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const isRiskScoreMaintainerMessage = (message: string): boolean =>
  message.includes(RISK_SCORE_LOG_PREFIX) || message.includes('maintainer totals');

const createAccumulator = (): ExtractionAccumulator => ({
  runs: [],
  current: { runSummaries: [] },
  hasContent: false,
});

const processRiskScoreLogEntry = (
  accumulator: ExtractionAccumulator,
  entry: RiskScoreLogEntry,
): void => {
  if (!isRiskScoreMaintainerMessage(entry.message)) return;

  const ts = entry.timestamp ?? extractTimestamp(entry.message);
  if (!accumulator.current.startTime && ts) accumulator.current.startTime = ts;
  if (ts) accumulator.current.endTime = ts;
  accumulator.hasContent = true;

  if (entry.message.includes('run summary')) {
    const data = extractJsonAfter(entry.message, 'run summary');
    if (data) {
      const summary = parseRunSummary(data);
      if (summary) accumulator.current.runSummaries.push(summary);
    }
    return;
  }

  if (entry.message.includes('maintainer totals')) {
    const data = extractJsonAfter(entry.message, 'maintainer totals');
    if (data) {
      const totals = parseMaintainerTotals(data);
      if (totals) {
        accumulator.current.maintainerTotals = totals;
        accumulator.runs.push(accumulator.current);
        accumulator.current = { runSummaries: [] };
        accumulator.hasContent = false;
      }
    }
  }
};

const finalizeAccumulator = (accumulator: ExtractionAccumulator): RiskScoringRunMetrics[] => {
  if (accumulator.hasContent) {
    accumulator.runs.push(accumulator.current);
  }
  return accumulator.runs;
};

const buildRiskScoreLogQuery = (additionalFilters: object[] = []) => ({
  bool: {
    filter: [
      { term: { 'service.type': 'kibana' } },
      ...additionalFilters,
      {
        bool: {
          should: [
            { match_phrase: { message: RISK_SCORE_LOG_PREFIX } },
            { match_phrase: { message: 'maintainer totals' } },
          ],
          minimum_should_match: 1,
        },
      },
      {
        bool: {
          should: [
            { match_phrase: { message: 'run summary' } },
            { match_phrase: { message: 'maintainer totals' } },
          ],
          minimum_should_match: 1,
        },
      },
    ],
  },
});

const classifyLogIndex = (
  logIndex: string,
): 'deployment_logs' | 'seeded_test_logs' | 'other_logs' => {
  if (logIndex.includes('.ds-logs-perftest') || logIndex.includes('logs-perftest')) {
    return 'seeded_test_logs';
  }
  if (
    logIndex.includes('elastic-cloud-logs') ||
    logIndex.includes('.logs-elastic-cloud') ||
    logIndex.includes('logs-elastic-cloud')
  ) {
    return 'deployment_logs';
  }
  return 'other_logs';
};

const getKibanaClientConfig = (
  options: ExtractRiskScoringMetricsFromEsOptions,
): KibanaClientConfig | undefined => {
  const fileEnv = options.envPath ? parseEnvFile(options.envPath) : {};
  const node = getEnvValue(fileEnv, 'KIBANA_NODE');
  const apiKey = getEnvValue(fileEnv, 'KIBANA_API_KEY');
  const username = getEnvValue(fileEnv, 'KIBANA_USERNAME');
  const password = getEnvValue(fileEnv, 'KIBANA_PASSWORD');

  if (!node) return undefined;
  if (apiKey) return { node, authHeader: `ApiKey ${apiKey}` };
  if (username && password) {
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    return { node, authHeader: `Basic ${encoded}` };
  }
  return undefined;
};

const getSpacePrefix = (space: string = 'default'): string =>
  !space || space === 'default' ? '' : `/s/${space}`;

const toEpochMs = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const fetchMaintainerSnapshot = async (
  config: KibanaClientConfig | undefined,
  maintainerId: string,
  space: string,
): Promise<MaintainerSnapshot> => {
  if (!config) {
    return {
      runs: null,
      taskStatus: 'unavailable',
    };
  }
  const response = await kibanaRequest<MaintainerStatusResponse>(
    config,
    `${getSpacePrefix(space)}/internal/security/entity_store/entity_maintainers?apiVersion=2&ids=${encodeURIComponent(maintainerId)}`,
    { method: 'GET' },
  );
  const maintainer = response.maintainers?.find((item) => item.id === maintainerId);
  return {
    runs: typeof maintainer?.runs === 'number' ? maintainer.runs : null,
    taskStatus: maintainer?.taskStatus ?? 'unknown',
    nextRunAt: maintainer?.nextRunAt,
    lastSuccessTimestamp: maintainer?.lastSuccessTimestamp ?? undefined,
    lastErrorTimestamp: maintainer?.lastErrorTimestamp ?? undefined,
  };
};

const triggerMaintainerRun = async (
  config: KibanaClientConfig,
  maintainerId: string,
  space: string,
): Promise<void> => {
  await kibanaRequest(
    config,
    `${getSpacePrefix(space)}/internal/security/entity_store/entity_maintainers/run/${encodeURIComponent(maintainerId)}?apiVersion=2`,
    {
      method: 'POST',
      body: {},
    },
  );
};

const kibanaRequest = async <T>(
  config: KibanaClientConfig,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> => {
  const baseUrl = config.node.endsWith('/') ? config.node.slice(0, -1) : config.node;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: config.authHeader,
      Accept: 'application/json',
      'kbn-xsrf': 'true',
      'x-elastic-internal-origin': 'kibana',
      'elastic-api-version': '2',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  } as RequestInit);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kibana request failed (${response.status} ${response.statusText}): ${body}`);
  }

  return (await response.json()) as T;
};

const waitForFreshMaintainerTotals = async (
  config: EsClientConfig,
  logIndex: string,
  options: ExtractRiskScoringMetricsFromEsOptions,
): Promise<WaitOutcome> => {
  const logIndexClass = classifyLogIndex(logIndex);
  if (logIndexClass === 'seeded_test_logs') {
    throw new Error(
      `Refusing wait-for-completion on seeded test log index (${logIndex}). ` +
        `Use deployment Kibana logs (for example .ds-elastic-cloud-logs-*) via --log-index.`,
    );
  }

  const waitStartedAt = new Date().toISOString();
  const waitStartedAtMs = Date.now();
  const timeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const kibanaConfig = getKibanaClientConfig(options);
  const space = options.space ?? 'default';
  const maintainerId = 'risk-score';
  const riskScoreIndex = `risk-score.risk-score-${space}`;
  let riskScoreBaselineCount: number;
  const baselineMaintainer = await fetchMaintainerSnapshot(kibanaConfig, maintainerId, space);
  let triggerDisposition: 'observe_only' | 'trigger_posted' | 'already_started_before_trigger' =
    'observe_only';
  try {
    const baselineResponse = await esRequest<CountResponse>(
      config,
      `/${encodeURIComponent(riskScoreIndex)}/_count`,
      { method: 'POST', body: { query: { match_all: {} } } },
    );
    riskScoreBaselineCount = baselineResponse.count ?? 0;
  } catch {
    riskScoreBaselineCount = 0;
  }

  if (options.triggerMaintainer) {
    if (!kibanaConfig) {
      throw new Error(
        'Cannot use --trigger-maintainer without Kibana credentials. Provide --env-path with KIBANA_* values.',
      );
    }
    if (baselineMaintainer.taskStatus === 'started') {
      triggerDisposition = 'already_started_before_trigger';
      log.warn(
        `Risk-score maintainer was already started before trigger request. ` +
          `Not posting another run request; observing the existing maintainer state instead. ` +
          `baseline_runs=${baselineMaintainer.runs ?? 'none'} ` +
          `baseline_last_success=${baselineMaintainer.lastSuccessTimestamp ?? 'none'} ` +
          `baseline_next_run_at=${baselineMaintainer.nextRunAt ?? 'none'}`,
      );
    } else {
      await triggerMaintainerRun(kibanaConfig, maintainerId, space);
      triggerDisposition = 'trigger_posted';
      log.info(
        `Posted run request for maintainer "${maintainerId}" in space "${space}" ` +
          `(baseline_runs=${baselineMaintainer.runs ?? 'none'}, baseline_task_status=${baselineMaintainer.taskStatus}).`,
      );
    }
  }

  let pollAttempt = 0;
  let latestHeartbeat: {
    logIndex: string;
    logIndexClass: string;
    triggerDisposition: string;
    maintainerRuns: number | null;
    maintainerRunsDelta: number | null;
    maintainerTaskStatus: string;
    maintainerLastSuccessTimestamp?: string;
    maintainerLastErrorTimestamp?: string;
    maintainerNextRunAt?: string;
    maintainerTotalsCount: number;
    runSummaryCount: number;
    riskScoreLogLinesCount: number;
    riskScoreLogNewestTimestamp?: string;
    riskScoreIndexCount: number;
    riskScoreIndexDeltaSinceWaitStart: number;
    riskScoreErrorLogsCount: number;
    riskScoreErrorNewestTimestamp?: string;
  } | null = null;

  log.info(`Risk scoring wait mode started`);
  log.info(`  discovered_log_index=${logIndex}`);
  log.info(`  log_index_class=${logIndexClass}`);
  log.info(`  wait_start=${waitStartedAt}`);
  log.info(`  timeout_ms=${timeoutMs}`);
  log.info(`  poll_interval_ms=${pollIntervalMs}`);
  log.info(`  trigger_disposition=${triggerDisposition}`);
  log.info(`  maintainer_runs_baseline=${baselineMaintainer.runs ?? 'unknown'}`);
  log.info(`  maintainer_task_status_baseline=${baselineMaintainer.taskStatus}`);
  log.info(
    `  maintainer_last_success_baseline=${baselineMaintainer.lastSuccessTimestamp ?? 'none'}`,
  );
  log.info(`  maintainer_next_run_at_baseline=${baselineMaintainer.nextRunAt ?? 'none'}`);
  log.info(`  risk_score_index=${riskScoreIndex}`);
  log.info(`  risk_score_index_baseline_count=${riskScoreBaselineCount}`);

  while (Date.now() - waitStartedAtMs <= timeoutMs) {
    pollAttempt += 1;
    const result = await esRequest<WaitHeartbeatResponse>(config, searchPathForIndex(logIndex), {
      method: 'POST',
      body: {
        size: 0,
        track_total_hits: true,
        query: {
          bool: {
            filter: [
              { term: { 'service.type': 'kibana' } },
              { range: { '@timestamp': { gte: waitStartedAt } } },
            ],
            should: [
              { match_phrase: { message: RISK_SCORE_LOG_PREFIX } },
              { match_phrase: { message: 'maintainer totals' } },
              { match_phrase: { message: 'run summary' } },
            ],
            minimum_should_match: 1,
          },
        },
        aggs: {
          maintainer_totals_count: {
            filter: {
              bool: {
                filter: [
                  { term: { 'service.type': 'kibana' } },
                  { match_phrase: { message: 'maintainer totals' } },
                  { range: { '@timestamp': { gte: waitStartedAt } } },
                ],
              },
            },
          },
          run_summary_count: {
            filter: {
              bool: {
                filter: [
                  { term: { 'service.type': 'kibana' } },
                  { match_phrase: { message: 'run summary' } },
                  { range: { '@timestamp': { gte: waitStartedAt } } },
                ],
              },
            },
          },
          newest_risk_score_timestamp: { max: { field: '@timestamp' } },
          risk_score_error_count: {
            filter: {
              bool: {
                filter: [
                  { term: { 'service.type': 'kibana' } },
                  { range: { '@timestamp': { gte: waitStartedAt } } },
                ],
                should: [
                  { match_phrase: { message: RISK_SCORE_LOG_PREFIX } },
                  { match_phrase: { message: 'maintainer totals' } },
                  { match_phrase: { message: 'run summary' } },
                ],
                minimum_should_match: 1,
                must: [
                  {
                    bool: {
                      should: [
                        { match_phrase: { message: 'error' } },
                        { match_phrase: { message: 'failed' } },
                        { match_phrase: { message: 'failure' } },
                        { match_phrase: { message: 'timeout' } },
                        { match_phrase: { message: 'exception' } },
                      ],
                      minimum_should_match: 1,
                    },
                  },
                ],
              },
            },
            aggs: {
              newest_error_timestamp: { max: { field: '@timestamp' } },
            },
          },
        },
      },
    });

    const totalHits = result.hits?.total;
    const riskScoreLogLinesCount =
      typeof totalHits === 'number' ? totalHits : (totalHits?.value ?? 0);
    const maintainerTotalsCount = result.aggregations?.maintainer_totals_count?.doc_count ?? 0;
    const runSummaryCount = result.aggregations?.run_summary_count?.doc_count ?? 0;
    const riskScoreLogNewestTimestamp =
      result.aggregations?.newest_risk_score_timestamp?.value_as_string;
    const riskScoreErrorLogsCount = result.aggregations?.risk_score_error_count?.doc_count ?? 0;
    const riskScoreErrorNewestTimestamp =
      result.aggregations?.risk_score_error_count?.newest_error_timestamp?.value_as_string;
    let maintainerSnapshot: MaintainerSnapshot;
    try {
      maintainerSnapshot = await fetchMaintainerSnapshot(kibanaConfig, maintainerId, space);
    } catch {
      maintainerSnapshot = {
        runs: null,
        taskStatus: 'unavailable',
      };
    }
    const maintainerRuns = maintainerSnapshot.runs;
    const maintainerTaskStatus = maintainerSnapshot.taskStatus;
    const maintainerRunsDelta =
      baselineMaintainer.runs !== null && maintainerRuns !== null
        ? maintainerRuns - baselineMaintainer.runs
        : null;
    let riskScoreIndexCount: number;
    try {
      const latestResponse = await esRequest<CountResponse>(
        config,
        `/${encodeURIComponent(riskScoreIndex)}/_count`,
        { method: 'POST', body: { query: { match_all: {} } } },
      );
      riskScoreIndexCount = latestResponse.count ?? riskScoreBaselineCount;
    } catch {
      riskScoreIndexCount = riskScoreBaselineCount;
    }
    const riskScoreIndexDeltaSinceWaitStart = riskScoreIndexCount - riskScoreBaselineCount;
    const elapsedMs = Date.now() - waitStartedAtMs;

    latestHeartbeat = {
      logIndex,
      logIndexClass,
      triggerDisposition,
      maintainerRuns,
      maintainerRunsDelta,
      maintainerTaskStatus,
      maintainerLastSuccessTimestamp: maintainerSnapshot.lastSuccessTimestamp,
      maintainerLastErrorTimestamp: maintainerSnapshot.lastErrorTimestamp,
      maintainerNextRunAt: maintainerSnapshot.nextRunAt,
      maintainerTotalsCount,
      runSummaryCount,
      riskScoreLogLinesCount,
      riskScoreLogNewestTimestamp,
      riskScoreIndexCount,
      riskScoreIndexDeltaSinceWaitStart,
      riskScoreErrorLogsCount,
      riskScoreErrorNewestTimestamp,
    };

    log.info(
      `[risk-scoring-wait] poll=${pollAttempt} elapsed_ms=${elapsedMs} ` +
        `log_index=${logIndex} log_index_class=${logIndexClass} trigger_disposition=${triggerDisposition} ` +
        `maintainer_runs=${maintainerRuns ?? 'none'} maintainer_runs_delta=${maintainerRunsDelta ?? 'none'} maintainer_task_status=${maintainerTaskStatus} ` +
        `maintainer_last_success_timestamp=${maintainerSnapshot.lastSuccessTimestamp ?? 'none'} ` +
        `maintainer_last_error_timestamp=${maintainerSnapshot.lastErrorTimestamp ?? 'none'} ` +
        `maintainer_next_run_at=${maintainerSnapshot.nextRunAt ?? 'none'} ` +
        `maintainer_totals_since_start=${maintainerTotalsCount} run_summary_since_start=${runSummaryCount} ` +
        `risk_score_log_lines_since_start=${riskScoreLogLinesCount} ` +
        `risk_score_log_newest_timestamp=${riskScoreLogNewestTimestamp ?? 'none'} ` +
        `risk_score_index_count=${riskScoreIndexCount} ` +
        `risk_score_index_delta_since_wait_start=${riskScoreIndexDeltaSinceWaitStart} ` +
        `risk_score_index_semantics=occupancy_only ` +
        `risk_score_error_logs_since_start=${riskScoreErrorLogsCount} ` +
        `risk_score_error_newest_timestamp=${riskScoreErrorNewestTimestamp ?? 'none'}`,
    );

    if (maintainerTotalsCount > 0) {
      log.info('Detected a freshly indexed maintainer totals log');
      return 'completed';
    }

    await sleep(pollIntervalMs);
  }

  const elapsedMs = Date.now() - waitStartedAtMs;
  const maintainerRunsChanged =
    baselineMaintainer.runs !== null &&
    latestHeartbeat?.maintainerRuns !== null &&
    latestHeartbeat?.maintainerRuns !== undefined &&
    latestHeartbeat.maintainerRuns > baselineMaintainer.runs;
  const lastSuccessAdvanced =
    toEpochMs(latestHeartbeat?.maintainerLastSuccessTimestamp) !== null &&
    toEpochMs(baselineMaintainer.lastSuccessTimestamp) !== null &&
    toEpochMs(latestHeartbeat?.maintainerLastSuccessTimestamp)! >
      toEpochMs(baselineMaintainer.lastSuccessTimestamp)!;
  const runSummariesSeen = (latestHeartbeat?.runSummaryCount ?? 0) > 0;
  const riskLogsSeen = (latestHeartbeat?.riskScoreLogLinesCount ?? 0) > 0;
  const errorsSeen = (latestHeartbeat?.riskScoreErrorLogsCount ?? 0) > 0;
  const taskStatus = latestHeartbeat?.maintainerTaskStatus ?? 'unavailable';
  const taskStarted = taskStatus === 'started';
  const progressSignals =
    maintainerRunsChanged || lastSuccessAdvanced || runSummariesSeen || riskLogsSeen;
  const likelyCompletedWithoutTotals = progressSignals && !taskStarted && !errorsSeen;
  const activelyRunningNoCompletionLog = progressSignals && taskStarted && !errorsSeen;
  const neverStarted =
    triggerDisposition !== 'already_started_before_trigger' && !progressSignals && !taskStarted;
  const preexistingStartedNoProgress =
    triggerDisposition === 'already_started_before_trigger' && !progressSignals && taskStarted;

  if (likelyCompletedWithoutTotals || activelyRunningNoCompletionLog) {
    const interpretation = likelyCompletedWithoutTotals
      ? 'partial_success_likely_completed_missing_completion_log'
      : 'partial_success_active_progress_missing_completion_log';
    log.warn(
      `Risk-scoring wait ended without fresh maintainer totals but progress signals are strong; continuing extraction. ` +
        `interpretation=${interpretation} elapsed_ms=${elapsedMs} timeout_ms=${timeoutMs} ` +
        `trigger_disposition=${triggerDisposition} ` +
        `maintainer_runs_baseline=${baselineMaintainer.runs ?? 'unknown'} maintainer_runs=${latestHeartbeat?.maintainerRuns ?? 'none'} ` +
        `maintainer_task_status=${taskStatus} risk_score_index_delta_since_wait_start=${latestHeartbeat?.riskScoreIndexDeltaSinceWaitStart ?? 0} ` +
        `risk_score_index_semantics=occupancy_only ` +
        `last_success_advanced=${lastSuccessAdvanced ? 'yes' : 'no'} ` +
        `run_summary_since_start=${latestHeartbeat?.runSummaryCount ?? 0} risk_score_log_lines_since_start=${latestHeartbeat?.riskScoreLogLinesCount ?? 0}`,
    );
    return 'partial_success';
  }

  if (preexistingStartedNoProgress) {
    throw new Error(
      `Risk-scoring wait could not obtain fresh-run semantics because the maintainer was already started before trigger and remained flat. ` +
        `elapsed_ms=${elapsedMs} timeout_ms=${timeoutMs} polls=${pollAttempt} ` +
        `interpretation=maintainer_already_started_before_trigger_no_progress ` +
        `trigger_disposition=${triggerDisposition} ` +
        `maintainer_runs_baseline=${baselineMaintainer.runs ?? 'unknown'} ` +
        `maintainer_runs=${latestHeartbeat?.maintainerRuns ?? 'none'} ` +
        `maintainer_task_status=${taskStatus} ` +
        `maintainer_last_success_baseline=${baselineMaintainer.lastSuccessTimestamp ?? 'none'} ` +
        `maintainer_last_success_timestamp=${latestHeartbeat?.maintainerLastSuccessTimestamp ?? 'none'} ` +
        `risk_score_index_delta_since_wait_start=${latestHeartbeat?.riskScoreIndexDeltaSinceWaitStart ?? 0} ` +
        `risk_score_index_semantics=occupancy_only ` +
        `risk_score_log_lines_since_start=${latestHeartbeat?.riskScoreLogLinesCount ?? 0} ` +
        `risk_score_error_logs_since_start=${latestHeartbeat?.riskScoreErrorLogsCount ?? 0} ` +
        `guidance=started_state_does_not_guarantee_active_work_consider_waiting_for_settle_or_using_pretrigger_baseline_owned_by_command`,
    );
  }

  if (neverStarted) {
    throw new Error(
      `Risk-scoring wait failed: maintainer never started (or no evidence of start). ` +
        `elapsed_ms=${elapsedMs} timeout_ms=${timeoutMs} polls=${pollAttempt} ` +
        `interpretation=maintainer_never_started ` +
        `trigger_disposition=${triggerDisposition} ` +
        `maintainer_runs_baseline=${baselineMaintainer.runs ?? 'unknown'} maintainer_runs=${latestHeartbeat?.maintainerRuns ?? 'none'} ` +
        `maintainer_task_status=${taskStatus} ` +
        `risk_score_index_delta_since_wait_start=${latestHeartbeat?.riskScoreIndexDeltaSinceWaitStart ?? 0} ` +
        `risk_score_index_semantics=occupancy_only ` +
        `risk_score_log_lines_since_start=${latestHeartbeat?.riskScoreLogLinesCount ?? 0} ` +
        `risk_score_error_logs_since_start=${latestHeartbeat?.riskScoreErrorLogsCount ?? 0} ` +
        `log_index=${latestHeartbeat?.logIndex ?? logIndex} log_index_class=${latestHeartbeat?.logIndexClass ?? logIndexClass}`,
    );
  }

  if (errorsSeen) {
    throw new Error(
      `Risk-scoring wait failed: maintainer-related error logs detected while waiting. ` +
        `elapsed_ms=${elapsedMs} timeout_ms=${timeoutMs} polls=${pollAttempt} ` +
        `interpretation=maintainer_erroring ` +
        `trigger_disposition=${triggerDisposition} ` +
        `maintainer_runs_baseline=${baselineMaintainer.runs ?? 'unknown'} maintainer_runs=${latestHeartbeat?.maintainerRuns ?? 'none'} ` +
        `maintainer_task_status=${taskStatus} ` +
        `risk_score_error_logs_since_start=${latestHeartbeat?.riskScoreErrorLogsCount ?? 0} ` +
        `risk_score_error_newest_timestamp=${latestHeartbeat?.riskScoreErrorNewestTimestamp ?? 'none'} ` +
        `risk_score_index_delta_since_wait_start=${latestHeartbeat?.riskScoreIndexDeltaSinceWaitStart ?? 0} ` +
        `risk_score_index_semantics=occupancy_only ` +
        `risk_score_log_lines_since_start=${latestHeartbeat?.riskScoreLogLinesCount ?? 0} ` +
        `log_index=${latestHeartbeat?.logIndex ?? logIndex} log_index_class=${latestHeartbeat?.logIndexClass ?? logIndexClass}`,
    );
  }

  throw new Error(
    `Risk-scoring wait timed out without completion evidence. ` +
      `elapsed_ms=${elapsedMs} timeout_ms=${timeoutMs} polls=${pollAttempt} ` +
      `interpretation=started_but_no_progress_or_completion ` +
      `log_index=${latestHeartbeat?.logIndex ?? logIndex} ` +
      `log_index_class=${latestHeartbeat?.logIndexClass ?? logIndexClass} ` +
      `trigger_disposition=${triggerDisposition} ` +
      `maintainer_runs_baseline=${baselineMaintainer.runs ?? 'unknown'} ` +
      `maintainer_runs=${latestHeartbeat?.maintainerRuns ?? 'none'} ` +
      `maintainer_task_status=${taskStatus} ` +
      `maintainer_last_success_baseline=${baselineMaintainer.lastSuccessTimestamp ?? 'none'} ` +
      `maintainer_last_success_timestamp=${latestHeartbeat?.maintainerLastSuccessTimestamp ?? 'none'} ` +
      `maintainer_totals_since_start=${latestHeartbeat?.maintainerTotalsCount ?? 0} ` +
      `run_summary_since_start=${latestHeartbeat?.runSummaryCount ?? 0} ` +
      `risk_score_log_lines_since_start=${latestHeartbeat?.riskScoreLogLinesCount ?? 0} ` +
      `risk_score_log_newest_timestamp=${latestHeartbeat?.riskScoreLogNewestTimestamp ?? 'none'} ` +
      `risk_score_index_count=${latestHeartbeat?.riskScoreIndexCount ?? 0} ` +
      `risk_score_index_delta_since_wait_start=${latestHeartbeat?.riskScoreIndexDeltaSinceWaitStart ?? 0} ` +
      `risk_score_index_semantics=occupancy_only ` +
      `risk_score_error_logs_since_start=${latestHeartbeat?.riskScoreErrorLogsCount ?? 0} ` +
      `risk_score_error_newest_timestamp=${latestHeartbeat?.riskScoreErrorNewestTimestamp ?? 'none'} ` +
      `guidance=for_small_validation_use_wait_timeout_ms_1800000_and_deployment_log_index`,
  );
};

const fetchRiskScoreLogEntriesFromEs = async (
  options: ExtractRiskScoringMetricsFromEsOptions,
): Promise<{ entries: RiskScoreLogEntry[]; logIndex: string }> => {
  const config = getEsClientConfig(options);
  const logIndex = options.logIndex ?? (await discoverLogIndex(config));

  if (options.waitForCompletion) {
    const waitOutcome = await waitForFreshMaintainerTotals(config, logIndex, options);
    if (waitOutcome === 'partial_success') {
      log.warn(
        'Proceeding with extraction in partial-success mode; completion log missing but alternate progress signals were detected.',
      );
    }
  }

  const entries: RiskScoreLogEntry[] = [];
  let searchAfter: Array<string | number> | undefined;

  while (true) {
    const result = await esRequest<SearchResponse>(config, searchPathForIndex(logIndex), {
      method: 'POST',
      body: {
        size: DEFAULT_ES_LOG_PAGE_SIZE,
        sort: [{ '@timestamp': 'asc' }, { _shard_doc: 'asc' }],
        ...(searchAfter ? { search_after: searchAfter } : {}),
        _source: ['message', '@timestamp', 'service.type'],
        query: buildRiskScoreLogQuery(),
      },
    });

    const hits = result.hits?.hits ?? [];
    if (hits.length === 0) break;

    for (const hit of hits) {
      const message = hit._source?.message;
      if (typeof message !== 'string') continue;
      const timestamp = hit._source?.['@timestamp'];
      entries.push({
        message,
        timestamp: typeof timestamp === 'string' ? timestamp : undefined,
      });
    }

    searchAfter = hits.at(-1)?.sort;
    if (!searchAfter || hits.length < DEFAULT_ES_LOG_PAGE_SIZE) break;
  }

  return { entries, logIndex };
};

const parseRunSummary = (data: Record<string, unknown>): RunSummary | undefined => {
  if (!data.entityType || typeof data.durationMs !== 'number') return undefined;
  return {
    entityType: String(data.entityType),
    status: String(data.status ?? 'unknown'),
    durationMs: data.durationMs as number,
    scoresWrittenBase: (data.scoresWrittenBase as number) ?? 0,
    scoresWrittenResolution: (data.scoresWrittenResolution as number) ?? 0,
    scoresWrittenTotal: (data.scoresWrittenTotal as number) ?? 0,
    notInStoreCount: (data.notInStoreCount as number) ?? 0,
    pagesProcessed: (data.pagesProcessed as number) ?? 0,
    alertsScored: data.alertsScored !== undefined ? (data.alertsScored as number) : undefined,
  };
};

const parseMaintainerTotals = (data: Record<string, unknown>): MaintainerTotals | undefined => {
  if (typeof data.durationMs !== 'number') return undefined;
  const totalScores =
    typeof data.totalScores === 'number'
      ? data.totalScores
      : typeof data.scoresWrittenTotal === 'number'
        ? data.scoresWrittenTotal
        : 0;
  return {
    durationMs: data.durationMs as number,
    entityTypesProcessed: (data.entityTypesProcessed as number) ?? 0,
    totalScores,
    calculationRunId:
      data.calculationRunId !== undefined ? String(data.calculationRunId) : undefined,
  };
};

/**
 * Parses a Kibana log file for `risk_score_maintainer` log lines and returns structured metrics.
 * Pass '-' to read from stdin.
 */
export const extractRiskScoringMetricsFromFile = async (
  filePath: string,
): Promise<RiskScoringRunMetrics[]> => {
  const stream = filePath === '-' ? process.stdin : fs.createReadStream(filePath);

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const accumulator = createAccumulator();

  for await (const line of rl) {
    processRiskScoreLogEntry(accumulator, { message: line });
  }

  return finalizeAccumulator(accumulator);
};

export const extractRiskScoringMetricsFromEs = async (
  options: ExtractRiskScoringMetricsFromEsOptions,
): Promise<{ runs: RiskScoringRunMetrics[]; logIndex: string }> => {
  const { entries, logIndex } = await fetchRiskScoreLogEntriesFromEs(options);
  const accumulator = createAccumulator();

  for (const entry of entries) {
    processRiskScoreLogEntry(accumulator, entry);
  }

  return {
    runs: finalizeAccumulator(accumulator),
    logIndex,
  };
};

export const runRiskScoringMetricsExtraction = async (
  input: string | RunRiskScoringMetricsExtractionOptions,
): Promise<void> => {
  const options: RunRiskScoringMetricsExtractionOptions =
    typeof input === 'string' ? { logFilePath: input } : input;

  let runs: RiskScoringRunMetrics[];

  if (options.fromEs) {
    const { logIndex, runs: esRuns } = await extractRiskScoringMetricsFromEs(options);
    runs = esRuns;
    log.info(`Extracting risk scoring metrics from Elasticsearch index/data stream ${logIndex}`);
  } else {
    const logFilePath = options.logFilePath;
    if (!logFilePath) {
      throw new Error('A log file path is required unless --from-es is specified.');
    }
    log.info(`Extracting risk scoring metrics from ${logFilePath === '-' ? 'stdin' : logFilePath}`);
    runs = await extractRiskScoringMetricsFromFile(logFilePath);
  }

  if (runs.length === 0) {
    log.warn('No risk_score_maintainer log lines found');
  } else {
    log.info(`Found ${runs.length} maintainer run(s)`);
  }

  process.stdout.write(JSON.stringify(runs, null, 2) + '\n');
};
