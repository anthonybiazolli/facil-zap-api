// ============================================
// LOGGER UTILITY
// Logging estruturado com Pino
// ============================================

import pino from 'pino';

export function createLogger(name: string): pino.Logger {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    base: {
      service: name,
      version: process.env.npm_package_version,
    },
  });
}

export const logger = createLogger('SessionKeeper');