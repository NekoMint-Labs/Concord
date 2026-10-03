/** C-owned, transient adapter values. A's persisted Change/Evidence remain authoritative. */
export interface DrawingSource {
  revisionId: string;
  sourceHash: string;
  data: ArrayBuffer;
}
export interface DrawingRegion {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PdfDiffOptions {
  scale?: number;
  maxShift?: number;
  colorTolerance?: number;
  minHighlightArea?: number;
  cropRegions?: DrawingRegion[];
  maskRegions?: DrawingRegion[];
}
export interface DrawingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PdfDiffPage {
  pageNumA: number;
  pageNumB: number;
  diffPixels: number;
  overlayA: Blob;
  overlayB: Blob;
  width: number;
  height: number;
  boxes: DrawingBox[];
  wordHighlightsA: DrawingBox[];
  wordHighlightsB: DrawingBox[];
  sourceRegionsA?: DrawingBox[];
  sourceRegionsB?: DrawingBox[];
  alignment: { dx: number; dy: number };
  similarity?: number;
}
export interface PdfDiffArtifact {
  engine: string;
  sourceHashes: [string, string];
  options: Required<PdfDiffOptions>;
  pages: PdfDiffPage[];
  addedPages: number[];
  deletedPages: number[];
  warnings: string[];
  elapsedMs: number;
}
export interface PdfDiffResult {
  artifact: PdfDiffArtifact;
  revisionIds: [string, string];
  cacheHit: boolean;
}
export const PDF_DIFF_ENGINE =
  "pdf-diff-viewer@96af1ce5caa0b27b3b4a2e14ef3c16aed0842170/pdfjs@4.10.38/concord-worker-v1";
