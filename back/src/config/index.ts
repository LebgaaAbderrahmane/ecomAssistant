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
  JWT_EXPIRES_IN: env('JWT_EXPIRES_IN')
}

export const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
};

export const redis = createClient({
  url: redisConnection.url,
});

redis.connect();