import type { AcDbDatabase } from "@mlightcad/data-model";
import type {
  AcApDiffCompareOptions,
  AcApDiffCompareResult,
} from "../vendor/compare";
import type { CadSource } from "./cadTypes";
import {
  clearCadSnapshots,
  prepareCadSnapshots,
  snapshotCadOptions,
} from "./cadSnapshots";
let sources = new WeakMap<AcDbDatabase, CadSource>();
let lifetime = new AbortController();
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<
  number,
  {
    resolve: (result: AcApDiffCompareResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    preparation?: {
      prepareMs: number;
      cacheHit: boolean;
      snapshotEntities: number;
      preparationYields: number;
    };
  }
>();
export function registerCadDatabase(database: AcDbDatabase, source: CadSource) {
  sources.set(database, source);
}
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./cadCompare.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({
    data,
  }: MessageEvent<{
    id: number;
    result?: AcApDiffCompareResult;
    error?: string;
    elapsedMs?: number;
    sourceParses?: number;
  }>) => {
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(data.id);
    if (data.error || !data.result)
      request.reject(new Error(data.error || "CAD engine returned no result"));
    else {
      window.dispatchEvent(
        new CustomEvent("concord-cad-timing", {
          detail: {
            ...request.preparation,
            elapsedMs: data.elapsedMs,
            comparisonSourceParses: data.sourceParses,
          },
        }),
      );
      request.resolve(data.result);
    }
  };
  worker.onerror = (event) =>
    disposeCadComparisons(
      new Error(event.message || "CAD comparison worker failed"),
    );
  worker.onmessageerror = () =>
    disposeCadComparisons(
      new Error("CAD comparison result could not be decoded"),
    );
  return worker;
}
export function compareCadDatabases(
  before: AcDbDatabase,
  after: AcDbDatabase,
  input: AcApDiffCompareOptions,
): Promise<AcApDiffCompareResult> {
  const a = sources.get(before),
    b = sources.get(after);
  if (!a || !b)
    return Promise.reject(
      new Error("CAD comparison requires registered project source revisions"),
    );
  let options: AcApDiffCompareOptions;
  try {
    options = snapshotCadOptions(input);
  } catch (error) {
    return Promise.reject(error);
  }
  const signal = lifetime.signal;
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => disposeCadComparisons(new Error("CAD comparison timed out")),
      120000,
    );
    pending.set(id, { resolve, reject, timer });
    void (async () => {
      try {
        const started = performance.now();
        const left = await prepareCadSnapshots(
          before,
          a.sourceHash,
          options,
          signal,
        );
        const right = await prepareCadSnapshots(
          after,
          b.sourceHash,
          options,
          signal,
        );
        signal.throwIfAborted();
        // Disposal always aborts this signal before clearing pending requests.
        const request = pending.get(id)!;
        request.preparation = {
          prepareMs: performance.now() - started,
          cacheHit: left.cacheHit && right.cacheHit,
          snapshotEntities: left.snapshots.length + right.snapshots.length,
          preparationYields: left.yields + right.yields,
        };
        ensureWorker().postMessage({
          id,
          before: left.snapshots,
          after: right.snapshots,
          options,
        });
      } catch (error) {
        const request = pending.get(id);
        if (!request) return;
        clearTimeout(request.timer);
        pending.delete(id);
        reject(error);
      }
    })();
  });
}
export function disposeCadComparisons(
  error = new Error("CAD viewer disposed"),
) {
  lifetime.abort(error);
  lifetime = new AbortController();
  worker?.terminate();
  worker = undefined;
  sources = new WeakMap();
  clearCadSnapshots();
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(error);
  }
  pending.clear();
}
