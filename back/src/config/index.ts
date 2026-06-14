import 'dotenv/config'

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
  jwtSecret: env('JWT_SECRET'),
  isDev: env('NODE_ENV', 'development') === 'development',
}
