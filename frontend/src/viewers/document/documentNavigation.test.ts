import { describe, it, expect } from "vitest";
import {
  documentCell,
  documentReference,
  resolveDocumentTarget,
  validateExtractedDocument,
} from "./documentNavigation";
import type { DocumentTarget, ExtractedDocument } from "./documentTypes";
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
  it("resolves canonical revision, path, page and location without exposing chunk IDs", () => {
    const target = documentReference(source, source.chunks[0]);
    expect(resolveDocumentTarget(source, target)).toBe(source.chunks[0]);
    expect(target).toEqual({
      kind: "document",
      source_revision_id: "R2",
      structural_path: ["Coordination", "row:4", "cell:C4"],
      page: null,
      location: source.chunks[0].location,
    });
    for (const patch of [
      { source_revision_id: "R1" },
      { structural_path: ["Requirements", "row:4", "cell:C4"] },
      { page: 1 },
      { location: "cell:A4" },
    ])
      expect(() =>
        resolveDocumentTarget(source, { ...target, ...patch }),
      ).toThrow();
  });
  it("opens a page/section and requires all supplied selectors to agree", () => {
    const book = {
      ...source,
      chunks: [
        { ...source.chunks[0], page: 1 },
        {
          ...source.chunks[0],
          id: "cell-2",
          page: 2,
          location: source.chunks[0]
            .location!.replace("Coordination", "Requirements")
            .replace("tables/0", "tables/1"),
        },
      ],
    };
    expect(
      resolveDocumentTarget(book, { source_revision_id: "R2", page: 2 }),
    ).toBe(book.chunks[1]);
    expect(
      resolveDocumentTarget(book, {
        source_revision_id: "R2",
        structural_path: ["Requirements"],
      }),
    ).toBe(book.chunks[1]);
    expect(() =>
      resolveDocumentTarget(book, {
        source_revision_id: "R2",
        page: 1,
        structural_path: ["Requirements"],
      }),
    ).toThrow("absent");
    expect(() =>
      resolveDocumentTarget(book, {
        source_revision_id: "R2",
        structural_path: ["Requirement"],
      }),
    ).toThrow("absent");
    expect(() =>
      resolveDocumentTarget(book, { source_revision_id: "R2", page: 3 }),
    ).toThrow("absent");
  });
  it("reopens source locations even when regenerated extraction has new chunk IDs", () => {
    const target = documentReference(source, source.chunks[0]);
    const reopened = {
      ...source,
      chunks: [{ ...source.chunks[0], id: "regenerated" }],
    };
    expect(resolveDocumentTarget(reopened, target).id).toBe("regenerated");
  });
  it("does not select an arbitrary split excerpt or identically addressed cell", () => {
    const first = source.chunks[0];
    for (const location of [
      first.location!.replace("offset=0", "offset=2400"),
      first.location!.replace("tables/0", "tables/1"),
      first.location!,
    ]) {
      const duplicate = {
        ...source,
        chunks: [first, { ...first, id: "second", location }],
      };
      expect(() =>
        resolveDocumentTarget(duplicate, {
          source_revision_id: "R2",
          structural_path: ["Coordination", "row:4", "cell:C4"],
        }),
      ).toThrow("ambiguous");
      if (location !== first.location)
        expect(
          resolveDocumentTarget(duplicate, documentReference(source, first)),
        ).toBe(first);
      else
        expect(() =>
          resolveDocumentTarget(duplicate, documentReference(source, first)),
        ).toThrow("ambiguous");
    }
  });
  it("retains nested actual groups and donor paragraph references", () => {
    const cell = {
      ...source.chunks[0],
      location: source.chunks[0].location!.replace(
        "Coordination",
        "Discipline/Coordination",
      ),
    };
    expect(documentReference(source, cell).structural_path).toEqual([
      "Discipline",
      "Coordination",
      "row:4",
      "cell:C4",
    ]);
    const paragraph = { ...cell, location: "#/texts/1; offset=0" };
    const doc = {
      ...source,
      chunks: [
        paragraph,
        { ...paragraph, id: "split", location: "#/texts/1; offset=2400" },
      ],
    };
    expect(() =>
      resolveDocumentTarget(doc, {
        source_revision_id: "R2",
        structural_path: ["#/texts/1"],
      }),
    ).toThrow("ambiguous");
    expect(
      resolveDocumentTarget(doc, documentReference(doc, doc.chunks[1])),
    ).toBe(doc.chunks[1]);
    const unlocated = { ...paragraph, location: null };
    expect(() => documentReference(source, unlocated)).toThrow(
      "no stable source location",
    );
  });
  it("parses table addresses after page/OCR provenance without polluting ancestry", () => {
    const chunk = {
      ...source.chunks[0],
      location: source.chunks[0].location!.replace(
        "; Coordination",
        "; pages=1,2; ocr-page-confidence=0.91; Coordination",
      ),
    };
    expect(documentCell(chunk)?.group).toBe("Coordination");
    expect(documentReference(source, chunk).structural_path).toEqual([
      "Coordination",
      "row:4",
      "cell:C4",
    ]);
  });
  it("rejects malformed runtime targets and tampered extraction hashes", () => {
    for (const patch of [
      { kind: "bim" },
      { page: 0 },
      { page: 1.5 },
      { page: NaN },
      { page: 10001 },
      { structural_path: "Coordination" },
      { structural_path: null },
      { structural_path: [""] },
      { structural_path: [1] },
      { structural_path: Array(65).fill("a") },
      { structural_path: ["a".repeat(1001)] },
      { location: "" },
      { location: 4 },
    ])
      expect(() =>
        resolveDocumentTarget(source, {
          source_revision_id: "R2",
          ...patch,
        } as unknown as DocumentTarget),
      ).toThrow();
    expect(() =>
      resolveDocumentTarget(
        { ...source, sourceHash: "b".repeat(64) },
        { source_revision_id: "R2" },
      ),
    ).toThrow("source hash");
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
