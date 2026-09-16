import 'dotenv/config'
import { ConnectionOptions } from "bullmq";
import { createClient } from "redis";

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  port: Number(env('API_PORT', '3000')),
  nodeEnv: env('NODE_ENV', 'development'),
  databaseUrl: env('DATABASE_URL'),
  redisUrl: env('REDIS_URL', 'redis://redis:6379'),
  isDev: env('NODE_ENV', 'development') === 'development',
  JWT_SECRET: env('JWT_SECRET'),
  JWT_EXPIRES_IN: env('JWT_EXPIRES_IN'),
  openwaUrl: env('OPENWA_URL', 'http://localhost:2785'),
  openwaApiKey: env('OPENWA_API_KEY', 'dev-admin-key'),
  openwaWebhookSecret: env('OPENWA_WEBHOOK_SECRET', 'whsec_dev'),
  appUrl: env('APP_URL', 'http://localhost:3000').trim(),
  internalUrl: env('INTERNAL_URL', 'http://back:3000'),
  agentGrpcAddr: env('AGENT_GRPC_ADDR', 'agent:50052'),
  internalApiKey: env('INTERNAL_API_KEY', 'dev-internal-key'),
  toolsGrpcAddr: env('TOOLS_GRPC_ADDR', '0.0.0.0:50051'),
  toolsGrpcEnabled: env('TOOLS_GRPC_ENABLED', 'true') !== 'false',
  chargily: {
    baseUrl: env('CHARGILY_BASE_URL'),
    publicKey: env('CHARGILY_PUBLIC_KEY'),
    privateKey: env('CHARGILY_PRIVATE_KEY'),
  },
  googleClientId: env('GOOGLE_CLIENT_ID'),
  googleClientSecret: env('GOOGLE_CLIENT_SECRET'),
  frontendUrl: env('FRONTEND_URL', 'http://localhost:5173'),
  googleCallbackUrl: env('GOOGLE_CALLBACK_URL', 'http://localhost:3000/auth/google/callback'),
};


export const redisConnection: ConnectionOptions = {
  url: config.redisUrl
};


export const redis = createClient({
  url: config.redisUrl,
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

redis.connect()
  .then(() => console.log("Redis connected"))
  .catch((err) => console.error("Redis connection failed:", err));