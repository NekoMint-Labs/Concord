import type { BimTarget } from "./ifcTypes";
/** Return a bounded snapshot; callers cannot mutate an in-flight navigation target. */
export function snapshotBimTarget(target: BimTarget): BimTarget {
  if (
    !target ||
    (target.kind !== undefined && target.kind !== "bim") ||
    typeof target.source_revision_id !== "string" ||
    !target.source_revision_id ||
    target.source_revision_id.length > 1000
  )
    throw new Error("Invalid revision-bound BIM target");
  if (target.viewpoint != null)
    throw new Error(
      "BIM viewpoint navigation is unavailable until camera semantics are confirmed",
    );
  const ids = target.global_ids;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 1000 ||
    new Set(ids).size !== ids.length ||
    ids.some(
      (id) => typeof id !== "string" || !/^[0-3][0-9A-Za-z_$]{21}$/.test(id),
    )
  )
    throw new Error("BIM navigation requires unique valid IFC GlobalIds");
  return {
    kind: "bim",
    source_revision_id: target.source_revision_id,
    global_ids: [...ids],
  };
}
