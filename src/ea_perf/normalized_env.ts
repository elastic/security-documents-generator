import { writeFile } from 'node:fs/promises';

import { parseEnvFile } from '../utils/env_file.ts';

export interface WriteNormalizedEnvFileOptions {
  envPath: string;
  outputPath: string;
}

export interface WriteNormalizedEnvFileResult {
  envPath: string;
  outputPath: string;
  keysWritten: string[];
}

export const writeNormalizedEnvFile = async (
  options: WriteNormalizedEnvFileOptions,
): Promise<WriteNormalizedEnvFileResult> => {
  const parsed = parseEnvFile(options.envPath);
  const keysWritten = Object.keys(parsed).sort((a, b) => a.localeCompare(b));
  const body = `${keysWritten.map((key) => `${key}=${parsed[key]}`).join('\n')}\n`;

  await writeFile(options.outputPath, body, 'utf8');

  return {
    envPath: options.envPath,
    outputPath: options.outputPath,
    keysWritten,
  };
};
