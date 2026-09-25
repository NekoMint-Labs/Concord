import { lazy, Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Box, Image as ImageIcon } from "lucide-react";
import { api, readSource, type InvestigationReport } from "../api/client";
import { documentLocation } from "../ui/labels";
import type { ConcordContext } from "./ConcordAgent";

const IFCViewer = lazy(() => import("../viewers/IFCViewer"));

/** Keep the saved investigation beside its real source geometry and evidence. */
export function InvestigationWorkspace({
  project,
  context,
  report,
}: {
  project: string;
  context: ConcordContext;
  report?: InvestigationReport | null;
}) {
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const source =
    sources.data?.find((item) => item.source.id === context.sourceId) ??
    sources.data?.find(
      (item) => item.source.kind === "BIM" && item.latest_revision_id,
    );
  const revision = context.revisionId ?? source?.latest_revision_id;
  const file = useQuery({
    queryKey: ["investigation-ifc", project, source?.source.id, revision],
    enabled: !!source?.source.id && !!revision,
    queryFn: async () =>
      new File(
        [
          await readSource(
            `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(source!.source.id)}/revisions/${encodeURIComponent(revision!)}/content`,
          ),
        ],
        "investigation-model.ifc",
      ),
    retry: false,
  });
  const documents = useQuery({
    queryKey: ["documents", project],
    queryFn: () => api.documents(project),
  });
  const document = documents.data?.[0];
  const chunks = useQuery({
    queryKey: ["chunks", document?.id],
    queryFn: () => api.chunks(document!.id),
    enabled: !!document,
  });
  const ids = useMemo(
    () => report?.scope.element_ids ?? context.elementIds,
    [report?.scope.element_ids, context.elementIds],
  );
  return (
    <section className="investigation-workspace" aria-label="调查依据工作区">
      <nav className="investigation-tabs" aria-label="调查来源">
        <span className="active">
          <Box size={13} /> 模型
        </span>
        <span>
          <FileText size={13} /> 文档{" "}
          <small>{documents.data?.length ?? 0}</small>
        </span>
        <span>
          <ImageIcon size={13} /> 图片 <small>0</small>
        </span>
      </nav>
      <div className="investigation-visuals">
        <div className="investigation-model" aria-label="调查模型">
          {file.data ? (
            <Suspense
              fallback={
                <div className="model-stage-state">正在加载 IFC 模型…</div>
              }
            >
              <IFCViewer
                file={file.data}
                impacted={ids}
                onSelected={() => {}}
                selectedLabel={undefined}
              />
            </Suspense>
          ) : (
            <div className="model-stage-state">
              {file.isLoading
                ? "正在加载 IFC 模型…"
                : file.error
                  ? "此模型版本不可用。"
                  : "本次调查未关联模型版本。"}
            </div>
          )}
        </div>
        <div className="investigation-document" aria-label="调查文档">
          <header>
            <FileText size={14} />
            <strong>
              {document ? `项目文档 · ${document.filename}` : "项目文档"}
            </strong>
            <span>{chunks.data?.length ?? 0} 段摘录</span>
          </header>
          <div className="investigation-document-body">
            {chunks.data?.map((entry) => (
              <section key={entry.id}>
                <small>
                  {document?.filename} · {documentLocation(entry.location)}
                </small>
                <p>{entry.text}</p>
              </section>
            ))}
            {!chunks.data?.length && (
              <p className="quiet-message">
                {chunks.isLoading ? "正在加载项目文档…" : "暂无项目文档。"}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
