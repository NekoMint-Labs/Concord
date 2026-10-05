import type { BimTarget, IfcSource } from "./ifcTypes";
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

/** A-confirmed source-only requests open verified bytes without element navigation. */
export function bimSurfaceTarget(
  target: BimTarget,
  sources: readonly IfcSource[],
): BimTarget | undefined {
  if (
    !target ||
    (target.kind !== undefined && target.kind !== "bim") ||
    !sources.some((source) => source.revisionId === target.source_revision_id)
  )
    throw new Error("IFC target source revision is not loaded");
  if (target.viewpoint != null)
    throw new Error("BIM viewpoint is reserved; use BCF for camera exchange");
  if (
    target.global_ids === undefined ||
    (Array.isArray(target.global_ids) && target.global_ids.length === 0)
  )
    return undefined;
  return snapshotBimTarget(target);
}
