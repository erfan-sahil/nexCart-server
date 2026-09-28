import { env, isProduction } from '../config/env';

export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug';

export type LogMeta = Record<string, unknown>;

export type Logger = {
  debug: (message: string, meta?: LogMeta) => void;
  http: (message: string, meta?: LogMeta) => void;
  info: (message: string, meta?: LogMeta) => void;
  warn: (message: string, meta?: LogMeta) => void;
  error: (message: string, meta?: LogMeta) => void;
  child: (bindings: LogMeta) => Logger;
};

const LEVEL_RANK: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const SENSITIVE_KEY = /password|token|authorization|cookie|secret|api[-_]?key/i;

const activeLevel = (): LogLevel => env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: isProduction ? undefined : error.stack,
    };
  }

  return error;
};

const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 6) {
    return '[Truncated]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[Redacted]' : redact(entry, depth + 1),
      ]),
    );
  }

  return value;
};

const shouldLog = (level: LogLevel) => LEVEL_RANK[level] <= LEVEL_RANK[activeLevel()];

const write = (level: LogLevel, message: string, meta?: LogMeta) => {
  if (!shouldLog(level)) {
    return;
  }

  const { err, ...rest } = meta ?? {};
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(redact(rest) as LogMeta),
    ...(err !== undefined ? { err: serializeError(err) } : {}),
  };

  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
};

const createLogger = (bindings: LogMeta = {}): Logger => ({
  debug(message, meta) {
    write('debug', message, { ...bindings, ...meta });
  },
  http(message, meta) {
    write('http', message, { ...bindings, ...meta });
  },
  info(message, meta) {
    write('info', message, { ...bindings, ...meta });
  },
  warn(message, meta) {
    write('warn', message, { ...bindings, ...meta });
  },
  error(message, meta) {
    write('error', message, { ...bindings, ...meta });
  },
  child(extra) {
    return createLogger({ ...bindings, ...extra });
  },
});

export const logger = createLogger();
