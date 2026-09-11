import { loadSync } from '@grpc/proto-loader';
import * as grpc from '@grpc/grpc-js';
import { join } from 'node:path';
import { config } from '../config/index.js';
import { loaderOptions, PROTO_ROOT } from './proto.js';

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
  return new Promise((resolve, reject) => {
    client.Health({}, (err, response) => (err ? reject(err) : resolve(response!)));
  });
}

export function agentProcessMessage(
  client: AgentServiceClient,
  request: ProcessMessageRequest
): Promise<ProcessMessageResponse> {
  return new Promise((resolve, reject) => {
    client.ProcessMessage(request, (err, response) => (err ? reject(err) : resolve(response!)));
  });
}

export function closeAgentClient(client: AgentServiceClient): void {
  client.close();
}