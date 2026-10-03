import { ifcClassName } from "./concord-ifc-categories";
import type { ItemData, SpatialTreeItem } from "@thatopen/fragments";
import type { SpatialNode, SpatialElement } from "../types";
export type FragmentIndex = {
  tree: SpatialNode[];
  decomp: [number, number[]][];
};
export const MAX_DEPTH = 128;
const SPATIAL = new Set([
  "IFCPROJECT",
  "IFCSITE",
  "IFCBUILDING",
  "IFCBUILDINGSTOREY",
  "IFCSPACE",
  "IFCFACILITY",
  "IFCFACILITYPART",
  "IFCBRIDGE",
  "IFCROAD",
  "IFCRAILWAY",
  "IFCMARINEFACILITY",
]);
export function id(value: number | null): value is number {
  return Number.isSafeInteger(value) && value! > 0;
}
export function value(item: ItemData, key: string): string {
  const attribute = item[key];
  return attribute &&
    !Array.isArray(attribute) &&
    typeof attribute.value === "string"
    ? attribute.value
    : "";
}
export function localId(item: ItemData): number {
  const attribute = item._localId;
  if (
    !attribute ||
    Array.isArray(attribute) ||
    typeof attribute.value !== "number" ||
    !id(attribute.value)
  )
    throw new Error("Fragment item has no stable local ID");
  return attribute.value;
}

/** Adapt native hierarchy/relationships to the existing donor ModelTree shape. */
export function composeFragmentTree(
  structure: SpatialTreeItem,
  items: Map<number, ItemData>,
  decomposed: Map<number, number[]>,
  geometry: number[],
): FragmentIndex {
  function element(key: number): SpatialElement {
    const item = items.get(key);
    if (!item) throw new Error("Fragment hierarchy metadata is unavailable");
    return {
      expressId: key,
      globalId: value(item, "GlobalId") || value(item, "_guid"),
      ifcClass: ifcClassName(value(item, "_category")),
      name: value(item, "Name") || `#${key}`,
    };
  }
  const placed = new Set<number>();
  const tree: SpatialNode[] = [];
  function append(node: SpatialTreeItem, parent: SpatialNode | null): void {
    if (!id(node.localId)) {
      for (const child of node.children ?? []) append(child, parent);
      return;
    }
    const key = node.localId;
    if (placed.has(key)) {
      if (SPATIAL.has(element(key).ifcClass.toUpperCase()))
        throw new Error(
          "Spatial item has multiple parents or a cyclic identity",
        );
      return;
    }
    placed.add(key);
    const info = element(key);
    if (SPATIAL.has(info.ifcClass.toUpperCase())) {
      const item = items.get(key)!;
      const spatial: SpatialNode = {
        ...info,
        longName: value(item, "LongName") || undefined,
        description: value(item, "Description") || undefined,
        children: [],
        containedElements: [],
      };
      (parent ? parent.children : tree).push(spatial);
      for (const child of node.children ?? []) append(child, spatial);
    } else {
      if (parent) parent.containedElements.push(info);
      else uncontained.push(info);
      // Physical children remain available via the donor's decomposition map.
      for (const child of node.children ?? []) {
        if (
          id(child.localId) &&
          SPATIAL.has(element(child.localId).ifcClass.toUpperCase())
        )
          throw new Error("Spatial node decomposes from a physical element");
        markPhysical(child);
      }
    }
  }
  function markPhysical(node: SpatialTreeItem): void {
    if (id(node.localId)) placed.add(node.localId);
    for (const child of node.children ?? []) markPhysical(child);
  }
  const uncontained: SpatialElement[] = [];
  append(structure, null);
  for (const key of geometry)
    if (!placed.has(key)) {
      uncontained.push(element(key));
      placed.add(key);
    }
  // Explicit UI grouping; never claims an IFC spatial containment relation.
  if (uncontained.length)
    tree.push({
      expressId: -1,
      globalId: "",
      ifcClass: "Uncontained",
      name: "Uncontained elements",
      children: [],
      containedElements: uncontained,
    });
  const decomp: [number, number[]][] = [];
  for (const [key, children] of decomposed) {
    if (SPATIAL.has(element(key).ifcClass.toUpperCase()) || !children.length)
      continue;
    if (children.some((child) => !items.has(child)))
      throw new Error("Fragment decomposition has unavailable children");
    decomp.push([key, children]);
  }
  const edges = new Map(decomp);
  const checked = new Set<number>();
  function checkDecomp(key: number, path: Set<number>): void {
    if (path.has(key) || path.size > MAX_DEPTH)
      throw new Error(
        "Fragment decomposition exceeds bounds or contains a cycle",
      );
    if (checked.has(key)) return;
    path.add(key);
    for (const child of edges.get(key) ?? []) checkDecomp(child, path);
    path.delete(key);
    checked.add(key);
  }
  for (const key of edges.keys()) checkDecomp(key, new Set());
  return { tree, decomp };
}
