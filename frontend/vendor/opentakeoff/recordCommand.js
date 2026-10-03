// Extracted unchanged from OpenTakeoff web/src/lib/shapeCommands.js.
const UNDO_CAP = 100;
export function recordCommand(undo, entry, cap = UNDO_CAP) {
  const next = [...undo, entry];
  return { undo: next.length > cap ? next.slice(next.length - cap) : next, redo: [] };
}
