import type { CadNavigation, CadSource, CadTarget } from "./cadTypes";
import { validateCadTarget } from "./cadValidation";

type CadSourceIdentity = Pick<CadSource, "revisionId" | "sourceHash">;

function loadedSource(
  sources: readonly (CadSourceIdentity | undefined)[],
  revisionId: string,
) {
  const source = sources.find(
    (candidate) => candidate?.revisionId === revisionId,
  );
  if (!source) throw new Error(`CAD revision ${revisionId} is not loaded`);
  return source;
}

export function toCadNavigation(
  target: CadTarget,
  sources: readonly (CadSourceIdentity | undefined)[],
): CadNavigation {
  if (target.kind != null && target.kind !== "cad")
    throw new Error("Viewer target is not a CAD target");
  if (typeof target.entity_id !== "string" || !target.entity_id)
    throw new Error("CAD navigation requires an entity ID");
  const source = loadedSource(sources, target.source_revision_id);
  const viewBounds =
    target.view_bounds != null
      ? {
          minX: target.view_bounds[0],
          minY: target.view_bounds[1],
          maxX: target.view_bounds[2],
          maxY: target.view_bounds[3],
        }
      : undefined;
  const navigation: CadNavigation = {
    sourceRevisionId: target.source_revision_id,
    sourceHash: source.sourceHash,
    entityId: target.entity_id,
    ...(target.layer !== undefined ? { layer: target.layer } : {}),
    ...(viewBounds !== undefined ? { viewBounds } : {}),
  };
  validateCadTarget(navigation);
  return navigation;
}

export function toCadTarget(
  navigation: CadNavigation,
  sources: readonly (CadSourceIdentity | undefined)[],
): CadTarget {
  const source = loadedSource(sources, navigation.sourceRevisionId);
  validateCadTarget(navigation);
  if (navigation.sourceHash !== source.sourceHash)
    throw new Error("CAD navigation hash does not match the loaded revision");
  return {
    kind: "cad",
    source_revision_id: source.revisionId,
    entity_id: navigation.entityId,
    ...(navigation.layer !== undefined ? { layer: navigation.layer } : {}),
    ...(navigation.viewBounds != null
      ? {
          view_bounds: [
            navigation.viewBounds.minX,
            navigation.viewBounds.minY,
            navigation.viewBounds.maxX,
            navigation.viewBounds.maxY,
          ],
        }
      : {}),
  };
}
