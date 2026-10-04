import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import IfcSurface from "./IfcSurface";
import type { BimTarget, IfcSource } from "./ifcTypes";
import { sha256 } from "../drawing/pdfDiffValidation";
import { IFC_DONOR, IFC_LOCK, IFC_NAVIGATION } from "./ifcValidation";
const state = vi.hoisted(() => ({
  instances: [] as Array<{
    navigate: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    selected: (target: unknown) => void;
    failure: (error: Error | null) => void;
  }>,
}));
vi.mock("./IfcModelAdapter", () => ({
  IfcModelAdapter: class {
    summaries = [{ elementCount: 1 }];
    load = vi.fn(async () => this.summaries);
    navigate = vi.fn(async (target: unknown) => {
      this.failure(null);
      this.selected(target);
      return target;
    });
    dispose = vi.fn();
    constructor(
      _mount: HTMLElement,
      readonly selected: (target: unknown) => void,
      readonly failure: (error: Error | null) => void,
    ) {
      state.instances.push(this);
    }
  },
}));
const target: BimTarget = {
  kind: "bim",
  source_revision_id: "R2",
  global_ids: ["3M0KwyPFrBT9KwklhqZa8W"],
};
async function source(): Promise<IfcSource> {
  const data = new TextEncoder().encode("IFC source").buffer;
  return {
    revisionId: "R2",
    sourceHash: await sha256(data),
    name: "structure.ifc",
    data,
  };
}
beforeEach(() => {
  state.instances = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        name: "concord-ifc-integration",
        revision: IFC_DONOR,
        lock: IFC_LOCK,
        navigation: IFC_NAVIGATION,
      }),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("loads lazily and consumes canonical initial and changed targets with one SDK lifetime", async () => {
  const sources = [await source()],
    selected = vi.fn();
  const view = render(
    <IfcSurface sources={sources} target={target} onSelection={selected} />,
  );
  await waitFor(() =>
    expect(state.instances[0]?.navigate).toHaveBeenCalledWith(target),
  );
  expect(selected).toHaveBeenCalledWith(target);
  const next = { ...target, source_revision_id: "R3" };
  view.rerender(
    <IfcSurface sources={sources} target={next} onSelection={selected} />,
  );
  await waitFor(() =>
    expect(state.instances[0].navigate).toHaveBeenLastCalledWith(next),
  );
  expect(state.instances).toHaveLength(1);
  expect(state.instances[0].dispose).not.toHaveBeenCalled();
});
it("presents navigation errors and recovers without disposing a usable model", async () => {
  const sources = [await source()];
  render(<IfcSurface sources={sources} />);
  await waitFor(() => expect(state.instances).toHaveLength(1));
  const adapter = state.instances[0];
  act(() => adapter.failure(new Error("IFC GlobalId is absent")));
  expect(screen.getByRole("alert")).toHaveTextContent("GlobalId is absent");
  act(() => adapter.failure(null));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(adapter.dispose).not.toHaveBeenCalled();
});
it("disposes replaced/unmounted sessions and fences their late callbacks", async () => {
  const first = [await source()],
    selected = vi.fn();
  const view = render(<IfcSurface sources={first} onSelection={selected} />);
  await waitFor(() => expect(state.instances).toHaveLength(1));
  const old = state.instances[0];
  view.rerender(
    <IfcSurface
      sources={[{ ...first[0], revisionId: "R3" }]}
      onSelection={selected}
    />,
  );
  await waitFor(() => expect(state.instances).toHaveLength(2));
  expect(old.dispose).toHaveBeenCalledOnce();
  act(() => {
    old.failure(new Error("old failure"));
    old.selected(target);
  });
  expect(selected).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  view.unmount();
  expect(state.instances[1].dispose).toHaveBeenCalledOnce();
});

it("rejects stale viewer assets that cannot acknowledge canonical BIM navigation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        name: "concord-ifc-integration",
        revision: IFC_DONOR,
        lock: IFC_LOCK,
      }),
    })),
  );
  render(<IfcSurface sources={[await source()]} />);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "version is unsupported",
    ),
  );
  expect(state.instances).toHaveLength(0);
});
