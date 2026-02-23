import path from 'path';

export const getDataDir = () => path.join(process.cwd(), 'data');

export const getDataPath = (...segments: string[]) => path.join(getDataDir(), ...segments);

export const getEntityResolutionDataDir = () => getDataPath('entity_resolution_data');

export const getEntityStorePerfDataDir = () => getDataPath('entity_store_perf_data');

export const getRiskEnginePerfDataDir = () => getDataPath('risk_engine', 'perf');

export const getBaselinesDir = () => getDataPath('baselines');

export const getTestLogDataDir = () => getDataPath('test_log_data');
