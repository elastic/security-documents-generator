import { mkdir, writeFile } from 'node:fs/promises';
import os from 'os';
import path from 'node:path';

import { getEaPerfRunDir, getEaPerfScenarioDir } from '../../utils/data_paths.ts';

export interface RecordRunParams {
  feature: string;
  scenario: string;
  note?: string;
  envFile?: string;
  resultsRoot?: string;
}

export interface RecordRunResult {
  run: number;
  runDir: string;
  paramsPath: string;
}

const expandHome = (input: string): string =>
  input.startsWith('~/') ? path.join(os.homedir(), input.slice(2)) : input;

const getScenarioDir = (feature: string, scenario: string, resultsRoot?: string): string => {
  if (resultsRoot) {
    return path.join(path.resolve(expandHome(resultsRoot)), feature, scenario);
  }
  return getEaPerfScenarioDir(feature, scenario);
};

const getRunDir = (
  feature: string,
  scenario: string,
  run: number,
  resultsRoot?: string,
): string => {
  if (resultsRoot) {
    return path.join(path.resolve(expandHome(resultsRoot)), feature, scenario, `run-${run}`);
  }
  return getEaPerfRunDir(feature, scenario, run);
};

export async function recordRun(params: RecordRunParams): Promise<RecordRunResult> {
  const { feature, scenario, note = '', envFile, resultsRoot } = params;
  const scenarioDir = getScenarioDir(feature, scenario, resultsRoot);
  await mkdir(scenarioDir, { recursive: true });

  let runNumber = 1;
  while (true) {
    const runDir = getRunDir(feature, scenario, runNumber, resultsRoot);
    try {
      await mkdir(runDir);
      const paramsPath = path.join(runDir, 'params.json');
      const payload = {
        feature,
        scenario,
        run: runNumber,
        timestamp: new Date().toISOString(),
        note,
        host: os.hostname(),
        env_file: envFile ?? 'not set',
      };
      await writeFile(paramsPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
      return { run: runNumber, runDir, paramsPath };
    } catch (error) {
      const record = error as NodeJS.ErrnoException;
      if (record.code !== 'EEXIST') {
        throw error;
      }
      runNumber += 1;
    }
  }
}
