import { sha256 } from "../drawing/pdfDiffValidation";
import type { IfcSource, IfcElementReference } from "./ifcTypes";
export const IFC_NAVIGATION = "canonical-bim-v1";
export const IFC_DONOR = "5073adf1f5fadef76129460555482b6507c2be74";
export const IFC_LOCK =
  "cd7223b245b36d2e0534bbed4499185e94647ae56463ec95632f8dd105db7ea0";
export function validateIfcReference(target: IfcElementReference) {
  if (
    !target.sourceRevisionId ||
    !/^[0-9a-f]{64}$/.test(target.sourceHash) ||
    !/^[0-3][0-9A-Za-z_$]{21}$/.test(target.globalId)
  )
    throw new Error("Invalid revision-bound IFC target");
}
function validateMetadata(sources: readonly IfcSource[]) {
  if (sources.length === 0 || sources.length > 4)
    throw new Error("Choose between one and four IFC revisions");
  const ids = new Set<string>();
  let total = 0;
  for (const source of sources) {
    if (!source.revisionId || ids.has(source.revisionId))
      throw new Error("IFC revision IDs must be present and unique");
    ids.add(source.revisionId);
    if (!source.name.toLowerCase().endsWith(".ifc"))
      throw new Error("Only exported IFC sources are supported");
    let size: number;
    try {
      size = Object.getOwnPropertyDescriptor(
        ArrayBuffer.prototype,
        "byteLength",
      )!.get!.call(source.data);
    } catch {
      throw new Error("IFC bytes must be an ArrayBuffer");
    }
    total += size;
    if (size === 0 || total > 128 * 1024 * 1024)
      throw new Error(
        "IFC sources exceed the 128 MiB session limit or are empty",
      );
    if (!/^[0-9a-f]{64}$/.test(source.sourceHash))
      throw new Error("IFC source hash mismatch");
  }
}
/** Validate resource bounds before allocating immutable session snapshots. */
export function snapshotIfcSources(sources: readonly IfcSource[]): IfcSource[] {
  validateMetadata(sources);
  return sources.map((source) => {
    const data = new ArrayBuffer(source.data.byteLength);
    new Uint8Array(data).set(new Uint8Array(source.data));
    return { ...source, data };
  });
}
export async function validateIfcSources(sources: readonly IfcSource[]) {
  validateMetadata(sources);
  for (const source of sources) {
    if ((await sha256(source.data)) !== source.sourceHash)
      throw new Error("IFC source hash mismatch");
  }
}
