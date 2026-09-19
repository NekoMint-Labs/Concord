import { expect, it } from "vitest";
import type { DTO } from "../api/client";
import { filterBimCandidates } from "./BimMappingWorkspace";

const elements = [
  {
    revision_id: "r1",
    global_id: "wall-l02",
    ifc_class: "IfcWall",
    name: "Wall",
    storey: "L02",
    space: "Lab",
    properties: {},
  },
  {
    revision_id: "r1",
    global_id: "duct-l02",
    ifc_class: "IfcDuctSegment",
    name: "Duct",
    storey: "L02",
    space: "Plant",
    properties: {},
  },
  {
    revision_id: "r1",
    global_id: "wall-l03",
    ifc_class: "IfcWall",
    name: "Wall",
    storey: "L03",
    space: "Lab",
    properties: {},
  },
] satisfies DTO<"BimElementSnapshot">[];

it("intersects storey, space, and IFC type filters without inventing membership", () => {
  expect(
    filterBimCandidates(elements, {
      storey: "L02",
      space: "Lab",
      ifcClass: "IfcWall",
    }).map((item) => item.global_id),
  ).toEqual(["wall-l02"]);
  expect(
    filterBimCandidates(elements, {
      storey: "L02",
      space: "",
      ifcClass: "",
    }),
  ).toHaveLength(2);
});
