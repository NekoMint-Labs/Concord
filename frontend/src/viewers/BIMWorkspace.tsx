import { lazy, Suspense, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, FolderOpen, PackageOpen } from "lucide-react";
import { api, readSource } from "../api/client";
import { useBIMSource } from "./useBIMSource";
import { propertySections, OTHER_PROPERTIES_TITLE } from "./bimProperties";
import { demoElementName } from "../ui/demo/demoPresentation";
import { statusLabel } from "../ui/labels";
import {
  PropertyGroup,
  PropertyRow,
  PropertyTable,
} from "../components/PropertyTable";
import { Button } from "../components/ui/button";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { icon } from "../components/ui/icon";
import { notify } from "../components/ui/AppToaster";

const IFCViewer = lazy(() => import("./IFCViewer"));

/** Product composition only: model loading and SDK ownership remain in the viewer hooks. */
export default function BIMWorkspace({
  project,
  impacted,
  externalFile,
  hideSourceActions = false,
  onViewerSelected,
  focusId,
  autoProjectModel = false,
}: {
  project: string;
  impacted: readonly string[];
  condensed?: boolean;
  externalFile?: File | null;
  hideSourceActions?: boolean;
  onViewerSelected?: (id: string) => void;
  focusId?: string;
  autoProjectModel?: boolean;
}) {
  const elements = useQuery({
    queryKey: ["bim", project],
    queryFn: () => api.bim(project),
  });
  const {
    selected,
    setSelected,
    file,
    setFile,
    error,
    notice,
    busy,
    imported,
    importSource,
    openImported,
    chooseFile,
  } = useBIMSource(project);
  const input = useRef<HTMLInputElement>(null);
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
    enabled: autoProjectModel && externalFile === undefined,
  });
  const source = sources.data?.find(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  const revision = useQuery({
    queryKey: [
      "model-content",
      project,
      source?.source.id,
      source?.latest_revision_id,
    ],
    enabled: !!source?.latest_revision_id && autoProjectModel,
    retry: false,
    queryFn: async () =>
      new File(
        [
          await readSource(
            `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(source!.source.id)}/revisions/${encodeURIComponent(source!.latest_revision_id!)}/content`,
          ),
        ],
        "project-model.ifc",
      ),
  });
  const viewFile =
    externalFile === undefined ? (file ?? revision.data ?? null) : externalFile;
  const item = elements.data?.find(
    (element) => element.id === (focusId ?? selected),
  );
  const sections = item ? propertySections(item.properties) : [];

  useEffect(() => {
    if (imported.data?.status === "COMPLETED") notify.success("IFC 导入完成");
    if (imported.data?.status === "FAILED")
      notify.error("IFC 导入失败", imported.data.error ?? undefined);
  }, [imported.data?.status, imported.data?.error]);

  const select = (id: string) => {
    setSelected(id);
    onViewerSelected?.(id);
  };

  return (
    <section
      className="bim-workspace spatial-workspace"
      aria-label="模型工作区"
    >
      <aside className="spatial-explorer" aria-label="模型构件">
        <header className="spatial-pane-heading">
          <span>构件</span>
          <small>{elements.data?.length ?? 0}</small>
        </header>
        <div className="spatial-explorer-list">
          {elements.data?.map((element) => (
            <button
              key={element.id}
              type="button"
              className={`bim-element ${element.id === selected ? "selected" : ""} ${impacted.includes(element.id) ? "impacted" : ""}`}
              aria-pressed={element.id === selected}
              onClick={() => select(element.id)}
            >
              <span className="bim-element-name">
                <strong>{demoElementName(element.id, element.name)}</strong>
                {impacted.includes(element.id) && (
                  <span className="bim-element-impact">变更</span>
                )}
              </span>
              <small>
                {element.type} · {element.storey ?? "未分配楼层"}
              </small>
            </button>
          ))}
          {!elements.data?.length && (
            <p className="quiet-message pane-empty">
              暂无已解析构件。打开项目 IFC 或导入模型后可在此浏览。
            </p>
          )}
        </div>
        {!hideSourceActions && (
          <div className="spatial-explorer-actions">
            <input
              ref={input}
              hidden
              type="file"
              accept=".ifc"
              disabled={busy}
              aria-label="本地 IFC 文件"
              onChange={(event) => {
                chooseFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <FolderOpen {...icon} />
              打开本机 IFC
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void openImported()}
            >
              <PackageOpen {...icon} />
              打开项目 IFC
            </Button>
            {file && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void importSource()}
              >
                {busy ? "处理中…" : "导入项目"}
              </Button>
            )}
            {file && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFile(null);
                  select("");
                }}
              >
                关闭本机视图
              </Button>
            )}
          </div>
        )}
      </aside>
      <div className="spatial-stage">
        {viewFile ? (
          <Suspense
            fallback={<div className="loading-view">正在加载 IFC 查看器…</div>}
          >
            <IFCViewer
              file={viewFile}
              impacted={item ? [item.id, ...impacted] : impacted}
              onSelected={select}
              focusId={focusId}
            />
          </Suspense>
        ) : (
          <div className="spatial-stage-empty">
            <Box aria-hidden="true" />
            <strong>模型工作区</strong>
            <span>
              {revision.isPending && source
                ? "正在打开项目模型…"
                : "打开项目 IFC，在模型中查看构件与变更。"}
            </span>
            <small>本机文件仅在本机查看；导入项目需要明确操作。</small>
          </div>
        )}
        {(error ||
          elements.error ||
          imported.error ||
          imported.data?.error) && (
          <div className="alert spatial-feedback" role="alert">
            {error ||
              elements.error?.message ||
              imported.error?.message ||
              imported.data?.error}
          </div>
        )}
        {(notice || imported.data) && (
          <div className="viewer-status spatial-feedback" role="status">
            {[
              notice,
              imported.data && `导入 ${statusLabel(imported.data.status)}。`,
            ]
              .filter(Boolean)
              .join(" ")}
          </div>
        )}
      </div>
      <aside className="spatial-inspector bim-properties" aria-label="构件详情">
        <header className="spatial-pane-heading">
          <span>{item ? demoElementName(item.id, item.name) : "选择构件"}</span>
        </header>
        {item ? (
          <div className="spatial-inspector-body">
            <PropertyGroup title="标识与类型">
              <PropertyTable>
                <PropertyRow label="类型" value={item.type} />
                <PropertyRow label="标识" value={item.id} mono />
                <PropertyRow label="版本" value={item.revision} />
              </PropertyTable>
            </PropertyGroup>
            <PropertyGroup title="位置">
              <PropertyTable>
                <PropertyRow label="楼层" value={item.storey ?? "未分配"} />
                <PropertyRow label="空间" value={item.space ?? "无"} />
              </PropertyTable>
            </PropertyGroup>
            <PropertyGroup title="关联">
              <PropertyTable>
                <PropertyRow
                  label="相关构件"
                  value={`${item.related_ids.length} 个`}
                />
                <PropertyRow
                  label="变更"
                  value={impacted.includes(item.id) ? "受影响" : "无已知影响"}
                  attention={impacted.includes(item.id)}
                />
              </PropertyTable>
            </PropertyGroup>
            <AppDisclosure label="全部属性">
              {sections.length ? (
                sections.map((section, index) => (
                  <PropertyGroup
                    key={section.title ?? index}
                    title={section.title ?? OTHER_PROPERTIES_TITLE}
                  >
                    <PropertyTable>
                      {section.fields.map((field, i) => (
                        <PropertyRow
                          key={`${field.label}-${i}`}
                          label={field.label}
                          value={field.value}
                        />
                      ))}
                    </PropertyTable>
                  </PropertyGroup>
                ))
              ) : (
                <p className="quiet-message">没有附加属性。</p>
              )}
            </AppDisclosure>
          </div>
        ) : (
          <p className="quiet-message pane-empty">
            在左侧构件树或模型中选择对象，查看属性与位置。
          </p>
        )}
      </aside>
    </section>
  );
}
