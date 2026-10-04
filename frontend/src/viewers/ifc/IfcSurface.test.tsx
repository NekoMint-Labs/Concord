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
    clearSelection: ReturnType<typeof vi.fn>;
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
    clearSelection = vi.fn(async (reportRecovery = true) => {
      if (reportRecovery) this.failure(null);
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
    expect(screen.getByRole("alert")).toHaveTextContent("not loaded"),
  );
  expect(state.instances[0].navigate).toHaveBeenCalledOnce();
  expect(state.instances[0].clearSelection).toHaveBeenCalledWith(false);
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

it("opens a verified source-only BIM target without requesting element navigation", async () => {
  const sources = [await source()],
    failure = vi.fn();
  const view = render(
    <IfcSurface
      sources={sources}
      target={{ ...target, global_ids: [] }}
      onError={failure}
    />,
  );
  await waitFor(() =>
    expect(state.instances[0]?.clearSelection).toHaveBeenCalledOnce(),
  );
  expect(state.instances[0].navigate).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  view.rerender(
    <IfcSurface sources={sources} target={target} onError={failure} />,
  );
  await waitFor(() =>
    expect(state.instances[0].navigate).toHaveBeenCalledWith(target),
  );
  view.rerender(
    <IfcSurface
      sources={sources}
      target={{ ...target, global_ids: [] }}
      onError={failure}
    />,
  );
  await waitFor(() =>
    expect(state.instances[0].clearSelection).toHaveBeenCalledTimes(2),
  );
  expect(state.instances).toHaveLength(1);
});
it("reports an unavailable viewer to the Evidence host", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false })),
  );
  const failure = vi.fn();
  render(<IfcSurface sources={[await source()]} onError={failure} />);
  await waitFor(() =>
    expect(failure).toHaveBeenLastCalledWith(
      "The local IFC capability has not been built",
    ),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("has not been built");
});

it("keeps source-only revision and non-null viewpoint failures visible to the host", async () => {
  const sources = [await source()],
    failure = vi.fn();
  const view = render(
    <IfcSurface
      sources={sources}
      target={{ ...target, global_ids: [], viewpoint: [1, 2, 3, 4, 5, 6] }}
      onError={failure}
    />,
  );
  await waitFor(() =>
    expect(failure).toHaveBeenLastCalledWith(
      "BIM viewpoint is reserved; use BCF for camera exchange",
    ),
  );
  expect(state.instances[0].navigate).not.toHaveBeenCalled();
  view.rerender(
    <IfcSurface
      sources={sources}
      target={{ ...target, global_ids: [], source_revision_id: "missing" }}
      onError={failure}
    />,
  );
  await waitFor(() =>
    expect(failure).toHaveBeenLastCalledWith(
      "IFC target source revision is not loaded",
    ),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("not loaded");
});

it("retains a reserved viewpoint error if an older native request reports late recovery", async () => {
  const sources = [await source()],
    report = vi.fn();
  const view = render(
    <IfcSurface sources={sources} target={target} onError={report} />,
  );
  await waitFor(() => expect(state.instances).toHaveLength(1));
  view.rerender(
    <IfcSurface
      sources={sources}
      target={{ ...target, viewpoint: [1, 2, 3, 4, 5, 6] }}
      onError={report}
    />,
  );
  act(() => state.instances[0].failure(null));
  expect(screen.getByRole("alert")).toHaveTextContent("reserved");
  expect(report).toHaveBeenLastCalledWith(
    "BIM viewpoint is reserved; use BCF for camera exchange",
  );
});
