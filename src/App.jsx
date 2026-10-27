import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, MarkerType,
  useNodesState, useEdgesState, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';

import FlowNode from './components/FlowNode.jsx';
import InsertableEdge from './components/InsertableEdge.jsx';
import NodePicker from './components/NodePicker.jsx';
import Sidebar from './components/Sidebar.jsx';
import ConfigPanel from './components/ConfigPanel.jsx';
import RunPanel from './components/RunPanel.jsx';
import { BuilderContext } from './BuilderContext.js';
import { nodeMeta } from './flow/catalog.js';
import { connectionError, edgeId, insertBetween, layoutChain, validateFlow } from './flow/graph.js';
import { runFlow } from './flow/executor.js';
import { readDraggedKind } from './flow/dnd.js';

const STORAGE_KEY = 'lamatic-flow-qa:flow:v1';
const nodeTypes = { step: FlowNode };
const edgeTypes = { insertable: InsertableEdge };
const defaultEdgeOptions = { type: 'insertable', markerEnd: { type: MarkerType.ArrowClosed } };
const FIT_VIEW_OPTIONS = { padding: 0.3, maxZoom: 1.1 };

const makeNode = (id, kind, position) => {
  const meta = nodeMeta(kind);
  const isSystem = kind === 'trigger' || kind === 'response';
  return {
    id, type: 'step', position,
    deletable: !isSystem,
    data: { kind, label: meta.label, config: structuredClone(meta.defaults || {}) },
  };
};

export const defaultFlow = () => {
  const nodes = [
    makeNode('trigger', 'trigger', { x: 250, y: 40 }),
    makeNode('generateText_1', 'generateText', { x: 250, y: 170 }),
    makeNode('response', 'response', { x: 250, y: 300 }),
  ];
  const edges = [
    { id: edgeId('trigger', 'generateText_1'), source: 'trigger', target: 'generateText_1', type: 'insertable' },
    { id: edgeId('generateText_1', 'response'), source: 'generateText_1', target: 'response', type: 'insertable' },
  ];
  return { nodes, edges };
};

function loadFlow() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        return { nodes: parsed.nodes.map((n) => ({ ...n, type: 'step', deletable: !['trigger', 'response'].includes(n.data.kind) })), edges: parsed.edges };
      }
    }
  } catch { /* corrupt storage → fall back to default */ }
  return defaultFlow();
}

const serialize = (nodes, edges) => ({
  version: 1,
  nodes: nodes.map(({ id, position, data }) => ({ id, position: { x: Math.round(position.x), y: Math.round(position.y) }, data })),
  edges: edges.map(({ id, source, target }) => ({ id, source, target })),
});

