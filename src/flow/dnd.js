// Palette → canvas drag payload.
//
// The node kind travels under a custom MIME type AND as prefixed text/plain.
// Some engines only carry the standard pasteboard types through a drag: in
// Playwright's WebKit build, data set under a custom type in dragstart is gone
// by drop time (getData returns ''), while text/plain survives. The prefix keeps
// ordinary dragged text (e.g. a selected word "code") from creating a node.
import { NODE_CATALOG } from './catalog.js';

export const DND_MIME = 'application/x-lamatic-node';
export const DND_TEXT_PREFIX = 'lamatic-node:';

/** @param {Pick<DataTransfer, 'setData'>} dt @param {string} kind */
export function writeDraggedKind(dt, kind) {
  dt.setData(DND_MIME, kind);
  dt.setData('text/plain', DND_TEXT_PREFIX + kind);
}

/** @param {Pick<DataTransfer, 'getData'>} dt @returns {string | null} a known node kind, or null */
export function readDraggedKind(dt) {
  const text = dt.getData('text/plain') || '';
  const kind = dt.getData(DND_MIME) || (text.startsWith(DND_TEXT_PREFIX) ? text.slice(DND_TEXT_PREFIX.length) : '');
  return Object.hasOwn(NODE_CATALOG, kind) ? kind : null;
}
