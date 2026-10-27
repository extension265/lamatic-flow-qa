import { useContext } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { BuilderContext } from '../BuilderContext.js';

// Edge with a hover-revealed "+" button, same pattern as Lamatic Studio
// (button#edge-plus-<edgeId>, aria-label "Insert step here", opacity 0 until hover).
export default function InsertableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }) {
  const { openPicker } = useContext(BuilderContext);
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="edge-plus-zone nodrag nopan"
          data-testid={`edge-plus-zone-${id}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <button
            id={`edge-plus-${id}`}
            type="button"
            className="edge-plus"
            aria-label="Insert step here"
            aria-haspopup="dialog"
            onClick={(e) => { e.stopPropagation(); openPicker(id); }}
          >
            +
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
