import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CURRENT_MEMORY_VERSION } from '../memory.types';
import type { ConversationMemory, Flow } from '../memory.types';

// ─── Mock functions ────────────────────────────────────────────────────────
// Lazy-delegation pattern: factory closures dereference at call time, not
// hoist time, sidestepping vitest's TDZ constraint on vi.mock factories.
const messageFindUniqueOrThrow = vi.fn();
const messageFindFirst = vi.fn();
const messageFindMany = vi.fn();
const messageUpdate = vi.fn();
const messageCreate = vi.fn();
const conversationUpdate = vi.fn();
const conversationFindUnique = vi.fn();
const agentConfigFindUnique = vi.fn();
const customerFindUniqueOrThrow = vi.fn();
const customerFindUnique = vi.fn();
const customerUpdate = vi.fn();
const suggestedIntentFindMany = vi.fn();
const whatsAppSessionFindUnique = vi.fn();
const productFindMany = vi.fn();
const productFindFirst = vi.fn();
const orderFindFirst = vi.fn();
const orderUpdate = vi.fn();
const orderCreate = vi.fn();
const wilayaDeliveryCostFindFirst = vi.fn();
const communeFindFirst = vi.fn();
const communeFindMany = vi.fn();
const notificationCreate = vi.fn();

vi.mock('../../../config/db.config', () => ({
  default: {
    message: {
      findUniqueOrThrow: (...a: unknown[]) => messageFindUniqueOrThrow(...a),
      findFirst: (...a: unknown[]) => messageFindFirst(...a),
      findMany: (...a: unknown[]) => messageFindMany(...a),
      update: (...a: unknown[]) => messageUpdate(...a),
      create: (...a: unknown[]) => messageCreate(...a),
    },
    conversation: {
      update: (...a: unknown[]) => conversationUpdate(...a),
      findUnique: (...a: unknown[]) => conversationFindUnique(...a),
    },
    agentConfig: {
      findUnique: (...a: unknown[]) => agentConfigFindUnique(...a),
    },
    customer: {
      findUniqueOrThrow: (...a: unknown[]) => customerFindUniqueOrThrow(...a),
      findUnique: (...a: unknown[]) => customerFindUnique(...a),
      update: (...a: unknown[]) => customerUpdate(...a),
    },
    suggestedIntent: {
      findMany: (...a: unknown[]) => suggestedIntentFindMany(...a),
    },
    whatsAppSession: {
      findUnique: (...a: unknown[]) => whatsAppSessionFindUnique(...a),
    },
    product: {
      findMany: (...a: unknown[]) => productFindMany(...a),
      findFirst: (...a: unknown[]) => productFindFirst(...a),
    },
    order: {
      findFirst: (...a: unknown[]) => orderFindFirst(...a),
      update: (...a: unknown[]) => orderUpdate(...a),
      create: (...a: unknown[]) => orderCreate(...a),
    },
    wilayaDeliveryCost: {
      findFirst: (...a: unknown[]) => wilayaDeliveryCostFindFirst(...a),
    },
    commune: {
      findFirst: (...a: unknown[]) => communeFindFirst(...a),
      findMany: (...a: unknown[]) => communeFindMany(...a),
    },
    notification: {
      create: (...a: unknown[]) => notificationCreate(...a),
    },
  },
}));

// ─── Mock search helpers (prevent tool-internal LLM calls from consuming mock) ─
const resolveProductRequest = vi.fn();

vi.mock('../tools/searchHelpers', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../tools/searchHelpers')>();
  return {
    ...orig,
    resolveProductRequest: (...a: unknown[]) => resolveProductRequest(...a),
  };
});

// ─── Mock LLM ──────────────────────────────────────────────────────────────
const callLLMMock = vi.fn();

vi.mock('../clients/llm.client', () => ({
  callLLM: (...a: unknown[]) => callLLMMock(...a),
}));

vi.mock('../clients/gemini.client', () => ({
  callLLM: (...a: unknown[]) => callLLMMock(...a),
}));

// ─── Mock WhatsApp ─────────────────────────────────────────────────────────
const sendMessagesSequentially = vi.fn();
const sendText = vi.fn();

vi.mock('../../whatsapp/whatsapp.service', () => ({
  openwaService: {
    sendMessagesSequentially: (...a: unknown[]) => sendMessagesSequentially(...a),
    sendText: (...a: unknown[]) => sendText(...a),
  },
}));

// ─── Mock queues ──────────────────────────────────────────────────────────
const enqueueLayer2Job = vi.fn();
const enqueueOrderJob = vi.fn();

