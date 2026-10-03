import { sha256 } from "../drawing/pdfDiffValidation";
import type { CadNavigation, CadSource } from "./cadTypes";

export function validateCadTarget(target: CadNavigation) {
  if (
    !target.sourceRevisionId ||
    !/^[a-f0-9]{64}$/.test(target.sourceHash) ||
    !/^[a-f0-9]{1,32}$/i.test(target.entityId)
  )
    throw new Error("Invalid revision-bound CAD entity target");
}
function metadata(source: CadSource) {
  if (
    !source.name ||
    /[/\\\x00-\x1f]/.test(source.name) ||
    !/\.dxf$/i.test(source.name)
  )
    throw new Error("Only DXF sources are accepted by this viewer");
  if (!source.revisionId || !/^[a-f0-9]{64}$/.test(source.sourceHash))
    throw new Error("A source revision and SHA-256 are required");
  let size: number;
  try {
    size = Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      "byteLength",
    )!.get!.call(source.data);
  } catch {
    throw new Error("DXF bytes must be an ArrayBuffer");
  }
  if (!size || size > 32 * 1024 * 1024)
    throw new Error("DXF input exceeds the 32 MiB limit");
}
export function snapshotCadSources(
  before: CadSource,
  after?: CadSource,
): [CadSource, CadSource?] {
  metadata(before);
  if (after) {
    metadata(after);
    if (before.revisionId === after.revisionId)
      throw new Error("CAD revisions must be distinct");
  }
  const copy = (source: CadSource) => {
    const data = new ArrayBuffer(source.data.byteLength);
    new Uint8Array(data).set(new Uint8Array(source.data));
    return { ...source, data };
  };
  return [copy(before), after && copy(after)];
}
export async function verifyCadSource(source: CadSource) {
  metadata(source);
  if ((await sha256(source.data)) !== source.sourceHash)
    throw new Error("DXF bytes do not match the source revision hash");
}
