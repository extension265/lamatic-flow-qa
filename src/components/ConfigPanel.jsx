import { useEffect, useState } from 'react';

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'claude-sonnet', 'gemini-flash'];
const LONG_FIELDS = ['systemPrompt', 'userPrompt', 'code', 'schema'];
const FIELD_LABELS = {
  model: 'Model', systemPrompt: 'System prompt', userPrompt: 'User prompt', schema: 'Output schema (JSON)',
  index: 'Index', topK: 'Top K', expression: 'Expression', code: 'Code', ms: 'Wait (ms)',
  channel: 'Channel', url: 'URL', method: 'Method', redactPII: 'Redact PII in response',
};

export default function ConfigPanel({ node, runResult, onChange, onRename, onClose }) {
  const [tab, setTab] = useState('config');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!node) return null;
  const config = node.data.config || {};
  const fieldId = (k) => `cfg-${node.id}-${k}`;

  return (
    <aside className="config-panel" role="dialog" aria-label={`Configure ${node.data.label}`}>
      <header className="config-head">
        <input
          className="config-title"
          aria-label="Node name"
          value={node.data.label}
          onChange={(e) => onRename(e.target.value)}
        />
        <span className="config-id">{node.id}</span>
        <button type="button" aria-label="Close configuration" onClick={onClose}>✕</button>
      </header>

      <div role="tablist" className="tabs">
        {['config', 'raw'].map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'config' ? 'Config' : 'Raw Output'}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <div role="tabpanel" aria-label="Config" className="config-body">
          {Object.keys(config).length === 0 && <p className="muted">This node has no settings.</p>}
          {Object.entries(config).map(([key, value]) => (
            <div className="field" key={key}>
              <label htmlFor={fieldId(key)}>{FIELD_LABELS[key] || key}</label>
              {key === 'model' ? (
                <select id={fieldId(key)} value={value} onChange={(e) => onChange(key, e.target.value)}>
                  {MODELS.map((m) => <option key={m}>{m}</option>)}
                </select>
              ) : typeof value === 'boolean' ? (
                <input id={fieldId(key)} type="checkbox" checked={value} onChange={(e) => onChange(key, e.target.checked)} />
              ) : LONG_FIELDS.includes(key) ? (
                <textarea id={fieldId(key)} rows={4} value={value} onChange={(e) => onChange(key, e.target.value)} />
              ) : (
                <input id={fieldId(key)} value={value} onChange={(e) => onChange(key, typeof value === 'number' ? Number(e.target.value) : e.target.value)} />
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'raw' && (
        <div role="tabpanel" aria-label="Raw Output" className="config-body">
          {runResult ? (
            <pre data-testid="raw-output">{JSON.stringify({ status: runResult.status, output: runResult.output ?? null, error: runResult.error, tokens: runResult.tokens, latencyMs: runResult.latencyMs }, null, 2)}</pre>
          ) : (
            <p className="muted">Run the flow to see output.</p>
          )}
        </div>
      )}
    </aside>
  );
}
