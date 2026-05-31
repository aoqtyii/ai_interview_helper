import pino from 'pino';

export const appLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: undefined
});
