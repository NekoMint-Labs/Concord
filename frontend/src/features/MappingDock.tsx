import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { DTO, InvestigationReport } from "../api/client";
import { Button } from "../components/ui/button";
import { AppSelect } from "../components/ui/AppSelect";
import { demoInvestigationText } from "../ui/demo/demoPresentation";
import {
  AGENT_ELEMENT_LIMIT_MESSAGE,
  MAX_AGENT_ELEMENTS,
} from "./agentContext";

export type MappingFilters = {
  storey: string;
  space: string;
  ifcClass: string;
};
type Props = {
  selector: ReactNode;
  investigationProgress?: ReactNode;
  inspectionMode: boolean;
  filters: MappingFilters;
  onFilters: Dispatch<SetStateAction<MappingFilters>>;
  elements: DTO<"BimElementSnapshot">[];
  inspectableElements: DTO<"BimElementSnapshot">[];
  candidates: DTO<"BimElementSnapshot">[];
  candidateIds: string[];
  validSelected: string[];
  sourceId: string;
  revisionId: string;
  intentIds: string[];
  fromRevisionId?: string;
  noModels: boolean;
  snapshotError: boolean;
  modelError?: Error | null;
  confirmPending: boolean;
  confirmSuccess: boolean;
  confirmedCount: number;
  confirmError?: Error | null;
  changes: DTO<"BimElementChange">[];
  allowedIds: string[];
  activeId: string;
  existing: DTO<"BimBindingStatus">[];
  report?: InvestigationReport | null;
  workPackageId: string;
  onOpenInvestigation?: () => void;
  onModels?: () => void;
  onInvestigate: (
    source: string,
    revision: string,
    ids: string[],
    from?: string,
  ) => void;
  onToggle: (id: string, checked: boolean) => void;
  onActivate: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
};

