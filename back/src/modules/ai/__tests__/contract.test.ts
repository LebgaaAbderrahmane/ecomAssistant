import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_NAMES, TOOL_DESCRIPTIONS } from '@ecomassistant/contracts';
import { ReadToolNameSchema, WriteToolNameSchema } from '../schemas/intents.schemas';

const registryNameDeclarations = [
  ...ReadToolNameSchema.options,
  ...WriteToolNameSchema.options,
];

const descriptionNames = TOOL_DESCRIPTIONS.map((d) => d.name);

describe('contracts package vs backend registry', () => {
  it('every registry tool is declared in contracts (registry ⊆ contracts)', () => {
    const missing = registryNameDeclarations.filter((name) => !TOOL_NAMES.includes(name));
    assert.deepEqual(missing, [], 'registry tools missing from contracts TOOL_NAMES');
  });

  it('TOOL_DESCRIPTIONS cover TOOL_NAMES exactly', () => {
    assert.deepEqual(descriptionNames, TOOL_NAMES as unknown as typeof descriptionNames);
  });

  it('every descriptor arg is a known type', () => {
    const known = new Set(['string', 'integer', 'number', 'boolean', 'string[]']);
    const bad = TOOL_DESCRIPTIONS.flatMap((d) =>
      d.args.filter((a) => !known.has(a.type)).map((a) => `${d.name}.${a.name}:${a.type}`)
    );
    assert.deepEqual(bad, []);
  });
});