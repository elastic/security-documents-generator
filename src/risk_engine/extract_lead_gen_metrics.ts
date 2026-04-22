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

/**
 * Parsed metrics from a single lead generation pipeline run.
 */
export interface LeadGenRunMetrics {
  executionId?: string;
  pipeline: {
    entityFetchMs?: number;
    entityFetchCount?: number;
    enginePipelineMs?: number;
    enginePipelineLeads?: number;
    persistenceMs?: number;
    persistenceLeads?: number;
    persistenceMode?: string;
    totalPipelineMs?: number;
  };
  engine: {
    observationCollectionMs?: number;
    observationCollectionCount?: number;
    observationCollectionModules?: number;
    entityScoringMs?: number;
    entityScoringCount?: number;
    leadGroupingMs?: number;
    leadGroupingLeads?: number;
    totalPipelineMs?: number;
    collectionMs?: number;
    scoringMs?: number;
    synthesisMs?: number;
    entityCount?: number;
    observationCount?: number;
    leadCount?: number;
    modules: Array<{
      name: string;
      durationMs: number;
      observationCount: number;
      entityCount: number;
    }>;
    synthesisDurations: Array<{
      leadIndex: number;
      totalLeads: number;
      durationMs: number;
      method: 'LLM' | 'rule-based' | string;
    }>;
  };
}

const DEFAULT_ES_LOG_PAGE_SIZE = 500;
const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 10 * 1000;

interface LeadGenLogEntry {
  message: string;
}

interface SearchHitSource {
  message?: unknown;
}

interface SearchHit {
  _source?: SearchHitSource;
  sort?: Array<string | number>;
}

interface SearchResponse {
  hits?: {
    hits?: SearchHit[];
    total?: { value?: number } | number;
  };
  aggregations?: {
    newest_timestamp?: { value_as_string?: string };
    engine_total_count?: { doc_count?: number };
  };
}

