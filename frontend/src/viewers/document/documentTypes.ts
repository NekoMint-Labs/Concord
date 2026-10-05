import type { components } from "../../api/schema";
/** Read-only staging input consumes the existing generated chunk schema. A owns publication. */
export type DocumentChunk = components["schemas"]["DocumentChunk"];
export interface ExtractedDocument {
  sourceRevisionId: string;
  sourceHash: string;
  filename: string;
  chunks: readonly DocumentChunk[];
}
export interface DocumentNavigation {
  sourceRevisionId: string;
  sourceHash: string;
  chunkId: string;
  page?: number | null;
  location?: string | null;
}
export interface DocumentController {
  navigate(target: DocumentNavigation): Promise<DocumentNavigation>;
}
export interface DocumentCell {
  group: string;
  tableId: string;
  address: string;
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  columnHeader: boolean;
  rowHeader: boolean;
}
