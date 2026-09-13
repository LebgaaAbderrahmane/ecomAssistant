import { loadSync } from '@grpc/proto-loader';
import * as grpc from '@grpc/grpc-js';
import { join } from 'node:path';
import { config } from '../config/index.js';
import { loaderOptions, PROTO_ROOT } from './proto.js';
import prisma from '../config/db.config';
import {
  ToolNameSchema,
  isReadTool,
  LEGACY_ONLY_TOOL_NAMES,
  type ToolName,
} from '../modules/ai/schemas/intents.schemas';
import { executeTool } from '../modules/ai/tools/registry';
import {
  buildToolEntities,
  applyReadToolState,
  type ToolSourceContext,
  type InjectedToolEntities,
} from '../modules/ai/agent.service';
import type { ConversationMemory } from '../modules/ai/memory.types';

export interface HealthRequest {}

export interface HealthResponse {
  status: string;
}

export interface IdentityInput {
  merchantId?: string;
  customerId?: string;
  conversationId?: string;
}

export interface ExecuteToolRequest {
  toolName: string;
  entitiesJson: string;
  identity: IdentityInput;
}

export interface ExecuteToolResponse {
  success: boolean;
  outcome: string;
  dataJson: string;
  error: string;
}

interface ToolServiceConstructor {
  service: grpc.ServiceDefinition;
}

function loadToolService(): ToolServiceConstructor {
  const proto = grpc.loadPackageDefinition(
    loadSync(join(PROTO_ROOT, 'tools/v1/tool.proto'), loaderOptions)
  ) as unknown as {
    ecomassistant: {
      tools: {
        v1: {
          ToolService: ToolServiceConstructor;
        };
      };
    };
  };
  return proto.ecomassistant.tools.v1.ToolService;
}

// Mirror of the agent's own gRPC auth (ecom_agent/server.py): both sides
// require `authorization: Bearer <INTERNAL_API_KEY>` on every call.
function authError(call: grpc.ServerUnaryCall<unknown, unknown>): grpc.ServiceError | null {
  const expected = `Bearer ${config.internalApiKey}`;
  const received = call.metadata.get('authorization')[0] ?? '';
  if (received !== expected) {
    const err = new grpc.StatusBuilder()
      .withCode(grpc.status.PERMISSION_DENIED)
      .withDetails('missing or invalid INTERNAL_API_KEY')
      .build() as grpc.ServiceError;
    return err;
  }
  return null;
}

function healthHandler(
  call: grpc.ServerUnaryCall<HealthRequest, HealthResponse>,
  callback: grpc.sendUnaryData<HealthResponse>
): void {
  const unauthorized = authError(call);
  if (unauthorized) {
    callback(unauthorized, null);
    return;
  }
  callback(null, { status: 'STATUS_SERVING' });
}

// Serialize a recoverable tool outcome into the wire response — recovery is an
// OK gRPC status with success/outcome/error in the body. Hard errors (unknown
// tool, bad input, missing rows) become gRPC status codes.
function toolResponse(
  success: boolean,
  outcome: 'OUTCOME_SUCCESS' | 'OUTCOME_NOT_FOUND' | 'OUTCOME_AMBIGUOUS' | 'OUTCOME_UNSPECIFIED',
  dataJson: string,
  error: string,
): ExecuteToolResponse {
  return { success, outcome, dataJson, error };
}

