import { ELEMENT_CATEGORIES } from "./concord-ifc-categories";
import type {
  FragmentsModel,
  ItemData,
  SpatialTreeItem,
} from "@thatopen/fragments";
import {
  composeFragmentTree,
  id,
  localId,
  value,
  MAX_DEPTH,
} from "./concord-fragment-tree";
import type { FragmentIndex } from "./concord-fragment-tree";
export type { FragmentIndex } from "./concord-fragment-tree";
type Model = Pick<
  FragmentsModel,
  | "getSpatialStructure"
  | "getItemsIdsWithGeometry"
  | "getItemsData"
  | "getItemsOfCategories"
>;
const MAX_ITEMS = 500000;
const BATCH = 256;
function collectHierarchy(
  structure: SpatialTreeItem,
): Map<number, SpatialTreeItem> {
  const hierarchy = new Map<number, SpatialTreeItem>();
  let count = 0;
  function collect(
    node: SpatialTreeItem,
    depth: number,
    path: Set<SpatialTreeItem>,
  ): void {
    if (++count > MAX_ITEMS || depth > MAX_DEPTH || path.has(node))
      throw new Error("Fragment hierarchy exceeds bounds or contains a cycle");
    path.add(node);
    if (node.localId !== null && node.localId !== undefined) {
      if (!id(node.localId)) throw new Error("Invalid fragment hierarchy ID");
      // Shared physical references may occur, but a local ID has one category.
      const previous = hierarchy.get(node.localId);
      if (previous && previous.category !== node.category)
        throw new Error("Conflicting fragment categories");
      hierarchy.set(node.localId, node);
    }
    for (const child of node.children ?? []) collect(child, depth + 1, path);
    path.delete(node);
  }
  collect(structure, 0, new Set());
  return hierarchy;
}
async function readMetadata(
  model: Model,
  ids: number[],
  checkpoint: () => void,
) {
  const items = new Map<number, ItemData>();
  const decomposed = new Map<number, number[]>();
  for (let offset = 0; offset < ids.length; offset += BATCH) {
    checkpoint();
    const batch = ids.slice(offset, offset + BATCH);
    const data = await model.getItemsData(batch, {
      attributesDefault: false,
      attributes: ["Name", "LongName", "Description", "GlobalId"],
      relations: { IsDecomposedBy: { attributes: true, relations: false } },
      relationsDefault: { attributes: false, relations: false },
    });
    checkpoint();
    const requested = new Set(batch);
    for (const item of data) {
      const key = localId(item);
      if (!requested.delete(key))
        throw new Error("Fragment item does not match its requested ID");
      const category = value(item, "_category");
      if (!category) throw new Error("Fragment item category is unavailable");
      items.set(key, item);
      const children = item.IsDecomposedBy;
      if (children !== undefined && !Array.isArray(children))
        throw new Error("Invalid fragment decomposition");
      if (Array.isArray(children)) {
        if (children.length > MAX_ITEMS)
          throw new Error("Fragment decomposition exceeds bounds");
        decomposed.set(key, [...new Set(children.map(localId))]);
      }
    }
    if (requested.size) throw new Error("Fragment metadata is incomplete");
  }
  return { items, decomposed };
}
/** Maps native derived data to the donor ModelTree; never opens IFC bytes. */
export async function fragmentIndex(
  model: Model,
  alive: () => boolean = () => true,
): Promise<FragmentIndex> {
  const checkpoint = () => {
    if (!alive()) throw new Error("Model removed during fragment indexing");
  };
  const structure = await model.getSpatialStructure();
  checkpoint();
  const hierarchy = collectHierarchy(structure);
  const geometry = await model.getItemsIdsWithGeometry();
  checkpoint();
  if (geometry.length > MAX_ITEMS || geometry.some((n) => !id(n)))
    throw new Error("Invalid or oversized fragment geometry index");
  const physical = await model.getItemsOfCategories([ELEMENT_CATEGORIES]);
  checkpoint();
  const elements = [...new Set(geometry)];
  for (const group of Object.values(physical)) {
    if (group.length > MAX_ITEMS || group.some((n) => !id(n)))
      throw new Error("Invalid or oversized fragment element index");
    for (const key of group) elements.push(key);
    if (elements.length > MAX_ITEMS)
      throw new Error("Fragment element index exceeds item budget");
  }
  const ids = [...new Set([...hierarchy.keys(), ...elements])];
  if (ids.length > MAX_ITEMS)
    throw new Error("Fragment index exceeds item budget");
  const { items, decomposed } = await readMetadata(model, ids, checkpoint);
  const result = composeFragmentTree(structure, items, decomposed, [
    ...new Set(elements),
  ]);
  checkpoint();
  return result;
}
