/**
 * Aggregate benchmark runs and write a summary table.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ScenarioResult } from './measure_explore_perf.ts';

export interface RunSummary {
  scenario: string;
  runs: number;
  min: number;
  max: number;
  median: number;
  allValues: number[];
}

export interface RecordExploreResultsOptions {
  input: string;
  output?: string;
}

export interface RecordExploreResultsResult {
  outputPath: string;
  summary: RunSummary[];
  markdownTable: string;
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function primaryMetric(result: ScenarioResult): number | undefined {
  switch (result.scenario) {
    case 'hosts-list':
    case 'users-list':
      return result.metrics.timeToTableRendered;
    case 'host-detail':
    case 'user-detail':
      return result.metrics.timeToEntityIdRendered ?? result.metrics.timeToDetailRendered;
    case 'flyout':
    case 'flyout-user':
    case 'flyout-entity-store':
    case 'flyout-observed':
      return result.metrics.timeToFlyoutRendered;
    default:
      return undefined;
  }
}

function buildSummaries(results: ScenarioResult[]): RunSummary[] {
  const byScenario = new Map<string, ScenarioResult[]>();
  for (const result of results) {
    const rows = byScenario.get(result.scenario) ?? [];
    rows.push(result);
    byScenario.set(result.scenario, rows);
  }

  const summaries: RunSummary[] = [];
  for (const [scenario, rows] of byScenario) {
    const values = rows
      .map(primaryMetric)
      .filter((value): value is number => typeof value === 'number');
    if (values.length === 0) continue;
    summaries.push({
      scenario,
      runs: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      median: medianOf(values),
      allValues: values,
    });
  }

  const scenarioOrder = [
    'hosts-list',
    'host-detail',
    'flyout',
    'flyout-entity-store',
    'flyout-observed',
    'users-list',
    'user-detail',
    'flyout-user',
  ];
  summaries.sort((a, b) => {
    const left = scenarioOrder.indexOf(a.scenario);
    const right = scenarioOrder.indexOf(b.scenario);
    return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
  });
  return summaries;
}

function markdownTable(summaries: RunSummary[]): string {
  const lines = [
    '| Scenario | Runs | Min (ms) | Median (ms) | Max (ms) |',
    '|----------|------|----------|-------------|----------|',
  ];
  for (const summary of summaries) {
    lines.push(
      `| ${summary.scenario} | ${summary.runs} | ${Math.round(summary.min)} | ${Math.round(summary.median)} | ${Math.round(summary.max)} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function extractResults(parsed: unknown): ScenarioResult[] {
  if (Array.isArray(parsed)) return parsed as ScenarioResult[];
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { results?: unknown }).results)
  ) {
    return (parsed as { results: ScenarioResult[] }).results;
  }
  throw new Error('JSON must be ScenarioResult[] or { results: ScenarioResult[] }');
}

export async function recordExploreResults(
  options: RecordExploreResultsOptions,
): Promise<RecordExploreResultsResult> {
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output ?? options.input);

  const raw = await readFile(inputPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  const results = extractResults(parsed);
  const summary = buildSummaries(results);
  const table = markdownTable(summary);

  const summarizedAt = new Date().toISOString();
  const merged = Array.isArray(parsed)
    ? { results, summary, summarizedAt }
    : { ...(parsed as Record<string, unknown>), summary, summarizedAt };

  await writeFile(outputPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  return {
    outputPath,
    summary,
    markdownTable: table,
  };
}
