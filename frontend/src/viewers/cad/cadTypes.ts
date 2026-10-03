import type { DrawingSource } from "../drawing/pdfDiffTypes";
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

/** Local navigation until A's canonical ViewerTarget seam lands. */
export interface CadNavigation {
  sourceRevisionId: string;
  sourceHash: string;
  entityId: string;
  /** Native layer name when the donor can provide it. */
  layer?: string;
}

export interface CadController {
  navigate(target: CadNavigation): Promise<CadNavigation>;
}
