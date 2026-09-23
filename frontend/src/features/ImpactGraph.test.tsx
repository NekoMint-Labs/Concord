import { render, screen, within } from "@testing-library/react";
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
    const graph = within(screen.getByRole("region", { name: "影响关系" }));
    expect(graph.getByText("变更事件")).toBeVisible();
    expect(graph.getByText("Duct route revised / V17")).toBeVisible();
    expect(graph.getByText("图纸 V16 → V17")).toBeVisible();
    expect(graph.getByText("受影响工作包")).toBeVisible();
    expect(graph.getByText("阻塞条件")).toBeVisible();
    expect(graph.getByText("建议处理")).toBeVisible();
    expect(graph.getByText(/批准后执行/)).toBeVisible();

    rerender(
      <ImpactGraph
        workspace={workspace}
        selected="WP-300"
        onConstraint={vi.fn()}
      />,
    );
    const updatedGraph = within(
      screen.getByRole("region", { name: "影响关系" }),
    );
    expect(updatedGraph.getByText("当前没有可展示的影响关系")).toBeVisible();
    expect(
      updatedGraph.queryByText("Duct route revised / V17"),
    ).not.toBeInTheDocument();
  });
});