function Builder() {
  const initial = useMemo(loadFlow, []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [pickerEdge, setPickerEdge] = useState(null);
  const [configNodeId, setConfigNodeId] = useState(null);
  const [toast, setToast] = useState(null);
  const [runState, setRunState] = useState({});
  const [summary, setSummary] = useState(null);
  const [running, setRunning] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [triggerInput, setTriggerInput] = useState('What is Lamatic?');
  const { screenToFlowPosition, fitView, getViewport, setViewport } = useReactFlow();
  const canvasRef = useRef(null);

  // ---- undo / redo -------------------------------------------------------
  const past = useRef([]);
  const future = useRef([]);
  const latest = useRef({ nodes, edges });
  latest.current = { nodes, edges };
  const snapshot = useCallback(() => {
    past.current.push(structuredClone(serialize(latest.current.nodes, latest.current.edges)));
    if (past.current.length > 50) past.current.shift();
    future.current = [];
  }, []);
  const restore = (snap) => {
    const loaded = snap.nodes.map((n) => ({ ...n, type: 'step', deletable: !['trigger', 'response'].includes(n.data.kind) }));
    setNodes(loaded);
    setEdges(snap.edges.map((e) => ({ ...e, type: 'insertable' })));
  };
  const undo = useCallback(() => {
    const snap = past.current.pop();
    if (!snap) return;
    future.current.push(serialize(latest.current.nodes, latest.current.edges));
    restore(snap);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const redo = useCallback(() => {
    const snap = future.current.pop();
    if (!snap) return;
    past.current.push(serialize(latest.current.nodes, latest.current.edges));
    restore(snap);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ---- persistence + test hook -------------------------------------------
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(nodes, edges))); } catch { /* storage unavailable */ }
  }, [nodes, edges]);

  // Clear stale validation only when the graph or a node's config really changes.
  // (Not on selection/dimension changes — the error badge itself resizes the node.)
  const graphSignature = useMemo(
    () => JSON.stringify([nodes.map((n) => [n.id, n.data]), edges.map((e) => e.id)]),
    [nodes, edges],
  );
  useEffect(() => { setValidationErrors([]); }, [graphSignature]);

  useEffect(() => {
    // Read-only hook so tests can assert on the real graph, not just pixels.
    window.__flowApi = { getFlow: () => serialize(latest.current.nodes, latest.current.edges) };
  }, []);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => setToast(null), 3000);
  };

  const nextId = (kind) => {
    const used = latest.current.nodes.map((n) => n.id).filter((id) => id.startsWith(`${kind}_`)).map((id) => Number(id.split('_').pop()) || 0);
    return `${kind}_${Math.max(0, ...used) + 1}`;
  };

  // ---- canvas interactions -----------------------------------------------
  const onConnect = useCallback((conn) => {
    const reason = connectionError(latest.current.nodes, latest.current.edges, conn);
    if (reason) { showToast(reason); return; }
    snapshot();
    setEdges((eds) => [...eds, { id: edgeId(conn.source, conn.target), source: conn.source, target: conn.target, type: 'insertable' }]);
  }, [snapshot, setEdges]);

  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const kind = readDraggedKind(e.dataTransfer);
    if (!kind) return;
    snapshot();
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setNodes((nds) => [...nds, makeNode(nextId(kind), kind, { x: position.x - 110, y: position.y - 30 })]);
  }, [screenToFlowPosition, snapshot, setNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPick = (kind) => {
    const edge = latest.current.edges.find((e) => e.id === pickerEdge);
    setPickerEdge(null);
    if (!edge) return;
    snapshot();
    const id = nextId(kind);
    const newEdges = insertBetween(latest.current.edges, edge, id);
    const newNodes = layoutChain([...latest.current.nodes, makeNode(id, kind, { x: 0, y: 0 })], newEdges);
    setEdges(newEdges);
    setNodes(newNodes);
    // Each insert pushes the chain 130px further down. Re-fit so the new node and the
    // next edge's "+" stay on the canvas instead of sliding under the run panel.
    // (React Flow queues this until the new node has been measured.)
    fitView(FIT_VIEW_OPTIONS);
  };

  const deleteNode = useCallback((id) => {
    const node = latest.current.nodes.find((n) => n.id === id);
    if (!node || node.deletable === false) return;
    snapshot();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setConfigNodeId((cur) => (cur === id ? null : cur));
  }, [snapshot, setNodes, setEdges]);

  // Opening the config panel narrows the canvas. If that leaves the node being
  // configured under the panel (narrow windows), pan so it is centred again.
  // Reading DOM rects here forces layout with the panel already in place.
  useEffect(() => {
    const canvasEl = canvasRef.current;
    const nodeEl = configNodeId && canvasEl?.querySelector(`.react-flow__node[data-id="${CSS.escape(configNodeId)}"]`);
    if (!nodeEl) return;
    const c = canvasEl.getBoundingClientRect();
    const n = nodeEl.getBoundingClientRect();
    if (n.left >= c.left && n.right <= c.right && n.top >= c.top && n.bottom <= c.bottom) return;
    const { x, y, zoom } = getViewport();
    setViewport({
      x: x + (c.left + c.width / 2) - (n.left + n.width / 2),
      y: y + (c.top + c.height / 2) - (n.top + n.height / 2),
      zoom,
    });
  }, [configNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateConfig = (key, value) => setNodes((nds) => nds.map((n) => (n.id === configNodeId ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } } : n)));
  const rename = (label) => setNodes((nds) => nds.map((n) => (n.id === configNodeId ? { ...n, data: { ...n.data, label } } : n)));

  // ---- run ---------------------------------------------------------------
  const run = async () => {
    const errors = validateFlow(latest.current.nodes, latest.current.edges);
    if (errors.length) { setValidationErrors(errors); setSummary(null); setRunState({}); return; }
    setRunning(true);
    setRunState({});
    setSummary(null);
    try {
      const result = await runFlow(latest.current.nodes, latest.current.edges, {
        triggerInput,
        onUpdate: (id, state) => setRunState((prev) => ({ ...prev, [id]: state })),
      });
      setSummary(result);
    } catch (err) {
      setSummary({ status: 'failed', durationMs: 0, tokens: 0, error: err.message });
      showToast(err.message);
    } finally {
      setRunning(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(serialize(nodes, edges), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'flow.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const resetFlow = () => {
    snapshot();
    const d = defaultFlow();
    setNodes(d.nodes);
    setEdges(d.edges);
    setRunState({});
    setSummary(null);
    setTimeout(() => fitView({ padding: 0.3 }), 0);
  };

  const ctx = useMemo(() => ({
    runState, validationErrors, deleteNode,
    openConfig: (id) => setConfigNodeId(id),
    openPicker: (id) => setPickerEdge(id),
  }), [runState, validationErrors, deleteNode]);

  const configNode = nodes.find((n) => n.id === configNodeId);

  return (
    <BuilderContext.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <div className="brand"><span className="logo" aria-hidden="true">◆</span> Flow Builder <span className="tag">QA demo</span></div>
          <div className="actions">
            <button type="button" onClick={undo} aria-label="Undo">↶</button>
            <button type="button" onClick={redo} aria-label="Redo">↷</button>
            <button type="button" onClick={resetFlow}>Reset</button>
            <button type="button" onClick={exportJson}>Export JSON</button>
            <a className="btn-link" href="./report/index.html" target="_blank" rel="noreferrer">Test report</a>
            <button type="button" className="primary" onClick={run} disabled={running} data-testid="run-flow">
              {running ? 'Running…' : '▶ Test flow'}
            </button>
          </div>
        </header>

        <div className="workspace">
          <Sidebar />
          <main className="canvas" ref={canvasRef} onDrop={onDrop} onDragOver={onDragOver} aria-label="Flow canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onBeforeDelete={async () => { snapshot(); return true; }}
              onNodeDragStart={snapshot}
              onNodeClick={(_, n) => setConfigNodeId(n.id)}
              deleteKeyCode={['Backspace', 'Delete']}
              fitView
              fitViewOptions={FIT_VIEW_OPTIONS}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable ariaLabel="Flow minimap" />
            </ReactFlow>
            {toast && <div className="toast" role="status" data-testid="toast">{toast}</div>}
          </main>
          {configNode && (
            <ConfigPanel
              key={configNode.id}
              node={configNode}
              runResult={runState[configNode.id]}
              onChange={updateConfig}
              onRename={rename}
              onClose={() => setConfigNodeId(null)}
            />
          )}
        </div>

        <RunPanel
          nodes={nodes}
          triggerInput={triggerInput}
          setTriggerInput={setTriggerInput}
          running={running}
          summary={summary}
          validationErrors={validationErrors}
          runState={runState}
        />

        {pickerEdge && <NodePicker onPick={onPick} onClose={() => setPickerEdge(null)} />}
      </div>
    </BuilderContext.Provider>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Builder />
    </ReactFlowProvider>
  );
}
