import os from 'os';
import path from 'path';

export const getDataDir = () => path.join(process.cwd(), 'data');

export const getDataPath = (...segments: string[]) => path.join(getDataDir(), ...segments);

export const getEntityResolutionDataDir = () => getDataPath('entity_resolution_data');

export const getEntityStorePerfDataDir = () => getDataPath('entity_store_perf_data');

export const getRiskEnginePerfDataDir = () => getDataPath('risk_engine', 'perf');

export const getRiskEnginePerfScenarioDir = (name: string) =>
  path.join(getRiskEnginePerfDataDir(), name);

export const getRiskEnginePerfScenarioAlertsDir = (name: string) =>
  path.join(getRiskEnginePerfScenarioDir(name), 'alerts');

export const getRiskEnginePerfScenarioEntitiesPath = (name: string) =>
  path.join(getRiskEnginePerfScenarioDir(name), 'entities.jsonl');

/** Write alias for `.entities.v2.latest.security_*` (see Kibana `getEntitiesAlias(ENTITY_LATEST, namespace)`). */
export const getEntityStoreLatestAlias = (namespace: string = 'default') =>
  `entities-latest-${namespace}`;

export const getBaselinesDir = () => getDataPath('baselines');

export const getTestLogDataDir = () => getDataPath('test_log_data');

const DEFAULT_EA_PERF_RESULTS_DIR = path.join(
  os.homedir(),
  'Desktop',
  'performance_testing',
  'results',
);

export const getEaPerfResultsRoot = () =>
  process.env.EA_PERF_RESULTS_DIR || process.env.PERF_RESULTS_DIR || DEFAULT_EA_PERF_RESULTS_DIR;

export const getEaPerfScenarioDir = (feature: string, scenario: string) =>
  path.join(getEaPerfResultsRoot(), feature, scenario);

export const getEaPerfRunDir = (feature: string, scenario: string, run: number) =>
  path.join(getEaPerfScenarioDir(feature, scenario), `run-${run}`);
