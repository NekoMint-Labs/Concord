import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import fixture from "../../tests/fixtures/inspector.json";
import type { Workspace } from "../api/client";
import ImpactGraph from "./ImpactGraph";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({
    nodes,
    children,
  }: {
    nodes: Array<{ id: string; data: { label: ReactNode } }>;
    children: ReactNode;
  }) => (
    <div>
      {nodes.map((node) => (
        <div key={node.id}>{node.data.label}</div>
      ))}
      {children}
    </div>
  ),
  Controls: () => null,
  MarkerType: { ArrowClosed: "arrowclosed" },
}));

function designChangeWorkspace(): Workspace {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.events[0] = {
    ...workspace.events[0],
    kind: "design_revision",
    title: "Duct route revised / V17",
    change: { ...workspace.events[0].change, revision: "V17" },
  };
  return workspace;
}

describe("ImpactGraph", () => {
  it("shows only the selected work package's active coordination path", () => {
    const workspace = designChangeWorkspace();
    const { rerender } = render(
      <ImpactGraph
        workspace={workspace}
        selected="WP-200"
        onConstraint={vi.fn()}
      />,
    );

    expect(screen.getByText("影响关系")).toBeVisible();
    expect(screen.getByText("变更事件")).toBeVisible();
    expect(screen.getByText("Duct route revised / V17")).toBeVisible();
    expect(screen.getByText("图纸 V16 → V17")).toBeVisible();
    expect(screen.getByText("受影响工作包")).toBeVisible();
    expect(screen.getByText("阻塞原因")).toBeVisible();
    expect(screen.getByText("建议处理")).toBeVisible();
    expect(screen.getByText(/批准后执行/)).toBeVisible();

    rerender(
      <ImpactGraph
        workspace={workspace}
        selected="WP-300"
        onConstraint={vi.fn()}
      />,
    );
    expect(screen.getByText("当前检查")).toBeVisible();
    expect(
      screen.queryByText("Duct route revised / V17"),
    ).not.toBeInTheDocument();
  });
});
