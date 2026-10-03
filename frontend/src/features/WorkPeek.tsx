import type { RefObject } from "react";
import type { Workspace } from "../api/client";
import { DetailInspectorHeader } from "../components/DetailInspector";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { Button } from "../components/ui/button";
import { demoAreaName } from "../ui/demo/demoPresentation";
import { statusLabel } from "../ui/labels";
import type { WorkDecision } from "./workDecisions";

/** The current decision, not a second project overview. */
export function WorkPeek({
  selectedItem,
  workspace,
  peekRef,
  onClose,
  onModels,
  onSource,
}: {
  selectedItem: WorkDecision;
  workspace: Workspace;
  peekRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onModels: () => void;
  onSource?: (sourceId: string) => void;
}) {
  const selectedPackage = workspace.state.work_packages.find(
    (item) => item.id === (selectedItem.workPackageId ?? selectedItem.key),
  );
  const source = selectedItem.sourceContext;
  const comparison = source?.comparison;
  const readiness = workspace.analysis?.readiness.find(
    (item) => item.work_package_id === selectedPackage?.id,
  );
  const state = selectedPackage
    ? workspace.stale
      ? "需要重新检查"
      : statusLabel(readiness?.status ?? "UNCHECKED")
    : selectedItem.state;
  const location = selectedPackage
    ? `${demoAreaName(selectedPackage.area_id, workspace.state.areas.find((area) => area.id === selectedPackage.area_id)?.name ?? selectedPackage.area_id)} · ${selectedPackage.id}`
    : selectedItem.context;

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
            <span className="work-peek-location">{location}</span>
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
        <section className="work-peek-section" aria-label="为什么需要处理">
          <h3>为什么需要处理</h3>
          <p>{selectedItem.reason}</p>
        </section>
        <section className="work-peek-section" aria-label="当前判断">
          <h3>当前判断</h3>
          {comparison ? (
            <>
              <p>
                {comparison.changes.length} 个构件变化 ·{" "}
                {comparison.affected_work_packages.length} 个受影响工作包
              </p>
              {!!comparison.comparison.summary.warnings.length && (
                <p role="status">构件标识变化较多，结果可能不完整。</p>
              )}
            </>
          ) : (
            <p
              className={`work-peek-state is-${state === "已阻塞" ? "blocked" : state === "就绪" || state === "已完成" ? "ready" : "neutral"}`}
            >
              <i aria-hidden="true" />
              {state}
            </p>
          )}
          {!!selectedItem.evidence?.length && (
            <AppDisclosure label={`判断依据 · ${selectedItem.evidence.length}`}>
              <ul className="work-model-list">
                {selectedItem.evidence.map((evidence) => (
                  <li key={evidence.id}>
                    <strong>{evidence.source_id}</strong>
                    <span>{evidence.fact}</span>
                    <span>
                      {evidence.source_revision} ·{" "}
                      {evidence.location ?? "无位置"}
                    </span>
                  </li>
                ))}
              </ul>
            </AppDisclosure>
          )}
        </section>
        <section className="work-peek-section" aria-label="下一步">
          <h3>下一步</h3>
          <Button onClick={selectedItem.open}>{selectedItem.action}</Button>
          {source && (
            <div className="work-detail-links">
              <button
                type="button"
                onClick={() =>
                  onSource ? onSource(source.source.source.id) : onModels()
                }
              >
                在项目中查看版本 →
              </button>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
