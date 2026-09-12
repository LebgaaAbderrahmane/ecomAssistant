import { loadSync } from '@grpc/proto-loader';
import * as grpc from '@grpc/grpc-js';
import { join } from 'node:path';
import { config } from '../src/config/index.js';
import { loaderOptions, PROTO_ROOT } from '../src/grpc/proto.js';
import { agentHealth, agentProcessMessage, closeAgentClient, createAgentClient } from '../src/grpc/agent.client.js';

interface ToolHealthResponse {
  status: string;
}

function clientTarget(addr: string): string {
  return addr.replace(/^0\.0\.0\.0(?=:)/, '127.0.0.1').replace(/^\[:\](?=:)/, '[::1]');
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function checkBackToAgent(): Promise<boolean> {
  const client = createAgentClient();
  try {
    const health = await withTimeout(agentHealth(client), 5000, 'back -> agent');
    return health.status === 'STATUS_SERVING';
  } finally {
    closeAgentClient(client);
  }
}

const FALLBACK_REPLY = 'Bonjour, comment puis-je vous aider ?';

async function checkProcessMessageRoundTrip(): Promise<boolean> {
  const client = createAgentClient();
  try {
    const response = await withTimeout(
      agentProcessMessage(client, {
        messageId: 'grpc-check-no-such-message',
        conversationId: 'grpc-check',
        merchantId: 'grpc-check',
        customerId: 'grpc-check',
      }),
      5000,
      'back -> agent ProcessMessage'
    );
    return response.decision === 'DECISION_REPLY' && response.text === FALLBACK_REPLY;
  } finally {
    closeAgentClient(client);
  }
}

async function checkToolService(): Promise<boolean> {
  const definition = loadSync(join(PROTO_ROOT, 'tools/v1/tool.proto'), loaderOptions);
  const proto = grpc.loadPackageDefinition(definition) as Record<string, any>;
  const ToolService = proto.ecomassistant.tools.v1.ToolService;
  const client = new ToolService(
    clientTarget(config.toolsGrpcAddr),
    grpc.credentials.createInsecure()
  );
  try {
    const health = await withTimeout<ToolHealthResponse>(
      new Promise((resolve, reject) =>
        client.Health({}, (err: grpc.ServiceError | null, response?: ToolHealthResponse) =>
          err ? reject(err) : resolve(response!)
        )
      ),
      5000,
      'agent -> back (ToolService.Health)'
    );
    return health.status === 'STATUS_SERVING';
  } finally {
    client.close();
  }
}

const checks: Array<[string, () => Promise<boolean>]> = [
  ['back -> agent  (AgentService.Health        @ ' + config.agentGrpcAddr + ')', checkBackToAgent],
  ['back -> agent  (AgentService.ProcessMessage round trip       @ ' + config.agentGrpcAddr + ')', checkProcessMessageRoundTrip],
  ['agent -> back (ToolService.Health  @ ' + config.toolsGrpcAddr + ')', checkToolService],
];

let failures = 0;
for (const [label, run] of checks) {
  try {
    const ok = await run();
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + label);
    failures += ok ? 0 : 1;
  } catch (err) {
    console.log('FAIL  ' + label);
    console.log('      ' + (err as Error).message);
    failures += 1;
  }
}

console.log(failures === 0 ? 'ALL CHANNELS OK' : failures + ' channel(s) FAILED');
process.exit(failures === 0 ? 0 : 1);