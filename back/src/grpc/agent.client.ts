import { loadSync } from '@grpc/proto-loader';
import * as grpc from '@grpc/grpc-js';
import { join } from 'node:path';
import { config } from '../config/index.js';
import { loaderOptions, PROTO_ROOT } from './proto.js';
import { grpcLogger } from '../lib/logger';

function elapsedMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1e6;
}

export interface HealthRequest {}

export interface HealthResponse {
  status: string;
}

export interface ProcessMessageRequest {
  messageId: string;
  conversationId: string;
  merchantId: string;
  customerId: string;
}

export interface ProcessMessageResponse {
  decision: string;
  text: string;
  escalateReason?: string;
}

export type AgentDecision =
  | 'DECISION_REPLY'
  | 'DECISION_ESCALATE'
  | 'DECISION_UNAVAILABLE';

export interface AgentServiceClient extends grpc.Client {
  Health(request: HealthRequest, callback: grpc.requestCallback<HealthResponse>): grpc.ClientUnaryCall;
  ProcessMessage(
    request: ProcessMessageRequest,
    callback: grpc.requestCallback<ProcessMessageResponse>
  ): grpc.ClientUnaryCall;
}

type AgentServiceClientCtor = new (
  address: string,
  credentials: grpc.ChannelCredentials,
  options?: Partial<grpc.ClientOptions>
) => AgentServiceClient;

function loadAgentService(): AgentServiceClientCtor {
  const proto = grpc.loadPackageDefinition(
    loadSync(join(PROTO_ROOT, 'agent/v1/agent.proto'), loaderOptions)
  ) as unknown as {
    ecomassistant: {
      agent: {
        v1: {
          AgentService: AgentServiceClientCtor;
        };
      };
    };
  };
  return proto.ecomassistant.agent.v1.AgentService;
}

function withAuthMetadata(auth: grpc.Metadata): grpc.Interceptor {
  return (options, nextCall) => {
    return new grpc.InterceptingCall(nextCall(options), {
      start(metadata, listener, next) {
        const merged = metadata ?? new grpc.Metadata();
        merged.merge(auth);
        next(merged, listener);
      },
    });
  };
}

export function createAgentClient(options?: Partial<grpc.ClientOptions>): AgentServiceClient {
  const metadata = new grpc.Metadata();
  metadata.set('authorization', `Bearer ${config.internalApiKey}`);

  const AgentService = loadAgentService();
  return new AgentService(config.agentGrpcAddr, grpc.credentials.createInsecure(), {
    interceptors: [withAuthMetadata(metadata)],
    ...options,
  });
}

export function agentHealth(client: AgentServiceClient): Promise<HealthResponse> {
  const startedAt = process.hrtime.bigint();
  const log = grpcLogger.child({ rpc: 'AgentService.Health' });
  return new Promise((resolve, reject) => {
    client.Health({}, (err, response) => {
      const ms = elapsedMs(startedAt);
      if (err) {
        const code = (err as grpc.ServiceError).code ?? 'UNKNOWN';
        log.error({ code, ms }, 'agent health probe failed');
        reject(err);
      } else {
        log.info({ status: response!.status, ms }, 'agent health probe ok');
        resolve(response!);
      }
    });
  });
}

export function agentProcessMessage(
  client: AgentServiceClient,
  request: ProcessMessageRequest
): Promise<ProcessMessageResponse> {
  const startedAt = process.hrtime.bigint();
  const log = grpcLogger.child({
    rpc: 'AgentService.ProcessMessage',
    conversationId: request.conversationId,
    messageId: request.messageId,
  });
  return new Promise((resolve, reject) => {
    client.ProcessMessage(request, (err, response) => {
      const ms = elapsedMs(startedAt);
      if (err) {
        const code = (err as grpc.ServiceError).code ?? 'UNKNOWN';
        log.error({ code, ms }, 'agent ProcessMessage failed');
        reject(err);
      } else {
        log.info(
          { decision: response!.decision, hasText: Boolean(response!.text), ms },
          'agent ProcessMessage completed'
        );
        resolve(response!);
      }
    });
  });
}

export function closeAgentClient(client: AgentServiceClient): void {
  client.close();
}