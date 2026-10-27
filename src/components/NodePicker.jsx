import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, NODE_CATALOG } from '../flow/catalog.js';

export default function NodePicker({ onPick, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const entries = Object.entries(NODE_CATALOG).filter(([, m]) => !q || m.label.toLowerCase().includes(q));

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" role="dialog" aria-label="Insert step" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="picker-search"
          placeholder="Search nodes…"
          aria-label="Search nodes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {entries.length === 0 && <p className="picker-empty" data-testid="picker-empty">No nodes match “{query}”</p>}
        {CATEGORIES.map((cat) => {
          const items = entries.filter(([, m]) => m.category === cat);
          if (!items.length) return null;
          return (
            <section key={cat} aria-label={cat}>
              <h3 className="picker-cat">{cat}</h3>
              {items.map(([kind, m]) => (
                <button key={kind} type="button" className="picker-item" data-testid={`picker-item-${kind}`} onClick={() => onPick(kind)}>
                  <span aria-hidden="true">{m.icon}</span> {m.label}
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
