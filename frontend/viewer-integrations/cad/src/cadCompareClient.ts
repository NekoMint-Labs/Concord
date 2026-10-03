import type { AcDbDatabase } from "@mlightcad/data-model";
import type {
  AcApDiffCompareOptions,
  AcApDiffCompareResult,
} from "../vendor/compare";
import type { CadSource } from "./cadTypes";
const sources = new WeakMap<AcDbDatabase, CadSource>();
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<
  number,
  {
    resolve: (result: AcApDiffCompareResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
export function registerCadDatabase(database: AcDbDatabase, source: CadSource) {
  sources.set(database, source);
}
export function compareCadDatabases(
  before: AcDbDatabase,
  after: AcDbDatabase,
  options: AcApDiffCompareOptions,
): Promise<AcApDiffCompareResult> {
  const a = sources.get(before);
  const b = sources.get(after);
  if (!a || !b)
    return Promise.reject(
      new Error("CAD comparison requires registered project source revisions"),
    );
  if (!worker) {
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
      cacheHit?: boolean;
    }>) => {
      const request = pending.get(data.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(data.id);
      if (data.error || !data.result)
        request.reject(
          new Error(data.error || "CAD engine returned no result"),
        );
      else {
        window.dispatchEvent(
          new CustomEvent("concord-cad-timing", {
            detail: { elapsedMs: data.elapsedMs, cacheHit: data.cacheHit },
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
  }
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => disposeCadComparisons(new Error("CAD comparison timed out")),
      120000,
    );
    pending.set(id, { resolve, reject, timer });
    const left = a.data.slice(0);
    const right = b.data.slice(0);
    try {
      worker!.postMessage(
        {
          id,
          before: { ...a, data: left },
          after: { ...b, data: right },
          options,
        },
        [left, right],
      );
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}
export function disposeCadComparisons(
  error = new Error("CAD viewer disposed"),
) {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(error);
  }
  pending.clear();
}
