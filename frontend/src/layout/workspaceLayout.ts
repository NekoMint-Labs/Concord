// Source: OpenTakeoff web/src/lib/workspaceLayout.js (Apache-2.0).
// Copyright 2026 Kentucky AI and the OpenTakeoff contributors.
// Revision: 788e39bfe9c42b3260ea75e84a655e4574f9bc8c.
// Modified for Concord: the dock set is the three Concord surfaces that exist
// (rail, source navigator, Work and review). The donor's Takeoffs dock and its
// quantity/counter/readout/palette toggles have no Concord counterpart and are
// not carried over; everything else — defaults, normalization bounds, the
// versioned browser-local store and the saved-arrangement cap — is the donor's.

// Personal chrome only. Never include this in a project, profile, or sync payload.
export const WORKSPACE_LAYOUT_KEY = "concord.workspace-layout.v1";
export type WorkspaceLook = "graphite" | "light" | "hud";
export type DockSide = "left" | "right";
export type DockId = "tools" | "sheets" | "work";
export type Layout = {
  locked: boolean;
  tools: DockSide;
  sheets: DockSide;
  work: DockSide;
  workWidth: number;
  sheetWidth: number;
  look: WorkspaceLook;
  backlight: number;
};
export type SavedLayout = { name: string; layout: Layout };
export type WorkspacePreferences = {
  version: 1;
  enabled: boolean;
  layout: Layout;
  saved: SavedLayout[];
};

export const DEFAULT_LAYOUT: Readonly<Layout> = Object.freeze({
  locked: true,
  tools: "left",
  sheets: "left",
  work: "right",
  workWidth: 360,
  sheetWidth: 264,
  look: "graphite",
  backlight: 45,
});
export const DOCKS: readonly DockId[] = Object.freeze([
  "tools",
  "sheets",
  "work",
]);

export function normalizeLayout(value: unknown): Layout {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const out: Layout = { ...DEFAULT_LAYOUT };
  if (["graphite", "light", "hud"].includes(v.look as string))
    out.look = v.look as WorkspaceLook;
  if (typeof v.backlight === "number" && Number.isFinite(v.backlight))
    out.backlight = Math.round(Math.min(100, Math.max(0, v.backlight)));
  for (const key of DOCKS) {
    if (v[key] === "left" || v[key] === "right") out[key] = v[key];
  }
  if (typeof v.locked === "boolean") out.locked = v.locked;
  for (const [key, min, max] of [
    ["workWidth", 300, 480],
    ["sheetWidth", 220, 340],
  ] as const) {
    if (typeof v[key] === "number" && Number.isFinite(v[key])) {
      out[key] = Math.round(Math.max(min, Math.min(max, v[key])));
    }
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
