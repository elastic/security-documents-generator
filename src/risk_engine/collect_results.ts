import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger.ts';
import { getEsClient } from '../commands/utils/indices.ts';
import {
  extractRiskScoringMetricsFromFile,
  type RiskScoringRunMetrics,
} from './extract_metrics_from_logs.ts';
import { type EsStatsSnapshot } from './capture_es_stats.ts';
import { getRiskEnginePerfScenarioDir } from '../utils/data_paths.ts';

export interface Tier1Metrics {
  totalDurationMs: number;
  entityTypesProcessed: number;
  totalScoresWritten: number;
  userDurationMs?: number;
  hostDurationMs?: number;
  userScoresWritten?: number;
  hostScoresWritten?: number;
  userNotInStore?: number;
  hostNotInStore?: number;
  userPagesProcessed?: number;
  hostPagesProcessed?: number;
  calculationRunId?: string;
}

export interface Tier2Metrics {
  scoringThroughputPerSec?: number;
  avgPageDurationMs?: number;
  resolutionOverheadRatio?: number;
  writeEfficiencyPct?: number;
}

export interface ScenarioResults {
  scenario: string;
  collectedAt: string;
  parameters: {
    userCount?: number;
    hostCount?: number;
    alertsPerEntity?: number;
    resolutionPct?: number;
  };
  tier1: Tier1Metrics;
  tier2: Tier2Metrics;
  esStatsPre?: EsStatsSnapshot;
  esStatsPost?: EsStatsSnapshot;
  riskScoreCount?: number;
  rawRuns: RiskScoringRunMetrics[];
}

const queryRiskScoreCount = async (space = 'default'): Promise<number> => {
  const es = getEsClient();
  try {
    const result = await es.count({
      index: `risk-score.risk-score-${space}`,
      ignore_unavailable: true,
    });
    return result.count;
  } catch {
    return -1;
  }
};

const buildTier1 = (runs: RiskScoringRunMetrics[]): Tier1Metrics => {
  const lastRun = runs[runs.length - 1];
  if (!lastRun) {
    return { totalDurationMs: 0, entityTypesProcessed: 0, totalScoresWritten: 0 };
  }

  const totals = lastRun.maintainerTotals;
  const summaries = lastRun.runSummaries;
  const user = summaries.find((s) => s.entityType === 'user');
  const host = summaries.find((s) => s.entityType === 'host');

  return {
    totalDurationMs: totals?.durationMs ?? 0,
    entityTypesProcessed: totals?.entityTypesProcessed ?? summaries.length,
    totalScoresWritten:
      totals?.totalScores ?? summaries.reduce((a, s) => a + s.scoresWrittenTotal, 0),
    userDurationMs: user?.durationMs,
    hostDurationMs: host?.durationMs,
    userScoresWritten: user?.scoresWrittenTotal,
    hostScoresWritten: host?.scoresWrittenTotal,
    userNotInStore: user?.notInStoreCount,
    hostNotInStore: host?.notInStoreCount,
    userPagesProcessed: user?.pagesProcessed,
    hostPagesProcessed: host?.pagesProcessed,
    calculationRunId: totals?.calculationRunId,
  };
};

const buildTier2 = (tier1: Tier1Metrics, runs: RiskScoringRunMetrics[]): Tier2Metrics => {
  const lastRun = runs[runs.length - 1];
  if (!lastRun) return {};

  const summaries = lastRun.runSummaries;
  const user = summaries.find((s) => s.entityType === 'user');
  const host = summaries.find((s) => s.entityType === 'host');

  const totalPages = (user?.pagesProcessed ?? 0) + (host?.pagesProcessed ?? 0);
  const avgPageDurationMs = totalPages > 0 ? tier1.totalDurationMs / totalPages : undefined;

  const totalScoresBase = summaries.reduce((a, s) => a + s.scoresWrittenBase, 0);
  const scoringThroughputPerSec =
    tier1.totalDurationMs > 0
      ? Math.round((tier1.totalScoresWritten / tier1.totalDurationMs) * 1000)
      : undefined;

  const totalResolution = summaries.reduce((a, s) => a + s.scoresWrittenResolution, 0);
  const resolutionOverheadRatio =
    totalScoresBase > 0 ? totalResolution / totalScoresBase : undefined;

  const totalNotInStore = summaries.reduce((a, s) => a + s.notInStoreCount, 0);
  const writeEfficiencyPct =
    tier1.totalScoresWritten + totalNotInStore > 0
      ? (tier1.totalScoresWritten / (tier1.totalScoresWritten + totalNotInStore)) * 100
      : undefined;

  return {
    scoringThroughputPerSec,
    avgPageDurationMs,
    resolutionOverheadRatio,
    writeEfficiencyPct,
  };
};

export interface CollectResultsParams {
  scenario: string;
  logFile: string;
  esStatsPreFile?: string;
  esStatsPostFile?: string;
  space?: string;
  parameters?: ScenarioResults['parameters'];
}

export const collectResults = async (params: CollectResultsParams): Promise<ScenarioResults> => {
  const {
    scenario,
    logFile,
    esStatsPreFile,
    esStatsPostFile,
    space = 'default',
    parameters = {},
  } = params;

  log.info(`Collecting results for scenario "${scenario}"`);

  const runs = await extractRiskScoringMetricsFromFile(logFile);
  log.info(`Parsed ${runs.length} maintainer run(s) from log`);

  const riskScoreCount = await queryRiskScoreCount(space);
  log.info(`Risk score count: ${riskScoreCount}`);

  const tier1 = buildTier1(runs);
  const tier2 = buildTier2(tier1, runs);

  let esStatsPre: EsStatsSnapshot | undefined;
  let esStatsPost: EsStatsSnapshot | undefined;

  if (esStatsPreFile && fs.existsSync(esStatsPreFile)) {
    esStatsPre = JSON.parse(fs.readFileSync(esStatsPreFile, 'utf-8')) as EsStatsSnapshot;
  }
  if (esStatsPostFile && fs.existsSync(esStatsPostFile)) {
    esStatsPost = JSON.parse(fs.readFileSync(esStatsPostFile, 'utf-8')) as EsStatsSnapshot;
  }

  const results: ScenarioResults = {
    scenario,
    collectedAt: new Date().toISOString(),
    parameters,
    tier1,
    tier2,
    esStatsPre,
    esStatsPost,
    riskScoreCount,
    rawRuns: runs,
  };

  const scenarioDir = getRiskEnginePerfScenarioDir(scenario);
  if (!fs.existsSync(scenarioDir)) {
    fs.mkdirSync(scenarioDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(scenarioDir, `results_${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  log.info(`Results written to ${outputPath}`);

  return results;
};
