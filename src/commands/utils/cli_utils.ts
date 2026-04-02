import cliProgress from 'cli-progress';
import { select } from '@inquirer/prompts';
import { log } from '../../utils/logger.ts';

export const parseIntBase10 = (input: string) => parseInt(input, 10);
export const parseOptionInt = (input: string | undefined, fallback: number): number =>
  input ? parseIntBase10(input) : fallback;

export function handleCommandError(error: unknown, message?: string): never {
  log.error(message ?? 'Command failed:', error);
  process.exit(1);
}

export function wrapAction<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    let isShuttingDown = false;

    const onSigInt = () => {
      if (isShuttingDown) {
        log.info('\nForce quitting...');
        process.exit(130);
      }
      isShuttingDown = true;
      log.info('\nInterrupted, shutting down... (Ctrl+C again to force quit)');
      process.exitCode = 130;

      setTimeout(() => {
        log.info('\nShutdown timed out, force quitting...');
        process.exit(130);
      }, 5000).unref();
    };

    process.on('SIGINT', onSigInt);

    try {
      await fn(...args);
    } catch (error) {
      handleCommandError(error);
    } finally {
      process.off('SIGINT', onSigInt);
    }
  };
}

export interface ProgressBarOptions {
  format?: string;
  clearOnComplete?: boolean;
}

export const createProgressBar = (
  label: string,
  options: ProgressBarOptions = {},
): cliProgress.SingleBar => {
  const { format, clearOnComplete } = options;
  const defaultFormat = `Progress indexing into ${label} | {value}/{total} docs`;
  return new cliProgress.SingleBar(
    {
      format: format ?? defaultFormat,
      clearOnComplete: clearOnComplete ?? false,
    },
    cliProgress.Presets.shades_classic,
  );
};

export const promptForFileSelection = async (fileList: string[]) => {
  if (fileList.length === 0) {
    log.info('No files to upload');
    process.exit(1);
  }

  return select({
    message: 'Select a file to upload',
    choices: fileList.map((file) => ({ name: file, value: file })),
  });
};
