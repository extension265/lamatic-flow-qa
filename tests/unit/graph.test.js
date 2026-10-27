// Fast unit gate for the pure graph rules (runs in < 1s with `node --test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionError, insertBetween, topoOrder, validateFlow, wouldCreateCycle } from '../../src/flow/graph.js';
import { redactPII } from '../../src/flow/executor.js';
import { readDraggedKind, writeDraggedKind } from '../../src/flow/dnd.js';

const n = (id, kind, config = {}) => ({ id, data: { kind, label: id, config } });
const e = (source, target) => ({ id: `${source}-${target}`, source, target });

const nodes = [n('t', 'trigger'), n('a', 'code'), n('b', 'code'), n('r', 'response')];
const chain = [e('t', 'a'), e('a', 'b'), e('b', 'r')];

test('cycle detection', () => {
  assert.equal(wouldCreateCycle(chain, 'b', 'a'), true);
  assert.equal(wouldCreateCycle(chain, 'a', 'a'), true);
  assert.equal(wouldCreateCycle(chain, 't', 'b'), false);
});

test('connection rules', () => {
  assert.equal(connectionError(nodes, chain, { source: 'r', target: 'a' }), 'Response node cannot be a source');
  assert.equal(connectionError(nodes, chain, { source: 'a', target: 't' }), 'Trigger node cannot be a target');
  assert.equal(connectionError(nodes, chain, { source: 't', target: 'a' }), 'Connection already exists');
  assert.equal(connectionError(nodes, chain, { source: 'b', target: 'a' }), 'Connection would create a cycle');
  assert.equal(connectionError(nodes, chain, { source: 't', target: 'b' }), null);
});

test('insertBetween splits one edge into two', () => {
  const out = insertBetween(chain, chain[1], 'x');
  assert.deepEqual(out.map((x) => x.id).sort(), ['a-x', 'b-r', 't-a', 'x-b']);
});

test('topological order and cycle error', () => {
  assert.deepEqual(topoOrder(nodes, chain), ['t', 'a', 'b', 'r']);
  assert.throws(() => topoOrder(nodes, [...chain, e('b', 'a')]), /cycle/);
});

test('validation finds orphans and empty prompts', () => {
  const ns = [...nodes, n('orphan', 'code'), n('llm', 'generateText', { userPrompt: ' ' })];
  const errs = validateFlow(ns, [...chain, e('a', 'llm')]).map((x) => x.nodeId);
  assert.deepEqual(errs.sort(), ['llm', 'orphan']);
});

// Small golden dataset for the PII guard.
const PII_CASES = [
  ['mail me at a.b@c.io', 'mail me at [redacted-email]'],
  ['UPPER@EXAMPLE.COM ok', '[redacted-email] ok'],
  ['call +91 98765 43210', 'call [redacted-phone]'],
  ['call 020-7946-0958 now', 'call [redacted-phone] now'],
  ['order #12345 shipped', 'order #12345 shipped'], // short numbers are not phones
  ['no pii here', 'no pii here'],
];
for (const [input, expected] of PII_CASES) {
  test(`redactPII: ${input}`, () => assert.equal(redactPII(input), expected));
}

// Palette drag payload. WebKit drops custom MIME types between dragstart and drop,
// so the kind must also be readable from the prefixed text/plain copy.
const fakeTransfer = (data) => ({ getData: (t) => data[t] ?? '', setData: (t, v) => { data[t] = v; } });

test('drag payload round-trips, and falls back to text/plain when the custom type is lost', () => {
  const data = {};
  writeDraggedKind(fakeTransfer(data), 'condition');
  assert.equal(readDraggedKind(fakeTransfer(data)), 'condition');
  assert.equal(readDraggedKind(fakeTransfer({ 'text/plain': data['text/plain'] })), 'condition');
});

test('drag payload ignores ordinary text and unknown kinds', () => {
  assert.equal(readDraggedKind(fakeTransfer({ 'text/plain': 'code' })), null);
  assert.equal(readDraggedKind(fakeTransfer({ 'text/plain': 'lamatic-node:trigger' })), null);
  assert.equal(readDraggedKind(fakeTransfer({ 'text/plain': 'lamatic-node:constructor' })), null);
});
