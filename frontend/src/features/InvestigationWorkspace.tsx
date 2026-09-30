import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Box } from "lucide-react";
import {
  api,
  readSource,
  type AgentRun,
  type InvestigationReport,
} from "../api/client";
import { reportMatchesRun } from "./agentContext";
import { documentLocation } from "../ui/labels";
import type { ConcordContext } from "./ConcordAgent";

const IFCViewer = lazy(() => import("../viewers/IFCViewer"));

/** Keep the saved investigation beside its real source geometry and evidence. */
export function InvestigationWorkspace({
  project,
  context,
  report,
  run,
}: {
  project: string;
  context: ConcordContext;
  report?: InvestigationReport | null;
  run?: AgentRun | null;
}) {
  const savedReport = run
    ? reportMatchesRun(report, run)
      ? report
      : null
    : report;
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const scopeSource = savedReport?.scope.source_id ?? context.sourceId;
  const source = scopeSource
    ? sources.data?.find(
        (item) => item.source.id === scopeSource && item.source.kind === "BIM",
      )
    : savedReport
      ? undefined
      : sources.data?.find(
          (item) => item.source.kind === "BIM" && item.latest_revision_id,
        );
  const revision =
    savedReport?.scope.to_revision_id ??
    context.revisionId ??
    source?.latest_revision_id;
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
  const document = documents.data?.find((item) =>
    savedReport?.evidence.some((entry) => entry.source_id === item.id),
  );
  const chunks = useQuery({
    queryKey: ["chunks", document?.id],
    queryFn: () => api.chunks(document!.id),
    enabled: !!document,
  });
  const ids = useMemo(
    () => savedReport?.scope.element_ids ?? context.elementIds,
    [savedReport?.scope.element_ids, context.elementIds],
  );
  const [selected, setSelected] = useState(ids[0] ?? "");
  useEffect(() => {
    if (!ids.includes(selected)) setSelected(ids[0] ?? "");
  }, [ids, selected]);
  const [sourceTab, setSourceTab] = useState<"model" | "documents">("model");
  const visibleTab =
    sourceTab === "documents" && document ? "documents" : "model";
  return (
    <section className="investigation-workspace" aria-label="调查依据工作区">
      <nav className="investigation-tabs" aria-label="调查来源">
        <button
          type="button"
          className={visibleTab === "model" ? "active" : ""}
          aria-current={visibleTab === "model" ? "true" : undefined}
          onClick={() => setSourceTab("model")}
        >
          <Box size={13} /> 模型
        </button>
        {document && (
          <button
            type="button"
            className={visibleTab === "documents" ? "active" : ""}
            aria-current={visibleTab === "documents" ? "true" : undefined}
            onClick={() => setSourceTab("documents")}
          >
            <FileText size={13} /> 文档 <small>1</small>
          </button>
        )}
      </nav>
      <div className={`investigation-visuals is-${visibleTab}`}>
        <div
          className="investigation-model"
          aria-label="调查模型"
          hidden={visibleTab !== "model"}
        >
          {file.data ? (
            <Suspense
              fallback={
                <div className="model-stage-state">正在加载 IFC 模型…</div>
              }
            >
              <IFCViewer
                file={file.data}
                impacted={ids}
                onSelected={setSelected}
                focusId={selected || undefined}
                selectedLabel={selected || undefined}
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
        <div
          className="investigation-document"
          aria-label="调查文档"
          hidden={visibleTab !== "documents"}
        >
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
