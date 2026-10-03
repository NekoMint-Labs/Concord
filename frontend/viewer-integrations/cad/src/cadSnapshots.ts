import type { AcDbDatabase } from "@mlightcad/data-model";
import {
  acapResolveSnapshotOptions,
  acapSnapshotEntity,
  type EntitySnapshot,
  type AcApDiffCompareOptions,
} from "../vendor/compare/acapCompareDrawings";
import { CAD_ENGINE } from "./cadTypes";

export const CAD_SNAPSHOT_LIMIT = 32 * 1024 * 1024;
const ENTITY_LIMIT = 100000;
const cache = new Map<string, { snapshots: EntitySnapshot[]; bytes: number }>();
let cacheBytes = 0;

/** Freeze donor settings before any asynchronous preparation or dispatch. */
export function snapshotCadOptions(
  input: AcApDiffCompareOptions,
): AcApDiffCompareOptions {
  const options = { ...input };
  for (const key of [
    "tolerance",
    "compareProps",
    "compareHatch",
    "compareText",
    "compareTolerance",
    "compareRcMargin",
  ] as const) {
    const value = options[key];
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isFinite(value))
    )
      throw new Error(`CAD comparison option ${key} must be finite`);
  }
  if (options.tolerance !== undefined && options.tolerance <= 0)
    throw new Error("CAD comparison tolerance must be positive");
  for (const [key, min, max] of [
    ["compareProps", 0, 127],
    ["compareHatch", 0, 1],
    ["compareText", 0, 1],
    ["compareTolerance", 0, 14],
    ["compareRcMargin", 1, 25],
  ] as const) {
    const value = options[key];
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < min || value > max)
    )
      throw new Error(`CAD comparison option ${key} is out of range`);
  }
  if (
    options.includeUnchanged !== undefined &&
    typeof options.includeUnchanged !== "boolean"
  )
    throw new Error("CAD includeUnchanged must be boolean");
  return Object.freeze(options);
}

export function cadSnapshotKey(hash: string, options: AcApDiffCompareOptions) {
  if (!/^[a-f0-9]{64}$/i.test(hash))
    throw new Error("CAD snapshot source hash is invalid");
  return `${CAD_ENGINE}:${hash.toLowerCase()}:${JSON.stringify(acapResolveSnapshotOptions(options))}`;
}
export function clearCadSnapshots() {
  cache.clear();
  cacheBytes = 0;
}

/** Retain only bounded plain donor data; no entity, database, source bytes or GPU state. */
export async function prepareCadSnapshots(
  database: AcDbDatabase,
  sourceHash: string,
  options: AcApDiffCompareOptions,
  signal: AbortSignal,
  yieldControl: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 0)),
) {
  const settings = snapshotCadOptions(options);
  signal.throwIfAborted();
  const key = cadSnapshotKey(sourceHash, settings);
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return {
      snapshots: existing.snapshots,
      cacheHit: true,
      visited: 0,
      yields: 0,
    };
  }
  const snapshots: EntitySnapshot[] = [];
  let visited = 0,
    bytes = 0,
    yields = 0;
  let sliceStarted = performance.now();
  for (const entity of database.tables.blockTable.modelSpace.newIterator()) {
    signal.throwIfAborted();
    if (++visited > ENTITY_LIMIT)
      throw new Error("CAD model-space entity limit exceeded");
    const snapshot = acapSnapshotEntity(entity, settings);
    if (snapshot) {
      // UTF-16 upper bound also accounts for structured-clone string storage.
      bytes += JSON.stringify(snapshot).length * 2;
      if (bytes > CAD_SNAPSHOT_LIMIT)
        throw new Error("CAD derived snapshot byte limit exceeded");
      snapshots.push(snapshot);
    }
    if (visited % 128 === 0 || performance.now() - sliceStarted >= 4) {
      ++yields;
      await yieldControl();
      signal.throwIfAborted();
      sliceStarted = performance.now();
    }
  }
  signal.throwIfAborted();
  const raced = cache.get(key);
  if (raced) {
    cache.delete(key);
    cacheBytes -= raced.bytes;
  }
  while (cache.size >= 4 || cacheBytes + bytes > CAD_SNAPSHOT_LIMIT) {
    const oldest = cache.keys().next().value!;
    cacheBytes -= cache.get(oldest)!.bytes;
    cache.delete(oldest);
  }
  cache.set(key, { snapshots, bytes });
  cacheBytes += bytes;
  return { snapshots, cacheHit: false, visited, yields };
}
