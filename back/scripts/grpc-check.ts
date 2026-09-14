import { loadSync } from '@grpc/proto-loader';
import * as grpc from '@grpc/grpc-js';
import { join } from 'node:path';
import { config } from '../src/config/index.js';
import prisma from '../src/config/db.config.js';
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

const PROCESS_MSG_REQUEST = {
  messageId: 'grpc-check-no-such-message',
  conversationId: 'grpc-check',
  merchantId: 'grpc-check',
  customerId: 'grpc-check',
};

function authInterceptor(authorization: string): grpc.Interceptor {
  const metadata = new grpc.Metadata();
  metadata.set('authorization', authorization);
  return (options, nextCall) => {
    return new grpc.InterceptingCall(nextCall(options), {
      start(metadataSource, listener, next) {
        const merged = metadataSource ?? new grpc.Metadata();
        merged.merge(metadata);
        next(merged, listener);
      },
    });
  };
}

async function checkProcessMessageRoundTrip(): Promise<boolean> {
  const client = createAgentClient();
  try {
    const response = await withTimeout(
      agentProcessMessage(client, PROCESS_MSG_REQUEST),
      5000,
      'back -> agent ProcessMessage'
    );
    return response.decision === 'DECISION_REPLY' && response.text === FALLBACK_REPLY;
  } finally {
    closeAgentClient(client);
  }
}

async function checkWrongKeyRejected(): Promise<boolean> {
  const client = createAgentClient({ interceptors: [authInterceptor('Bearer wrong-key')] });
  try {
    await withTimeout(agentProcessMessage(client, PROCESS_MSG_REQUEST), 5000, 'wrong key');
    return false;
  } catch (err) {
    return (err as grpc.ServiceError).code === grpc.status.UNAUTHENTICATED;
  } finally {
    closeAgentClient(client);
  }
}

async function checkMalformedMessageId(): Promise<boolean> {
  const client = createAgentClient();
  try {
    await withTimeout(
      agentProcessMessage(client, { ...PROCESS_MSG_REQUEST, messageId: '' }),
      5000,
      'empty message_id'
    );
    return false;
  } catch (err) {
    return (err as grpc.ServiceError).code === grpc.status.NOT_FOUND;
  } finally {
    closeAgentClient(client);
  }
}

