// Pure graph logic. No React here, so it is unit-tested directly (tests/unit).

export const edgeId = (source, target) => `${source}-${target}`;

/** Would adding source -> target create a cycle? (Is source reachable from target?) */
export function wouldCreateCycle(edges, source, target) {
  if (source === target) return true;
  const out = adjacency(edges);
  const stack = [target];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    (out.get(cur) || []).forEach((n) => stack.push(n));
  }
  return false;
}

/** Returns a reason string when the connection is not allowed, else null. */
export function connectionError(nodes, edges, { source, target }) {
  const src = nodes.find((n) => n.id === source);
  const tgt = nodes.find((n) => n.id === target);
  if (!src || !tgt) return 'Unknown node';
  if (source === target) return 'A node cannot connect to itself';
  if (src.data.kind === 'response') return 'Response node cannot be a source';
  if (tgt.data.kind === 'trigger') return 'Trigger node cannot be a target';
  if (edges.some((e) => e.source === source && e.target === target)) return 'Connection already exists';
  if (wouldCreateCycle(edges, source, target)) return 'Connection would create a cycle';
  return null;
}

/** Insert newNode on edge source->target: source->new->target. */
export function insertBetween(edges, edge, newNodeId) {
  const rest = edges.filter((e) => e.id !== edge.id);
  return [
    ...rest,
    { id: edgeId(edge.source, newNodeId), source: edge.source, target: newNodeId, type: 'insertable' },
    { id: edgeId(newNodeId, edge.target), source: newNodeId, target: edge.target, type: 'insertable' },
  ];
}

/** Kahn topological order starting from roots. Throws on cycle. */
export function topoOrder(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => indeg.set(e.target, (indeg.get(e.target) || 0) + 1));
  const out = adjacency(edges);
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    (out.get(id) || []).forEach((t) => {
      indeg.set(t, indeg.get(t) - 1);
      if (indeg.get(t) === 0) queue.push(t);
    });
  }
  if (order.length !== nodes.length) throw new Error('Flow contains a cycle');
  return order;
}

export function reachableFrom(edges, startId) {
  const out = adjacency(edges);
  const seen = new Set([startId]);
  const stack = [startId];
  while (stack.length) {
    (out.get(stack.pop()) || []).forEach((n) => {
      if (!seen.has(n)) { seen.add(n); stack.push(n); }
    });
  }
  return seen;
}

/** Validation run before executing a flow. Returns [{nodeId, message}]. */
export function validateFlow(nodes, edges) {
  const errors = [];
  const trigger = nodes.find((n) => n.data.kind === 'trigger');
  const response = nodes.find((n) => n.data.kind === 'response');
  if (!trigger) errors.push({ nodeId: null, message: 'Flow needs a trigger' });
  if (!response) errors.push({ nodeId: null, message: 'Flow needs a response' });
  if (!trigger || !response) return errors;

  const reach = reachableFrom(edges, trigger.id);
  nodes.forEach((n) => {
    if (!reach.has(n.id)) errors.push({ nodeId: n.id, message: `"${n.data.label}" is not connected to the trigger` });
  });
  nodes.forEach((n) => {
    if (['generateText', 'generateJSON'].includes(n.data.kind) && !String(n.data.config?.userPrompt || '').trim()) {
      errors.push({ nodeId: n.id, message: `"${n.data.label}" has an empty prompt` });
    }
  });
  return errors;
}

/** Simple top-down layout for the main chain (like Lamatic's vertical auto-layout). */
export function layoutChain(nodes, edges, { x = 250, startY = 40, gap = 130 } = {}) {
  let order;
  try { order = topoOrder(nodes, edges); } catch { return nodes; }
  const trigger = nodes.find((n) => n.data.kind === 'trigger');
  const reach = trigger ? reachableFrom(edges, trigger.id) : new Set();
  let y = startY;
  const pos = new Map();
  order.filter((id) => reach.has(id)).forEach((id) => { pos.set(id, { x, y }); y += gap; });
  return nodes.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id) } : n));
}

function adjacency(edges) {
  const out = new Map();
  edges.forEach((e) => {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source).push(e.target);
  });
  return out;
}
