import { lazy, Suspense, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Box, Cuboid, ExternalLink } from "lucide-react";
import { api, readSource } from "../api/client";
import { Button } from "../components/ui/button";
import { AppSelect } from "../components/ui/AppSelect";
import { icon } from "../components/ui/icon";
import { demoElementName } from "../ui/demo/demoPresentation";
import type { BimMappingContext } from "./BimMappingWorkspace";

const IFCViewer = lazy(() => import("../viewers/IFCViewer"));
type Props = {
  project: string;
  elementIds: readonly string[];
  impacted: readonly string[];
  revision: string;
  workPackageId?: string;
  /** The second argument preserves the source/revision, including missing GUIDs. */
  onOpenModel: (elementId?: string, context?: BimMappingContext) => void;
  onModels?: () => void;
  onChanges?: (context?: BimMappingContext) => void;
};

export function WorkPackageModelContext(props: Props) {
  return (
    <ModelContext
      key={JSON.stringify([props.project, props.workPackageId])}
      {...props}
    />
  );
}

function ModelContext({
  project,
  elementIds,
  impacted,
  revision,
  workPackageId,
  onOpenModel,
  onModels,
  onChanges,
}: Props) {
  const [selectedKey, setSelectedKey] = useState("");
  const [chosenSource, setChosenSource] = useState("");
  const elements = useQuery({
    queryKey: ["bim", project],
    queryFn: () => api.bim(project),
  });
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const models = useMemo(
    () =>
      sources.data?.filter(
        (item) => item.source.kind === "BIM" && item.latest_revision_id,
      ) ?? [],
    [sources.data],
  );
  const bindings = useQueries({
    queries: models.map((source) => ({
      queryKey: [
        "bim-bindings",
        project,
        source.source.id,
        source.latest_revision_id,
      ],
      queryFn: () =>
        api.bimBindings(project, source.source.id, source.latest_revision_id!),
      enabled: !!workPackageId,
    })),
  });
  const snapshots = useQueries({
    queries: models.map((source) => ({
      queryKey: [
        "bim-snapshot",
        project,
        source.source.id,
        source.latest_revision_id,
      ],
      queryFn: () =>
        api.bimSnapshot(project, source.source.id, source.latest_revision_id!),
      retry: false,
    })),
  });
  const comparisonLists = useQueries({
    queries: models.map((source) => ({
      queryKey: ["comparisons", project, source.source.id],
      queryFn: () => api.comparisons(project, source.source.id),
      enabled: source.has_pending_revision,
    })),
  });
  const comparisons = models.map((source, index) =>
    comparisonLists[index].data
      ?.slice()
      .reverse()
      .find(
        (item) =>
          item.to_revision_id === source.latest_revision_id &&
          item.from_revision_id === source.accepted_revision_id,
      ),
  );
  const impacts = useQueries({
    queries: models.map((source, index) => ({
      queryKey: [
        "comparison",
        project,
        source.source.id,
        comparisons[index]?.id,
      ],
      queryFn: () =>
        api.comparison(project, source.source.id, comparisons[index]!.id),
      enabled: !!comparisons[index],
    })),
  });
  const revisions = useQueries({
    queries: models.map((source) => ({
      queryKey: ["source-revisions", project, source.source.id],
      queryFn: () => api.sourceRevisions(project, source.source.id),
    })),
  });
  const keyFor = (sourceId: string, id: string, revisionId = "legacy") =>
    JSON.stringify([sourceId, revisionId, id]);
  const linked = models.flatMap((source, index) => {
    const ids = [
      ...new Set([
        ...(models.length === 1 ? elementIds : []),
        ...(bindings[index].data ?? [])
          .filter(
            (item) =>
              item.binding.project_id === project &&
              item.binding.source_id === source.source.id &&
              item.binding.work_package_id === workPackageId &&
              !item.binding.retired_at,
          )
          .map((item) => item.binding.global_id),
      ]),
    ];
    const snapshot = snapshots[index].data;
    const exact =
      snapshot?.project_id === project &&
      snapshot.source_id === source.source.id &&
      snapshot.revision_id === source.latest_revision_id
        ? snapshot
        : undefined;
    const changes =
      impacts[index].data?.affected_work_packages.find(
        (item) => item.work_package_id === workPackageId,
      )?.changes ?? [];
    return ids.map((id) => ({
      id,
      key: keyFor(source.source.id, id, source.latest_revision_id!),
      sourceId: source.source.id,
      sourceName: source.source.name,
      modelElement: exact?.elements.find((item) => item.global_id === id),
      element: undefined,
      missing: (bindings[index].data ?? []).some(
        (item) =>
          item.binding.work_package_id === workPackageId &&
          item.binding.global_id === id &&
          item.state === "missing",
      ),
      affected:
        changes.some((change) => change.global_id === id) ||
        (models.length === 1 && impacted.includes(id)),
    }));
  });
  // Legacy IDs have no source identity; never silently assign them to one of several models.
  const legacy =
    models.length === 0
      ? elementIds.map((id) => ({
          id,
          key: keyFor("", id),
          sourceId: "",
          sourceName: "",
          modelElement: undefined,
          element: elements.data?.find((item) => item.id === id),
          missing: false,
          affected: impacted.includes(id),
        }))
      : [];
  const rows = [...linked, ...legacy];
  const selected =
    rows.find((item) => item.key === selectedKey) ??
    (chosenSource
      ? rows.find((item) => item.sourceId === chosenSource)
      : rows[0]);
  const source =
    models.find(
      (item) => item.source.id === (chosenSource || selected?.sourceId),
    ) ?? models[0];
  const sourceIndex = source ? models.indexOf(source) : -1;
  const snapshot = sourceIndex >= 0 ? snapshots[sourceIndex].data : undefined;
  const exactSnapshot =
    snapshot?.project_id === project &&
    snapshot.source_id === source?.source.id &&
    snapshot.revision_id === source.latest_revision_id
      ? snapshot
      : undefined;
  const sourceRows = rows.filter(
    (item) => item.sourceId === (source?.source.id ?? ""),
  );
  const active =
    selected?.sourceId === (source?.source.id ?? "") ? selected : sourceRows[0];
  const affected = rows.filter((item) => item.affected);
  const comparison = sourceIndex >= 0 ? comparisons[sourceIndex] : undefined;
  const comparisonChanges =
    sourceIndex >= 0
      ? (impacts[sourceIndex].data?.affected_work_packages.find(
          (item) => item.work_package_id === workPackageId,
        )?.changes ?? [])
      : [];
  const labelFor = (id?: string | null) => {
    const entry =
      sourceIndex >= 0
        ? revisions[sourceIndex].data?.find((item) => item.id === id)
        : undefined;
    return entry
      ? `R${entry.sequence}${entry.external_label ? ` · ${entry.external_label}` : ""}`
      : (id ?? undefined);
  };
  const handoff: BimMappingContext | undefined = source
    ? {
        sourceId: source.source.id,
        revisionId: source.latest_revision_id!,
        revisionLabel: labelFor(source.latest_revision_id),
        fromRevisionId: comparison?.from_revision_id,
        fromRevisionLabel: labelFor(comparison?.from_revision_id),
        highlightIds: active ? [active.id] : sourceRows.map((item) => item.id),
        changes: comparisonChanges,
      }
    : undefined;
  const model = useQuery({
    queryKey: [
      "bim-content",
      project,
      source?.source.id ?? "legacy",
      source?.latest_revision_id ?? "legacy",
    ],
    queryFn: async () =>
      new File(
        [
          await readSource(
            source
              ? `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(source.source.id)}/revisions/${encodeURIComponent(source.latest_revision_id!)}/content`
              : `/api/projects/${encodeURIComponent(project)}/bim/content`,
          ),
        ],
        source ? "project-model.ifc" : "project-import.ifc",
      ),
    enabled: sources.isSuccess && (!models.length || !!exactSnapshot),
    retry: false,
    staleTime: Infinity,
  });
  const affectedInSource = sourceRows
    .filter((item) => item.affected)
    .map((item) => item.id);
  return (
    <section className="model-context" aria-label="模型上下文">
      <header className="overview-section-header">
        <div>
          <span className="section-label">模型上下文</span>
          <h2>{rows.length} 个关联构件</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={!sources.isSuccess}
          onClick={() => onOpenModel(active?.id, handoff)}
        >
          打开模型 <ExternalLink {...icon} />
        </Button>
        {models.length > 1 && (
          <AppSelect
            label="工作包项目模型"
            value={source?.source.id ?? models[0].source.id}
            onChange={(id) => {
              setChosenSource(id);
              setSelectedKey(
                rows.find((item) => item.sourceId === id)?.key ?? "",
              );
            }}
            options={models.map((item) => ({
              value: item.source.id,
              label: item.source.name,
            }))}
          />
        )}
        {!models.length && onModels && (
          <Button size="sm" onClick={onModels}>
            上传第一个模型
          </Button>
        )}
        {comparisonChanges.length > 0 && onChanges && (
          <Button size="sm" onClick={() => onChanges(handoff)}>
            查看 {comparisonChanges.length} 个变更构件
          </Button>
        )}
      </header>
      <div className="model-context-layout">
        <div className="overview-model-stage">
          {model.data && (!source || exactSnapshot) ? (
            <Suspense
              fallback={
                <div className="model-stage-state">正在准备 IFC 几何视图…</div>
              }
            >
              <IFCViewer
                file={model.data}
                impacted={affectedInSource}
                focusId={active?.id ?? ""}
                selectedLabel={
                  active?.modelElement?.name ??
                  active?.element?.name ??
                  undefined
                }
                onSelected={(id) => {
                  const row = sourceRows.find((item) => item.id === id);
                  if (row) setSelectedKey(row.key);
                }}
              />
            </Suspense>
          ) : (
            <div className="model-stage-state">
              <Cuboid {...icon} aria-hidden="true" />
              <div>
                <strong>
                  {model.isLoading
                    ? "正在查找项目模型"
                    : "暂无可打开的 IFC 几何文件"}
                </strong>
                <p>
                  {model.isLoading
                    ? "正在查找项目模型。"
                    : rows.length
                      ? "关联关系仍可查看；处理模型后将显示几何。"
                      : "为工作包关联构件后，模型上下文会显示在这里。"}
                </p>
              </div>
            </div>
          )}
        </div>
        <aside className="linked-element-panel">
          <header>
            <span>关联构件</span>
            <small>{rows.length}</small>
          </header>
          <div className="linked-element-list">
            {rows.map((row, index) => (
              <button
                type="button"
                key={row.key}
                className={active?.key === row.key ? "selected" : ""}
                aria-pressed={active?.key === row.key}
                onClick={() => {
                  setSelectedKey(row.key);
                  setChosenSource(row.sourceId);
                }}
              >
                <span className="element-index">{index + 1}</span>
                <span className="element-copy">
                  <strong>
                    {row.modelElement?.name ||
                      (row.element
                        ? demoElementName(row.element.id, row.element.name)
                        : row.missing
                          ? "此版本已删除的构件"
                          : "历史关联构件")}
                  </strong>
                  <small>
                    {[
                      models.length > 1 ? row.sourceName : "",
                      row.modelElement?.ifc_class ?? row.element?.type,
                      row.modelElement?.storey ?? row.element?.storey,
                      row.modelElement?.space ?? row.element?.space,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "结构化构件"}
                  </small>
                </span>
                <span
                  className={`element-signal${row.affected ? " is-affected" : ""}`}
                  aria-label={row.affected ? "受影响" : "未受影响"}
                />
              </button>
            ))}
            {!rows.length && (
              <div className="linked-element-empty">
                <Box {...icon} />
                <span>
                  {models.length > 1 && elementIds.length
                    ? "旧关联未记录模型来源；请重新确认来源后关联。"
                    : bindings.some((query) => query.isPending)
                      ? "正在读取工作包模型关联…"
                      : bindings.some((query) => query.isError)
                        ? "模型关联读取失败，请重试。"
                        : "当前工作包尚未关联 BIM 构件。"}
                </span>
              </div>
            )}
          </div>
          <div className="model-change-summary">
            <Box {...icon} />
            <div>
              <strong>
                {affected.length
                  ? `${affected.length} 个关联构件受到影响`
                  : "当前没有相关模型变化"}
              </strong>
              <small>
                {affected.length
                  ? models.some((item) => item.has_pending_revision)
                    ? "新版本待审核，请到「变更」查看详情。"
                    : `当前分析基于 ${revision}`
                  : "没有构件进入当前影响范围"}
              </small>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
