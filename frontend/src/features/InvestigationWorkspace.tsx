import { lazy, Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Box, Image as ImageIcon } from "lucide-react";
import { api, readSource, type InvestigationReport } from "../api/client";
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
    <section
      className="investigation-workspace"
      aria-label="Investigation evidence workspace"
    >
      <nav className="investigation-tabs" aria-label="Investigation sources">
        <span className="active">
          <Box size={13} /> Model
        </span>
        <span>
          <FileText size={13} /> Documents{" "}
          <small>{documents.data?.length ?? 0}</small>
        </span>
        <span>
          <ImageIcon size={13} /> Photos <small>0</small>
        </span>
        <strong>AI insights</strong>
      </nav>
      <div className="investigation-visuals">
        <div className="investigation-model" aria-label="Investigation model">
          {file.data ? (
            <Suspense
              fallback={
                <div className="model-stage-state">Loading IFC geometry…</div>
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
                ? "Loading IFC geometry…"
                : file.error
                  ? "This model revision is unavailable."
                  : "No model revision is linked to this investigation."}
            </div>
          )}
        </div>
        <div
          className="investigation-document"
          aria-label="Investigation document"
        >
          <header>
            <FileText size={14} />
            <strong>
              {document
                ? `Project document · ${document.filename}`
                : "Project documents"}
            </strong>
            <span>{chunks.data?.length ?? 0} excerpts</span>
          </header>
          <div className="investigation-document-body">
            {chunks.data?.map((entry) => (
              <section key={entry.id}>
                <small>
                  {document?.filename} · {entry.location}
                </small>
                <p>{entry.text}</p>
              </section>
            ))}
            {!chunks.data?.length && (
              <p className="quiet-message">
                {chunks.isLoading
                  ? "Loading project document…"
                  : "No project documents are available."}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
