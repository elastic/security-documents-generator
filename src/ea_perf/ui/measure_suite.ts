import path from 'node:path';
import {
  measureExplorePerf,
  type MeasureExplorePerfResult,
  type ScenarioName,
} from './measure_explore_perf.ts';

export interface MeasureSuiteOptions {
  envPath: string;
  runs?: number;
  outputRoot?: string;
  storeEntity?: string;
  observedEntity?: string;
  continueOnError?: boolean;
  scenarioTimeoutMs?: number;
  scenarios?: string[];
  headed?: boolean;
}

export interface MeasureSuiteSummary {
  startedAt: string;
  completedAt: string;
  scenariosAttempted: string[];
  scenariosPassed: string[];
  scenariosFailed: string[];
  outputs: Record<string, string>;
  failureMessages: Record<string, string>;
}

const DEFAULT_SCENARIOS: Array<Exclude<ScenarioName, 'all'>> = [
  'hosts-list',
  'host-detail',
  'flyout',
  'users-list',
  'user-detail',
  'flyout-user',
  'flyout-comparison',
];

const runWithTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs?: number,
  label?: string,
): Promise<T> => {
  if (!timeoutMs) return promise;
  const timeoutError = new Error(
    `Scenario timeout after ${timeoutMs}ms${label ? ` (${label})` : ''}`,
  );
  const timeout = new Promise<T>((_, reject) => {
    setTimeout(() => reject(timeoutError), timeoutMs);
  });
  return Promise.race([promise, timeout]);
};

export const runMeasureSuite = async (
  options: MeasureSuiteOptions,
): Promise<MeasureSuiteSummary> => {
  const startedAt = new Date().toISOString();
  const scenarios =
    options.scenarios && options.scenarios.length > 0 ? options.scenarios : DEFAULT_SCENARIOS;
  const continueOnError = options.continueOnError !== false;
  const summary: MeasureSuiteSummary = {
    startedAt,
    completedAt: startedAt,
    scenariosAttempted: [],
    scenariosPassed: [],
    scenariosFailed: [],
    outputs: {},
    failureMessages: {},
  };

  for (const scenario of scenarios) {
    summary.scenariosAttempted.push(scenario);
    process.stdout.write(`\n[measure-suite] START scenario=${scenario}\n`);

    try {
      const scenarioOutputDir = options.outputRoot
        ? path.join(path.resolve(options.outputRoot), scenario)
        : undefined;
      const result: MeasureExplorePerfResult = await runWithTimeout(
        measureExplorePerf({
          envFile: options.envPath,
          scenario: scenario as ScenarioName,
          runs: options.runs,
          storeEntity: options.storeEntity,
          observedEntity: options.observedEntity,
          outputDir: scenarioOutputDir,
          headed: options.headed,
        }),
        options.scenarioTimeoutMs,
        scenario,
      );
      summary.scenariosPassed.push(scenario);
      summary.outputs[scenario] = result.outputPath;
      process.stdout.write(
        `[measure-suite] END scenario=${scenario} status=pass output=${result.outputPath}\n`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.scenariosFailed.push(scenario);
      summary.failureMessages[scenario] = message;
      process.stdout.write(
        `[measure-suite] END scenario=${scenario} status=fail error=${message}\n`,
      );
      if (!continueOnError) {
        break;
      }
    }
  }

  summary.completedAt = new Date().toISOString();
  return summary;
};
