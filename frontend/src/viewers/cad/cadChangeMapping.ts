import type { components } from "../../api/schema";
import { toCadTarget } from "./cadContract";
import { validateCadTarget } from "./cadValidation";
import { CAD_ENGINE } from "./cadTypes";
import type { CadChangeCandidate, CadComparison, CadSource } from "./cadTypes";

export type CanonicalChange = components["schemas"]["Change"];
/** Trusted caller supplies project/source identity; no upload or write endpoint. */
export interface CadChangeContext {
  projectId: string;
  sourceId: string;
  operationId: string;
  before: Pick<CadSource, "revisionId" | "sourceHash">;
  after: Pick<CadSource, "revisionId" | "sourceHash">;
  observedAt: string;
  rawArtifactKey?: string | null;
}

function validateContext(result: CadComparison, context: CadChangeContext) {
  if (
    [context.projectId, context.sourceId, context.operationId].some(
      (value) => typeof value !== "string" || !value.trim(),
    ) ||
    context.operationId.length > 100
  )
    throw new Error(
      "CAD mapping requires project, source and operation identities",
    );
  for (const source of [context.before, context.after]) {
    if (!source.revisionId?.trim() || !/^[a-f0-9]{64}$/.test(source.sourceHash))
      throw new Error(
        "CAD mapping requires revision IDs and full SHA-256 hashes",
      );
  }
  if (context.before.revisionId === context.after.revisionId)
    throw new Error("CAD comparison revisions must be distinct");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(
      context.observedAt,
    ) ||
    !Number.isFinite(Date.parse(context.observedAt)) ||
    new Date(context.observedAt).toISOString().slice(0, 19) !==
      context.observedAt.slice(0, 19)
  )
    throw new Error("CAD mapping requires a stable UTC observation time");
  if (
    result.engine !== CAD_ENGINE ||
    result.revisionIds.length !== 2 ||
    result.sourceHashes.length !== 2 ||
    result.revisionIds[0] !== context.before.revisionId ||
    result.revisionIds[1] !== context.after.revisionId ||
    result.sourceHashes[0] !== context.before.sourceHash ||
    result.sourceHashes[1] !== context.after.sourceHash
  )
    throw new Error(
      "CAD comparison does not match its engine or revision/hash pair",
    );
  if (result.changes.length > 2000)
    throw new Error("CAD mapping exceeds the bounded donor result limit");
}

function navigation(row: CadChangeCandidate) {
  return {
    sourceRevisionId: row.sourceRevisionId,
    sourceHash: row.sourceHash,
    entityId: row.entityId,
    ...(row.layer ? { layer: row.layer } : {}),
    ...(row.location ? { viewBounds: row.location } : {}),
  };
}

function validateRows(result: CadComparison, context: CadChangeContext) {
  const rows = new Map<string, CadChangeCandidate>();
  for (const row of result.changes) {
    const source = [context.before, context.after].find(
      (candidate) => candidate.revisionId === row.sourceRevisionId,
    );
    if (!source || source.sourceHash !== row.sourceHash)
      throw new Error(
        "CAD candidate provenance does not match its compared revision",
      );
    validateCadTarget(navigation(row));
    if (
      !["added", "deleted", "modified"].includes(row.kind) ||
      (row.kind === "added" && source !== context.after) ||
      (row.kind === "deleted" && source !== context.before)
    )
      throw new Error("CAD candidate kind contradicts its comparison side");
    if (
      row.aspects.length > 256 ||
      row.aspects.some(
        (aspect) => typeof aspect.field !== "string" || !aspect.field.trim(),
      )
    )
      throw new Error("CAD candidate has invalid changed aspects");
    const key = JSON.stringify([
      row.sourceRevisionId,
      row.entityId.toUpperCase(),
    ]);
    if (rows.has(key))
      throw new Error("CAD comparison contains duplicate entity candidates");
    rows.set(key, row);
  }
  for (const row of result.changes) {
    if (row.kind !== "modified") {
      if (row.pairedEntityId != null)
        throw new Error(
          "Unmatched CAD candidate must not claim a paired entity",
        );
      continue;
    }
    const other =
      row.sourceRevisionId === context.before.revisionId
        ? context.after
        : context.before;
    const pair = rows.get(
      JSON.stringify([other.revisionId, row.pairedEntityId?.toUpperCase()]),
    );
    if (
      !pair ||
      pair.kind !== "modified" ||
      pair.pairedEntityId?.toUpperCase() !== row.entityId.toUpperCase() ||
      JSON.stringify(pair.aspects) !== JSON.stringify(row.aspects)
    )
      throw new Error(
        "Modified CAD candidate requires a consistent reciprocal pair",
      );
  }
}

/** Produces canonical drafts only. A retains trusted publication and all business state. */
export async function mapCadChanges(
  comparison: CadComparison,
  input: CadChangeContext,
): Promise<CanonicalChange[]> {
  // Validate bounds before copying, then own all values before asynchronous hashing.
  validateContext(comparison, input);
  const result = structuredClone(comparison);
  const context: CadChangeContext = {
    projectId: input.projectId,
    sourceId: input.sourceId,
    operationId: input.operationId,
    before: {
      revisionId: input.before.revisionId,
      sourceHash: input.before.sourceHash,
    },
    after: {
      revisionId: input.after.revisionId,
      sourceHash: input.after.sourceHash,
    },
    observedAt: input.observedAt,
    rawArtifactKey: input.rawArtifactKey,
  };
  validateRows(result, context);
  const selected = result.changes.filter(
    (row) =>
      row.kind !== "modified" ||
      row.sourceRevisionId === context.after.revisionId,
  );
  if (selected.length > 1000)
    throw new Error(
      "CAD mapping exceeds the platform Change publication limit",
    );
  return Promise.all(
    selected.map(async (row) => {
      const subject = toCadTarget(navigation(row), [
        context.before,
        context.after,
      ]);
      const value = {
        project_id: context.projectId,
        source_id: context.sourceId,
        from_revision_id: context.before.revisionId,
        to_revision_id: context.after.revisionId,
        subject,
        kind: row.kind === "modified" ? "changed" : row.kind,
        aspects: [...new Set(row.aspects.map((aspect) => aspect.field))],
        detector: "mlightcad",
        detector_version: result.engine,
        raw_artifact_key: context.rawArtifactKey ?? null,
        created_at: context.observedAt,
      };
      const bytes = new TextEncoder().encode(
        JSON.stringify([
          "concord:cad-change:v1",
          context.operationId,
          result.sourceHashes,
          row,
          value,
        ]),
      );
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const id = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      return { id, ...value };
    }),
  );
}