async function executeToolHandler(
  call: grpc.ServerUnaryCall<ExecuteToolRequest, ExecuteToolResponse>,
  callback: grpc.sendUnaryData<ExecuteToolResponse>
): Promise<void> {
  const unauthorized = authError(call);
  if (unauthorized) {
    callback(unauthorized, null);
    return;
  }

  try {
    const { toolName, entitiesJson, identity } = call.request;

    if (!ToolNameSchema.safeParse(toolName).success) {
      callback({ code: grpc.status.INVALID_ARGUMENT, message: `Unknown tool "${toolName}"` }, null);
      return;
    }
    const typedToolName = toolName as ToolName;

    // Legacy-only tools exist for the internal fallback path only — they are not
    // part of the agent-facing contract (contracts TOOL_NAMES / tools.json) and
    // are rejected here.
    if ((LEGACY_ONLY_TOOL_NAMES as readonly string[]).includes(typedToolName)) {
      callback(
        { code: grpc.status.INVALID_ARGUMENT, message: `Tool "${toolName}" is not part of the agent contract` },
        null
      );
      return;
    }

    if (!identity?.conversationId) {
      callback({ code: grpc.status.INVALID_ARGUMENT, message: 'identity.conversation_id is required' }, null);
      return;
    }

    let agentEntities: Record<string, unknown> = {};
    if (entitiesJson) {
      try {
        const parsed = JSON.parse(entitiesJson);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        agentEntities = parsed as Record<string, unknown>;
      } catch {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: 'entities_json is not a valid JSON object' }, null);
        return;
      }
    }

    // The conversation row is the authoritative scope. The agent-supplied
    // identity selects it; merchant/customer are then materialized from the row
    // so tool entities always match the backend's truth. A mismatched identity
    // is rejected rather than silently re-scoped (cross-tenant confusion).
    const conversation = await prisma.conversation.findUnique({
      where: { id: identity.conversationId },
    });
    if (!conversation) {
      callback({ code: grpc.status.NOT_FOUND, message: `Conversation "${identity.conversationId}" not found` }, null);
      return;
    }
    if (identity.merchantId && identity.merchantId !== conversation.merchantId) {
      callback({ code: grpc.status.INVALID_ARGUMENT, message: 'identity.merchant_id does not match the conversation' }, null);
      return;
    }
    if (identity.customerId && identity.customerId !== conversation.customerId) {
      callback({ code: grpc.status.INVALID_ARGUMENT, message: 'identity.customer_id does not match the conversation' }, null);
      return;
    }

    const customer = await prisma.customer.findUnique({
      where: { id: conversation.customerId },
    });
    if (!customer) {
      callback({ code: grpc.status.NOT_FOUND, message: `Customer "${conversation.customerId}" not found` }, null);
      return;
    }

    // Human takeover gate: read tools are suppressed while a human owns the
    // conversation (write tools still run — mirror of agent.service).
    if (conversation.takenOverByHuman && isReadTool(typedToolName)) {
      callback(
        null,
        toolResponse(
          false,
          'OUTCOME_UNSPECIFIED',
          '{}',
          'Conversation is under human takeover; read tools are suppressed'
        )
      );
      return;
    }

    // Merge identity + materialize backend-owned context (current order/product,
    // saved address, memory) into explicit entities — same transport the
    // internal pipeline uses, so legacy behavior is preserved over gRPC.
    const source: ToolSourceContext = {
      conversation,
      customer,
      memory: (conversation.memory as ConversationMemory | null) ?? {},
    };
    const toolEntities: InjectedToolEntities = buildToolEntities(
      typedToolName,
      agentEntities as InjectedToolEntities,
      source
    );

    const result = await executeTool(typedToolName, toolEntities);

    // Read-tool navigation state is owned by the transport: apply the tool's
    // transition (+ currentProductId) after a successful run, as the internal
    // pipeline does.
    await applyReadToolState(conversation.id, typedToolName, result);

    const outcome:
      | 'OUTCOME_SUCCESS'
      | 'OUTCOME_NOT_FOUND'
      | 'OUTCOME_AMBIGUOUS'
      | 'OUTCOME_UNSPECIFIED' = result.success
      ? 'OUTCOME_SUCCESS'
      : result.outcome === 'NOT_FOUND'
        ? 'OUTCOME_NOT_FOUND'
        : result.outcome === 'AMBIGUOUS'
          ? 'OUTCOME_AMBIGUOUS'
          : 'OUTCOME_UNSPECIFIED';
    callback(
      null,
      toolResponse(result.success, outcome, JSON.stringify(result.data ?? {}), result.error ?? '')
    );
  } catch (err) {
    console.error('[gRPC] ExecuteTool failed unexpectedly', err);
    callback(
      { code: grpc.status.INTERNAL, message: 'Tool execution failed unexpectedly' },
      null
    );
  }
}

export async function startToolServer(): Promise<grpc.Server | null> {
  if (!config.toolsGrpcEnabled) {
    console.log('[gRPC] ToolService disabled (TOOLS_GRPC_ENABLED != true)');
    return null;
  }

  const server = new grpc.Server();
  server.addService(loadToolService().service, {
    Health: healthHandler,
    ExecuteTool: executeToolHandler,
  });

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(
      config.toolsGrpcAddr,
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`[gRPC] ToolService listening on ${config.toolsGrpcAddr} (port ${port})`);
        resolve();
      }
    );
  });

  return server;
}