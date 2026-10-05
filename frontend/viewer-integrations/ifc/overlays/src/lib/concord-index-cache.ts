import type { SpatialNode } from "../types";

/** Viewer-local derived tree cache; never authoritative project state. */
const DIRECTORY = "concord-ifc-index-v2";
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 4;
export const indexDiagnostics = { builds: 0, hits: 0, writes: 0, failures: 0 };
type Entry = { tree: SpatialNode[]; decomp: [number, number[]][] };
async function location(key: string) {
  if (!key.startsWith("concord-ifc:") || !key.includes(":f2:")) return null;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  const name =
    Array.from(new Uint8Array(hash), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("") + ".json";
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(DIRECTORY, { create: true });
  return { directory, name };
}
export async function readIndex(key: string): Promise<Entry | null> {
  try {
    const loc = await location(key);
    if (!loc) return null;
    const file = await (await loc.directory.getFileHandle(loc.name)).getFile();
    if (file.size > MAX_BYTES) return null;
    const data = JSON.parse(await file.text());
    if (
      !Array.isArray(data.tree) ||
      !Array.isArray(data.decomp) ||
      data.decomp.length > 500000 ||
      !data.decomp.every(
        (p: unknown) =>
          Array.isArray(p) &&
          p.length === 2 &&
          Number.isSafeInteger(p[0]) &&
          Array.isArray(p[1]) &&
          p[1].length <= 500000 &&
          p[1].every(Number.isSafeInteger),
      )
    )
      return null;
    return data as Entry;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError"))
      indexDiagnostics.failures++;
    return null;
  }
}
let pendingWrite = Promise.resolve();
export function writeIndex(key: string, data: Entry): Promise<void> {
  const result = pendingWrite.then(() =>
    navigator.locks
      ? navigator.locks.request(DIRECTORY, () => storeIndex(key, data))
      : storeIndex(key, data),
  );
  pendingWrite = result.catch(() => {
    indexDiagnostics.failures++;
  });
  return pendingWrite;
}
async function storeIndex(key: string, data: Entry): Promise<void> {
  try {
    const loc = await location(key);
    if (!loc) return;
    const json = JSON.stringify(data);
    if (new Blob([json]).size > MAX_BYTES) return;
    const entries: { name: string; time: number }[] = [];
    // OPFS iteration is supported by the qualified browser; keep it out of DOM typings.
    const iterable = loc.directory as FileSystemDirectoryHandle & {
      values(): AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
    };
    for await (const handle of iterable.values()) {
      if (handle.kind !== "file" || handle.name === loc.name) continue;
      entries.push({
        name: handle.name,
        time: (await (handle as FileSystemFileHandle).getFile()).lastModified,
      });
    }
    entries.sort((a, b) => a.time - b.time);
    while (entries.length >= MAX_ENTRIES)
      await loc.directory.removeEntry(entries.shift()!.name);
    const writable = await (
      await loc.directory.getFileHandle(loc.name, { create: true })
    ).createWritable();
    try {
      await writable.write(json);
      await writable.close();
    } catch (error) {
      await writable.abort();
      throw error;
    }
    indexDiagnostics.writes++;
  } catch {
    indexDiagnostics.failures++;
  }
}
