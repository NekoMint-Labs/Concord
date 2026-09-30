import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import IFCViewer from "./IFCViewer";

const actions = vi.hoisted(() => vi.fn());
vi.mock("./useIFCViewer", async () => {
  const { useRef, useState } = await import("react");
  return {
    useIFCViewer: () => {
      const container = useRef<HTMLDivElement>(null);
      const [isolated, setIsolated] = useState(false);
      const [candidatesHighlighted, setCandidatesHighlighted] = useState(true);
      const [viewMode, setViewMode] = useState<"2d" | "3d">("3d");
      return {
        container,
        ready: true,
        message: "ready",
        error: "",
        busy: false,
        anchor: null,
        hasTarget: true,
        isolated,
        candidatesHighlighted,
        viewMode,
        act: async (name: string, mode?: "2d" | "3d") => {
          actions(name, mode);
          if (
            name === "isolate" ||
            name === "isolateCandidates" ||
            name === "isolateSelected"
          )
            setIsolated(true);
          if (name === "highlightCandidates")
            setCandidatesHighlighted((value) => !value);
          if (name === "selectMode" || name === "showAll") setIsolated(false);
          if (mode) setViewMode(mode);
        },
      };
    },
  };
});

it("uses one selection toolbar and a real stateful projection/isolation contract", async () => {
  render(
    <IFCViewer
      file={new File(["IFC"], "model.ifc")}
      impacted={[]}
      onSelected={() => {}}
    />,
  );
  const viewer = screen.getByLabelText("IFC 模型查看器");
  const toolbar = within(viewer).getByLabelText("模型工具");
  expect(within(toolbar).getAllByRole("button")).toHaveLength(4);
  expect(within(toolbar).getByRole("button", { name: "选择" })).toBeDisabled();
  fireEvent.click(within(toolbar).getByRole("button", { name: "聚焦" }));
  expect(actions).toHaveBeenCalledWith("focus", undefined);
  fireEvent.click(within(toolbar).getByRole("button", { name: "隔离" }));
  expect(
    await within(toolbar).findByRole("button", { name: "选择" }),
  ).toBeEnabled();
  expect(viewer).toHaveAttribute("data-isolated", "true");
  fireEvent.click(within(toolbar).getByRole("button", { name: "选择" }));
  expect(viewer).toHaveAttribute("data-isolated", "false");
  fireEvent.click(within(toolbar).getByRole("button", { name: "隔离" }));
  fireEvent.click(within(toolbar).getByRole("button", { name: "显示全部" }));
  expect(viewer).toHaveAttribute("data-isolated", "false");
  fireEvent.click(within(viewer).getByRole("button", { name: "2D" }));
  expect(viewer).toHaveAttribute("data-view-mode", "2d");
  fireEvent.click(within(viewer).getByRole("button", { name: "3D" }));
  expect(viewer).toHaveAttribute("data-view-mode", "3d");
  expect(actions).toHaveBeenCalledWith("setViewMode", "2d");
  expect(actions).toHaveBeenCalledWith("setViewMode", "3d");
});

it("exposes separate candidate and batch-selection targets only in mapping mode", () => {
  actions.mockClear();
  render(
    <IFCViewer
      file={new File(["IFC"], "model.ifc")}
      impacted={[]}
      onSelected={() => {}}
      mapping={{
        candidateIds: ["candidate"],
        selectedIds: ["selected"],
        allowedIds: ["candidate", "selected"],
      }}
    />,
  );
  const highlight = screen.getByRole("button", { name: "高亮候选" });
  expect(highlight).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(highlight);
  expect(highlight).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "隔离候选" }));
  fireEvent.click(screen.getByRole("button", { name: "隔离已选" }));
  expect(actions).toHaveBeenCalledWith("isolateCandidates", undefined);
  expect(actions).toHaveBeenCalledWith("isolateSelected", undefined);
});