vi.mock('../../../queues/layer2.queue', () => ({
  enqueueLayer2Job: (...a: unknown[]) => enqueueLayer2Job(...a),
}));

vi.mock('../../../queues/order.queue', () => ({
  enqueueOrderJob: (...a: unknown[]) => enqueueOrderJob(...a),
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────
const MERCHANT_ID = 'merchant-1';
const CUSTOMER_ID = 'customer-1';
const CONVERSATION_ID = 'conv-1';
const CUSTOMER_PHONE = '+213555000000';

const baseConversation = (state = 'IDLE', memory: unknown = null) => ({
  id: CONVERSATION_ID,
  merchantId: MERCHANT_ID,
  customerId: CUSTOMER_ID,
  state,
  memory,
  takenOverByHuman: false,
  escalatedAt: null,
});

const baseCustomer = () => ({
  id: CUSTOMER_ID,
  name: 'Ahmed',
  phone: CUSTOMER_PHONE,
  wilaya: 'Alger',
  commune: 'Bab Ezzouar',
});

const baseAgentConfig = () => ({
  merchantId: MERCHANT_ID,
  tone: 'friendly',
  defaultLanguage: 'auto',
  escalationThreshold: 3,
});

const baseMessage = (text: string, conversationState = 'IDLE', memory: unknown = null) => ({
  id: 'msg-1',
  conversationId: CONVERSATION_ID,
  direction: 'IN' as const,
  text,
  content: text,
  messageType: 'text',
  entities: {},
  intent: null,
  confidence: null,
  parsedIntents: null,
  toolResults: null,
  mediaUrls: [],
  createdAt: new Date().toISOString(),
  conversation: baseConversation(conversationState, memory),
});

function discoveryMemory(flowId: string, productName = 'shoes'): ConversationMemory {
  return {
    version: CURRENT_MEMORY_VERSION,
    globalInformation: {},
    activeFlow: flowId,
    flows: [
      {
        flowId,
        state: 'PRODUCT_DISCOVERY',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        productDiscovery: {
          input: { productName, filters: {} },
          toolResults: [],
        },
      },
    ],
  };
}

function selectedMemory(flowId: string, productName = 'shoes', productId = 'p1'): ConversationMemory {
  const disc = discoveryMemory(flowId, productName);
  return {
    ...disc,
    flows: [
      {
        ...disc.flows[0],
        state: 'PRODUCT_SELECTED' as const,
        currentProductId: productId,
      } as Flow,
    ],
  };
}

function pendingMemory(
  flowId: string,
  productName = 'shoes',
  productId = 'p1',
  orderId = 'order-1',
): ConversationMemory {
  const sel = selectedMemory(flowId, productName, productId);
  return {
    ...sel,
    flows: [
      {
        ...sel.flows[0],
        state: 'ORDER_PENDING' as const,
        order: { orderId, productId, quantity: 1 },
      } as Flow,
    ],
  };
}

function intentResponse(intents: Array<Record<string, unknown>>, conversationAct = 'NORMAL') {
  return JSON.stringify({ intents, conversationAct });
}

function replyResponse(messages: string[]) {
  return JSON.stringify({ messages });
}

function setupMocks(msg: ReturnType<typeof baseMessage>) {
  // Dynamic message mock: every call to findUniqueOrThrow returns the message
  // with the latest persisted memory. This simulates the DB round-trip where
  // processMessage writes memory via persistFlowMemory, then executeTools
  // re-reads it.
  let latestMemory: unknown = msg.conversation.memory;
  let latestState: string = msg.conversation.state;
  messageFindUniqueOrThrow.mockImplementation(async () => ({
    ...msg,
    conversation: { ...msg.conversation, memory: latestMemory, state: latestState },
  }));
  messageFindFirst.mockResolvedValue(null);
  messageFindMany.mockResolvedValue([]);
  messageUpdate.mockResolvedValue(undefined);
  messageCreate.mockResolvedValue({ id: 'reply-1' });
  conversationUpdate.mockImplementation(async (args: Record<string, unknown>) => {
    const data = args.data as Record<string, unknown>;
    if (data.memory !== undefined) latestMemory = data.memory;
    if (data.state !== undefined) latestState = data.state as string;
  });
  conversationFindUnique.mockResolvedValue(null);
  agentConfigFindUnique.mockResolvedValue(baseAgentConfig());
  customerFindUniqueOrThrow.mockResolvedValue(baseCustomer());
  customerFindUnique.mockResolvedValue(baseCustomer());
  customerUpdate.mockResolvedValue(undefined);
  suggestedIntentFindMany.mockResolvedValue([]);
  whatsAppSessionFindUnique.mockResolvedValue({
    merchantId: MERCHANT_ID,
    sessionId: 'session-1',
    status: 'connected',
  });
  productFindMany.mockResolvedValue([]);
  productFindFirst.mockResolvedValue(null);
  orderFindFirst.mockResolvedValue(null);
  orderUpdate.mockResolvedValue(undefined);
  orderCreate.mockResolvedValue({ id: 'order-new', status: 'PENDING' });
  wilayaDeliveryCostFindFirst.mockResolvedValue(null);
  communeFindFirst.mockResolvedValue(null);
  communeFindMany.mockResolvedValue([]);
  notificationCreate.mockResolvedValue(undefined);
  resolveProductRequest.mockResolvedValue({ outcome: 'NOT_FOUND', reason: 'no products' });
  sendMessagesSequentially.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);
  enqueueLayer2Job.mockResolvedValue(undefined);
  enqueueOrderJob.mockResolvedValue(undefined);
}

/** Get the last conversation.update that wrote a `memory` field (persistFlowMemory). */
function lastPersistedMemory() {
  const calls = conversationUpdate.mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0]?.data?.memory) {
      return calls[i][0].data.memory as ConversationMemory;
    }
  }
  return null;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('flow integration — end-to-end pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Fresh conversation: no existing flows → new discovery flow created
  it('creates a new discovery flow on first search', async () => {
    const { processMessage } = await import('../agent.service');

    setupMocks(baseMessage('I need shoes'));

    const intentJson = intentResponse([
      { intent: 'PRODUCT_SEARCH', entities: { productName: 'shoes' }, confidence: 0.9, order: 1 },
    ]);
    const replyJson = replyResponse(['Bien sûr ! Voici ce que j\'ai trouvé.']);

    callLLMMock.mockReset();
    callLLMMock.mockResolvedValueOnce(intentJson).mockResolvedValueOnce(replyJson);

    await processMessage('msg-1');

    const mem = lastPersistedMemory();
    expect(mem).not.toBeNull();
    expect(mem!.flows).toHaveLength(1);
    expect(mem!.flows[0].state).toBe('PRODUCT_DISCOVERY');
    expect(mem!.activeFlow).toBe(mem!.flows[0].flowId);
  });

   // 2. Product selection: discovery → PRODUCT_SELECTED via selectProduct
   it('transitions to PRODUCT_SELECTED on selectProduct', async () => {
    const { processMessage } = await import('../agent.service');

    const flowId = 'flow-sel';
     // Pre-populate flow with product results so selectProduct can resolve by index
    const memWithProducts = discoveryMemory(flowId);
    const discFlow = memWithProducts.flows[0] as Extract<Flow, { state: 'PRODUCT_DISCOVERY' }>;
    discFlow.productDiscovery.toolResults = [
      { productId: 'p1', productName: 'Shoes Pro', price: 5000, variants: [] },
    ];
    setupMocks(baseMessage('I\'ll take the first one', 'PRODUCT_DISCOVERY', memWithProducts));

    callLLMMock
      .mockResolvedValueOnce(
        intentResponse([
          { intent: 'PRODUCT_SELECT', entities: { productIndex: 0 }, confidence: 0.95, order: 1 },
        ]),
      )
      .mockResolvedValueOnce(replyResponse(['Parfait, je retiens la première option.']));

     // selectProduct queries the product by ID from the flow
    productFindFirst.mockResolvedValue({ id: 'p1', name: 'Shoes Pro', price: 5000, stockStatus: 'in_stock', description: 'Best shoes', currency: 'DZD' });

    await processMessage('msg-1');

    const mem = lastPersistedMemory();
    expect(mem).not.toBeNull();
    expect(mem!.flows).toHaveLength(1);
    expect(mem!.flows[0].state).toBe('PRODUCT_SELECTED');
  });

  // 3. Order creation: selected → ORDER_PENDING via createOrder
  it('transitions to ORDER_PENDING on createOrder', async () => {
    const { processMessage } = await import('../agent.service');

    const flowId = 'flow-ord';
    setupMocks(baseMessage('Order it for me', 'PRODUCT_SELECTED', selectedMemory(flowId)));

    callLLMMock
      .mockResolvedValueOnce(
        intentResponse([
          { intent: 'ORDER_CREATE', entities: { productId: 'p1', commune: 'Bab Ezzouar', quantity: 1 }, confidence: 0.9, order: 1 },
        ]),
      )
      .mockResolvedValueOnce(replyResponse(['Commande passée !']));

    // createOrder validates commune via DB
    communeFindFirst.mockResolvedValue({ name: 'Bab Ezzouar', wilaya: 'Alger' });
    // createOrder finds product by ID
    productFindFirst.mockResolvedValue({ id: 'p1', name: 'Shoes Pro', price: 5000, stockStatus: 'in_stock', currency: 'DZD' });
    // createOrder creates the order
    orderCreate.mockResolvedValue({ id: 'order-new', status: 'PENDING' });

    await processMessage('msg-1');

    const mem = lastPersistedMemory();
    expect(mem).not.toBeNull();
    expect(mem!.flows).toHaveLength(1);
    expect(mem!.flows[0].state).toBe('ORDER_PENDING');
    expect((mem!.flows[0] as Extract<Flow, { state: 'ORDER_PENDING' }>).order?.orderId).toBe('order-new');
  });

  it('reads delivery info from memory when order args omit them', async () => {
    const { processMessage } = await import('../agent.service');

    // Product selected; the customer's commune + wilaya are saved in memory's
    // globalInformation from a previous exchange. The order message only names
    // the product/quantity.
    const flowId = 'flow-ord';
    const memory = selectedMemory(flowId, 'Shoes Pro', 'p1');
    memory.globalInformation = { wilaya: 'Alger', commune: 'Bab Ezzouar' };
    setupMocks(baseMessage('Order 2 of them', 'PRODUCT_SELECTED', memory));

    callLLMMock
      .mockResolvedValueOnce(
        intentResponse([
          { intent: 'ORDER_CREATE', entities: { quantity: 2 }, confidence: 0.9, order: 1 },
        ]),
      )
      .mockResolvedValueOnce(replyResponse(['Commande passée !']));

    // createOrder reads conversation memory to resolve delivery info
    conversationFindUnique.mockResolvedValue({
      id: CONVERSATION_ID,
      merchantId: MERCHANT_ID,
      customerId: CUSTOMER_ID,
      memory,
    });

    // createOrder validates commune via DB (from memory, not args)
    communeFindFirst.mockResolvedValue({ name: 'Bab Ezzouar', wilaya: 'Alger' });
    // createOrder finds product by ID from the flow's currentProductId
    productFindFirst.mockResolvedValue({ id: 'p1', name: 'Shoes Pro', price: 5000, stockStatus: 'in_stock', currency: 'DZD' });
    // delivery cost for Alger
    wilayaDeliveryCostFindFirst.mockResolvedValue({ cost: 500 });
    orderCreate.mockResolvedValue({ id: 'order-new', status: 'PENDING' });

    await processMessage('msg-1');

    // Order created with delivery info pulled from memory and quantity from args
    const orderArgs = orderCreate.mock.calls[0]?.[0] as {
      data: { wilaya: string; commune: string; quantity: number };
    };
    expect(orderArgs.data.wilaya).toBe('Alger');
    expect(orderArgs.data.commune).toBe('Bab Ezzouar');
    expect(orderArgs.data.quantity).toBe(2);
    expect(orderCreate).toHaveBeenCalledTimes(1);
  });

  // 4. New search during active order: creates new flow, old flow stays
  it('creates new flow when searching during active order', async () => {
    const { processMessage } = await import('../agent.service');

    const oldFlowId = 'flow-old';
    const msg = baseMessage('Actually, show me jackets', 'WAITING_CONFIRMATION', pendingMemory(oldFlowId));
    setupMocks(msg);

    callLLMMock
      .mockResolvedValueOnce(
        intentResponse([
          { intent: 'PRODUCT_SEARCH', entities: { productName: 'jackets' }, confidence: 0.9, order: 1 },
        ]),
      )
      .mockResolvedValueOnce(replyResponse(['Bien sûr, voici nos vestes !']));

    await processMessage('msg-1');

    const mem = lastPersistedMemory();
    expect(mem).not.toBeNull();
    expect(mem!.flows).toHaveLength(2);
    expect(mem!.activeFlow).not.toBe(oldFlowId);

    const active = mem!.flows.find((f) => f.flowId === mem!.activeFlow);
    expect(active).toBeDefined();
    expect(active!.state).toBe('PRODUCT_DISCOVERY');
  });

  // 5. Order confirmation: pending → ORDER_CONFIRMED via confirmOrder
  it('transitions to ORDER_CONFIRMED on confirmOrder', async () => {
    const { processMessage } = await import('../agent.service');

    const flowId = 'flow-confirm';
    const orderId = 'order-c1';
    setupMocks(baseMessage('Yes, confirm', 'WAITING_CONFIRMATION', pendingMemory(flowId, 'shoes', 'p1', orderId)));

    callLLMMock
      .mockResolvedValueOnce(
        intentResponse([
          { intent: 'ORDER_CONFIRM', entities: { orderId }, confidence: 0.95, order: 1 },
        ]),
      )
      .mockResolvedValueOnce(replyResponse(['Commande confirmée ! Merci.']));

    // confirmOrder updates the order status
    orderUpdate.mockResolvedValue({ id: orderId, status: 'CONFIRMED', productName: 'Shoes Pro' });

    await processMessage('msg-1');

    const mem = lastPersistedMemory();
    expect(mem).not.toBeNull();
    expect(mem!.flows).toHaveLength(1);
    expect(mem!.flows[0].state).toBe('ORDER_CONFIRMED');
  });

  // 6. Invalid action: intent incompatible with flow state → intent stays unresolved
  it('handles invalid action when intent does not match flow state', async () => {
    const { processMessage } = await import('../agent.service');

    // Flow is in PRODUCT_DISCOVERY — ORDER_CONFIRM is not valid here
    const flowId = 'flow-inv';
    setupMocks(baseMessage('Confirm my order', 'PRODUCT_DISCOVERY', discoveryMemory(flowId)));

    callLLMMock
      .mockResolvedValueOnce(
        intentResponse([
          { intent: 'ORDER_CONFIRM', entities: {}, confidence: 0.6, order: 1 },
        ]),
      )
      .mockResolvedValueOnce(replyResponse(['Je n\'ai pas de commande en cours. Vous souhaitez rechercher un produit ?']));

    await processMessage('msg-1');

    const mem = lastPersistedMemory();
    expect(mem).not.toBeNull();
    // Flow state should NOT have changed — invalid action doesn't advance state
    expect(mem!.flows[0].state).toBe('PRODUCT_DISCOVERY');
  });

  // 7. Flow switching: starts new flow, old flow remains but inactive
  it('switches to new flow while preserving old flow', async () => {
    const { processMessage } = await import('../agent.service');

    const oldFlowId = 'flow-old';
    const msg = baseMessage('I want to search for jackets instead', 'PRODUCT_DISCOVERY', discoveryMemory(oldFlowId, 'shoes'));
    setupMocks(msg);

    callLLMMock
      .mockResolvedValueOnce(
        intentResponse([
          { intent: 'PRODUCT_SEARCH', entities: { productName: 'jackets' }, confidence: 0.9, order: 1 },
        ]),
      )
      .mockResolvedValueOnce(replyResponse(['Voici nos vestes.']));

    await processMessage('msg-1');

    const mem = lastPersistedMemory();
    expect(mem).not.toBeNull();
    expect(mem!.flows).toHaveLength(2);
    expect(mem!.activeFlow).not.toBe(oldFlowId);

    const newFlow = mem!.flows.find((f) => f.flowId === mem!.activeFlow)!;
    expect(newFlow.state).toBe('PRODUCT_DISCOVERY');
  });

  // 8. Backward-compat migration: old memory shape → migrated to v1
  it('migrates old memory shape to v1 with flows', async () => {
    const { processMessage } = await import('../agent.service');

    // Old memory shape (no version, no flows)
    const oldMemory = {
      entities: { wilaya: 'Alger' },
      recentIntents: ['PRODUCT_SEARCH:ANSWER'],
    };

    setupMocks(baseMessage('I need shoes', 'IDLE', oldMemory));

    callLLMMock
      .mockResolvedValueOnce(
        intentResponse([
          { intent: 'PRODUCT_SEARCH', entities: { productName: 'shoes' }, confidence: 0.9, order: 1 },
        ]),
      )
      .mockResolvedValueOnce(replyResponse(['Bien sûr !']));

    await processMessage('msg-1');

    const mem = lastPersistedMemory();
    expect(mem).not.toBeNull();
    expect(mem!.version).toBe(CURRENT_MEMORY_VERSION);
    expect(mem!.flows).toHaveLength(1);
    expect(mem!.flows[0].state).toBe('PRODUCT_DISCOVERY');
    expect(mem!.activeFlow).toBe(mem!.flows[0].flowId);
  });
});
