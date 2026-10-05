import { describe, it, expect } from "vitest";
import {
  documentCell,
  documentReference,
  resolveDocumentTarget,
  validateExtractedDocument,
} from "./documentNavigation";
import type { ExtractedDocument } from "./documentTypes";
const source: ExtractedDocument = {
  sourceRevisionId: "R2",
  sourceHash: "a".repeat(64),
  filename: "coordination.xlsx",
  chunks: [
    {
      id: "cell-1",
      text: "Review",
      page: null,
      location:
        "#/tables/0; Coordination/row:4/cell:C4; row-span=2; col-span=3; column-header=False; row-header=True; offset=0",
      source_hash: "a".repeat(64),
      parser: "docling-local-no-ocr",
    },
  ],
};
describe("Document revision/location boundary", () => {
  it("retains actual sheet/cell/merged spans and header flags", () => {
    validateExtractedDocument(source);
    expect(documentCell(source.chunks[0])).toEqual({
      group: "Coordination",
      tableId: "#/tables/0",
      address: "C4",
      row: 4,
      column: 3,
      rowSpan: 2,
      columnSpan: 3,
      columnHeader: false,
      rowHeader: true,
    });
    expect(
      documentCell({ ...source.chunks[0], location: "characters 0-80" }),
    ).toBeUndefined();
  });
  it("resolves exact revision, hash, chunk, page and location", () => {
    const target = documentReference(source, source.chunks[0]);
    expect(resolveDocumentTarget(source, target)).toBe(source.chunks[0]);
    for (const patch of [
      { sourceRevisionId: "R1" },
      { sourceHash: "0".repeat(64) },
      { chunkId: "missing" },
      { page: 1 },
      { location: "cell:A4" },
    ])
      expect(() =>
        resolveDocumentTarget(source, { ...target, ...patch }),
      ).toThrow();
  });
  it("rejects malformed extraction before rendering", () => {
    for (const patch of [
      { chunks: [] },
      { sourceHash: "bad" },
      { sourceRevisionId: "" },
      { chunks: [source.chunks[0], source.chunks[0]] },
      { chunks: [{ ...source.chunks[0], source_hash: "b".repeat(64) }] },
      { chunks: [{ ...source.chunks[0], page: 0 }] },
      { chunks: [{ ...source.chunks[0], text: "x".repeat(2401) }] },
    ])
      expect(() =>
        validateExtractedDocument({ ...source, ...patch }),
      ).toThrow();
    expect(() =>
      documentCell({
        ...source.chunks[0],
        location: source.chunks[0].location!.replace("cell:C4", "cell:C5"),
      }),
    ).toThrow("invalid");
  });
});
