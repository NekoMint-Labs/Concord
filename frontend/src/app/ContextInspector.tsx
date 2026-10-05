/* The one contextual inspector.
 *
 * Donor language: the docked panel face from
 * `vendor/opentakeoff/components/workspacePanel.css` — one heading, one
 * bounded body, mono metadata labels, hairline section rules. There is exactly
 * one inspector in the workspace: selecting a Finding, an Evidence, a Source,
 * a Revision, a Document or a Work Package fills this panel and nothing else
 * opens beside it.
 */
import { X } from "lucide-react";
import type {
  AgentRun,
  DTO,
  InvestigationReport,
  ProjectSourceStatus,
  Workspace,
} from "../api/client";
import type { ConcordContext } from "../features/ConcordAgent";
import { useEngineeringFindings } from "../features/useEngineeringFindings";
import { findingStateLabels } from "../features/WorkPanel";
import { statusLabel, sourceKindLabel } from "../ui/labels";
import {
  demoAreaName,
  demoDiscipline,
  demoOwner,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { stageKey, type StageObject } from "./stageContracts";
import type { WorkspaceTab } from "./destinations";
import "../styles/features/context-inspector.css";

const kindLabels: Record<StageObject["kind"], string> = {
  source: "资料",
  revision: "资料版本",
  document: "文档",
  finding: "工程判断",
  "work-package": "工作包",
  "work-package-model": "模型构件",
};

export function ContextInspector({
  project,
  data,
  sources,
  object,
  report,
  run,
  context,
  busy,
  onClose,
  onOpen,
  onWorkPackage,
  onTab,
}: {
  project: string;
  data: Workspace;
  sources: ProjectSourceStatus[];
  object: StageObject | null;
  report?: InvestigationReport | null;
  run?: AgentRun | null;
  context?: ConcordContext;
  busy?: boolean;
  perform?: (operation: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
  onOpen?: (object: StageObject) => void;
  onWorkPackage: (id: string) => void;
  onTab: (tab: WorkspaceTab) => void;
}) {
  const findings = useEngineeringFindings(project);
  const areaName = (areaId: string) =>
    demoAreaName(
      areaId,
      data.state.areas.find((area) => area.id === areaId)?.name ?? areaId,
    );
  const source = (id: string | null | undefined) =>
    sources.find((item) => item.source.id === id)?.source;
  const readinessFor = (id: string) =>
    data.analysis?.readiness.find((item) => item.work_package_id === id);
  const packageFor = (id: string | null | undefined) =>
    data.state.work_packages.find((item) => item.id === id);

  const title = (() => {
    if (!object) return "未选择对象";
    switch (object.kind) {
      case "source":
        return source(object.id)?.name ?? object.id;
      case "revision":
        return `${source(object.sourceId)?.name ?? object.sourceId} · 版本`;
      case "document":
        return object.id;
      case "finding":
        return (
          findings.data?.find((item) => item.id === object.id)?.title ??
          object.id
        );
      case "work-package":
      case "work-package-model": {
        const item = packageFor(object.id);
        return item ? demoWorkPackageName(item.id, item.name) : object.id;
      }
    }
  })();

  const finding =
    object?.kind === "finding"
      ? findings.data?.find((item) => item.id === object.id)
      : undefined;

  const rows: [string, string][] = [];
  const evidence: DTO<"Evidence">[] = [];
  if (
    object?.kind === "work-package" ||
    object?.kind === "work-package-model"
  ) {
    const item = packageFor(object.id);
    if (item) {
      rows.push(
        ["工作包编号", item.id],
        ["区域", areaName(item.area_id)],
        ["专业", demoDiscipline(item.discipline)],
        ["负责人", demoOwner(item.id, item.owner || "未指定")],
        ["构件", `${item.element_ids.length} 个`],
        [
          "当前判断",
          data.stale
            ? "需要重新检查"
            : statusLabel(readinessFor(item.id)?.status ?? "UNCHECKED"),
        ],
        ["设计版本", item.design_revision || "未提供"],
        ["已接受版本", item.accepted_revision || "未提供"],
      );
    }
  } else if (object?.kind === "source") {
    const item = sources.find((entry) => entry.source.id === object.id);
    if (item) {
      rows.push(
        ["资料编号", item.source.id],
        ["类型", sourceKindLabel(item.source.kind)],
        ["最新版本", item.latest_revision_id ? "已导入" : "尚未导入"],
        ["处理状态", item.has_pending_revision ? "有待处理版本" : "已同步"],
        ["基线", data.stale ? "需要重新检查" : "已确认"],
      );
    }
  } else if (object?.kind === "revision") {
    rows.push(
      ["来源", source(object.sourceId)?.name ?? object.sourceId],
      ["版本编号", object.id],
    );
  } else if (object?.kind === "document") {
    rows.push(["文档编号", object.id]);
  }

  if (finding) {
    rows.push(
      ["状态", findingStateLabels[finding.state]],
      ["建议专业", finding.suggested_discipline || "未指定"],
      ["置信度", String(finding.confidence)],
      ["更新时间", finding.updated_at.slice(0, 10)],
    );
    evidence.push(
      ...(data.analysis?.evidence ?? []).filter((item) =>
        finding.evidence_ids.includes(item.id),
      ),
    );
  }

  const relatedFindings = findings.data?.filter((item) =>
    object?.kind === "work-package" || object?.kind === "work-package-model"
      ? item.work_package_id === object.id
      : finding
        ? item.id === finding.id
        : false,
  );

  return (
    <aside className="context-inspector" aria-label="检查器">
      <header className="context-inspector-heading">
        <div>
          <span className="t-label">
            {object ? kindLabels[object.kind] : "检查器"}
          </span>
          <strong title={title}>{title}</strong>
        </div>
        <button type="button" aria-label="关闭检查器" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="context-inspector-body">
        {!object && (
          <p className="context-inspector-note">
            在导航器中选择资料、版本、工作包或工程判断，检查器会显示它的来源、依据与当前判断。
          </p>
        )}
        {!!rows.length && (
          <section className="context-section">
            <h3 className="t-label">身份与来源</h3>
            <dl>
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {!!finding && (
          <>
            <section className="context-section">
              <h3 className="t-label">什么变了</h3>
              <p>{finding.what_changed}</p>
            </section>
            <section className="context-section">
              <h3 className="t-label">为什么重要</h3>
              <p>{finding.why_it_matters}</p>
            </section>
            <section className="context-section">
              <h3 className="t-label">下一步 · 建议</h3>
              <p>
                {finding.suggested_action || "先检查关联依据，再作人工判断。"}
              </p>
            </section>
          </>
        )}
        {!!evidence.length && (
          <section className="context-section">
            <h3 className="t-label">工程依据</h3>
            {evidence.map((item) => (
              <button
                type="button"
                className="context-evidence"
                key={item.id}
                onClick={() => onOpen?.({ kind: "finding", id: finding!.id })}
              >
                <strong>{item.fact || "工程依据"}</strong>
                <small>
                  {source(item.source_id)?.name ?? "来源未提供"} ·{" "}
                  {item.quality === "inferred" ? "推断" : "来源提取"}
                </small>
              </button>
            ))}
          </section>
        )}
        {!!relatedFindings?.length && (
          <section className="context-section">
            <h3 className="t-label">工程判断</h3>
            {relatedFindings.map((item) => (
              <button
                type="button"
                className="context-evidence"
                key={item.id}
                onClick={() => onOpen?.({ kind: "finding", id: item.id })}
                aria-current={finding?.id === item.id ? "true" : undefined}
              >
                <strong>{item.title}</strong>
                <small>
                  {findingStateLabels[item.state]} ·{" "}
                  {item.suggested_discipline || "专业未指定"}
                </small>
              </button>
            ))}
          </section>
        )}
        <section className="context-section">
          <h3 className="t-label">重新检查</h3>
          <p>
            {data.stale
              ? "资料已更新，当前工程判断需要重新检查。"
              : "当前工程判断与最新资料一致。"}
          </p>
        </section>
        {(report || run) && (
          <section className="context-section">
            <h3 className="t-label">调查</h3>
            <p>
              {run?.status === "RUNNING"
                ? "调查正在运行。"
                : report
                  ? report.answer.summary || "调查已完成；结论与依据分别记录。"
                  : "尚未开始调查。"}
            </p>
            {context?.workPackageName && (
              <p className="context-inspector-note">
                {context.workPackageName}
                {context.sourceName ? ` · ${context.sourceName}` : ""}
              </p>
            )}
          </section>
        )}
      </div>
      <footer className="context-inspector-footer">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            object && object.kind !== "work-package"
              ? onWorkPackage(
                  finding?.work_package_id ||
                    (object.kind === "work-package-model" ? object.id : ""),
                )
              : onTab("work")
          }
        >
          {object?.kind === "finding" ? "在工作面板处理 →" : "打开工作面板 →"}
        </button>
        <button
          type="button"
          onClick={() =>
            onOpen?.({
              kind: "work-package",
              id:
                finding?.work_package_id ||
                (object?.kind === "work-package" ? object.id : ""),
            })
          }
          disabled={
            !(finding?.work_package_id || object?.kind === "work-package")
          }
        >
          查看工作包上下文 →
        </button>
        <code title="当前对象键">{object ? stageKey(object) : "—"}</code>
      </footer>
    </aside>
  );
}
