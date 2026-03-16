const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
} as const;

const LEVEL_STYLES: Record<Exclude<LogLevel, 'silent'>, { color: string; label: string }> = {
  debug: { color: COLORS.dim, label: 'DEBUG' },
  info: { color: COLORS.cyan, label: 'INFO' },
  warn: { color: COLORS.yellow, label: 'WARN' },
  error: { color: COLORS.red, label: 'ERROR' },
};

function resolveLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LOG_LEVELS) return env as LogLevel;
  return 'info';
}

let currentLevel: LogLevel = resolveLevel();

function shouldLog(level: Exclude<LogLevel, 'silent'>): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatPrefix(level: Exclude<LogLevel, 'silent'>): string {
  const { color, label } = LEVEL_STYLES[level];
  return `${color}[${label}]${COLORS.reset}`;
}

function write(level: Exclude<LogLevel, 'silent'>, args: unknown[]): void {
  if (!shouldLog(level)) return;
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  const prefix = formatPrefix(level);
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join(' ');
  stream.write(`${prefix} ${msg}\n`);
}

export const log = {
  debug: (...args: unknown[]) => write('debug', args),
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args),

  setLevel: (level: LogLevel) => {
    currentLevel = level;
  },
  getLevel: (): LogLevel => currentLevel,
};
