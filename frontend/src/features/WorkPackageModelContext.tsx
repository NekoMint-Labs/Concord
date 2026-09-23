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
  onOpenModel,
}: {
  project: string;
  elementIds: readonly string[];
  impacted: readonly string[];
  revision: string;
  onOpenModel: () => void;
}) {
  const [selected, setSelected] = useState(elementIds[0] ?? "");
  const elements = useQuery({
    queryKey: ["bim", project],
    queryFn: () => api.bim(project),
  });
  const model = useQuery({
    queryKey: ["bim-content", project],
    queryFn: async () => {
      const blob = await readSource(
        `/api/projects/${encodeURIComponent(project)}/bim/content`,
      );
      return new File([blob], "project-import.ifc");
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const linked = useMemo(
    () =>
      elementIds.map((id) => ({
        id,
        element: elements.data?.find((item) => item.id === id),
      })),
    [elementIds, elements.data],
  );
  const affected = elementIds.filter((id) => impacted.includes(id));

  useEffect(() => {
    if (!elementIds.includes(selected)) setSelected(elementIds[0] ?? "");
  }, [elementIds, selected]);

  return (
    <section className="model-context" aria-label="模型上下文">
      <header className="overview-section-header">
        <div>
          <span className="section-label">模型上下文</span>
          <h2>{elementIds.length} 个关联构件</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpenModel}>
          打开模型 <ExternalLink {...icon} />
        </Button>
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
                  {model.isLoading
                    ? "正在查找项目模型"
                    : "暂无可打开的 IFC 几何文件"}
                </strong>
                <p>
                  {model.isLoading
                    ? "正在核对当前项目的模型来源。"
                    : elementIds.length
                      ? "关联关系和结构化构件仍可检查；导入 IFC 后会在此显示真实几何。"
                      : "为工作包关联构件后，模型上下文会显示在这里。"}
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="linked-element-panel">
          <header>
            <span>关联构件</span>
            <small>{elementIds.length}</small>
          </header>
          <div className="linked-element-list">
            {linked.map(({ id, element }, index) => (
              <button
                type="button"
                key={id}
                className={selected === id ? "selected" : ""}
                onClick={() => setSelected(id)}
              >
                <span className="element-index">{index + 1}</span>
                <span className="element-copy">
                  <strong>
                    {element
                      ? demoElementName(element.id, element.name)
                      : "历史关联构件"}
                  </strong>
                  <small>
                    {[element?.type, element?.storey, element?.space]
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
                  ? `当前分析基于 ${revision}`
                  : "没有构件进入当前影响范围"}
              </small>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
