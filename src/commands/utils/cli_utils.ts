import cliProgress from 'cli-progress';
import { select } from '@inquirer/prompts';
import { log } from '../../utils/logger.ts';

export const parseIntBase10 = (input: string) => parseInt(input, 10);
export const parseOptionInt = (input: string | undefined, fallback: number): number =>
  input ? parseIntBase10(input) : fallback;

const formatCauseChain = (error: unknown): string[] => {
  const chain: string[] = [];
  let cursor: unknown = error;
  let guard = 0;

  while (cursor && guard < 6) {
    guard += 1;
    if (cursor instanceof Error) {
      const record = cursor as Error & {
        code?: string;
        errno?: number | string;
        address?: string;
        port?: number;
        cause?: unknown;
      };
      const details = [
        `${record.name}: ${record.message}`,
        record.code ? `code=${record.code}` : undefined,
        record.errno !== undefined ? `errno=${String(record.errno)}` : undefined,
        record.address ? `address=${record.address}` : undefined,
        record.port !== undefined ? `port=${String(record.port)}` : undefined,
      ]
        .filter(Boolean)
        .join(', ');
      chain.push(details);
      cursor = record.cause;
      continue;
    }

    chain.push(String(cursor));
    break;
  }

  return chain;
};

export function handleCommandError(error: unknown, message?: string): never {
  const prefix = message ?? 'Command failed';
  if (error instanceof Error) {
    const e = error as Error & {
      statusCode?: number;
      responseData?: unknown;
    };
    log.error(`${prefix}: ${e.name}: ${e.message}`);

    if (e.statusCode !== undefined) {
      log.error(`HTTP status: ${e.statusCode}`);
    }
    if (e.responseData !== undefined) {
      log.error('HTTP response body:', e.responseData);
    }

    const causeChain = formatCauseChain(e.cause);
    if (causeChain.length > 0) {
      log.error('Cause chain:');
      causeChain.forEach((cause, idx) => log.error(`  [${idx + 1}] ${cause}`));
    }
  } else {
    log.error(`${prefix}:`, error);
  }
  process.exit(1);
}

export function wrapAction<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
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
