import { expect, it } from "vitest";
import {
  OTHER_PROPERTIES_TITLE,
  formatPropertyValue,
  propertyLabel,
  propertySections,
} from "./bimProperties";

it("labels known technical keys and leaves unknown keys as identifiers", () => {
  expect(propertyLabel("FireRating")).toBe("防火等级");
  expect(propertyLabel("Width")).toBe("宽度");
  expect(propertyLabel("Height")).toBe("高度");
  expect(propertyLabel("ChangeStatus")).toBe("变更状态");
  expect(propertyLabel("WorkPackageIds")).toBe("关联工作包");
  expect(propertyLabel("Easting")).toBe("东向偏移");
  // An imported IFC key with no certain meaning stays a technical identifier.
  expect(propertyLabel("Pset_WallCommon")).toBe("Pset_WallCommon");
  expect(propertyLabel("LoadBearing")).toBe("LoadBearing");
});

it("renders lists, booleans, and dimensions the way the sheet reads", () => {
  expect(formatPropertyValue("WorkPackageIds", ["WP-100", "WP-200"])).toBe(
    "WP-100、WP-200",
  );
  expect(formatPropertyValue("LoadBearing", true)).toBe("是");
  expect(formatPropertyValue("LoadBearing", false)).toBe("否");
  // The demo fixture measures Width / Height / Easting in metres.
  expect(formatPropertyValue("Width", 0.2)).toBe("0.2 m");
  expect(formatPropertyValue("Height", 0.4)).toBe("0.4 m");
  // FireRating carries its own unit inside the string; nothing is added.
  expect(formatPropertyValue("FireRating", "120 min")).toBe("120 min");
});

it("routes ChangeStatus domain values through the shared label layer", () => {
  expect(formatPropertyValue("ChangeStatus", "baseline")).toBe("基线");
  expect(formatPropertyValue("ChangeStatus", "changed")).toBe("已变更");
  expect(formatPropertyValue("ChangeStatus", "affected")).toBe("受影响");
  expect(formatPropertyValue("ChangeStatus", "unchanged")).toBe("未变更");
  // An unknown value is shown as the identifier, never guessed at.
  expect(formatPropertyValue("ChangeStatus", "review")).toBe("review");
});

it("renders nested property sets as nested rows, never as JSON", () => {
  const sections = propertySections({
    ChangeStatus: "baseline",
    Pset_WallCommon: { FireRating: "120 min", LoadBearing: true },
  });
  expect(
    sections.map((section) => section.title ?? OTHER_PROPERTIES_TITLE),
  ).toEqual([OTHER_PROPERTIES_TITLE, "Pset_WallCommon"]);
  expect(sections[0].fields).toEqual([{ label: "变更状态", value: "基线" }]);
  expect(sections[1].fields).toEqual([
    { label: "防火等级", value: "120 min" },
    { label: "LoadBearing", value: "是" },
  ]);
  const rendered = sections
    .flatMap((section) => section.fields.map((field) => field.value))
    .join("\n");
  // No JSON source can reach a value: no object braces, no "key": pairs.
  expect(rendered).not.toMatch(/[{}]|":/);
});

it("never emits JSON source for an object value", () => {
  const value = formatPropertyValue("Geometry", { X: 1, Y: 2 });
  expect(value).toBe("X：1、Y：2");
  expect(value).not.toMatch(/[{}]|":/);
});
