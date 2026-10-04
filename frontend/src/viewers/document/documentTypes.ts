import type { components } from "../../api/schema";
/** Read-only staging input consumes the existing generated chunk schema. A owns publication. */
export type DocumentChunk = components["schemas"]["DocumentChunk"];
export interface ExtractedDocument {
  sourceRevisionId: string;
  sourceHash: string;
  filename: string;
  chunks: readonly DocumentChunk[];
}
/** Generated public navigation contract; hashes and chunk IDs stay inside this adapter. */
export type DocumentTarget = components["schemas"]["DocumentTarget"];
export interface DocumentController {
  navigate(target: DocumentTarget): Promise<DocumentTarget>;
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
