import { CATEGORIES, NODE_CATALOG } from '../flow/catalog.js';
import { writeDraggedKind } from '../flow/dnd.js';

export default function Sidebar() {
  const onDragStart = (e, kind) => {
    writeDraggedKind(e.dataTransfer, kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="sidebar" aria-label="Node palette">
      <h2>Nodes</h2>
      <p className="hint">Drag onto the canvas, or hover an edge and click +</p>
      {CATEGORIES.map((cat) => (
        <div key={cat} className="palette-group">
          <h3>{cat}</h3>
          <div role="list" aria-label={`${cat} nodes`}>
          {Object.entries(NODE_CATALOG)
            .filter(([, m]) => m.category === cat)
            .map(([kind, m]) => (
              <div
                key={kind}
                className="palette-item"
                draggable
                role="listitem"
                data-testid={`palette-${kind}`}
                onDragStart={(e) => onDragStart(e, kind)}
              >
                <span aria-hidden="true">{m.icon}</span> {m.label}
              </div>
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}
