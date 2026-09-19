import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  readSource,
  type DTO,
  type InvestigationReport,
} from "../api/client";
import { Button } from "../components/ui/button";
import BIMWorkspace from "../viewers/BIMWorkspace";

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
  revisionId?: string;
  highlightIds?: string[];
};

export function BimMappingWorkspace({
  project,
  workPackageId,
  initial,
  report,
  condensed,
  onContext,
  onInvestigate,
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
  ) => void;
  onInvestigate: (
    sourceId: string,
    revisionId: string,
    elementIds: string[],
  ) => void;
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
  const [selected, setSelected] = useState<string[]>(
    initial?.highlightIds ?? [],
  );
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    if (!sourceId && bimSources[0]) setSourceId(bimSources[0].source.id);
  }, [bimSources, sourceId]);
  useEffect(() => {
    setSelected(initial?.highlightIds ?? []);
  }, [initial?.highlightIds]);
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
  const intentIds = useMemo(
    () =>
      selected.length ? selected : candidates.map((item) => item.global_id),
    [candidates, selected],
  );
  useEffect(() => {
    if (sourceId && revisionId) onContext(sourceId, revisionId, intentIds);
  }, [intentIds, onContext, revisionId, sourceId]);

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
      <div className="mapping-controls">
        <header>
          <div>
            <span className="eyebrow">{workPackageId}</span>
            <h2>关联 BIM</h2>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={!sourceId || !revisionId}
            onClick={() => onInvestigate(sourceId, revisionId, intentIds)}
          >
            让 Concord 调查当前选择
          </Button>
        </header>
        <label className="form-label">
          BIM 来源
          <select
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
              setSelected([]);
            }}
          >
            <option value="">选择已上传来源</option>
            {bimSources.map((item) => (
              <option key={item.source.id} value={item.source.id}>
                {item.source.name}
              </option>
            ))}
          </select>
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
        {snapshot.data && (
          <>
            <div className="mapping-filters">
              <label>
                楼层
                <select
                  value={storey}
                  onChange={(e) => setStorey(e.target.value)}
                >
                  <option value="">全部</option>
                  {values("storey").map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                空间
                <select
                  value={space}
                  onChange={(e) => setSpace(e.target.value)}
                >
                  <option value="">全部</option>
                  {values("space").map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                IFC 类型
                <select
                  value={ifcClass}
                  onChange={(e) => setIfcClass(e.target.value)}
                >
                  <option value="">全部</option>
                  {values("ifc_class").map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
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
            <div className="candidate-list">
              {candidates.map((item) => (
                <label key={item.global_id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(item.global_id)}
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
            <Button
              disabled={!selected.length || confirm.isPending}
              onClick={() => confirm.mutate()}
            >
              确认关联 {selected.length} 个构件
            </Button>
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
          {!existing.length && <p className="quiet-message">尚未确认绑定。</p>}
        </section>
        {confirm.error && <p className="alert">{confirm.error.message}</p>}
        {report?.scope.work_package_ids.includes(workPackageId) && (
          <section className="context-agent-result">
            <span className="eyebrow">Concord 调查结果</span>
            <p>{report.answer.summary}</p>
            <small>{report.evidence.length} 条已持久化 Evidence</small>
          </section>
        )}
      </div>
      <div className="mapping-viewer">
        {fileError && <p className="alert">{fileError}</p>}
        <BIMWorkspace
          project={project}
          impacted={intentIds}
          condensed={condensed}
          externalFile={file}
          hideSourceActions
          onViewerSelected={(id) =>
            setSelected((items) =>
              id && !items.includes(id) ? [...items, id] : items,
            )
          }
        />
      </div>
    </section>
  );
}
