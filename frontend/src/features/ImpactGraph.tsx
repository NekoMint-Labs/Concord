import { useMemo } from "react";
import {
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Workspace } from "../api/client";
import { activeCoordinationEvent } from "../app/coordination";

export default function ImpactGraph({
  workspace,
  selected,
  onConstraint,
}: {
  workspace: Workspace;
  selected: string;
  onConstraint: (id: string) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const wp = workspace.state.work_packages.find(
      (item) => item.id === selected,
    )!;
    const activeEvent = activeCoordinationEvent(workspace, selected);
    const readiness = workspace.analysis?.readiness.find(
      (item) => item.work_package_id === selected,
    );
    const constraints = (workspace.analysis?.constraints ?? [])
      .filter((item) => item.work_package_id === selected && item.blocking)
      .slice(0, 4);
    const proposal = workspace.proposals.find(
      (item) => item.work_package_id === selected,
    );
    const revision = activeEvent?.change.revision;
    const nodes: Node[] = [
      {
        id: "event",
        position: { x: 0, y: 100 },
        className: "graph-node source-node",
        data: {
          label: (
            <>
              <small>{activeEvent ? "变更事件" : "当前检查"}</small>
              <strong>
                {activeEvent?.title ?? `图纸 ${wp.design_revision}`}
              </strong>
              <span>
                {revision
                  ? `图纸 ${wp.accepted_revision} → ${revision}`
                  : "基于最新项目事实"}
              </span>
            </>
          ),
        },
      },
      {
        id: wp.id,
        position: { x: 285, y: 100 },
        className: `graph-node ${readiness?.status === "BLOCKED" ? "node-blocked" : "node-ready"}`,
        data: {
          label: (
            <>
              <small>受影响工作包</small>
              <strong>
                {wp.id} · {wp.name}
              </strong>
              <span>
                {readiness?.status === "BLOCKED"
                  ? `${constraints.length} 项阻塞原因`
                  : "就绪，没有未解决阻塞"}
              </span>
            </>
          ),
        },
      },
    ];
    const edges: Edge[] = [
      {
        id: "event-package",
        source: "event",
        target: wp.id,
        label: "影响",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
    ];
    constraints.forEach((constraint, index) => {
      nodes.push({
        id: constraint.id,
        position: { x: 580, y: 25 + index * 135 },
        className: "graph-node constraint-node",
        data: {
          label: (
            <>
              <small>阻塞原因</small>
              <strong>{constraint.description}</strong>
              <span>{constraint.evidence_ids.length} 条判断依据</span>
            </>
          ),
        },
      });
      edges.push({
        id: `edge-${constraint.id}`,
        source: wp.id,
        target: constraint.id,
        label: "阻塞",
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    });
    if (proposal) {
      nodes.push({
        id: proposal.id ?? "proposal",
        position: { x: 875, y: 100 },
        className: "graph-node action-node",
        data: {
          label: (
            <>
              <small>建议处理</small>
              <strong>{proposal.title}</strong>
              <span>批准后执行 · R{proposal.risk}</span>
            </>
          ),
        },
      });
      edges.push({
        id: "constraint-proposal",
        source: constraints[0]?.id ?? wp.id,
        target: proposal.id ?? "proposal",
        label: "处理",
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
    return { nodes, edges };
  }, [workspace, selected]);

  return (
    <div className="graph-canvas" aria-label="影响关系图">
      <div className="canvas-label">
        <span className="eyebrow">影响关系</span>
        <span>变更 → 影响 → 阻塞 → 处理</span>
      </div>
      <ReactFlow
        key={`${selected}-${workspace.analysis?.id}`}
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.45}
        maxZoom={1.35}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => onConstraint(node.id)}
        proOptions={{ hideAttribution: false }}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
