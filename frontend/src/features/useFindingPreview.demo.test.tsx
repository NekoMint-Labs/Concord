// Isolated local demo contract only; production FindingWorkbench uses persisted APIs.
import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useFindingPreview } from "./useFindingPreview";
import type { FixtureRecheckScenario } from "../app/fixtures/recheck";

it("retains demo session values but refuses unknown evidence and invalid review input", () => {
  const { result } = renderHook(useFindingPreview);
  act(() => {
    expect(result.current.selectEvidence("unknown-from-search")).toBe(false);
    expect(result.current.decide("dismiss", " ")).toBe(false);
  });
  expect(result.current.active.id).toBe("drawing");
  expect(result.current.decision).toBeNull();
  act(() => {
    result.current.decide("confirm", "已复核");
    result.current.setEnabled(true);
  });
  act(() => result.current.setEnabled(false));
  expect(result.current.decision).toBe("confirm");
  act(() =>
    result.current.edit({
      ...result.current.values,
      title: "人工修改后的 Finding",
    }),
  );
  expect(result.current.decision).toBeNull();
  expect(result.current.note).toBe("");
});

function confirmedRecheckSession() {
  const hook = renderHook(useFindingPreview);
  act(() => {
    expect(hook.result.current.receiveRevision()).toBe(false);
    expect(hook.result.current.showRecheckSample("resolved")).toBe(false);
  });
  act(() => hook.result.current.decide("confirm", "工程师确认示例"));
  act(() => hook.result.current.receiveRevision());
  return hook;
}

it.each<FixtureRecheckScenario>([
  "unavailable",
  "open",
  "changed",
  "partial",
  "stale",
])(
  "blocks demo closure for %s, including missing coverage and stale resolved samples",
  (scenario) => {
    const { result } = confirmedRecheckSession();
    expect(result.current.recheckAvailable).toBe(true);
    act(() => result.current.showRecheckSample(scenario));
    expect(result.current.canClose).toBe(false);
    act(() => expect(result.current.close("人工尝试关闭")).toBe(false));
    expect(result.current.followUp.closed).toBe(false);
    if (scenario === "stale") {
      expect(result.current.report?.outcome).toBe("RESOLVED");
      expect(result.current.currentSample).toBe(false);
    }
    if (scenario === "partial") {
      expect(result.current.report?.checks[0].outcome).toBe("RESOLVED");
      expect(result.current.report?.checks[1].evidence).toBeNull();
    }
  },
);

it("invalidates demo resolved samples after revision or Finding changes and requires current human consent", () => {
  const { result } = confirmedRecheckSession();
  act(() => result.current.showRecheckSample("resolved"));
  expect(result.current.canClose).toBe(true);
  act(() => expect(result.current.close(" ")).toBe(false));
  const oldConsentSample = result.current.latestSample;
  act(() => result.current.receiveRevision());
  expect(result.current.currentSample).toBe(false);
  expect(result.current.canClose).toBe(false);
  act(() => result.current.showRecheckSample("resolved"));
  expect(result.current.canClose).toBe(true);
  act(() =>
    expect(result.current.close("旧表单确认", oldConsentSample)).toBe(false),
  );
  act(() =>
    result.current.edit({
      ...result.current.values,
      title: "人工修改后的 Finding",
    }),
  );
  expect(result.current.currentSample).toBe(false);
  expect(result.current.followUp.samples).toHaveLength(2);
  act(() => result.current.decide("confirm", "重新判断"));
  expect(result.current.canClose).toBe(false);
  act(() => result.current.showRecheckSample("resolved"));
  act(() =>
    expect(result.current.close("人工核对当前两个依赖源后关闭示例")).toBe(true),
  );
  expect(result.current.reviewLabel).toBe("已关闭");
  expect(result.current.followUp.history.map((item) => item.action)).toEqual([
    "confirm",
    "edit",
    "confirm",
    "close",
  ]);
  act(() => expect(result.current.receiveRevision()).toBe(false));
  act(() => result.current.reset());
  expect(result.current.followUp).toEqual({
    revision: 1,
    generation: 0,
    closed: false,
    samples: [],
    history: [],
  });
});

it("keeps demo historical evidence stale after navigation, new revisions, edits and sample replacement", () => {
  const { result } = renderHook(useFindingPreview);
  act(() => result.current.decide("confirm", "人工确认"));
  act(() => result.current.receiveRevision());
  act(() => result.current.showRecheckSample("resolved"));
  const id = result.current.report!.checks[0].evidence!.id;
  act(() => result.current.selectEvidence(id));
  expect(result.current.activeSampleStale).toBe(false);
  act(() => result.current.receiveRevision());
  expect(result.current.activeSampleStale).toBe(true);
  act(() => result.current.selectEvidence(id));
  expect(result.current.activeSampleStale).toBe(true);
  act(() => result.current.showRecheckSample("resolved"));
  act(() =>
    result.current.selectEvidence(
      result.current.report!.checks[0].evidence!.id,
    ),
  );
  expect(result.current.activeSampleStale).toBe(false);
  act(() =>
    result.current.edit({ ...result.current.values, discipline: "暖通" }),
  );
  expect(result.current.activeSampleStale).toBe(true);
  act(() => result.current.decide("confirm", "再次确认"));
  act(() => result.current.showRecheckSample("resolved"));
  act(() =>
    result.current.selectEvidence(
      result.current.report!.checks[0].evidence!.id,
    ),
  );
  act(() => result.current.showRecheckSample("open"));
  expect(result.current.activeSampleStale).toBe(true);
  act(() => result.current.selectEvidence("drawing"));
  expect(result.current.activeSampleStale).toBe(false);
  act(() => result.current.reset());
  expect(result.current.activeSampleStale).toBe(false);
});
