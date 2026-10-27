import { topoOrder } from './graph.js';
import { simulateNode } from './simulator.js';

// Every node execution goes through POST api/execute.
// The static demo has no backend, so a 404 / network error falls back to the
// in-browser simulator. Playwright intercepts this same endpoint with page.route()
// to make runs deterministic (success, failure, latency, malformed AI output).
const ENDPOINT = 'api/execute';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s-]{8,}\d/g;
export const redactPII = (text) => String(text).replace(EMAIL_RE, '[redacted-email]').replace(PHONE_RE, '[redacted-phone]');

async function callBackend(node, input) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeId: node.id, kind: node.data.kind, config: node.data.config, input }),
    });
    // No backend deployed (static hosting returns 404/405 or the SPA's HTML) → simulator.
    const isJson = (res.headers.get('content-type') || '').includes('json');
    if (res.status === 404 || res.status === 405 || (res.ok && !isJson)) return simulateNode(node, input);
    const body = await res.json().catch(() => ({ status: 'failed', error: 'Malformed response from executor' }));
    if (!res.ok && body.status !== 'failed') return { status: 'failed', error: `Executor returned HTTP ${res.status}` };
    return body;
  } catch {
    // A real network failure must surface as an error, never be silently simulated.
    return { status: 'failed', error: 'Network error while calling executor' };
  }
}

/** Post-processing guardrails applied to node output, independent of the backend. */
function applyGuards(node, result, allNodes) {
  if (result.status !== 'success') return result;
  if (node.data.kind === 'generateJSON') {
    try {
      const parsed = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
      const schema = JSON.parse(node.data.config?.schema || '{}');
      const missing = Object.keys(schema).filter((k) => !(k in parsed));
      if (missing.length) return { ...result, status: 'failed', error: `Output missing required keys: ${missing.join(', ')}` };
      return { ...result, output: parsed };
    } catch {
      return { ...result, status: 'failed', error: 'Model returned invalid JSON' };
    }
  }
  if (node.data.kind === 'response') {
    const out = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
    // Prompt-injection guard: never return an AI node's system prompt to the end user.
    const leaked = allNodes.some((n) => {
      const sp = String(n.data.config?.systemPrompt || '').trim();
      return sp.length >= 12 && out.toLowerCase().includes(sp.toLowerCase());
    });
    if (leaked) return { status: 'failed', error: 'Blocked: response would leak a system prompt' };
    if (node.data.config?.redactPII !== false) return { ...result, output: redactPII(out) };
  }
  return result;
}

/**
 * Runs the flow in topological order. Stops at the first failure and marks
 * everything downstream as "skipped". onUpdate(nodeId, state) drives the UI.
 */
export async function runFlow(nodes, edges, { triggerInput, onUpdate, timeoutMs = 15000 }) {
  const order = topoOrder(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outputs = new Map();
  const results = [];
  let failed = false;
  const started = performance.now();

  for (const id of order) {
    const node = byId.get(id);
    if (failed) {
      onUpdate(id, { status: 'skipped' });
      results.push({ nodeId: id, status: 'skipped' });
      continue;
    }
    const parents = edges.filter((e) => e.target === id).map((e) => outputs.get(e.source));
    const input = node.data.kind === 'trigger' ? triggerInput : parents.length === 1 ? parents[0] : parents;

    onUpdate(id, { status: 'running' });
    const t0 = performance.now();
    let result;
    if (node.data.kind === 'trigger') {
      result = { status: 'success', output: triggerInput };
    } else {
      result = await Promise.race([
        callBackend(node, input),
        new Promise((r) => setTimeout(() => r({ status: 'failed', error: `Timed out after ${timeoutMs}ms` }), timeoutMs)),
      ]);
      result = applyGuards(node, result, nodes);
    }
    const latencyMs = Math.round(performance.now() - t0);
    const state = { ...result, latencyMs, input };
    onUpdate(id, state);
    results.push({ nodeId: id, ...state });
    outputs.set(id, result.output);
    if (result.status !== 'success') failed = true;
  }

  const response = nodes.find((n) => n.data.kind === 'response');
  return {
    status: failed ? 'failed' : 'success',
    durationMs: Math.round(performance.now() - started),
    tokens: results.reduce((s, r) => s + (r.tokens || 0), 0),
    output: failed ? null : outputs.get(response?.id),
    results,
  };
}
