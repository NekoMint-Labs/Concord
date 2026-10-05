import { describe, it, expect } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseBcfZip } from "../workers/bcf-parser.worker";
import { exportBcfZip } from "./bcf";
import { validateBcfViewpoint } from "./concord-bcf-camera";
import type { BcfTopic } from "../types";
const viewpoint = {
  guid: "22222222-2222-4222-8222-222222222222",
  cameraPosition: { x: 3, y: 2, z: 6 },
  cameraDirection: { x: 0, y: 0, z: -1 },
  cameraUp: { x: 0.6, y: 0.8, z: 0 },
  cameraKind: "orthogonal" as const,
  viewToWorldScale: 7.5,
  aspectRatio: 1,
  componentGuids: ["3M0KwyPFrBT9KwklhqZa8W"],
  clippingPlanes: [
    { location: { x: 0, y: 3, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
  ],
};
const topic: BcfTopic = {
  guid: "11111111-1111-4111-8111-111111111111",
  title: "View",
  source: "generated",
  viewpoints: [viewpoint],
  comments: [],
};
const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;

describe("Concord BCF adapter qualification", () => {
  it("uses the donor writer/parser for orthogonal optics, rolled camera and clipping", () => {
    const result = parseBcfZip(buffer(exportBcfZip([topic], "3.0")));
    expect(result.version).toBe("3.0");
    expect(result.topics[0].viewpoints[0]).toMatchObject(viewpoint);
  });
  it.each(["../outside", "/absolute", "C:/file", "topic//file", "topic\\file"])(
    "rejects unsafe archive member %s",
    (name) => {
      expect(() =>
        parseBcfZip(
          buffer(
            zipSync({
              "bcf.version": strToU8('<Version VersionId="3.0"/>'),
              [name]: strToU8("x"),
            }),
          ),
        ),
      ).toThrow("Unsafe");
    },
  );
  it("rejects missing version and decompression bombs before inflating their data", () => {
    expect(() =>
      parseBcfZip(buffer(zipSync({ "markup.bcf": strToU8("x") })), true),
    ).toThrow("manifest");
    expect(() =>
      parseBcfZip(
        buffer(
          zipSync({ "bcf.version": new Uint8Array(25 * 1024 * 1024 + 1) }),
        ),
      ),
    ).toThrow("expansion");
  });
  it("rejects unsafe optics, basis, identities and plane directions", () => {
    validateBcfViewpoint(viewpoint);
    for (const patch of [
      { cameraDirection: { x: 0, y: 0, z: 0 } },
      { cameraUp: { x: 0, y: 0, z: -1 } },
      { viewToWorldScale: 0 },
      { aspectRatio: Infinity },
      { componentGuids: ["bad"] },
      {
        clippingPlanes: [
          { location: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } },
        ],
      },
    ])
      expect(() => validateBcfViewpoint({ ...viewpoint, ...patch })).toThrow();
  });
});
