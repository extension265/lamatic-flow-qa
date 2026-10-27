export default function RunPanel({ nodes, triggerInput, setTriggerInput, running, summary, validationErrors, runState }) {
  const labelOf = (id) => nodes.find((n) => n.id === id)?.data.label || id;
  return (
    <section className="run-panel" aria-label="Run panel">
      <div className="run-input">
        <label htmlFor="trigger-input">Chat message</label>
        <input id="trigger-input" data-testid="trigger-input" value={triggerInput} onChange={(e) => setTriggerInput(e.target.value)} />
      </div>

      {validationErrors.length > 0 && (
        <div className="validation" role="alert" data-testid="validation-errors">
          <strong>Fix before running:</strong>
          <ul>{validationErrors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
        </div>
      )}

      <div className="run-status" data-testid="run-status" data-status={running ? 'running' : summary?.status || 'idle'} aria-live="polite">
        {running ? 'Running…' : summary ? (summary.status === 'success' ? 'Run succeeded' : 'Run failed') : 'Not run yet'}
        {summary && !running && <span className="muted"> · {summary.durationMs} ms · {summary.tokens} tokens</span>}
      </div>

      {Object.keys(runState).length > 0 && (
        <ol className="run-log" data-testid="run-log">
          {Object.entries(runState).map(([id, s]) => (
            <li key={id} data-node-id={id} data-status={s.status}>
              <span className={`dot status-${s.status}`} aria-hidden="true" /> {labelOf(id)} — {s.status}
              {s.latencyMs != null && <span className="muted"> ({s.latencyMs} ms)</span>}
              {s.error && <div className="err">{s.error}</div>}
            </li>
          ))}
        </ol>
      )}

      {summary?.status === 'success' && (
        <div className="final-output">
          <strong>Response</strong>
          <pre data-testid="final-output">{typeof summary.output === 'string' ? summary.output : JSON.stringify(summary.output, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}
