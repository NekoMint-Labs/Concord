import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Cuboid, ExternalLink } from "lucide-react";
import { api, readSource } from "../api/client";
import { Button } from "../components/ui/button";
import { icon } from "../components/ui/icon";
import { demoElementName } from "../ui/demo/demoPresentation";

const IFCViewer = lazy(() => import("../viewers/IFCViewer"));

export function WorkPackageModelContext({
  project,
  elementIds,
  impacted,
  revision,
  workPackageId,
  onOpenModel,
  onModels,
  onChanges,
}: {
  project: string;
  elementIds: readonly string[];
  impacted: readonly string[];
  revision: string;
  workPackageId?: string;
  onOpenModel: (elementId?: string) => void;
  onModels?: () => void;
  onChanges?: () => void;
}) {
  const [selected, setSelected] = useState(elementIds[0] ?? "");
  const elements = useQuery({
    queryKey: ["bim", project],
    queryFn: () => api.bim(project),
  });
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const models =
    sources.data?.filter(
      (item) => item.source.kind === "BIM" && item.latest_revision_id,
    ) ?? [];
  const source = models.length === 1 ? models[0] : undefined;
  const bindings = useQuery({
    queryKey: [
      "bim-bindings",
      project,
      source?.source.id,
      source?.latest_revision_id,
    ],
    queryFn: () =>
      api.bimBindings(project, source!.source.id, source!.latest_revision_id!),
    enabled: !!workPackageId && !!source?.latest_revision_id,
  });
  const comparisons = useQuery({
    queryKey: ["comparisons", project, source?.source.id],
    queryFn: () => api.comparisons(project, source!.source.id),
    enabled: !!source?.source.id && !!source.has_pending_revision,
  });
  const comparison = comparisons.data
    ?.slice()
    .reverse()
    .find(
      (item) =>
        item.to_revision_id === source?.latest_revision_id &&
        item.from_revision_id === source?.accepted_revision_id,
    );
  const changeImpact = useQuery({
    queryKey: ["comparison", project, source?.source.id, comparison?.id],
    queryFn: () => api.comparison(project, source!.source.id, comparison!.id),
    enabled: !!comparison,
  });
  const snapshot = useQuery({
    queryKey: [
      "bim-snapshot",
      project,
      source?.source.id,
      source?.latest_revision_id,
    ],
    queryFn: () =>
      api.bimSnapshot(project, source!.source.id, source!.latest_revision_id!),
    enabled: !!source?.latest_revision_id,
    retry: false,
  });
  const linkedIds = [
    ...new Set([
      ...elementIds,
      ...(bindings.data ?? [])
        .filter((item) => item.binding.work_package_id === workPackageId)
        .map((item) => item.binding.global_id),
    ]),
  ];
  const model = useQuery({
    queryKey: ["bim-content", project, source?.latest_revision_id],
    queryFn: async () => {
      const path = source
        ? `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(source.source.id)}/revisions/${encodeURIComponent(source.latest_revision_id!)}/content`
        : `/api/projects/${encodeURIComponent(project)}/bim/content`;
      return new File(
        [await readSource(path)],
        source ? "project-model.ifc" : "project-import.ifc",
      );
    },
    enabled:
      sources.isSuccess && models.length <= 1 && (!source || !!snapshot.data),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const linked = useMemo(
    () =>
      linkedIds.map((id) => ({
        id,
        element: elements.data?.find((item) => item.id === id),
        snapshot: snapshot.data?.elements.find((item) => item.global_id === id),
      })),
    [linkedIds.join("|"), elements.data, snapshot.data],
  );
  const missingIds = (bindings.data ?? [])
    .filter(
      (item) =>
        item.binding.work_package_id === workPackageId &&
        item.state === "missing",
    )
    .map((item) => item.binding.global_id);
  const comparisonChanges =
    changeImpact.data?.affected_work_packages.find(
      (item) => item.work_package_id === workPackageId,
    )?.changes ?? [];
  const affected = linkedIds.filter(
    (id) =>
      impacted.includes(id) ||
      comparisonChanges.some((change) => change.global_id === id),
  );

  useEffect(() => {
    if (!linkedIds.includes(selected)) setSelected(linkedIds[0] ?? "");
  }, [linkedIds.join("|"), selected]);

  return (
    <section className="model-context" aria-label="模型上下文">
      <header className="overview-section-header">
        <div>
          <span className="section-label">模型上下文</span>
          <h2>{linkedIds.length} 个关联构件</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onOpenModel(selected)}>
          打开模型 <ExternalLink {...icon} />
        </Button>
        {!source && onModels && (
          <Button size="sm" onClick={onModels}>
            {models.length > 1 ? "选择项目模型" : "上传第一个模型"}
          </Button>
        )}
        {comparisonChanges.length > 0 && onChanges && (
          <Button size="sm" onClick={onChanges}>
            查看 {comparisonChanges.length} 个变更构件
          </Button>
        )}
      </header>

      <div className="model-context-layout">
        <div className="overview-model-stage">
          {model.data ? (
            <Suspense
              fallback={
                <div className="model-stage-state">正在准备 IFC 几何视图…</div>
              }
            >
              <IFCViewer
                file={model.data}
                impacted={affected}
                onSelected={setSelected}
              />
            </Suspense>
          ) : (
            <div className="model-stage-state">
              <Cuboid {...icon} aria-hidden="true" />
              <div>
                <strong>
                  {models.length > 1
                    ? "项目有多个模型"
                    : model.isLoading
                      ? "正在查找项目模型"
                      : "暂无可打开的 IFC 几何文件"}
                </strong>
                <p>
                  {models.length > 1
                    ? "请在模型版本中选择要查看的模型，避免混淆不同模型的构件。"
                    : model.isLoading
                      ? "正在查找项目模型。"
                      : linkedIds.length
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
            <small>{linkedIds.length}</small>
          </header>
          <div className="linked-element-list">
            {linked.map(({ id, element, snapshot: modelElement }, index) => (
              <button
                type="button"
                key={id}
                className={selected === id ? "selected" : ""}
                onClick={() => setSelected(id)}
              >
                <span className="element-index">{index + 1}</span>
                <span className="element-copy">
                  <strong>
                    {modelElement?.name ||
                      (element
                        ? demoElementName(element.id, element.name)
                        : missingIds.includes(id)
                          ? "此版本已删除的构件"
                          : "历史关联构件")}
                  </strong>
                  <small>
                    {[
                      modelElement?.ifc_class ?? element?.type,
                      modelElement?.storey ?? element?.storey,
                      modelElement?.space ?? element?.space,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "结构化构件"}
                  </small>
                </span>
                <span
                  className={`element-signal${affected.includes(id) ? " is-affected" : ""}`}
                  aria-label={affected.includes(id) ? "受影响" : "未受影响"}
                />
              </button>
            ))}
            {!linked.length && (
              <div className="linked-element-empty">
                <Box {...icon} />
                <span>当前工作包尚未关联 BIM 构件。</span>
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
                  ? comparison
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
