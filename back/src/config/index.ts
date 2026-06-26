import 'dotenv/config'
import { ConnectionOptions } from "bullmq";
import { createClient } from "redis";

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

export const config = {
  port: Number(env('API_PORT', '3000')),
  nodeEnv: env('NODE_ENV', 'development'),
  databaseUrl: env('DATABASE_URL'),
  redisUrl: env('REDIS_URL', 'redis://redis:6379'),
  isDev: env('NODE_ENV', 'development') === 'development',
  JWT_SECRET: env('JWT_SECRET'),
  JWT_EXPIRES_IN: env('JWT_EXPIRES_IN'),
  openwaUrl: env('OPENWA_URL', 'http://openwa:2785'),
  openwaApiKey: env('OPENWA_API_KEY', 'dev-admin-key'),
  openwaWebhookSecret: env('OPENWA_WEBHOOK_SECRET', 'whsec_dev'),
  appUrl: env('APP_URL', 'http://localhost:3000'),
}

export const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
};

export const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
});

redis.connect();