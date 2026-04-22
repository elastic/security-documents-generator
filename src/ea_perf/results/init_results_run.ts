import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getEaPerfResultsRoot } from '../../utils/data_paths.ts';

export interface InitResultsRunOptions {
  tier: string;
  feature: string;
  scenario: string;
  run: number;
  outputRoot?: string;
}

export interface InitResultsRunResult {
  runDir: string;
  created: string[];
}

const expandHome = (input: string): string =>
  input.startsWith('~/') ? path.join(os.homedir(), input.slice(2)) : input;

const resolveOutputRoot = (override?: string): string => {
  if (!override) return getEaPerfResultsRoot();
  return path.resolve(expandHome(override));
};

export const initResultsRun = async (
  options: InitResultsRunOptions,
): Promise<InitResultsRunResult> => {
  const root = resolveOutputRoot(options.outputRoot);
  const runDir = path.join(
    root,
    options.tier,
    options.feature,
    options.scenario,
    `run-${options.run}`,
  );
  await mkdir(runDir, { recursive: true });

  const created: string[] = [];
  const paramsPath = path.join(runDir, 'params.json');
  const notesPath = path.join(runDir, 'notes.md');
  const rawLogsPath = path.join(runDir, 'raw_logs.txt');

  await writeFile(
    paramsPath,
    JSON.stringify(
      {
        tier: options.tier,
        feature: options.feature,
        scenario: options.scenario,
        run: options.run,
        initializedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  created.push(paramsPath);

  await writeFile(
    notesPath,
    `# Notes\n\n- Run initialized at ${new Date().toISOString()}\n`,
    'utf8',
  );
  created.push(notesPath);

  await writeFile(rawLogsPath, '', 'utf8');
  created.push(rawLogsPath);

  return { runDir, created };
};
