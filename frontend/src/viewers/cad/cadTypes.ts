import type { components } from "../../api/schema";
import type { DrawingSource } from "../drawing/pdfDiffTypes";

export type CadTarget = components["schemas"]["CadTarget"];
export type CadSource = DrawingSource & { name: string };
export interface CadChangeCandidate {
  kind: "added" | "deleted" | "modified";
  sourceRevisionId: string;
  sourceHash: string;
  entityId: string;
  pairedEntityId?: string;
  entityType: string;
  layer: string;
  location?: { minX: number; minY: number; maxX: number; maxY: number };
  aspects: { field: string; before: string; after: string }[];
}
export interface CadComparison {
  engine: string;
  changes: CadChangeCandidate[];
  warnings: string[];
}

/** Viewer-local navigation payload; sourceHash never crosses the canonical contract. */
export interface CadViewBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CadNavigation {
  sourceRevisionId: string;
  sourceHash: string;
  entityId: string;
  /** Native layer name when the donor can provide it. */
  layer?: string | null;
  /** Optional model-space viewport hint; native extents remain authoritative. */
  viewBounds?: CadViewBounds | null;
}

export interface CadController {
  navigate(target: CadTarget): Promise<CadTarget>;
}
