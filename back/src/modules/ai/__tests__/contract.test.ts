import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  TOOL_NAMES,
  TOOL_DESCRIPTIONS,
  TOOL_DESCRIPTIONS_BY_NAME,
  type ToolArgType,
  type ToolDescriptor,
  type ToolName,
} from '@ecomassistant/contracts';
import {
  ReadToolNameSchema,
  WriteToolNameSchema,
  toolSchemas,
  LEGACY_ONLY_TOOL_NAMES,
} from '../schemas/intents.schemas';
import { TOOL_META, INJECTED_ARG_NAMES } from '../tools/toolMeta';

const INJECTED = new Set<string>(INJECTED_ARG_NAMES);

// ─── Schema introspection (independent reimplementation of the generator) ──

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
      throw new Error(`unsupported zod type: ${inner._def.typeName}`);
  }
}

function isSchemaRequired(type: z.ZodTypeAny): boolean {
  return !(type._def.typeName === 'ZodOptional' || type._def.typeName === 'ZodDefault');
}

function publicSchemaKeys(name: ToolName): string[] {
  return objectSchemaKeys(name).filter((key) => !INJECTED.has(key));
}

function objectSchemaKeys(name: ToolName): string[] {
  return Object.keys(objectShape(toolSchemas[name]));
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('contracts package vs backend registry', () => {
  it('contracts surface ≡ registry minus legacy-only tools', () => {
    const contracted: string[] = [...TOOL_NAMES];
    const legacy: string[] = [...LEGACY_ONLY_TOOL_NAMES];

    // No legacy tool may masquerade as agent-facing.
    const overlap = contracted.filter((t) => legacy.includes(t));
    assert.deepEqual(overlap, [], 'legacy-only tools must not appear in contracts TOOL_NAMES');

    const registered: string[] = [...ReadToolNameSchema.options, ...WriteToolNameSchema.options];
    // Every contracted tool is registered...
    const missingFromRegistry = contracted.filter((t) => !registered.includes(t));
    assert.deepEqual(missingFromRegistry, [], 'contracts tools missing from the backend registry');
    // ...and every registered tool is either contracted or explicitly legacy-only.
    const unclassified = registered.filter((t) => !contracted.includes(t) && !legacy.includes(t));
    assert.deepEqual(unclassified, [], 'registered tools must be contracted or legacy-only, not both/neither');

    assert.deepEqual(Object.keys(toolSchemas).sort(), registered.sort(), 'toolSchemas keys must match the registry enums');
  });

  it('generated tools.json covers TOOL_NAMES exactly, in canonical order', () => {
    assert.deepEqual(TOOL_DESCRIPTIONS.map((d) => d.name), [...TOOL_NAMES]);
  });

  it('no transport-injected key leaks into the agent-facing contract', () => {
    const leaked = TOOL_DESCRIPTIONS.flatMap((d) =>
      d.args.filter((a) => INJECTED.has(a.name)).map((a) => `${d.name}.${a.name}`)
    );
    assert.deepEqual(leaked, []);
  });
});

describe('generated tools.json matches the zod schemas', () => {
  it('every configured arg belongs to the contract type union', () => {
    const known = new Set<string>(['string', 'integer', 'number', 'boolean', 'string[]']);
    const bad = TOOL_DESCRIPTIONS.flatMap((d) =>
      d.args.filter((a) => !known.has(a.type)).map((a) => `${d.name}.${a.name}:${a.type}`)
    );
    assert.deepEqual(bad, []);
  });

  it('recomputed descriptors from toolSchemas + TOOL_META equal tools.json', () => {
    const recomputed: ToolDescriptor[] = TOOL_NAMES.map((name) => {
      const schema = toolSchemas[name];
      const meta = TOOL_META[name];
      const shape = objectShape(schema);
      const args = Object.entries(shape)
        .filter(([key]) => !INJECTED.has(key))
        .map(([key, field]) => ({
          name: key,
          type: zodToType(field),
          required: isSchemaRequired(field),
          description: meta.args[key].description,
        }));
      return { name, description: meta.description, args };
    });

    assert.deepEqual(recomputed, TOOL_DESCRIPTIONS);
  });

  it('TOOL_META describes exactly the public schema keys of each tool', () => {
    for (const name of TOOL_NAMES) {
      const publicKeys = publicSchemaKeys(name);
      assert.deepEqual(Object.keys(TOOL_META[name].args).sort(), publicKeys.sort(), `TOOL_META[:${name}]`);
    }
  });

  it('every tool and arg has a non-empty description', () => {
    for (const descriptor of TOOL_DESCRIPTIONS) {
      assert.ok(descriptor.description.trim().length > 0, `${descriptor.name} description`);
      for (const arg of descriptor.args) {
        assert.ok(arg.description.trim().length > 0, `${descriptor.name}.${arg.name} description`);
      }
    }
  });

  it('each descriptor resolves in TOOL_DESCRIPTIONS_BY_NAME', () => {
    for (const name of TOOL_NAMES) {
      assert.equal(TOOL_DESCRIPTIONS_BY_NAME.get(name)?.name, name);
    }
  });
});