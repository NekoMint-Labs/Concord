import { ChevronDown, ChevronUp } from "lucide-react";
import type { DTO, Workspace } from "../api/client";
import {
  demoConstraintKind,
  demoConstraintText,
  demoElementName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";

type Change = DTO<"BimElementChange">;
type Issue = DTO<"Constraint">;
type Snapshot = DTO<"BimElementSnapshot">;

export function SpatialContext({
  context,
  setContext,
  open,
  setOpen,
  rows,
  issues,
  activeId,
  selectedIssue,
  snapshots,
  elements,
  workspace,
  revisionLabel,
  onSelect,
  onIssue,
  onWorkPackage,
  workPackageId,
  onExpandInspector,
  onNavigate,
}: {
  context: "changes" | "issues";
  setContext: (value: "changes" | "issues") => void;
  open: boolean;
  setOpen: (value: boolean) => void;
  rows: Pick<Change, "global_id" | "change_kind" | "changed_aspects">[];
  issues: Issue[];
  activeId: string;
  selectedIssue: string;
  snapshots: Snapshot[];
  elements?: DTO<"BIMElement">[];
  workspace?: Workspace;
  revisionLabel?: string;
  onSelect: (id: string) => void;
  onIssue: (issue: Issue) => void;
  onWorkPackage?: (id: string) => void;
  workPackageId?: string;
  onExpandInspector?: () => void;
  onNavigate?: (tab: "sources" | "documents" | "history") => void;
}) {
  const packageFor = (id: string) =>
    workspace?.state.work_packages.find((wp) => wp.element_ids.includes(id));
  const description = (aspects: string[]) =>
    aspects
      .map(
        (aspect) =>
          ({
            placement: "位置变更",
            geometry: "几何变更",
            attributes: "属性变更",
            properties: "属性集变更",
            impact: "受设计变更影响",
          })[aspect] ?? aspect,
      )
      .join(" · ");
  return (
    <section className="spatial-context" aria-label="模型上下文">
      <header className="spatial-context-header">
        <div className="spatial-context-tabs">
          <button
            type="button"
            className={context === "changes" ? "active" : ""}
            aria-pressed={context === "changes"}
            onClick={() => {
              setContext("changes");
              setOpen(true);
            }}
          >
            变更对比 <small>{rows.length}</small>
          </button>
          <button
            type="button"
            className={context === "issues" ? "active" : ""}
            aria-pressed={context === "issues"}
            onClick={() => {
              setContext("issues");
              setOpen(true);
            }}
          >
            相关问题 <small>{issues.length}</small>
          </button>
        </div>
        {/* Links leave the model; they are a separate, quieter group from the in-place views. */}
        <nav className="spatial-context-links" aria-label="相关页面">
          <button
            type="button"
            disabled={!workPackageId || !onWorkPackage}
            title={!workPackageId ? "当前构件没有关联工作包" : undefined}
            onClick={() => workPackageId && onWorkPackage?.(workPackageId)}
          >
            工作包
          </button>
          {onNavigate && (
            <>
              <button type="button" onClick={() => onNavigate("sources")}>
                模型版本
              </button>
              <button type="button" onClick={() => onNavigate("documents")}>
                文档
              </button>
              <button type="button" onClick={() => onNavigate("history")}>
                历史
              </button>
            </>
          )}
        </nav>
        <span>{revisionLabel}</span>
        {onExpandInspector && (
          <button
            type="button"
            aria-label="展开检查器"
            title="展开检查器"
            onClick={onExpandInspector}
          >
            检查器
          </button>
        )}
        <button
          type="button"
          aria-label={open ? "收起上下文列表" : "展开上下文列表"}
          title={open ? "收起上下文列表" : "展开上下文列表"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </header>
      <div className="spatial-context-scroll" hidden={!open}>
        {context === "changes" ? (
          <table>
            <thead>
              <tr>
                <th>类型</th>
                <th>构件</th>
                <th>描述</th>
                <th>影响</th>
                <th>状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr
                  key={entry.global_id}
                  className={activeId === entry.global_id ? "selected" : ""}
                >
                  <td>
                    <i className="dot blue" />
                    {entry.change_kind === "added"
                      ? "新增"
                      : entry.change_kind === "deleted"
                        ? "删除"
                        : "修改"}
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-current={
                        activeId === entry.global_id ? "true" : undefined
                      }
                      onClick={() => onSelect(entry.global_id)}
                    >
                      {demoElementName(
                        entry.global_id,
                        snapshots.find((s) => s.global_id === entry.global_id)
                          ?.name ||
                          elements?.find((e) => e.id === entry.global_id)
                            ?.name ||
                          entry.global_id,
                      )}
                    </button>
                  </td>
                  <td>{description(entry.changed_aspects)}</td>
                  <td>
                    {packageFor(entry.global_id)
                      ? demoWorkPackageName(
                          packageFor(entry.global_id)!.id,
                          packageFor(entry.global_id)!.name,
                        )
                      : "—"}
                  </td>
                  <td>
                    <span
                      className={`context-status${workspace?.analysis?.readiness.find((item) => item.work_package_id === packageFor(entry.global_id)?.id)?.status === "READY" ? " is-ready" : ""}`}
                    >
                      {workspace?.analysis?.readiness.find(
                        (item) =>
                          item.work_package_id ===
                          packageFor(entry.global_id)?.id,
                      )?.status === "READY"
                        ? "就绪"
                        : "待复核"}
                    </span>
                  </td>
                  <td>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>问题</th>
                <th>工作包</th>
                <th>上下文</th>
                <th>状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {issues.map((entry) => (
                <tr
                  key={entry.id}
                  className={selectedIssue === entry.id ? "selected" : ""}
                >
                  <td>
                    <button
                      type="button"
                      aria-current={
                        selectedIssue === entry.id ? "true" : undefined
                      }
                      onClick={() => onIssue(entry)}
                    >
                      <i className="dot red" />
                      {demoConstraintText(entry.kind, entry.description)}
                    </button>
                  </td>
                  <td>
                    {demoWorkPackageName(
                      entry.work_package_id,
                      workspace?.state.work_packages.find(
                        (wp) => wp.id === entry.work_package_id,
                      )?.name ?? entry.work_package_id,
                    )}
                  </td>
                  <td>{demoConstraintKind(entry.kind)}</td>
                  <td>
                    <span className="context-status is-open">待处理</span>
                  </td>
                  <td>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(context === "changes" ? !rows.length : !issues.length) && (
          <p className="context-empty">
            {context === "changes"
              ? "当前上下文暂无模型变更。"
              : "当前上下文暂无空间问题。"}
          </p>
        )}
      </div>
    </section>
  );
}
