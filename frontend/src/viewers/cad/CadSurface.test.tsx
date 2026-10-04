import { webcrypto } from "node:crypto";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CadSurface from "./CadSurface";
import type { CadNavigation, CadSource, CadTarget } from "./cadTypes";

vi.mock("./cadValidation", async (load) => ({
  ...(await load<typeof import("./cadValidation")>()),
  verifyCadSource: vi.fn().mockResolvedValue(undefined),
}));

const source: CadSource = {
  name: "fixture.dxf",
  data: new ArrayBuffer(8),
  revisionId: "revision-one",
  sourceHash: "a".repeat(64),
};
const target = (entityId: string): CadTarget => ({
  kind: "cad",
  source_revision_id: source.revisionId,
  entity_id: entityId,
  layer: "STRUCTURE",
});

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "concord-cad-integration", version: "1.7.3" }),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function bridge(view: ReturnType<typeof render>) {
  const frame = view.container.querySelector("iframe")!;
  await waitFor(() =>
    expect(frame.src).toContain("/viewer/cad/index.html?token="),
  );
  const token = new URL(frame.src).searchParams.get("token");
  const frameWindow = frame.contentWindow;
  Object.defineProperty(frame, "contentWindow", {
    configurable: true,
    value: frameWindow,
  });
  const send = vi
    .spyOn(frame.contentWindow!, "postMessage")
    .mockImplementation(() => undefined);
  const receive = async (data: object) => {
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: frame.contentWindow,
          origin: location.origin,
          data: { ...data, token },
        }),
      );
    });
  };
  await receive({ type: "ready" });
  const open = send.mock.calls.find(([message]) => message.type === "open")![0];
  return {
    send,
    receive,
    opened: () =>
      receive({ type: "opened", requestId: open.requestId, elementCount: 2 }),
    requests: () =>
      send.mock.calls
        .map(([message]) => message)
        .filter((message) => message.type === "navigate"),
  };
}

it("keeps the latest target's successful navigation when the initial request fails late", async () => {
  const first = target("31"),
    second = target("32");
  const view = render(<CadSurface before={source} target={first} />);
  const native = await bridge(view);
  await native.opened();
  await waitFor(() => expect(native.requests()).toHaveLength(1));
  view.rerender(<CadSurface before={source} target={second} />);
  await waitFor(() => expect(native.requests()).toHaveLength(2));
  const [oldRequest, currentRequest] = native.requests();
  expect(currentRequest.target).toEqual({
    sourceRevisionId: source.revisionId,
    sourceHash: source.sourceHash,
    entityId: "32",
    layer: "STRUCTURE",
  });
  await native.receive({
    type: "navigated",
    requestId: currentRequest.requestId,
    target: currentRequest.target,
  });
  await native.receive({
    type: "error",
    requestId: oldRequest.requestId,
    message: "Old target is absent",
  });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("reports the current navigation failure and clears it only after a current successful retry", async () => {
  const first = target("31"),
    second = target("32");
  const view = render(<CadSurface before={source} target={first} />);
  const native = await bridge(view);
  await native.opened();
  await waitFor(() => expect(native.requests()).toHaveLength(1));
  await native.receive({
    type: "error",
    requestId: native.requests()[0].requestId,
    message: "CAD entity is absent",
  });
  expect(screen.getByRole("alert")).toHaveTextContent("CAD entity is absent");
  view.rerender(<CadSurface before={source} target={second} />);
  await waitFor(() => expect(native.requests()).toHaveLength(2));
  // Pending navigation is not a successful fallback.
  expect(screen.getByRole("alert")).toHaveTextContent("CAD entity is absent");
  await native.receive({
    type: "navigated",
    requestId: native.requests()[1].requestId,
    target: native.requests()[1].target,
  });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does not show an obsolete initial target failure after the target is removed", async () => {
  const view = render(<CadSurface before={source} target={target("31")} />);
  const native = await bridge(view);
  await native.opened();
  await waitFor(() => expect(native.requests()).toHaveLength(1));
  view.rerender(<CadSurface before={source} />);
  await native.receive({
    type: "error",
    requestId: native.requests()[0].requestId,
    message: "Removed target failed",
  });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("rejects the old session's pending navigation when the source changes", async () => {
  let controller: import("./cadTypes").CadController | undefined;
  const view = render(
    <CadSurface
      before={source}
      onReady={(value) => {
        controller = value;
      }}
    />,
  );
  const native = await bridge(view);
  await native.opened();
  const pending = controller!
    .navigate(target("31"))
    .catch((error: Error) => error.message);
  expect(native.requests()).toHaveLength(1);
  view.rerender(
    <CadSurface before={{ ...source, revisionId: "revision-two" }} />,
  );
  await expect(pending).resolves.toBe("CAD viewer was closed");
  await expect(controller!.navigate(target("31"))).rejects.toThrow("not ready");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("navigates only the latest optional-layer target once the viewer becomes ready", async () => {
  const initial = target("31");
  const latest: CadTarget = {
    kind: "cad",
    source_revision_id: source.revisionId,
    entity_id: "32",
  };
  const view = render(<CadSurface before={source} target={initial} />);
  const native = await bridge(view);
  view.rerender(<CadSurface before={source} target={latest} />);
  expect(native.requests()).toHaveLength(0);
  await native.opened();
  await waitFor(() => expect(native.requests()).toHaveLength(1));
  expect(native.requests()[0].target).toEqual({
    sourceRevisionId: source.revisionId,
    sourceHash: source.sourceHash,
    entityId: "32",
  });
  await native.receive({
    type: "navigated",
    requestId: native.requests()[0].requestId,
    target: native.requests()[0].target,
  });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("reports target failure and recovery to the Evidence host", async () => {
  const report = vi.fn();
  const view = render(
    <CadSurface before={source} target={target("31")} onError={report} />,
  );
  const native = await bridge(view);
  await native.opened();
  await waitFor(() => expect(native.requests()).toHaveLength(1));
  await native.receive({
    type: "error",
    requestId: native.requests()[0].requestId,
    message: "Entity is absent",
  });
  expect(report).toHaveBeenLastCalledWith("Entity is absent");
  view.rerender(
    <CadSurface before={source} target={target("32")} onError={report} />,
  );
  await waitFor(() => expect(native.requests()).toHaveLength(2));
  const request = native.requests()[1];
  await native.receive({
    type: "navigated",
    requestId: request.requestId,
    target: request.target,
  });
  expect(report).toHaveBeenLastCalledWith(null);
});
