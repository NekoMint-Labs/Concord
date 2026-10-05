import type { AcApDiffCompareResult } from "../vendor/compare";
import type { CadComparison } from "../../../src/viewers/cad/cadTypes";
import type { CadSource } from "./cadTypes";
import { CAD_ENGINE } from "./cadTypes";
export function normalizeCadResult(
  result: AcApDiffCompareResult,
  before: CadSource,
  after: CadSource,
): CadComparison {
  return {
    engine: CAD_ENGINE,
    revisionIds: [before.revisionId, after.revisionId],
    sourceHashes: [before.sourceHash, after.sourceHash],
    changes: [...result.added, ...result.deleted, ...result.modified].map(
      (hit) => {
        const source = hit.side === "left" ? before : after;
        return {
          kind: hit.kind as "added" | "deleted" | "modified",
          sourceRevisionId: source.revisionId,
          sourceHash: source.sourceHash,
          entityId: hit.objectId,
          pairedEntityId: hit.pairedId,
          entityType: hit.dxfType,
          layer: hit.layer,
          location: hit.extents,
          aspects: (hit.changes ?? []).map((change) => ({
            field: change.field,
            before: change.oldValue,
            after: change.newValue,
          })),
        };
      },
    ),
    warnings: [
      "Comparison is limited to top-level model-space entities; nested blocks/layouts and effective layer attributes are not fully compared.",
      "COMPAREPROPS defaults to zero: property-only changes are ignored unless enabled in the donor settings.",
      "Fonts must be supplied locally; missing or substituted glyphs require review.",
    ],
  };
}
