import { memo, useContext } from 'react';
import { Handle, Position } from '@xyflow/react';
import { nodeMeta } from '../flow/catalog.js';
import { BuilderContext } from '../BuilderContext.js';

const STATUS_LABEL = {
  running: 'Running…',
  success: 'Success',
  failed: 'Error Found',
  skipped: 'Skipped',
};

function FlowNode({ id, data, selected }) {
  const { runState, validationErrors, openConfig, deleteNode } = useContext(BuilderContext);
  const meta = nodeMeta(data.kind);
  const status = runState[id]?.status;
  const invalid = validationErrors.some((e) => e.nodeId === id);
  const isSystem = data.kind === 'trigger' || data.kind === 'response';

  return (
    <div
      className={`flow-node kind-${data.kind} ${selected ? 'is-selected' : ''} ${status ? `status-${status}` : ''} ${invalid ? 'is-invalid' : ''}`}
      data-node-kind={data.kind}
      onDoubleClick={() => openConfig(id)}
    >
      {data.kind !== 'trigger' && <Handle type="target" position={Position.Top} id="top" />}

      <div className="node-toolbar" data-node-toolbar>
        <button type="button" className="nodrag" aria-label={`Configure ${data.label}`} data-node-menu-item="open-node-config" onClick={() => openConfig(id)}>⚙</button>
        {!isSystem && (
          <button type="button" className="nodrag" aria-label={`Delete ${data.label}`} data-node-menu-item="delete" onClick={() => deleteNode(id)}>✕</button>
        )}
      </div>

      <div className="node-head">
        <span className="node-icon" aria-hidden="true">{meta?.icon}</span>
        <span className="node-category">{meta?.category}</span>
        {status && (
          <span className={`node-status status-${status}`} data-testid={`node-status-${id}`} data-status={status}>
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>
      <div className="node-label">{data.label}</div>
      {invalid && <div className="node-invalid" data-testid={`node-invalid-${id}`}>Needs attention</div>}

      {data.kind !== 'response' && <Handle type="source" position={Position.Bottom} id="bottom" />}
    </div>
  );
}

export default memo(FlowNode);
