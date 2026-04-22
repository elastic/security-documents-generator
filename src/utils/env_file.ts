import fs from 'node:fs';

const stripOptionalQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const parseEnvFile = (envPath: string): Record<string, string> => {
  const raw = fs.readFileSync(envPath, 'utf8');
  const env: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separator = withoutExport.indexOf('=');
    if (separator === -1) continue;

    const key = withoutExport.slice(0, separator).trim();
    const value = stripOptionalQuotes(withoutExport.slice(separator + 1));
    if (key) env[key] = value;
  }

  return env;
};

export const getEnvValue = (fileEnv: Record<string, string>, key: string): string | undefined =>
  process.env[key] ?? fileEnv[key];

export const applyEnvFileToProcess = (envPath: string): Record<string, string> => {
  const parsed = parseEnvFile(envPath);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return parsed;
};
