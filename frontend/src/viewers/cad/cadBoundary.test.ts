import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  verifyCadSource,
  validateCadTarget,
} from "../../../viewer-integrations/cad/src/cadTypes";
import { snapshotCadSources } from "./cadValidation";
import type { CadNavigation } from "./cadTypes";
vi.stubGlobal("crypto", webcrypto);
async function source(name = "review.dxf") {
  const data = new TextEncoder().encode(
    "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n",
  ).buffer;
  const digest = await webcrypto.subtle.digest("SHA-256", data);
  return {
    name,
    data,
    revisionId: "r1",
    sourceHash: Buffer.from(digest).toString("hex"),
  };
}
describe("native/CAD viewer boundary", () => {
  it("requires a revision-bound hexadecimal CAD handle", () => {
    const target = {
      sourceRevisionId: "R1",
      sourceHash: "a".repeat(64),
      entityId: "31",
    };
    expect(() => validateCadTarget(target)).not.toThrow();
    for (const patch of [
      { entityId: "../31" },
      { entityId: "" },
      { sourceHash: "bad" },
      { sourceRevisionId: "" },
      { layer: "" },
      { layer: "bad\u0000layer" },
      { layer: "x".repeat(256) },
      { viewBounds: { minX: 2, minY: 0, maxX: 1, maxY: 2 } },
      { viewBounds: { minX: 0, minY: 2, maxX: 1, maxY: 1 } },
      { viewBounds: { minX: 0, minY: 0, maxX: Infinity, maxY: 2 } },
      { viewBounds: { minX: 0, minY: 0, maxX: Number.NaN, maxY: 2 } },
    ])
      expect(() => validateCadTarget({ ...target, ...patch })).toThrow(
        "Invalid",
      );
  });
  it.each([
    { minX: 0, minY: 1, maxX: 10, maxY: 1 },
    { minX: 2, minY: 0, maxX: 2, maxY: 10 },
    { minX: 2, minY: 3, maxX: 2, maxY: 3 },
  ])("accepts finite native line and point extents %j", (viewBounds) => {
    expect(() =>
      validateCadTarget({
        sourceRevisionId: "R1",
        sourceHash: "a".repeat(64),
        entityId: "31",
        viewBounds,
      }),
    ).not.toThrow();
  });
  it.each([
    { layer: null },
    { viewBounds: null },
    { layer: null, viewBounds: null },
  ])("accepts nullable optional CAD hints %j", (hints) => {
    expect(() =>
      validateCadTarget({
        sourceRevisionId: "R1",
        sourceHash: "a".repeat(64),
        entityId: "31",
        ...hints,
      }),
    ).not.toThrow();
  });
  it.each([42, {}, ["STRUCTURE"]])("rejects a non-string layer %j", (layer) => {
    expect(() =>
      validateCadTarget({
        sourceRevisionId: "R1",
        sourceHash: "a".repeat(64),
        entityId: "31",
        layer,
      } as unknown as CadNavigation),
    ).toThrow("Invalid revision-bound CAD entity target");
  });
  it("accepts a bounded native layer hint for ViewerTarget mapping", () => {
    expect(() =>
      validateCadTarget({
        sourceRevisionId: "R1",
        sourceHash: "a".repeat(64),
        entityId: "31",
        layer: "MEP",
        viewBounds: { minX: 0, minY: 0, maxX: 10, maxY: 20 },
      }),
    ).not.toThrow();
  });
  it("validates before copying and captures independent revision bytes", async () => {
    const original = await source();
    const [snapshot] = snapshotCadSources(original);
    expect(snapshot.data).not.toBe(original.data);
    new Uint8Array(original.data).fill(0);
    await expect(verifyCadSource(snapshot)).resolves.toBeUndefined();
    expect(() =>
      snapshotCadSources({
        ...snapshot,
        data: { byteLength: 1 } as ArrayBuffer,
      }),
    ).toThrow("ArrayBuffer");
    expect(() => snapshotCadSources(snapshot, snapshot)).toThrow("distinct");
    expect(() =>
      snapshotCadSources({
        ...snapshot,
        data: new ArrayBuffer(32 * 1024 * 1024 + 1),
      }),
    ).toThrow("limit");
  });
  it("accepts a revision-bound, byte-verified DXF staging source", async () => {
    await expect(verifyCadSource(await source())).resolves.toBeUndefined();
  });
  it.each([
    "native.dwg",
    "native.rvt",
    "native.nwd",
    "native.nwc",
    "../source.dxf",
    "folder\\source.dxf",
    "bad\u0000.dxf",
  ])("rejects %s before any SDK is initialized", async (name) => {
    await expect(verifyCadSource(await source(name))).rejects.toThrow(
      "Only DXF",
    );
  });
  it("rejects hash mismatch, missing revision, invalid hashes and empty/oversized bytes", async () => {
    const original = await source();
    for (const mutation of [
      { revisionId: "" },
      { sourceHash: "wrong" },
      { sourceHash: "0".repeat(64) },
      { data: new ArrayBuffer(0) },
      { data: new ArrayBuffer(32 * 1024 * 1024 + 1) },
    ]) {
      await expect(
        verifyCadSource({ ...original, ...mutation }),
      ).rejects.toThrow();
    }
  });
});
