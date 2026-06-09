const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LEVELS;

const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as LogLevel;
const minLevel = LEVELS[configured] ?? LEVELS.info;

const write = (level: LogLevel, event: string, message: string, metadata?: Record<string, unknown>): void => {
  if (LEVELS[level] < minLevel) return;

  const entry: Record<string, unknown> = {
    level,
    event,
    message,
    timestamp: new Date().toISOString(),
  };

  if (metadata) {
    Object.assign(entry, metadata);
  }

  const line = JSON.stringify(entry);

  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
};

export const logger = {
  debug: (event: string, message: string, metadata?: Record<string, unknown>) => write('debug', event, message, metadata),
  info:  (event: string, message: string, metadata?: Record<string, unknown>) => write('info',  event, message, metadata),
  warn:  (event: string, message: string, metadata?: Record<string, unknown>) => write('warn',  event, message, metadata),
  error: (event: string, message: string, metadata?: Record<string, unknown>) => write('error', event, message, metadata),
};