export interface ExtractLeadGenMetricsFromEsOptions {
  envPath?: string;
  esNode?: string;
  esUser?: string;
  esPassword?: string;
  esApiKey?: string;
  logIndex?: string;
  waitForCompletion?: boolean;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface RunLeadGenMetricsExtractionOptions extends ExtractLeadGenMetricsFromEsOptions {
  fromEs?: boolean;
  logFilePath?: string;
}

const extractMs = (text: string): number | undefined => {
  const m = text.match(/(\d+(?:\.\d+)?)ms/);
  return m ? parseFloat(m[1]) : undefined;
};

const _extractCount = (text: string, label: string): number | undefined => {
  const re = new RegExp(`(\\d+)\\s+${label}`);
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : undefined;
};

const extractParenCount = (text: string): number | undefined => {
  const m = text.match(/\((\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
};

const parseLeadGenTelemetryLine = (line: string, metrics: LeadGenRunMetrics): void => {
  // [LeadGeneration][Telemetry] Entity fetch: Xms (N records)
  if (line.includes('[LeadGeneration][Telemetry] Entity fetch:')) {
    metrics.pipeline.entityFetchMs = extractMs(line);
    const m = line.match(/\((\d+)\s+records\)/);
    if (m) metrics.pipeline.entityFetchCount = parseInt(m[1], 10);
    return;
  }
  // [LeadGeneration][Telemetry] Engine pipeline: Xms (N leads)
  if (line.includes('[LeadGeneration][Telemetry] Engine pipeline:')) {
    metrics.pipeline.enginePipelineMs = extractMs(line);
    const m = line.match(/\((\d+)\s+leads?\)/);
    if (m) metrics.pipeline.enginePipelineLeads = parseInt(m[1], 10);
    return;
  }
  // [LeadGeneration][Telemetry] Persistence: Xms (N leads to {mode} index)
  if (line.includes('[LeadGeneration][Telemetry] Persistence:')) {
    metrics.pipeline.persistenceMs = extractMs(line);
    const countMatch = line.match(/\((\d+)\s+leads?/);
    if (countMatch) metrics.pipeline.persistenceLeads = parseInt(countMatch[1], 10);
    const modeMatch = line.match(/to\s+(\S+)\s+index/);
    if (modeMatch) metrics.pipeline.persistenceMode = modeMatch[1];
    return;
  }
  // [LeadGeneration][Telemetry] Total pipeline: Xms (executionId=...)
  if (line.includes('[LeadGeneration][Telemetry] Total pipeline:')) {
    metrics.pipeline.totalPipelineMs = extractMs(line);
    const m = line.match(/executionId=([a-zA-Z0-9_-]+)/);
    if (m) metrics.executionId = m[1];
    return;
  }
};

const parseLeadGenEngineLine = (line: string, metrics: LeadGenRunMetrics): void => {
  // [LeadGenerationEngine] Module "X": Xms (N observations from M entities)
  const moduleMatch = line.match(
    /\[LeadGenerationEngine\] Module "([^"]+)":\s*(\d+(?:\.\d+)?)ms\s+\((\d+) observations? from (\d+) entit/,
  );
  if (moduleMatch) {
    metrics.engine.modules.push({
      name: moduleMatch[1],
      durationMs: parseFloat(moduleMatch[2]),
      observationCount: parseInt(moduleMatch[3], 10),
      entityCount: parseInt(moduleMatch[4], 10),
    });
    return;
  }
  // [LeadGenerationEngine] Observation collection: Xms (N observations from M modules)
  if (line.includes('[LeadGenerationEngine] Observation collection:')) {
    metrics.engine.observationCollectionMs = extractMs(line);
    const obsMatch = line.match(/\((\d+)\s+observations?/);
    if (obsMatch) metrics.engine.observationCollectionCount = parseInt(obsMatch[1], 10);
    const modMatch = line.match(/from\s+(\d+)\s+modules?/);
    if (modMatch) metrics.engine.observationCollectionModules = parseInt(modMatch[1], 10);
    return;
  }
  // [LeadGenerationEngine] Entity scoring: Xms (N entities scored)
  if (line.includes('[LeadGenerationEngine] Entity scoring:')) {
    metrics.engine.entityScoringMs = extractMs(line);
    const m = extractParenCount(line);
    if (m !== undefined) metrics.engine.entityScoringCount = m;
    return;
  }
  // [LeadGenerationEngine] Lead grouping & synthesis: Xms (N leads)
  if (line.includes('[LeadGenerationEngine] Lead grouping & synthesis:')) {
    metrics.engine.leadGroupingMs = extractMs(line);
    const m = extractParenCount(line);
    if (m !== undefined) metrics.engine.leadGroupingLeads = m;
    return;
  }
  // [LeadGenerationEngine] Lead X/Y synthesis for [...]: Xms (LLM/rule-based)
  const synthMatch = line.match(
    /\[LeadGenerationEngine\] Lead (\d+)\/(\d+) synthesis for .+?:\s*(\d+(?:\.\d+)?)ms\s+\((.+?)\)/,
  );
  if (synthMatch) {
    metrics.engine.synthesisDurations.push({
      leadIndex: parseInt(synthMatch[1], 10),
      totalLeads: parseInt(synthMatch[2], 10),
      durationMs: parseFloat(synthMatch[3]),
      method: synthMatch[4].trim(),
    });
    return;
  }
  // [LeadGenerationEngine] Total pipeline: Xms | Collection: Xms | Scoring: Xms | Synthesis: Xms | Entities: N | Observations: N | Leads: N
  if (line.includes('[LeadGenerationEngine] Total pipeline:')) {
    const totalMs = extractMs(line);
    if (totalMs !== undefined) metrics.engine.totalPipelineMs = totalMs;
    const collMatch = line.match(/Collection:\s*(\d+(?:\.\d+)?)ms/);
    if (collMatch) metrics.engine.collectionMs = parseFloat(collMatch[1]);
    const scorMatch = line.match(/Scoring:\s*(\d+(?:\.\d+)?)ms/);
    if (scorMatch) metrics.engine.scoringMs = parseFloat(scorMatch[1]);
    const synthMatch2 = line.match(/Synthesis:\s*(\d+(?:\.\d+)?)ms/);
    if (synthMatch2) metrics.engine.synthesisMs = parseFloat(synthMatch2[1]);
    const entMatch = line.match(/Entities:\s*(\d+)/);
    if (entMatch) metrics.engine.entityCount = parseInt(entMatch[1], 10);
    const obsMatch = line.match(/Observations:\s*(\d+)/);
    if (obsMatch) metrics.engine.observationCount = parseInt(obsMatch[1], 10);
    const leadMatch = line.match(/Leads:\s*(\d+)/);
    if (leadMatch) metrics.engine.leadCount = parseInt(leadMatch[1], 10);
    return;
  }
};

const isLeadGenLine = (line: string): boolean =>
  line.includes('[LeadGeneration]') || line.includes('[LeadGenerationEngine]');

const createEmptyMetrics = (): LeadGenRunMetrics => ({
  pipeline: {},
  engine: { modules: [], synthesisDurations: [] },
});

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const buildLeadGenLogQuery = (additionalFilters: object[] = []) => ({
  bool: {
    filter: [
      { term: { 'service.type': 'kibana' } },
      ...additionalFilters,
      {
        bool: {
          should: [
            { match_phrase: { message: '[LeadGeneration]' } },
            { match_phrase: { message: '[LeadGenerationEngine]' } },
          ],
          minimum_should_match: 1,
        },
      },
    ],
  },
});

const waitForFreshLeadGenCompletion = async (
  config: EsClientConfig,
  logIndex: string,
  options: ExtractLeadGenMetricsFromEsOptions,
): Promise<void> => {
  const waitStartedAt = new Date().toISOString();
  const waitStartedAtMs = Date.now();
  const timeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let pollAttempt = 0;
  let latestHeartbeat: {
    completionCount: number;
    engineTotalCount: number;
    newestTimestamp?: string;
  } | null = null;

  log.info(`Lead generation wait mode started`);
  log.info(`  discovered_log_index=${logIndex}`);
  log.info(`  wait_start=${waitStartedAt}`);
  log.info(`  timeout_ms=${timeoutMs}`);
  log.info(`  poll_interval_ms=${pollIntervalMs}`);

  while (Date.now() - waitStartedAtMs <= timeoutMs) {
    pollAttempt += 1;
    const response = await esRequest<SearchResponse>(config, searchPathForIndex(logIndex), {
      method: 'POST',
      body: {
        size: 0,
        track_total_hits: true,
        query: {
          bool: {
            filter: [
              { term: { 'service.type': 'kibana' } },
              { range: { '@timestamp': { gte: waitStartedAt } } },
              {
                bool: {
                  should: [
                    {
                      match_phrase: {
                        message: '[LeadGeneration][Telemetry] Total pipeline:',
                      },
                    },
                    { match_phrase: { message: '[LeadGenerationEngine] Total pipeline:' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
        aggs: {
          newest_timestamp: { max: { field: '@timestamp' } },
          engine_total_count: {
            filter: {
              bool: {
                filter: [
                  { term: { 'service.type': 'kibana' } },
                  { range: { '@timestamp': { gte: waitStartedAt } } },
                  { match_phrase: { message: '[LeadGenerationEngine] Total pipeline:' } },
                ],
              },
            },
          },
        },
      },
    });

    const totalHits = response.hits?.total;
    const completionCount = typeof totalHits === 'number' ? totalHits : (totalHits?.value ?? 0);
    const engineTotalCount = response.aggregations?.engine_total_count?.doc_count ?? 0;
    const newestTimestamp = response.aggregations?.newest_timestamp?.value_as_string;
    const elapsedMs = Date.now() - waitStartedAtMs;

    latestHeartbeat = {
      completionCount,
      engineTotalCount,
      newestTimestamp,
    };

    log.info(
      `[lead-gen-wait] poll=${pollAttempt} elapsed_ms=${elapsedMs} completion_logs_since_start=${completionCount} newest_timestamp=${newestTimestamp ?? 'none'} engine_total_since_start=${engineTotalCount}`,
    );

    if (completionCount > 0) {
      log.info('Detected a freshly indexed lead generation completion log');
      return;
    }

    await sleep(pollIntervalMs);
  }

  const elapsedMs = Date.now() - waitStartedAtMs;
  throw new Error(
    `Timed out waiting for lead generation completion logs. ` +
      `elapsed_ms=${elapsedMs} timeout_ms=${timeoutMs} polls=${pollAttempt} ` +
      `completion_logs_since_start=${latestHeartbeat?.completionCount ?? 0} ` +
      `engine_total_since_start=${latestHeartbeat?.engineTotalCount ?? 0} ` +
      `newest_timestamp=${latestHeartbeat?.newestTimestamp ?? 'none'} ` +
      `log_index=${logIndex}`,
  );
};

const fetchLeadGenLogEntriesFromEs = async (
  options: ExtractLeadGenMetricsFromEsOptions,
): Promise<{ entries: LeadGenLogEntry[]; logIndex: string }> => {
  const config = getEsClientConfig(options);
  const logIndex = options.logIndex ?? (await discoverLogIndex(config));

  if (options.waitForCompletion) {
    await waitForFreshLeadGenCompletion(config, logIndex, options);
  }

  const entries: LeadGenLogEntry[] = [];
  let searchAfter: Array<string | number> | undefined;

  while (true) {
    const response = await esRequest<SearchResponse>(config, searchPathForIndex(logIndex), {
      method: 'POST',
      body: {
        size: DEFAULT_ES_LOG_PAGE_SIZE,
        sort: [{ '@timestamp': 'asc' }, { _shard_doc: 'asc' }],
        ...(searchAfter ? { search_after: searchAfter } : {}),
        _source: ['message', '@timestamp', 'service.type'],
        query: buildLeadGenLogQuery(),
      },
    });

    const hits = response.hits?.hits ?? [];
    if (hits.length === 0) break;

    for (const hit of hits) {
      const message = hit._source?.message;
      if (typeof message === 'string') {
        entries.push({ message });
      }
    }

    searchAfter = hits.at(-1)?.sort;
    if (!searchAfter || hits.length < DEFAULT_ES_LOG_PAGE_SIZE) break;
  }

  return { entries, logIndex };
};

export const extractLeadGenMetricsFromEs = async (
  options: ExtractLeadGenMetricsFromEsOptions,
): Promise<{ runs: LeadGenRunMetrics[]; logIndex: string }> => {
  const { entries, logIndex } = await fetchLeadGenLogEntriesFromEs(options);
  const runs: LeadGenRunMetrics[] = [];
  let current = createEmptyMetrics();
  let hasContent = false;

  for (const entry of entries) {
    const line = entry.message;
    if (!isLeadGenLine(line)) continue;

    if (line.includes('[LeadGenerationEngine] Total pipeline:') && hasContent) {
      parseLeadGenEngineLine(line, current);
      runs.push(current);
      current = createEmptyMetrics();
      hasContent = false;
      continue;
    }

    hasContent = true;
    if (line.includes('[LeadGeneration]')) {
      parseLeadGenTelemetryLine(line, current);
    } else {
      parseLeadGenEngineLine(line, current);
    }
  }

  if (hasContent) {
    runs.push(current);
  }

  return { runs, logIndex };
};

/**
 * Parses a Kibana log file (or stdin) for [LeadGeneration] / [LeadGenerationEngine] lines
 * and returns structured metrics objects — one per detected pipeline run.
 *
 * Multiple runs are detected by a new "Total pipeline" line resetting the accumulator.
 */
export const extractLeadGenMetricsFromFile = async (
  filePath: string,
): Promise<LeadGenRunMetrics[]> => {
  const stream = filePath === '-' ? process.stdin : fs.createReadStream(filePath);

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const runs: LeadGenRunMetrics[] = [];
  let current = createEmptyMetrics();
  let hasContent = false;

  for await (const line of rl) {
    if (!isLeadGenLine(line)) {
      continue;
    }

    // Detect start of a new run by seeing the engine "Total pipeline" summary line —
    // it's the last line of an engine run. When we see a second one, start a fresh accumulator.
    if (line.includes('[LeadGenerationEngine] Total pipeline:') && hasContent) {
      parseLeadGenEngineLine(line, current);
      runs.push(current);
      current = createEmptyMetrics();
      hasContent = false;
      continue;
    }

    hasContent = true;

    if (line.includes('[LeadGeneration]')) {
      parseLeadGenTelemetryLine(line, current);
    } else if (line.includes('[LeadGenerationEngine]')) {
      parseLeadGenEngineLine(line, current);
    }
  }

  // Push the last partial run if it has any data
  if (hasContent) {
    runs.push(current);
  }

  return runs;
};

/**
 * CLI entry point: read log from file path argument (or '-' for stdin),
 * output JSON results to stdout.
 */
export const runLeadGenMetricsExtraction = async (
  input: string | RunLeadGenMetricsExtractionOptions,
): Promise<void> => {
  const options: RunLeadGenMetricsExtractionOptions =
    typeof input === 'string' ? { logFilePath: input } : input;

  let runs: LeadGenRunMetrics[];

  if (options.fromEs) {
    const { runs: esRuns, logIndex } = await extractLeadGenMetricsFromEs(options);
    runs = esRuns;
    log.info(`Extracting lead generation metrics from Elasticsearch index/data stream ${logIndex}`);
  } else {
    const logFilePath = options.logFilePath;
    if (!logFilePath) {
      throw new Error('A log file path is required unless --from-es is specified.');
    }
    log.info(
      `Extracting lead generation metrics from ${logFilePath === '-' ? 'stdin' : logFilePath}`,
    );
    runs = await extractLeadGenMetricsFromFile(logFilePath);
  }

  if (runs.length === 0) {
    log.warn('No [LeadGeneration] or [LeadGenerationEngine] lines found in log');
  } else {
    log.info(`Found ${runs.length} lead generation run(s)`);
  }

  process.stdout.write(JSON.stringify(runs, null, 2) + '\n');
};
