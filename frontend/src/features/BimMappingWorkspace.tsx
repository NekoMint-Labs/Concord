import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  readSource,
  type DTO,
  type InvestigationReport,
} from "../api/client";
import { Button } from "../components/ui/button";
import { AppSelect } from "../components/ui/AppSelect";
import BIMWorkspace from "../viewers/BIMWorkspace";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import { demoInvestigationText } from "../ui/demo/demoPresentation";

export function filterBimCandidates(
  elements: readonly DTO<"BimElementSnapshot">[],
  filters: { storey: string; space: string; ifcClass: string },
) {
  return elements.filter(
    (item) =>
      (!filters.storey || item.storey === filters.storey) &&
      (!filters.space || item.space === filters.space) &&
      (!filters.ifcClass || item.ifc_class === filters.ifcClass),
  );
}

export type BimMappingContext = {
  sourceId?: string;
  fromRevisionId?: string;
  fromRevisionLabel?: string;
  revisionId?: string;
  revisionLabel?: string;
  highlightIds?: string[];
  changes?: DTO<"BimElementChange">[];
};

export function BimMappingWorkspace({
  project,
  workPackageId,
  initial,
  report,
  condensed,
  onContext,
  onInvestigate,
  onOpenInvestigation,
}: {
  project: string;
  workPackageId: string;
  initial?: BimMappingContext;
  report?: InvestigationReport | null;
  condensed?: boolean;
  onContext: (
    sourceId: string,
    revisionId: string,
    elementIds: string[],
    fromRevisionId?: string,
    revisionLabel?: string,
    fromRevisionLabel?: string,
  ) => void;
  onInvestigate: (
    sourceId: string,
    revisionId: string,
    elementIds: string[],
    fromRevisionId?: string,
  ) => void;
  onOpenInvestigation?: () => void;
}) {
  const cache = useQueryClient();
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const bimSources = (sources.data ?? []).filter(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  const [sourceId, setSourceId] = useState(initial?.sourceId ?? "");
  const current = bimSources.find((item) => item.source.id === sourceId);
  const revisionId =
    initial?.sourceId === sourceId
      ? (initial.revisionId ?? current?.latest_revision_id ?? "")
      : (current?.latest_revision_id ?? "");
  const snapshot = useQuery({
    queryKey: ["bim-snapshot", project, sourceId, revisionId],
    queryFn: () => api.bimSnapshot(project, sourceId, revisionId),
    enabled: !!sourceId && !!revisionId,
    retry: false,
  });
  const bindings = useQuery({
    queryKey: ["bim-bindings", project, sourceId, revisionId],
    queryFn: () => api.bimBindings(project, sourceId, revisionId),
    enabled: !!sourceId && !!revisionId,
  });
  const [storey, setStorey] = useState("");
  const [space, setSpace] = useState("");
  const [ifcClass, setIfcClass] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    if (!sourceId && bimSources[0]) setSourceId(bimSources[0].source.id);
  }, [bimSources, sourceId]);
  useEffect(() => {
    if (!initial?.sourceId) return;
    setSourceId(initial.sourceId);
    setSelected([]);
    setStorey("");
    setSpace("");
    setIfcClass("");
  }, [initial?.sourceId, initial?.revisionId]);
  useEffect(() => {
    setFile(null);
    setFileError("");
    if (!sourceId || !revisionId || !snapshot.data) return;
    let cancelled = false;
    void readSource(
      `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(sourceId)}/revisions/${encodeURIComponent(revisionId)}/content`,
    )
      .then((blob) => {
        if (!cancelled) setFile(new File([blob], "project-revision.ifc"));
      })
      .catch((cause) => {
        if (!cancelled)
          setFileError(
            cause instanceof Error ? cause.message : "IFC 文件不可用",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [project, revisionId, snapshot.data, sourceId]);

  const elements = snapshot.data?.elements ?? [];
  const values = (key: "storey" | "space" | "ifc_class") =>
    [...new Set(elements.map((item) => item[key]).filter(Boolean))] as string[];
  const candidates = useMemo(
    () => filterBimCandidates(elements, { storey, space, ifcClass }),
    [elements, ifcClass, space, storey],
  );
  const inspectionMode =
    !!initial?.fromRevisionId && initial.sourceId === sourceId;
  const inspectionIds = useMemo(
    () => (inspectionMode ? (initial?.highlightIds ?? []) : []),
    [initial?.highlightIds, inspectionMode],
  );
  const changes = inspectionMode ? (initial?.changes ?? []) : [];
  const intentIds = useMemo(
    () =>
      inspectionMode
        ? inspectionIds
        : selected.length
          ? selected
          : candidates.map((item) => item.global_id),
    [candidates, inspectionIds, inspectionMode, selected],
  );
  useEffect(() => {
    if (sourceId && revisionId)
      onContext(
        sourceId,
        revisionId,
        intentIds,
        inspectionMode ? initial?.fromRevisionId : undefined,
        inspectionMode ? initial?.revisionLabel : undefined,
        inspectionMode ? initial?.fromRevisionLabel : undefined,
      );
  }, [
    initial?.fromRevisionId,
    initial?.fromRevisionLabel,
    initial?.revisionLabel,
    inspectionMode,
    intentIds,
    onContext,
    revisionId,
    sourceId,
  ]);

  const confirm = useMutation({
    mutationFn: () =>
      api.confirmBimBindings(project, sourceId, {
        revision_id: revisionId,
        bindings: [{ work_package_id: workPackageId, global_ids: selected }],
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ["bim-bindings", project, sourceId],
      });
    },
  });
  const existing = (bindings.data ?? []).filter(
    (item) => item.binding.work_package_id === workPackageId,
  );

  return (
    <section className="mapping-workspace">
      <PaneSplit id="bim-mapping" persist>
        <Pane
          className="mapping-controls"
          defaultSize="320px"
          minSize="260px"
          maxSize="440px"
        >
          <header>
            <div>
              <span className="eyebrow">{workPackageId}</span>
              <h2>关联 BIM</h2>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!sourceId || !revisionId}
              onClick={() =>
                onInvestigate(
                  sourceId,
                  revisionId,
                  intentIds,
                  inspectionMode ? initial?.fromRevisionId : undefined,
                )
              }
            >
              调查当前选择
            </Button>
          </header>
          <label className="form-label">
            BIM 来源
            <AppSelect
              label="BIM 来源"
              value={sourceId || "__none__"}
              onChange={(value) => {
                setSourceId(value === "__none__" ? "" : value);
                setSelected([]);
              }}
              options={[
                { value: "__none__", label: "选择已上传来源" },
                ...bimSources.map((item) => ({
                  value: item.source.id,
                  label: item.source.name,
                  hint: item.has_pending_revision
                    ? "有待接受版本"
                    : "已同步基线",
                })),
              ]}
            />
          </label>
          {!bimSources.length && (
            <div className="impact-empty">
              <strong>尚无 BIM 来源</strong>
              <span>先在「项目来源」创建 BIM 来源并上传 IFC。</span>
            </div>
          )}
          {snapshot.isError && (
            <div className="impact-empty is-error">
              <strong>此版本尚未导入</strong>
              <span>原始文件已保存，但 IFC 解析尚未完成。</span>
            </div>
          )}
          {changes.length > 0 && (
            <section className="existing-bindings" aria-label="比较变更构件">
              <span className="fact-label">比较变更构件</span>
              {changes.map((change) => {
                const renderable = elements.some(
                  (element) => element.global_id === change.global_id,
                );
                return (
                  <div key={`${change.change_kind}:${change.global_id}`}>
                    <code>{change.global_id}</code>
                    <span className={`binding-state is-${change.change_kind}`}>
                      {change.change_kind}
                      {!renderable && change.change_kind === "deleted"
                        ? " · 目标版本无几何（历史变更保留）"
                        : !renderable
                          ? " · 目标版本不可渲染"
                          : " · 可在目标版本中定位"}
                    </span>
                  </div>
                );
              })}
            </section>
          )}
          {snapshot.data && (
            <>
              <div className="mapping-filters">
                <label>
                  楼层
                  <AppSelect
                    label="楼层"
                    value={storey || "__all__"}
                    onChange={(value) =>
                      setStorey(value === "__all__" ? "" : value)
                    }
                    options={[
                      { value: "__all__", label: "全部楼层" },
                      ...values("storey").map((value) => ({
                        value,
                        label: value,
                      })),
                    ]}
                  />
                </label>
                <label>
                  空间
                  <AppSelect
                    label="空间"
                    value={space || "__all__"}
                    onChange={(value) =>
                      setSpace(value === "__all__" ? "" : value)
                    }
                    options={[
                      { value: "__all__", label: "全部空间" },
                      ...values("space").map((value) => ({
                        value,
                        label: value,
                      })),
                    ]}
                  />
                </label>
                <label>
                  IFC 类型
                  <AppSelect
                    label="IFC 类型"
                    value={ifcClass || "__all__"}
                    onChange={(value) =>
                      setIfcClass(value === "__all__" ? "" : value)
                    }
                    options={[
                      { value: "__all__", label: "全部类型" },
                      ...values("ifc_class").map((value) => ({
                        value,
                        label: value,
                      })),
                    ]}
                  />
                </label>
              </div>
              {!inspectionMode && (
                <div className="candidate-heading">
                  <strong>{candidates.length} 个候选构件</strong>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(candidates.map((item) => item.global_id))
                    }
                  >
                    选择全部
                  </button>
                  <button type="button" onClick={() => setSelected([])}>
                    清除选择
                  </button>
                </div>
              )}
              {inspectionMode && (
                <p className="viewer-status">
                  影响检查为只读；只有从工作包主动进入「关联
                  BIM」后才能确认绑定。
                </p>
              )}
              <div className="candidate-list">
                {candidates.map((item) => (
                  <label key={item.global_id}>
                    <input
                      type="checkbox"
                      checked={
                        inspectionMode
                          ? inspectionIds.includes(item.global_id)
                          : selected.includes(item.global_id)
                      }
                      disabled={inspectionMode}
                      onChange={(event) =>
                        setSelected((items) =>
                          event.target.checked
                            ? [...items, item.global_id]
                            : items.filter((id) => id !== item.global_id),
                        )
                      }
                    />
                    <span>
                      <strong>{item.name || item.ifc_class}</strong>
                      <small>
                        {item.ifc_class} · {item.storey || "无楼层"} ·{" "}
                        {item.space || "无空间"}
                      </small>
                      <small className="mono">{item.global_id}</small>
                    </span>
                  </label>
                ))}
              </div>
              {!inspectionMode && (
                <Button
                  disabled={!selected.length || confirm.isPending}
                  onClick={() => confirm.mutate()}
                >
                  确认关联 {selected.length} 个构件
                </Button>
              )}
            </>
          )}
          <section className="existing-bindings">
            <span className="fact-label">现有绑定</span>
            {existing.map((item) => (
              <div key={item.binding.id}>
                <code>{item.binding.global_id}</code>
                <span className={`binding-state is-${item.state}`}>
                  {item.state === "present"
                    ? "当前版本存在"
                    : item.state === "missing"
                      ? "当前版本缺失（保留历史绑定）"
                      : "版本尚未导入"}
                </span>
              </div>
            ))}
            {!existing.length && (
              <p className="quiet-message">尚未确认绑定。</p>
            )}
          </section>
          {confirm.error && <p className="alert">{confirm.error.message}</p>}
          {report?.scope.work_package_ids.includes(workPackageId) && (
            <section className="context-agent-result">
              <span className="eyebrow">构件调查结果</span>
              <p>{demoInvestigationText(report.answer.summary)}</p>
              <div className="context-agent-result-footer">
                <small>{report.evidence.length} 条已持久化依据</small>
                {onOpenInvestigation && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onOpenInvestigation}
                  >
                    查看调查结果
                  </Button>
                )}
              </div>
            </section>
          )}
        </Pane>
        <PaneDivider label="调整 BIM 关联面板宽度" />
        <Pane className="mapping-viewer">
          {fileError && <p className="alert">{fileError}</p>}
          <BIMWorkspace
            project={project}
            impacted={intentIds}
            condensed={condensed}
            externalFile={file}
            hideSourceActions
            onViewerSelected={(id) => {
              if (inspectionMode) return;
              setSelected((items) =>
                id && !items.includes(id) ? [...items, id] : items,
              );
            }}
          />
        </Pane>
      </PaneSplit>
    </section>
  );
}
