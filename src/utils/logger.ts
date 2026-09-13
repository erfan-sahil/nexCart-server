import { env, isProduction } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogMeta = Record<string, unknown>;

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
};

const write = (level: LogLevel, message: string, meta?: LogMeta) => {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...meta,
    ...(meta?.err ? { err: serializeError(meta.err) } : {}),
  };

  if (isProduction) {
    const output = JSON.stringify(entry);
    if (level === 'error') {
      console.error(output);
      return;
    }
    if (level === 'warn') {
      console.warn(output);
      return;
    }
    console.log(output);
    return;
  }

  const prefix = `[${entry.time}] ${level.toUpperCase()}`;
  const { err: _err, message: _message, level: _level, time: _time, ...rest } = entry;
  const extras = Object.keys(rest).length > 0 ? rest : undefined;

  if (level === 'error') {
    console.error(prefix, message, extras ?? '', meta?.err ?? '');
    return;
  }

  if (level === 'warn') {
    console.warn(prefix, message, extras ?? '');
    return;
  }

  console.log(prefix, message, extras ?? '');
};

export const logger = {
  debug(message: string, meta?: LogMeta) {
    if (env.NODE_ENV === 'production') {
      return;
    }
    write('debug', message, meta);
  },
  info(message: string, meta?: LogMeta) {
    write('info', message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    write('warn', message, meta);
  },
  error(message: string, meta?: LogMeta) {
    write('error', message, meta);
  },
};
