import { describe, expect, it } from "vitest";
import {
  validateIfcNavigation,
  validateIfcSources,
  snapshotIfcSources,
} from "./ifcValidation";
import { sha256 } from "../drawing/pdfDiffValidation";
const data = new TextEncoder().encode("ISO-10303-21; IFC source").buffer;
const source = async () => ({
  revisionId: "R1:structure",
  sourceHash: await sha256(data),
  name: "structure.ifc",
  data,
});
describe("revision-bound IFC boundary", () => {
  it("accepts verified exported sources", async () => {
    await expect(validateIfcSources([await source()])).resolves.toBeUndefined();
  });
  it("rejects changed bytes, missing identity and duplicate revisions", async () => {
    const valid = await source();
    await expect(
      validateIfcSources([{ ...valid, sourceHash: "a".repeat(64) }]),
    ).rejects.toThrow("hash");
    await expect(
      validateIfcSources([{ ...valid, revisionId: "" }]),
    ).rejects.toThrow("IDs");
    await expect(validateIfcSources([valid, valid])).rejects.toThrow("unique");
  });
  it("rejects native inputs, empty and excessive sessions", async () => {
    const valid = await source();
    await expect(
      validateIfcSources([{ ...valid, name: "model.rvt" }]),
    ).rejects.toThrow("IFC");
    await expect(
      validateIfcSources([{ ...valid, data: new ArrayBuffer(0) }]),
    ).rejects.toThrow("empty");
    await expect(validateIfcSources([])).rejects.toThrow("one and four");
    await expect(validateIfcSources(Array(5).fill(valid))).rejects.toThrow(
      "one and four",
    );
  });
  it("copies verified session bytes and rejects oversized sources before copying", async () => {
    const valid = await source();
    const [copy] = snapshotIfcSources([valid]);
    expect(copy.data).not.toBe(valid.data);
    expect(new Uint8Array(copy.data)).toEqual(new Uint8Array(valid.data));
    expect(() =>
      snapshotIfcSources([
        { ...valid, data: new ArrayBuffer(128 * 1024 * 1024 + 1) },
      ]),
    ).toThrow("128 MiB");
  });
  it("requires the exact revision/hash and a compressed IFC GlobalId", () => {
    const target = {
      sourceRevisionId: "R1",
      sourceHash: "0".repeat(64),
      globalId: "3M0KwyPFrBT9KwklhqZa8W",
    };
    expect(() => validateIfcNavigation(target)).not.toThrow();
    for (const patch of [
      { globalId: "not-a-guid" },
      { sourceHash: "bad" },
      { sourceRevisionId: "" },
    ])
      expect(() => validateIfcNavigation({ ...target, ...patch })).toThrow();
  });
});
