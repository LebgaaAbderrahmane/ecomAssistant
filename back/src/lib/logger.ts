import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    service: 'back',
    nodeEnv: config.nodeEnv,
  },
  redact: {
    paths: ['req.headers.authorization', '*.internalApiKey', '*.jwt', '*.token'],
    censor: '[REDACTED]',
  },
});

export const grpcLogger = logger.child({ area: 'grpc' });