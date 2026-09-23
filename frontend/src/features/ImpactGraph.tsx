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
import { Status } from "../components/Status";
import { domainLabel } from "../ui/labels";
import {
  demoConstraintText,
  demoProposalTitle,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";

export default function ImpactGraph({
  workspace,
  selected,
  onConstraint,
}: {
  workspace: Workspace;
  selected: string;
  onConstraint: (id: string) => void;
}) {
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
  const { nodes, edges } = useMemo(() => {
    const graphNodes: Node[] = [
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
                {wp.id} · {demoWorkPackageName(wp.id, wp.name)}
              </strong>
              <span>
                {readiness?.status === "BLOCKED"
                  ? `${constraints.length} 项阻塞条件`
                  : "没有未解决阻塞"}
              </span>
            </>
          ),
        },
      },
    ];
    const graphEdges: Edge[] = [
      {
        id: "event-package",
        source: "event",
        target: wp.id,
        label: "影响",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
    ];
    constraints.forEach((constraint, index) => {
      graphNodes.push({
        id: constraint.id,
        position: { x: 580, y: 25 + index * 135 },
        className: "graph-node constraint-node",
        data: {
          label: (
            <>
              <small>阻塞条件</small>
              <strong>
                {demoConstraintText(constraint.kind, constraint.description)}
              </strong>
              <span>{constraint.evidence_ids.length} 条判断依据</span>
            </>
          ),
        },
      });
      graphEdges.push({
        id: `edge-${constraint.id}`,
        source: wp.id,
        target: constraint.id,
        label: "阻塞",
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    });
    if (proposal) {
      graphNodes.push({
        id: proposal.id ?? "proposal",
        position: { x: 875, y: 100 },
        className: "graph-node action-node",
        data: {
          label: (
            <>
              <small>建议处理</small>
              <strong>
                {demoProposalTitle(proposal.work_package_id, proposal.title)}
              </strong>
              <span>批准后执行 · R{proposal.risk}</span>
            </>
          ),
        },
      });
      graphEdges.push({
        id: "constraint-proposal",
        source: constraints[0]?.id ?? wp.id,
        target: proposal.id ?? "proposal",
        label: "处理",
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
    return { nodes: graphNodes, edges: graphEdges };
  }, [activeEvent, constraints, proposal, readiness?.status, revision, wp]);

  const events = [...workspace.events].reverse();
  const hasMeaningfulGraph =
    events.some((event) => event.work_package_id === selected) ||
    constraints.length > 0 ||
    !!proposal;

  return (
    <section className="changes-workspace">
      <header className="view-toolbar">
        <h2>变更</h2>
        <span className="viewer-toolbar-note">
          工程事实、工作包影响与处理关系
        </span>
      </header>
      <div className="changes-layout">
        <section className="change-register" aria-label="变更记录">
          <div className="data-list-header" aria-hidden="true">
            <span>变更</span>
            <span>工作包</span>
            <span>修订</span>
            <span>状态</span>
          </div>
          {events.map((event) => {
            const eventWp = workspace.state.work_packages.find(
              (item) => item.id === event.work_package_id,
            );
            const eventBlocked = (workspace.analysis?.constraints ?? []).some(
              (item) =>
                item.work_package_id === event.work_package_id && item.blocking,
            );
            return (
              <article
                key={event.id}
                className={`data-list-row${event.work_package_id === selected ? " selected" : ""}`}
              >
                <span className="row-primary">
                  <strong>{event.title}</strong>
                  <small>{domainLabel("eventKind", event.kind)}</small>
                </span>
                <span>
                  {eventWp
                    ? demoWorkPackageName(eventWp.id, eventWp.name)
                    : event.work_package_id}
                  <small>{event.work_package_id}</small>
                </span>
                <span className="mono">{event.change.revision ?? "—"}</span>
                <Status value={eventBlocked ? "BLOCKED" : "READY"} />
              </article>
            );
          })}
          {!events.length && (
            <div className="data-list-empty">
              <strong>尚无变更记录</strong>
              <span>记录工程事实变化后，影响会显示在这里。</span>
            </div>
          )}
        </section>

        <section
          className={`change-impact-pane${hasMeaningfulGraph ? "" : " is-empty"}`}
          aria-label="影响关系"
        >
          <header>
            <div>
              <span className="section-label">影响关系</span>
              <h3>
                {wp.id} · {demoWorkPackageName(wp.id, wp.name)}
              </h3>
            </div>
            <Status value={readiness?.status ?? "UNCHECKED"} />
          </header>
          {hasMeaningfulGraph ? (
            <div className="graph-canvas" aria-label="影响关系图">
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
          ) : (
            <div className="impact-empty">
              <span className="section-label">等待工程变化</span>
              <strong>当前没有可展示的影响关系</strong>
              <span>
                记录工程事实变化或导入新的来源版本后，关系将在这里展开。
              </span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
