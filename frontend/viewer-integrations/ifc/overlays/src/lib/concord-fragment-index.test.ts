import { describe, it, expect, vi } from "vitest";
import type { ItemData, SpatialTreeItem } from "@thatopen/fragments";
import { ELEMENT_CATEGORIES } from "./concord-ifc-categories";
import { fragmentIndex } from "./concord-fragment-index";
function item(id: number, category = "IFCBEAM", name = `item-${id}`): ItemData {
  return {
    _localId: { value: id },
    _category: { value: category },
    _guid: { value: `guid-${id}` },
    Name: { value: name },
  };
}
function model(
  structure: SpatialTreeItem,
  data: ItemData[],
  geometry: number[] = [],
) {
  return {
    getSpatialStructure: vi.fn(async () => structure),
    getItemsIdsWithGeometry: vi.fn(async () => geometry),
    getItemsOfCategories: vi.fn(async () => {
      const ids = data
        .filter((d) =>
          ELEMENT_CATEGORIES.test(
            (d._category as { value: string })?.value ?? "",
          ),
        )
        .map((d) => (d._localId as { value: number }).value);
      return { elements: ids };
    }),
    getItemsData: vi.fn(async (ids: (number | string)[]) =>
      data.filter((d) => ids.includes((d._localId as { value: number }).value)),
    ),
  };
}
const physical = (localId: number): SpatialTreeItem => ({
  category: "IFCBEAM",
  localId,
});
const project = (children: SpatialTreeItem[] = []): SpatialTreeItem => ({
  category: "IFCPROJECT",
  localId: 1,
  children,
});
const virtual = (children: SpatialTreeItem[]): SpatialTreeItem => ({
  category: "IFCPROJECT",
  localId: null,
  children,
});
describe("native fragment index", () => {
  it("retains GUIDs, properties, hierarchy and physical decomposition without source bytes", async () => {
    const p = item(1, "IFCPROJECT", "Project");
    const storey = item(2, "IFCBUILDINGSTOREY", "Level 1");
    storey.LongName = { value: "Coordination level" };
    const assembly = item(3, "IFCELEMENTASSEMBLY");
    assembly.IsDecomposedBy = [item(4)];
    const m = model(
      virtual([
        project([
          {
            category: "IFCBUILDINGSTOREY",
            localId: 2,
            children: [
              {
                category: "IFCELEMENTASSEMBLY",
                localId: 3,
                children: [physical(4)],
              },
            ],
          },
        ]),
      ]),
      [p, storey, assembly, item(4)],
      [3, 4],
    );
    const index = await fragmentIndex(m);
    expect(index.tree[0]).toMatchObject({
      expressId: 1,
      name: "Project",
      globalId: "guid-1",
    });
    expect(index.tree[0].children[0]).toMatchObject({
      expressId: 2,
      ifcClass: "IfcBuildingStorey",
      longName: "Coordination level",
      containedElements: [{ expressId: 3, globalId: "guid-3" }],
    });
    expect(index.decomp).toEqual([[3, [4]]]);
    expect(m.getSpatialStructure).toHaveBeenCalledOnce();
    expect(m.getItemsData.mock.calls[0][0]).toEqual([1, 2, 3, 4]);
  });
  it("keeps uncontained geometry in an explicit group and deduplicates geometry IDs", async () => {
    const index = await fragmentIndex(
      model(project(), [item(1, "IFCPROJECT"), item(7)], [7, 7]),
    );
    expect(index.tree[1]).toMatchObject({
      ifcClass: "Uncontained",
      globalId: "",
      containedElements: [{ expressId: 7, globalId: "guid-7" }],
    });
  });
  it("retains physical elements without geometry or spatial containment", async () => {
    const index = await fragmentIndex(
      model(project(), [item(1, "IFCPROJECT"), item(8, "IFCDUCTSEGMENT")], []),
    );
    expect(index.tree[1]).toMatchObject({
      name: "Uncontained elements",
      containedElements: [
        { expressId: 8, ifcClass: "IfcDuctSegment", globalId: "guid-8" },
      ],
    });
    expect(ELEMENT_CATEGORIES.test("IFCPROPERTYSET")).toBe(false);
    expect(ELEMENT_CATEGORIES.test("IFCRELAGGREGATES")).toBe(false);
  });
  it("separate models with the same local IDs retain their own metadata", async () => {
    const results = await Promise.all(
      ["Structure", "MEP"].map((name) =>
        fragmentIndex(
          model(project([physical(3)]), [
            item(1, "IFCPROJECT", name),
            item(3, "IFCBEAM", name),
          ]),
        ),
      ),
    );
    expect(results.map((x) => x.tree[0].containedElements[0].name)).toEqual([
      "Structure",
      "MEP",
    ]);
  });
  it("omits spatial aggregation from the physical decomposition map", async () => {
    const p = item(1, "IFCPROJECT");
    p.IsDecomposedBy = [item(2, "IFCBUILDING")];
    const index = await fragmentIndex(
      model(project([{ category: "IFCBUILDING", localId: 2 }]), [
        p,
        item(2, "IFCBUILDING"),
      ]),
    );
    expect(index.decomp).toEqual([]);
  });
  it("rejects incomplete metadata and missing category rather than inventing a valid tree", async () => {
    await expect(
      fragmentIndex(model(project([physical(3)]), [item(1, "IFCPROJECT")])),
    ).rejects.toThrow("incomplete");
    const p = item(1, "IFCPROJECT");
    delete p._category;
    await expect(fragmentIndex(model(project(), [p]))).rejects.toThrow(
      "category",
    );
  });
  it("rejects metadata belonging to a different request", async () => {
    const m = model(project(), [item(1, "IFCPROJECT")]);
    m.getItemsData.mockResolvedValue([item(2)]);
    await expect(fragmentIndex(m)).rejects.toThrow("requested ID");
  });
  it("rejects cyclic or excessively deep spatial structure", async () => {
    const cycle = project();
    cycle.children = [cycle];
    await expect(fragmentIndex(model(cycle, []))).rejects.toThrow("cycle");
    let deep = physical(5);
    for (let i = 0; i < 130; i++) deep = virtual([deep]);
    await expect(fragmentIndex(model(deep, []))).rejects.toThrow("bounds");
  });
  it("rejects cyclic decomposition and missing child metadata", async () => {
    const a = item(3);
    const b = item(4);
    a.IsDecomposedBy = [b];
    b.IsDecomposedBy = [a];
    await expect(
      fragmentIndex(
        model(project([physical(3), physical(4)]), [
          item(1, "IFCPROJECT"),
          a,
          b,
        ]),
      ),
    ).rejects.toThrow("cycle");
    a.IsDecomposedBy = [item(9)];
    await expect(
      fragmentIndex(model(project([physical(3)]), [item(1, "IFCPROJECT"), a])),
    ).rejects.toThrow("unavailable children");
  });
  it("rejects conflicting hierarchy categories and duplicate spatial parents", async () => {
    await expect(
      fragmentIndex(
        model(project([physical(3), { category: "IFCWALL", localId: 3 }]), []),
      ),
    ).rejects.toThrow("Conflicting");
    await expect(
      fragmentIndex(
        model(virtual([project(), project()]), [item(1, "IFCPROJECT")]),
      ),
    ).rejects.toThrow("multiple parents");
  });
  it("fails on removal before reading further derived data", async () => {
    const m = model(project(), [item(1, "IFCPROJECT")]);
    await expect(fragmentIndex(m, () => false)).rejects.toThrow("removed");
    expect(m.getItemsData).not.toHaveBeenCalled();
  });
  it("batches native metadata to bound individual SDK requests", async () => {
    const ids = Array.from({ length: 600 }, (_, i) => i + 2);
    const m = model(project(ids.map(physical)), [
      item(1, "IFCPROJECT"),
      ...ids.map((n) => item(n)),
    ]);
    expect((await fragmentIndex(m)).tree[0].containedElements).toHaveLength(
      600,
    );
    expect(m.getItemsData.mock.calls.map((call) => call[0].length)).toEqual([
      256, 256, 89,
    ]);
  });
  it.each([0, -1, NaN, Infinity])(
    "rejects invalid derived geometry ID %s",
    async (bad) => {
      await expect(
        fragmentIndex(model(project(), [item(1, "IFCPROJECT")], [bad])),
      ).rejects.toThrow("geometry index");
    },
  );
  it("enforces geometry, physical-element and total item budgets before metadata reads", async () => {
    const large = Array.from({ length: 500001 }, (_, i) => i + 2);
    const m = model(project(), [item(1, "IFCPROJECT")], large);
    await expect(fragmentIndex(m)).rejects.toThrow("geometry index");
    expect(m.getItemsData).not.toHaveBeenCalled();
    m.getItemsIdsWithGeometry.mockResolvedValue([]);
    m.getItemsOfCategories.mockResolvedValue({ elements: large });
    await expect(fragmentIndex(m)).rejects.toThrow("element index");
    m.getItemsIdsWithGeometry.mockResolvedValue([2]);
    m.getItemsOfCategories.mockResolvedValue({
      elements: large.slice(0, 500000),
    });
    await expect(fragmentIndex(m)).rejects.toThrow("item budget");
    m.getItemsIdsWithGeometry.mockResolvedValue([]);
    await expect(fragmentIndex(m)).rejects.toThrow("item budget");
  });
  it("rejects invalid hierarchy and physical-element IDs", async () => {
    await expect(fragmentIndex(model(physical(-2), []))).rejects.toThrow(
      "hierarchy ID",
    );
    const m = model(project(), [item(1, "IFCPROJECT")]);
    m.getItemsOfCategories.mockResolvedValue({ elements: [0] });
    await expect(fragmentIndex(m)).rejects.toThrow("element index");
  });
  it("rejects missing stable item IDs and malformed decomposition records", async () => {
    const m = model(project(), [item(1, "IFCPROJECT")]);
    const p = item(1, "IFCPROJECT");
    delete p._localId;
    m.getItemsData.mockResolvedValue([p]);
    await expect(fragmentIndex(m)).rejects.toThrow("stable local ID");
    const a = item(3);
    a.IsDecomposedBy = { value: "not a relation" };
    await expect(
      fragmentIndex(model(project([physical(3)]), [item(1, "IFCPROJECT"), a])),
    ).rejects.toThrow("Invalid fragment decomposition");
    a.IsDecomposedBy = Array.from({ length: 500001 }, () => item(3));
    await expect(
      fragmentIndex(model(project([physical(3)]), [item(1, "IFCPROJECT"), a])),
    ).rejects.toThrow("exceeds bounds");
  });
  it("retains explicit GlobalId, optional description, unknown classes and unnamed elements", async () => {
    const p = item(1, "IFCPROJECT");
    p.Description = { value: "Engineering project" };
    p.GlobalId = { value: "explicit-guid" };
    const a = item(3, "VendorElement", "");
    a.Name = [];
    delete a._guid;
    const index = await fragmentIndex(
      model(project([physical(3), physical(3)]), [p, a]),
    );
    expect(index.tree[0]).toMatchObject({
      globalId: "explicit-guid",
      description: "Engineering project",
    });
    expect(index.tree[0].containedElements).toEqual([
      { expressId: 3, globalId: "", ifcClass: "VendorElement", name: "#3" },
    ]);
  });
  it("rejects a physical hierarchy containing a spatial descendant", async () => {
    await expect(
      fragmentIndex(
        model(
          project([
            {
              category: "IFCBEAM",
              localId: 3,
              children: [{ category: "IFCBUILDINGSTOREY", localId: 4 }],
            },
          ]),
          [item(1, "IFCPROJECT"), item(3), item(4, "IFCBUILDINGSTOREY")],
        ),
      ),
    ).rejects.toThrow("physical element");
  });
  it("bounds deep physical decomposition independent of spatial tree depth", async () => {
    const entities = Array.from({ length: 131 }, (_, i) => item(i + 3));
    for (let i = 0; i < entities.length - 1; i++)
      entities[i].IsDecomposedBy = [entities[i + 1]];
    await expect(
      fragmentIndex(
        model(project(entities.map((_, i) => physical(i + 3))), [
          item(1, "IFCPROJECT"),
          ...entities,
        ]),
      ),
    ).rejects.toThrow("bounds");
  });
  it("handles geometry outside any native spatial root and empty element names", async () => {
    const index = await fragmentIndex(model(virtual([physical(3)]), [item(3)]));
    expect(index.tree[0]).toMatchObject({
      ifcClass: "Uncontained",
      containedElements: [{ expressId: 3 }],
    });
  });
});
