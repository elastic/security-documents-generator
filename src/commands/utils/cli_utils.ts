import cliProgress from 'cli-progress';
import { select } from '@inquirer/prompts';

export const parseIntBase10 = (input: string) => parseInt(input, 10);
export const parseOptionInt = (input: string | undefined, fallback: number): number =>
  input ? parseIntBase10(input) : fallback;

export function handleCommandError(error: unknown, message?: string): never {
  console.error(message ?? 'Command failed:', error);
  process.exit(1);
}

export function wrapAction<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await fn(...args);
    } catch (error) {
      handleCommandError(error);
    }
  };
}

export interface ProgressBarOptions {
  format?: string;
  clearOnComplete?: boolean;
}

export const createProgressBar = (
  label: string,
  options: ProgressBarOptions = {}
): cliProgress.SingleBar => {
  const { format, clearOnComplete } = options;
  const defaultFormat = `Progress indexing into ${label} | {value}/{total} docs`;
  return new cliProgress.SingleBar(
    {
      format: format ?? defaultFormat,
      clearOnComplete: clearOnComplete ?? false,
    },
    cliProgress.Presets.shades_classic
  );
};

export const promptForFileSelection = async (fileList: string[]) => {
  if (fileList.length === 0) {
    console.log('No files to upload');
    process.exit(1);
  }

  return select({
    message: 'Select a file to upload',
    choices: fileList.map((file) => ({ name: file, value: file })),
  });
};
