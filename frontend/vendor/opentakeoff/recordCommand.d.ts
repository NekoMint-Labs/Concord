export function recordCommand<T>(
  undo: T[],
  entry: T,
  cap?: number,
): { undo: T[]; redo: T[] };