async function checkToolService(): Promise<boolean> {
  const client = createToolServiceClient([authInterceptor('Bearer ' + config.internalApiKey)]);
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

function createToolServiceClient(interceptors: grpc.Interceptor[] = []): any {
  const definition = loadSync(join(PROTO_ROOT, 'tools/v1/tool.proto'), loaderOptions);
  const proto = grpc.loadPackageDefinition(definition) as Record<string, any>;
  const ToolService = proto.ecomassistant.tools.v1.ToolService;
  return new ToolService(clientTarget(config.toolsGrpcAddr), grpc.credentials.createInsecure(), {
    interceptors,
  });
}

function toolCall<T = any>(client: any, request: unknown, timeoutMs: number, label: string): Promise<T> {
  return withTimeout(
    new Promise<T>((resolve, reject) =>
      client.ExecuteTool(request, (err: grpc.ServiceError | null, response?: T) =>
        err ? reject(err) : resolve(response!)
      )
    ),
    timeoutMs,
    label
  );
}

function parseDataJson(dataJson?: string): Record<string, any> {
  if (!dataJson) return {};
  try {
    return JSON.parse(dataJson);
  } catch {
    return {};
  }
}

async function checkToolServiceMatrix(): Promise<boolean> {
  const auth = [authInterceptor('Bearer ' + config.internalApiKey)];
  const client = createToolServiceClient(auth);

  const merchantEmail = `grpc-check-${Date.now()}@example.com`;
  const ids = { merchantId: '', customerId: '', conversationId: '', productId: '', deliveryCostId: '', orderId: '' };
  const results: Array<[string, boolean]> = [];

  const authExec = (toolName: string, entitiesJson: string, identity: Record<string, string>) => ({
    toolName,
    entitiesJson,
    identity,
  });

  // No-auth ExecuteTool must be rejected before touching the database.
  {
    const bare = createToolServiceClient();
    try {
      await toolCall(bare, authExec('searchProducts', '{}', { conversationId: 'x' }), 5000, 'ExecuteTool no auth');
      results.push(['ExecuteTool no auth rejected', false]);
    } catch (err) {
      results.push(['ExecuteTool no auth rejected', (err as grpc.ServiceError).code === grpc.status.PERMISSION_DENIED]);
    } finally {
      bare.close();
    }
  }

  // Authorized calls that fail validation without any DB rows.
  {
    try {
      await toolCall(client, authExec('nope', '{}', { conversationId: 'x' }), 5000, 'ExecuteTool unknown tool');
      results.push(['ExecuteTool unknown tool rejected', false]);
    } catch (err) {
      results.push(['ExecuteTool unknown tool rejected', (err as grpc.ServiceError).code === grpc.status.INVALID_ARGUMENT]);
    }
    try {
      await toolCall(client, authExec('recallPreviousProducts', '{}', { conversationId: 'x' }), 5000, 'ExecuteTool legacy tool');
      results.push(['ExecuteTool legacy-only tool rejected', false]);
    } catch (err) {
      results.push(['ExecuteTool legacy-only tool rejected', (err as grpc.ServiceError).code === grpc.status.INVALID_ARGUMENT]);
    }
    try {
      await toolCall(client, authExec('searchProducts', '{}', {}), 5000, 'ExecuteTool missing conversation id');
      results.push(['ExecuteTool missing conversation_id rejected', false]);
    } catch (err) {
      results.push(['ExecuteTool missing conversation_id rejected', (err as grpc.ServiceError).code === grpc.status.INVALID_ARGUMENT]);
    }
    try {
      await toolCall(client, authExec('searchProducts', '{}', { conversationId: 'grpc-check-no-such' }), 5000, 'ExecuteTool unknown conversation');
      results.push(['ExecuteTool unknown conversation rejected', false]);
    } catch (err) {
      results.push(['ExecuteTool unknown conversation rejected', (err as grpc.ServiceError).code === grpc.status.NOT_FOUND]);
    }
  }

  // searchProducts via the server against a real conversation.
  try {
    const merchant = await prisma.merchant.create({
      data: { email: merchantEmail, name: 'grpc-check', shopName: 'grpc-check shop' },
    });
    ids.merchantId = merchant.id;
    const customer = await prisma.customer.create({
      data: { merchantId: merchant.id, phone: '0550-grpc-check' },
    });
    ids.customerId = customer.id;
    const conversation = await prisma.conversation.create({
      data: { merchantId: merchant.id, customerId: customer.id },
    });
    ids.conversationId = conversation.id;

    const identity = {
      conversationId: ids.conversationId,
      merchantId: ids.merchantId,
      customerId: ids.customerId,
    };

    // A concrete name absent from an EMPTY catalog is authoritatively NOT_FOUND
    // with no LLM call — deterministic, fast, no matcher flakiness.
    {
      const r = await toolCall<any>(
        client,
        authExec('searchProducts', JSON.stringify({ product: 'no-such-product-grpc-check' }), identity),
        8000,
        'searchProducts unknown (empty catalog)'
      );
      const data = parseDataJson(r?.dataJson);
      results.push([
        'searchProducts unknown -> NOT_FOUND',
        r?.success === false &&
          r?.outcome === 'OUTCOME_NOT_FOUND' &&
          r?.error !== '' &&
          data.query === 'no-such-product-grpc-check',
      ]);
    }

    const product = await prisma.product.create({
      data: {
        merchantId: merchant.id,
        platformProductId: 'grpc-check-1',
        name: 'GrpcCheckCamouflage',
        price: 1500,
        images: [],
        variants: [],
      },
    });
    ids.productId = product.id;

    {
      const r = await toolCall<any>(
        client,
        authExec('searchProducts', JSON.stringify({ product: 'GrpcCheckCamouflage' }), identity),
        8000,
        'searchProducts fixture'
      );
      const data = parseDataJson(r?.dataJson);
      results.push([
        'searchProducts -> fixture product',
        r?.success === true &&
          r?.outcome === 'OUTCOME_SUCCESS' &&
          r?.error === '' &&
          Array.isArray(data.products) &&
          data.products.some((p: any) => p.id === ids.productId),
      ]);
    }

    // selectProduct: pick the fixture product by name → success.
    {
      const r = await toolCall<any>(
        client,
        authExec('selectProduct', JSON.stringify({ productName: 'GrpcCheckCamouflage' }), identity),
        8000,
        'selectProduct fixture'
      );
      const data = parseDataJson(r?.dataJson);
      results.push([
        'selectProduct -> fixture product',
        r?.success === true &&
          r?.outcome === 'OUTCOME_SUCCESS' &&
          r?.error === '' &&
          data.productId === ids.productId &&
          data.productName === 'GrpcCheckCamouflage',
      ]);
    }

    // selectProduct: non-existent product name → NOT_FOUND. Runs after the
    // fixture select (which set currentProductId) to prove an explicit name
    // beats the injected "current product" fallback.
    {
      const r = await toolCall<any>(
        client,
        authExec('selectProduct', JSON.stringify({ productName: 'no-such-product-grpc-check' }), identity),
        8000,
        'selectProduct unknown'
      );
      results.push([
        'selectProduct unknown -> NOT_FOUND',
        r?.success === false && r?.outcome === 'OUTCOME_NOT_FOUND' && r?.error !== '',
      ]);
    }

    const deliveryCost = await prisma.wilayaDeliveryCost.create({
      data: { merchantId: merchant.id, wilaya: 'Alger', wilayaCode: 16, cost: 600 },
    });
    ids.deliveryCostId = deliveryCost.id;

    // calculateShipping: explicit wilaya → SUCCESS with the configured cost.
    {
      const r = await toolCall<any>(
        client,
        authExec('calculateShipping', JSON.stringify({ wilaya: 'alger' }), identity),
        8000,
        'calculateShipping fixture'
      );
      const data = parseDataJson(r?.dataJson);
      results.push([
        'calculateShipping -> fixture wilaya',
        r?.success === true &&
          r?.outcome === 'OUTCOME_SUCCESS' &&
          r?.error === '' &&
          data.cost === 600 &&
          data.wilaya === 'Alger',
      ]);
    }

    // calculateShipping: unknown wilaya → NOT_FOUND (no delivery cost configured).
    {
      const r = await toolCall<any>(
        client,
        authExec('calculateShipping', JSON.stringify({ wilaya: 'Mars' }), identity),
        8000,
        'calculateShipping unknown wilaya'
      );
      results.push([
        'calculateShipping unknown wilaya -> NOT_FOUND',
        r?.success === false && r?.outcome === 'OUTCOME_NOT_FOUND' && r?.error !== '',
      ]);
    }

    // getOrderStatus: explicit order id → SUCCESS with status + tracking.
    const order = await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId: customer.id,
        platformOrderId: 'grpc-check-1',
        wilaya: 'Alger',
        commune: 'Alger Centre',
        productId: product.id,
        productName: 'GrpcCheckCamouflage',
        quantity: 1,
        totalAmount: 2100,
        deliveryCost: 600,
        status: 'SHIPPED',
        trackingNumber: 'TRK-GRPC-1',
      },
    });
    ids.orderId = order.id;

    {
      const r = await toolCall<any>(
        client,
        authExec('getOrderStatus', JSON.stringify({ orderId: order.id }), identity),
        8000,
        'getOrderStatus fixture'
      );
      const data = parseDataJson(r?.dataJson);
      results.push([
        'getOrderStatus -> fixture order',
        r?.success === true &&
          r?.outcome === 'OUTCOME_SUCCESS' &&
          r?.error === '' &&
          data.orderId === order.id &&
          data.status === 'SHIPPED' &&
          data.trackingNumber === 'TRK-GRPC-1',
      ]);
    }

    // getOrderStatus: unknown order id → NOT_FOUND.
    {
      const r = await toolCall<any>(
        client,
        authExec('getOrderStatus', JSON.stringify({ orderId: 'grpc-check-no-such-order' }), identity),
        8000,
        'getOrderStatus unknown order'
      );
      results.push([
        'getOrderStatus unknown order -> NOT_FOUND',
        r?.success === false && r?.outcome === 'OUTCOME_NOT_FOUND' && r?.error !== '',
      ]);
    }
  } finally {
    if (ids.orderId) await prisma.order.delete({ where: { id: ids.orderId } }).catch(() => undefined);
    if (ids.deliveryCostId) await prisma.wilayaDeliveryCost.delete({ where: { id: ids.deliveryCostId } }).catch(() => undefined);
    if (ids.productId) await prisma.product.delete({ where: { id: ids.productId } }).catch(() => undefined);
    if (ids.conversationId) await prisma.conversation.delete({ where: { id: ids.conversationId } }).catch(() => undefined);
    if (ids.customerId || ids.merchantId) {
      // Customer rows are deleted via the merchant cascade only after other
      // dependent rows (order, delivery cost) are gone.
      if (ids.customerId) await prisma.customer.delete({ where: { id: ids.customerId } }).catch(() => undefined);
    }
    if (ids.merchantId) await prisma.merchant.delete({ where: { id: ids.merchantId } }).catch(() => undefined);
    client.close();
  }

  const allOk = results.every(([, ok]) => ok);
  if (!allOk) {
    for (const [label, ok] of results) {
      if (!ok) console.log('    FAIL  ' + label);
    }
  }
  return allOk;
}

const checks: Array<[string, () => Promise<boolean>]> = [
  ['back -> agent  (AgentService.Health                @ ' + config.agentGrpcAddr + ')', checkBackToAgent],
  ['back -> agent  (AgentService.ProcessMessage happy path   @ ' + config.agentGrpcAddr + ')', checkProcessMessageRoundTrip],
  ['back -> agent  (AgentService.ProcessMessage wrong key    @ ' + config.agentGrpcAddr + ')', checkWrongKeyRejected],
  ['back -> agent  (AgentService.ProcessMessage empty msg id @ ' + config.agentGrpcAddr + ')', checkMalformedMessageId],
  ['agent -> back (ToolService.Health                @ ' + config.toolsGrpcAddr + ')', checkToolService],
  ['agent -> back (ToolService.ExecuteTool matrix    @ ' + config.toolsGrpcAddr + ')', checkToolServiceMatrix],
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