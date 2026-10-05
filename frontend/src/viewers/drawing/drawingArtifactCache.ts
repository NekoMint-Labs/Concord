import {
  DRAWING_ENGINE,
  DRAWING_RENDER_OPTIONS,
  DRAWING_CACHE_BYTES,
  drawingSheetBytes,
} from "./drawingArtifactTypes";
import type { DrawingArtifact } from "./drawingArtifactTypes";
const entries = new Map<string, { artifact: DrawingArtifact; bytes: number }>();
let retainedBytes = 0;
let generation = 0;
export function drawingArtifactCacheGeneration() {
  return generation;
}
export function drawingArtifactKey(sourceHash: string) {
  return JSON.stringify([sourceHash, DRAWING_ENGINE, DRAWING_RENDER_OPTIONS]);
}
export function cachedDrawingArtifact(
  key: string,
): DrawingArtifact | undefined {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  entries.set(key, entry);
  return structuredClone(entry.artifact);
}
export function cacheDrawingArtifact(key: string, artifact: DrawingArtifact) {
  const bytes = artifact.sheets.reduce(
    (sum, sheet) => sum + drawingSheetBytes(sheet),
    0,
  );
  if (bytes > DRAWING_CACHE_BYTES)
    throw new Error("Drawing artifacts exceed the 32 MiB cache limit");
  if (
    artifact.engine !== DRAWING_ENGINE ||
    drawingArtifactKey(artifact.sourceHash) !== key
  )
    throw new Error("Drawing artifact cache identity mismatch");
  const previous = entries.get(key);
  if (previous) retainedBytes -= previous.bytes;
  entries.delete(key);
  entries.set(key, { artifact: structuredClone(artifact), bytes });
  retainedBytes += bytes;
  while (retainedBytes > DRAWING_CACHE_BYTES || entries.size > 4) {
    const oldest = entries.keys().next().value!;
    retainedBytes -= entries.get(oldest)!.bytes;
    entries.delete(oldest);
  }
}
export function clearDrawingArtifactCache() {
  ++generation;
  entries.clear();
  retainedBytes = 0;
}
