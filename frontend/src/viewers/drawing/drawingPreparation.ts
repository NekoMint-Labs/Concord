import { snapshotDrawingSource, sha256 } from "./pdfDiffValidation";
import {
  drawingArtifactKey,
  cachedDrawingArtifact,
  cacheDrawingArtifact,
  drawingArtifactCacheGeneration,
} from "./drawingArtifactCache";
import { produceDrawingArtifact } from "./produceDrawingArtifact";
import type { DrawingArtifact } from "./drawingArtifactTypes";
import type { DrawingSource } from "./pdfDiffTypes";
type Progress = (page: number, total: number) => void;
interface Preparation {
  generation: number;
  abort: AbortController;
  promise: Promise<DrawingArtifact>;
  users: number;
  listeners: Set<{ notify: Progress }>;
  timer: ReturnType<typeof setTimeout>;
}
const pending = new Map<string, Preparation>();
function assertGeneration(generation: number) {
  if (generation !== drawingArtifactCacheGeneration())
    throw new Error("Drawing preparation invalidated by cache reset");
}
function start(
  key: string,
  source: DrawingSource,
  generation: number,
): Preparation {
  for (const [oldKey, entry] of pending) {
    if (entry.generation !== generation) {
      pending.delete(oldKey);
      clearTimeout(entry.timer);
      entry.abort.abort(
        new Error("Drawing preparation invalidated by cache reset"),
      );
    }
  }
  if (pending.size >= 2)
    throw new Error("Drawing preparation capacity is exhausted");
  const abort = new AbortController();
  const listeners = new Set<{ notify: Progress }>();
  const timer = setTimeout(
    () => abort.abort(new Error("Drawing preparation timed out")),
    120000,
  );
  const entry: Preparation = {
    generation,
    abort,
    timer,
    listeners,
    users: 0,
    promise: produceDrawingArtifact(source, abort.signal, (page, total) => {
      if (
        !abort.signal.aborted &&
        generation === drawingArtifactCacheGeneration()
      )
        for (const listener of listeners) listener.notify(page, total);
    })
      .then((artifact) => {
        assertGeneration(generation);
        abort.signal.throwIfAborted();
        cacheDrawingArtifact(key, artifact);
        return artifact;
      })
      .finally(() => {
        clearTimeout(timer);
        if (pending.get(key) === entry) pending.delete(key);
      }),
  };
  pending.set(key, entry);
  return entry;
}
function subscribe(
  entry: Preparation,
  key: string,
  signal: AbortSignal,
  progress?: Progress,
): Promise<DrawingArtifact> {
  return new Promise((resolve, reject) => {
    let ended = false;
    const listener = progress ? { notify: progress } : undefined;
    entry.users++;
    if (listener) entry.listeners.add(listener);
    const finish = (
      result: { error: unknown } | { artifact: DrawingArtifact },
    ) => {
      if (ended) return;
      if ("artifact" in result) {
        try {
          assertGeneration(entry.generation);
        } catch (error) {
          result = { error };
        }
      }
      ended = true;
      signal.removeEventListener("abort", cancelled);
      if (listener) entry.listeners.delete(listener);
      entry.users--;
      if (!entry.users && pending.get(key) === entry) {
        pending.delete(key);
        clearTimeout(entry.timer);
        entry.abort.abort(
          new DOMException("Drawing preparation cancelled", "AbortError"),
        );
      }
      if ("error" in result) reject(result.error);
      else resolve(structuredClone(result.artifact));
    };
    const cancelled = () =>
      finish({
        error: signal.reason ?? new DOMException("Cancelled", "AbortError"),
      });
    signal.addEventListener("abort", cancelled, { once: true });
    entry.promise.then(
      (artifact) => finish({ artifact }),
      (error) => finish({ error }),
    );
    if (signal.aborted) cancelled();
  });
}
/** Immutable bytes are verified even on warm reads. Concurrent readers share one SDK preparation. */
export async function prepareDrawingSource(
  source: DrawingSource,
  signal: AbortSignal,
  progress?: Progress,
) {
  const generation = drawingArtifactCacheGeneration();
  signal.throwIfAborted();
  const snapshot = snapshotDrawingSource(source);
  const hash = await sha256(snapshot.data);
  signal.throwIfAborted();
  assertGeneration(generation);
  if (hash !== snapshot.sourceHash)
    throw new Error("Drawing bytes do not match their source hash");
  const key = drawingArtifactKey(snapshot.sourceHash);
  const cached = cachedDrawingArtifact(key);
  if (cached) return { artifact: cached, cacheHit: true };
  const previous = pending.get(key);
  const entry =
    previous?.generation === generation
      ? previous
      : start(key, snapshot, generation);
  return {
    artifact: await subscribe(entry, key, signal, progress),
    cacheHit: false,
  };
}
