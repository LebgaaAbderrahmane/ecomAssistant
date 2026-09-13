// Generates contracts/src/generated/tools.json from the backend's tool schemas
// (back/src/modules/ai/schemas/intents.schemas.ts) + tool descriptions
// (back/src/modules/ai/tools/toolMeta.ts).
//
//   contracts/src/generated/tools.json  ←  toolSchemas (arg names/types/
//                                         requiredness) + TOOL_META (wording)
//
// Run from the repo root (or anywhere):  node --run ... see README note.
//   docker compose exec -T back sh -c 'cd /app/back && ./node_modules/.bin/tsx scripts/export-contract.ts'
//
// The JSON is COMMITTED. Regenerate it whenever a tool schema changes. The
// contract test (back/src/modules/ai/__tests__/contract.test.ts) fails if the
// committed tools.json drifts from the registry/schemas.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { toolSchemas } from '../src/modules/ai/schemas/intents.schemas';
import { TOOL_META, INJECTED_ARG_NAMES } from '../src/modules/ai/tools/toolMeta';
import { TOOL_NAMES, type ToolArgType } from '@ecomassistant/contracts';

const BACK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(BACK_ROOT, '../contracts/src/generated/tools.json');

const INJECTED = new Set<string>(INJECTED_ARG_NAMES);

function objectShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  let current: z.ZodTypeAny = schema;
  while (current._def.typeName === 'ZodEffects') {
    current = current._def.schema as z.ZodTypeAny;
  }
  if (current._def.typeName !== 'ZodObject') {
    throw new Error(`expected a ZodObject, got ${current._def.typeName}`);
  }
  return (current as z.ZodObject<z.ZodRawShape>).shape;
}

function unwrap(type: z.ZodTypeAny): z.ZodTypeAny {
  let current = type;
  for (;;) {
    if (current._def.typeName === 'ZodOptional' || current._def.typeName === 'ZodNullable' || current._def.typeName === 'ZodDefault') {
      current = current._def.innerType;
    } else if (current._def.typeName === 'ZodEffects') {
      current = current._def.schema as z.ZodTypeAny;
    } else {
      return current;
    }
  }
}

function zodToType(type: z.ZodTypeAny): ToolArgType {
  const inner = unwrap(type);
  switch (inner._def.typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodArray':
      return 'string[]';
    case 'ZodNumber': {
      const checks = (inner._def as { checks?: Array<{ kind: string }> }).checks ?? [];
      return checks.some((c) => c.kind === 'int') ? 'integer' : 'number';
    }
    default:
      throw new Error(`unsupported zod type for contract: ${inner._def.typeName}`);
  }
}

function isSchemaRequired(type: z.ZodTypeAny): boolean {
  return !(type._def.typeName === 'ZodOptional' || type._def.typeName === 'ZodDefault');
}

const tools = TOOL_NAMES.map((name) => {
  const schema = toolSchemas[name];
  if (!schema) throw new Error(`no schema registered for tool "${name}"`);
  const meta = TOOL_META[name];
  const shape = objectShape(schema);

  const args = Object.entries(shape)
    .filter(([key]) => !INJECTED.has(key))
    .map(([key, field]) => {
      const argMeta = meta.args[key];
      if (!argMeta) {
        throw new Error(`TOOL_META missing description for "${name}.${key}"`);
      }
      return {
        name: key,
        type: zodToType(field),
        required: isSchemaRequired(field),
        description: argMeta.description,
      };
    });

  // Every TOOL_META arg must exist as a public schema key (no stray metadata).
  for (const key of Object.keys(meta.args)) {
    if (!(key in shape)) throw new Error(`TOOL_META arg "${name}.${key}" is not in the schema`);
    if (INJECTED.has(key)) throw new Error(`TOOL_META marks injected key "${name}.${key}" as a described arg`);
  }

  return { name, description: meta.description, args };
});

const json = JSON.stringify(
  {
    version: 1,
    generatedFrom: '@ecomassistant/back toolSchemas + TOOL_META',
    tools,
  },
  null,
  2,
);

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, `${json}\n`, 'utf8');
console.log(`wrote ${OUT_FILE} (${tools.length} tools)`);