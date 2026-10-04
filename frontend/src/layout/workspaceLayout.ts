// Source: OpenTakeoff web/src/lib/workspaceLayout.js (Apache-2.0).
// Copyright 2026 Kentucky AI and OpenTakeoff contributors.
// Revision: 60c82e34b389384401a083cefeb9389f89fbaae1.
// Modified for Concord (TS/localization/primitives/product-only docks).

// Personal chrome only. Never include this in a project, profile, or sync payload.
export type DockSide = "left" | "right";
export type DockId = "work";
export type Layout = { locked: boolean; work: DockSide; workWidth: number };
export type SavedLayout = { name: string; layout: Layout };
export type WorkspacePreferences = {
  version: 1;
  enabled: boolean;
  layout: Layout;
  saved: SavedLayout[];
};

export const WORKSPACE_LAYOUT_KEY = "concord.workspace-layout.v1";
export const DEFAULT_LAYOUT: Readonly<Layout> = Object.freeze({
  locked: true,
  work: "right",
  workWidth: 360,
});
export const DOCKS: readonly DockId[] = Object.freeze(["work"]);

export function normalizeLayout(value: unknown): Layout {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const out = { ...DEFAULT_LAYOUT };
  for (const key of DOCKS) {
    if (v[key] === "left" || v[key] === "right") out[key] = v[key];
  }
  if (typeof v.locked === "boolean") out.locked = v.locked;
  if (typeof v.workWidth === "number" && Number.isFinite(v.workWidth)) {
    out.workWidth = Math.round(Math.max(300, Math.min(480, v.workWidth)));
  }
  return out;
}

export function moveDock(
  layout: unknown,
  dock: DockId,
  side: DockSide,
): Layout {
  const current = normalizeLayout(layout);
  if (
    current.locked ||
    !DOCKS.includes(dock) ||
    !["left", "right"].includes(side)
  )
    return current;
  return { ...current, [dock]: side };
}

export function readWorkspacePreferences(
  raw: string | null,
): WorkspacePreferences {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1
    ) {
      throw new Error("Unsupported layout");
    }
    const v = value as Record<string, unknown>;
    return {
      version: 1,
      enabled: v.enabled !== false,
      layout: normalizeLayout(v.layout),
      saved: (Array.isArray(v.saved) ? v.saved : [])
        .filter(
          (s): s is { name: string; layout?: unknown } =>
            s && typeof s.name === "string" && s.name.trim(),
        )
        .slice(0, 8)
        .map((s) => ({
          name: s.name.trim().slice(0, 40),
          layout: normalizeLayout(s.layout),
        })),
    };
  } catch {
    return {
      version: 1,
      enabled: true,
      layout: { ...DEFAULT_LAYOUT },
      saved: [],
    };
  }
}