/** Filters and retained candidate/binding records in the shared Model dock. */
export function MappingDock({
  selector,
  investigationProgress,
  inspectionMode,
  filters,
  elements,
  inspectableElements,
  candidates,
  candidateIds,
  validSelected,
  sourceId,
  revisionId,
  intentIds,
  fromRevisionId,
  noModels,
  changes,
  allowedIds,
  activeId,
  existing,
  report,
  workPackageId,
  onOpenInvestigation,
  onModels,
  onInvestigate,
  onFilters,
  snapshotError,
  modelError,
  confirmPending,
  confirmSuccess,
  confirmedCount,
  confirmError,
  onToggle,
  onActivate,
  onSelectAll,
  onClear,
}: Props) {
  return (
    <section
      className="mapping-dock"
      aria-label={inspectionMode ? "影响构件" : "关联候选构件"}
    >
      <div className="mapping-dock-tools">
        {selector}
        {(
          [
            ["storey", "楼层", "storey"],
            ["space", "空间", "space"],
            ["ifcClass", "IFC 类型", "ifc_class"],
          ] as const
        ).map(([key, label, field]) => (
          <label key={key}>
            {label}
            <AppSelect
              label={label}
              value={filters[key] || "__all__"}
              onChange={(value) =>
                onFilters((current) => ({
                  ...current,
                  [key]: value === "__all__" ? "" : value,
                }))
              }
              options={[
                { value: "__all__", label: `全部${label}` },
                ...[
                  ...new Set(
                    elements
                      .map((item) => item[field])
                      .filter((value): value is string => !!value),
                  ),
                ].map((value) => ({ value, label: value })),
              ]}
            />
          </label>
        ))}
        <strong>
          {candidates.length} 个候选构件 · 已选 {validSelected.length}
        </strong>
        {!inspectionMode && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={!candidates.length || confirmPending}
              onClick={() => {
                onSelectAll();
              }}
            >
              选择全部
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onClear();
              }}
            >
              清除选择
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={
            !sourceId ||
            !revisionId ||
            !intentIds.length ||
            intentIds.length > MAX_AGENT_ELEMENTS
          }
          onClick={() =>
            onInvestigate(sourceId, revisionId, intentIds, fromRevisionId)
          }
        >
          调查当前选择
        </Button>
        {intentIds.length > MAX_AGENT_ELEMENTS && (
          <p role="alert">{AGENT_ELEMENT_LIMIT_MESSAGE}</p>
        )}
      </div>
      <div className="mapping-dock-body">
        {investigationProgress}
        {noModels && (
          <div className="impact-empty">
            <strong>尚无项目模型</strong>
            <span>先上传并处理第一个 IFC。</span>
            {onModels && (
              <Button size="sm" onClick={onModels}>
                上传第一个模型
              </Button>
            )}
          </div>
        )}
        {snapshotError && (
          <div className="impact-empty is-error">
            <strong>此版本尚未处理完成</strong>
            {onModels && (
              <Button size="sm" onClick={onModels}>
                查看模型版本
              </Button>
            )}
          </div>
        )}
        {modelError && <p className="alert">{modelError.message}</p>}
        <div className="candidate-list">
          {candidates.map((item) => (
            <div
              className={`mapping-candidate${activeId === item.global_id ? " is-active" : ""}`}
              key={item.global_id}
            >
              {!inspectionMode && (
                <input
                  type="checkbox"
                  aria-label={`关联 ${item.name || item.ifc_class}`}
                  checked={validSelected.includes(item.global_id)}
                  disabled={confirmPending}
                  onChange={(event) =>
                    onToggle(item.global_id, event.target.checked)
                  }
                />
              )}
              <button
                type="button"
                aria-pressed={activeId === item.global_id}
                onClick={() => onActivate(item.global_id)}
              >
                <strong>{item.name || item.ifc_class}</strong>
                <small>
                  {item.ifc_class} · {item.storey || "无楼层"} ·{" "}
                  {item.space || "无空间"}
                </small>
              </button>
            </div>
          ))}
        </div>
        {inspectionMode && (
          <section className="existing-bindings" aria-label="比较变更构件">
            {changes.map((change) => (
              <button
                type="button"
                key={change.global_id}
                aria-pressed={activeId === change.global_id}
                onClick={() => onActivate(change.global_id)}
              >
                <strong>
                  {inspectableElements.find(
                    (item) => item.global_id === change.global_id,
                  )?.name || "历史变更构件"}
                </strong>
                <span>
                  {
                    { added: "新增", deleted: "删除", changed: "变化" }[
                      change.change_kind
                    ]
                  }{" "}
                  ·{" "}
                  {allowedIds.includes(change.global_id)
                    ? "可在目标版本中定位"
                    : change.change_kind === "deleted"
                      ? "目标版本无几何（历史变更保留）"
                      : "目标版本不可渲染"}
                </span>
              </button>
            ))}
          </section>
        )}
        <section className="existing-bindings">
          <span className="fact-label">现有绑定</span>
          {existing.map((item) => (
            <button
              type="button"
              key={item.binding.id}
              aria-pressed={activeId === item.binding.global_id}
              onClick={() => onActivate(item.binding.global_id)}
            >
              <span>
                {inspectableElements.find(
                  (element) => element.global_id === item.binding.global_id,
                )?.name || "历史关联构件"}
              </span>
              <span className={`binding-state is-${item.state}`}>
                {item.state === "present"
                  ? "当前版本存在"
                  : item.state === "missing"
                    ? "当前版本缺失（保留历史绑定）"
                    : "版本尚未导入"}
              </span>
            </button>
          ))}
          {!existing.length && <p className="quiet-message">尚未确认绑定。</p>}
        </section>
        {confirmSuccess && (
          <p className="viewer-status" role="status">
            已关联 {confirmedCount} 个构件。
          </p>
        )}
        {confirmError && <p className="alert">{confirmError.message}</p>}
        {report?.scope.work_package_ids.includes(workPackageId) && (
          <section className="context-agent-result">
            <span className="eyebrow">构件调查结果</span>
            <p>{demoInvestigationText(report.answer.summary)}</p>
            {onOpenInvestigation && (
              <Button size="sm" variant="ghost" onClick={onOpenInvestigation}>
                查看调查结果
              </Button>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
