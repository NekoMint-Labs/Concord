import type { RefObject } from "react";
import type { Workspace } from "../api/client";
import type { ProjectContext } from "../app/useProjectContext";
import type { WorkspaceTab } from "../app/destinations";
import { DetailInspectorHeader } from "../components/DetailInspector";
import { Button } from "../components/ui/button";
import { demoAreaName, demoDiscipline } from "../ui/demo/demoPresentation";
import { statusLabel, statusTone, shortDate } from "../ui/labels";
import type { WorkDecision } from "./workDecisions";

/** The selected decision's object context; list selection and dismissal stay outside. */
export function WorkPeek({
  selectedItem,
  workspace,
  context,
  peekRef,
  onClose,
  onPackage,
  onModels,
  onInvestigate,
  onSource,
  onProject,
  onTab,
}: {
  selectedItem: WorkDecision;
  workspace: Workspace;
  context: ProjectContext;
  peekRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onPackage: (id: string) => void;
  onModels: () => void;
  onInvestigate?: (input: {
    sourceId: string;
    revisionId: string;
    fromRevisionId?: string;
    elementIds?: string[];
    revisionLabel?: string;
    fromRevisionLabel?: string;
  }) => void;
  onProject: () => void;
  onSource?: (sourceId: string) => void;
  onTab: (tab: WorkspaceTab) => void;
}) {
  const { baseline, documents, models, revisionNo, pendingModels } = context;
  const selectedPackage = workspace.state.work_packages.find(
    (item) => item.id === (selectedItem.workPackageId ?? selectedItem.key),
  );
  const selectedSource = selectedItem.sourceContext;
  const readiness = (id: string) =>
    workspace.analysis?.readiness.find((item) => item.work_package_id === id)
      ?.status ?? "UNCHECKED";
  const judgement = workspace.stale
    ? "需要重新检查"
    : workspace.analysis_run?.status === "FAILED"
      ? "检查未完成"
      : workspace.analysis
        ? "当前检查有效"
        : "尚未检查";
  const readyCount = workspace.state.work_packages.filter(
    (item) => readiness(item.id) === "READY",
  ).length;
  const selectedArea = selectedPackage
    ? demoAreaName(
        selectedPackage.area_id,
        workspace.state.areas.find(
          (area) => area.id === selectedPackage.area_id,
        )?.name ?? selectedPackage.area_id,
      )
    : selectedItem?.context;
  const projectFacts = (
    <div className="work-project-facts">
      <p>
        <span>当前基线 · </span>
        {baseline ? (
          <button type="button" onClick={() => onTab("history")}>
            <strong className="mono">B{baseline.sequence}</strong>
            <small>{shortDate(baseline.created_at)} 已确认</small>
          </button>
        ) : (
          <strong>尚未确认</strong>
        )}
      </p>
      <p className={workspace.stale ? "is-attention" : ""}>
        {!workspace.state.work_packages.length
          ? "项目尚无工作包"
          : workspace.analysis
            ? `${workspace.stale ? "原检查 · " : ""}${readyCount} / ${workspace.state.work_packages.length} 工作包可施工`
            : "工作包尚未检查"}
        <small>{judgement}</small>
      </p>
      <p>
        {pendingModels.length ? (
          <button type="button" onClick={() => onTab("sources")}>
            <strong>
              {pendingModels.map((item) => item.source.name).join("、")}
            </strong>
            <small>{pendingModels.length} 个版本待核对</small>
          </button>
        ) : (
          <span>没有待审核的模型</span>
        )}
      </p>
      <p>
        <button type="button" onClick={() => onTab("documents")}>
          {documents.length
            ? `${documents.length} 个项目文件`
            : "还没有项目文件"}
        </button>
      </p>
    </div>
  );

  return (
    <aside
      ref={peekRef}
      id="work-peek"
      className="work-peek"
      aria-label="所选工作事项"
      role="complementary"
    >
      <DetailInspectorHeader
        eyebrow="当前事项"
        title={selectedItem.title}
        meta={
          <>
            <span className="work-peek-location">
              {selectedArea}
              {selectedPackage && (
                <>
                  {" "}
                  · <span className="mono">{selectedPackage.id}</span>
                </>
              )}
            </span>
            <span
              className={`work-peek-state is-${selectedItem.state === "已阻塞" ? "blocked" : selectedItem.state === "可施工" || selectedItem.state === "已完成" ? "ready" : "neutral"}`}
            >
              <i aria-hidden="true" />
              {selectedItem.state}
            </span>
          </>
        }
        onClose={onClose}
      />
      <div className="work-peek-scroll">
        <section className="work-peek-section" aria-label="概览">
          <h3>概览</h3>
          <p>{selectedItem.reason}</p>
          <Button onClick={selectedItem.open}>{selectedItem.action}</Button>
        </section>
        {selectedSource && (
          <section className="work-peek-section" aria-label="模型版本上下文">
            <h3>模型版本上下文</h3>
            <p className="work-peek-location">
              <strong>{selectedSource.source.source.name}</strong> ·{" "}
              {
                {
                  BIM: "模型",
                  DOCUMENT: "文件",
                  DRAWING: "图纸原件",
                  SCHEDULE: "计划原件",
                }[selectedSource.source.source.kind]
              }
            </p>
            <p>
              {selectedSource.source.accepted_revision_id
                ? `${selectedSource.revisions.find((item) => item.id === selectedSource.source.accepted_revision_id)?.external_label ?? `R${selectedSource.revisions.find((item) => item.id === selectedSource.source.accepted_revision_id)?.sequence ?? "?"}`} → ${selectedSource.revisions.find((item) => item.id === selectedSource.source.latest_revision_id)?.external_label ?? `R${selectedSource.revisions.find((item) => item.id === selectedSource.source.latest_revision_id)?.sequence ?? "?"}`}`
                : "尚未确认基线"}
            </p>
            {selectedSource.comparison && (
              <>
                <p>
                  {selectedSource.comparison.changes.length} 个构件变化 ·{" "}
                  {selectedSource.comparison.affected_work_packages.length}{" "}
                  个受影响工作包
                </p>
                {selectedSource.comparison.comparison.evidence_ids.length >
                  0 && (
                  <small>
                    比较依据{" "}
                    {selectedSource.comparison.comparison.evidence_ids.join(
                      "、",
                    )}
                  </small>
                )}
              </>
            )}
            <div className="work-detail-links">
              <button
                type="button"
                onClick={() => {
                  if (!onInvestigate) return onModels();
                  onInvestigate({
                    sourceId: selectedSource.source.source.id,
                    revisionId: selectedSource.source.latest_revision_id!,
                    fromRevisionId:
                      selectedSource.source.accepted_revision_id ?? undefined,
                    elementIds: selectedSource.comparison?.changes.map(
                      (item) => item.global_id,
                    ),
                  });
                }}
              >
                {onInvestigate ? "调查此版本 →" : "打开模型与版本 →"}
              </button>
              <button
                type="button"
                onClick={() =>
                  onSource
                    ? onSource(selectedSource.source.source.id)
                    : onModels()
                }
              >
                在项目中查看版本 →
              </button>
            </div>
          </section>
        )}
        {selectedItem.evidence?.length ? (
          <section className="work-peek-section" aria-label="判断依据">
            <h3>
              判断依据{" "}
              <span className="mono">{selectedItem.evidence.length}</span>
            </h3>
            <ul className="work-model-list">
              {selectedItem.evidence.slice(0, 4).map((evidence) => (
                <li key={evidence.id}>
                  <strong>{evidence.source_id}</strong>
                  <span>{evidence.fact}</span>
                  <span>
                    {evidence.source_revision} · {evidence.location ?? "无位置"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {selectedPackage && (
          <section className="work-peek-section" aria-label="关联工作包">
            <h3>
              工作包 <span className="mono">{selectedPackage.id}</span>
            </h3>
            <p className="work-peek-location">
              {selectedArea} · {demoDiscipline(selectedPackage.discipline)}
            </p>
            <p
              className={`work-peek-state is-${workspace.stale ? "neutral" : statusTone(readiness(selectedPackage.id))}`}
            >
              <i aria-hidden="true" />
              施工判断 · {workspace.stale ? "需复核 · " : ""}
              {statusLabel(readiness(selectedPackage.id))}
            </p>
            <button
              className="work-context-action"
              type="button"
              onClick={() => onPackage(selectedPackage.id)}
            >
              打开工作包 →
            </button>
          </section>
        )}
        {(selectedPackage || models.length > 0) && (
          <section className="work-peek-section" aria-label="模型上下文">
            <h3>模型上下文</h3>
            {selectedPackage && (
              <p className="work-model-summary">
                <span>
                  设计{" "}
                  <strong className="mono">
                    {selectedPackage.design_revision || "—"}
                  </strong>
                </span>
                <span>{selectedPackage.element_ids.length} 个关联构件</span>
              </p>
            )}
            {models.length ? (
              <ul className="work-model-list">
                {models.map((item, index) => (
                  <li key={item.source.id}>
                    <strong>{item.source.name}</strong>
                    <span>
                      最新{" "}
                      <span className="mono">
                        {revisionNo(index, item.latest_revision_id)}
                      </span>{" "}
                      · 基线{" "}
                      <span className="mono">
                        {revisionNo(index, item.accepted_revision_id)}
                      </span>
                    </span>
                    <span>
                      {item.has_pending_revision
                        ? "新版本待审核"
                        : item.accepted_revision_id
                          ? "已纳入基线"
                          : "尚未确认"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quiet-message">项目尚未上传模型。</p>
            )}
            <div className="work-detail-links">
              {models.length > 0 && (
                <button type="button" onClick={() => onTab("bim")}>
                  打开模型工作区 →
                </button>
              )}
              <button type="button" onClick={onModels}>
                {models.length ? "模型与版本 →" : "添加项目模型 →"}
              </button>
            </div>
          </section>
        )}
        <section className="work-peek-section" aria-label="项目状态">
          <h3>项目状态</h3>
          {projectFacts}
          <button
            className="work-context-action"
            type="button"
            onClick={onProject}
          >
            打开项目工作区 →
          </button>
        </section>
      </div>
    </aside>
  );
}
