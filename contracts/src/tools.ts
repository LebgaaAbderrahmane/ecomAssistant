import generatedTools from './generated/tools.json';

export const TOOL_NAMES = [
  'searchProducts',
  'selectProduct',
  'getProductDetails',
  'suggestProducts',
  'calculateShipping',
  'getOrderStatus',
  'createOrder',
  'confirmOrder',
  'modifyOrder',
  'cancelOrder',
  'escalateConversation',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type ToolOutcome = 'SUCCESS' | 'NOT_FOUND' | 'AMBIGUOUS';

export type ToolArgType = 'string' | 'integer' | 'number' | 'boolean' | 'string[]';

export interface ToolArg {
  name: string;
  type: ToolArgType;
  required: boolean;
  description: string;
}

export interface ToolDescriptor {
  name: ToolName;
  description: string;
  args: readonly ToolArg[];
}

// Generated artifacts are the authoritative, machine-readable contract. The
// backend produces contracts/src/generated/tools.json from its tool schemas +
// descriptions (back/scripts/export-contract.ts); the contract test in `back`
// fails if it drifts from the registry. Use TOOL_DESCRIPTIONS (not a hand-
// edited copy) as the source of truth.
const GENERATED = generatedTools as unknown as { version: number; tools: ToolDescriptor[] };

export const TOOL_DESCRIPTIONS: readonly ToolDescriptor[] = GENERATED.tools;

export const TOOL_DESCRIPTIONS_BY_NAME: ReadonlyMap<ToolName, ToolDescriptor> =
  new Map(TOOL_DESCRIPTIONS.map((descriptor) => [descriptor.name, descriptor]));