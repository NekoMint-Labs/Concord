import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, readSource, type Workspace } from "../api/client";
import BIMWorkspace from "../viewers/BIMWorkspace";

/** A blocking condition is spatial only where its evidence actually names elements. */
export function IssueExplorer({
  project,
  workspace,
  localFile,
  onLocalFile,
  onWorkPackage,
  onResolve,
  onSelectWorkPackage,
  selectedElement,
  selectedIssue,
  onElementSelected,
  onIssueSelected,
}: {
  project: string;
  workspace: Workspace;
  localFile?: File | null;
  onLocalFile?: (file: File | null) => void;
  onWorkPackage?: (id: string) => void;
  onResolve?: (id: string) => void;
  onSelectWorkPackage?: (id: string) => void;
  selectedElement?: string;
  selectedIssue?: string;
  onElementSelected?: (id: string) => void;
  onIssueSelected?: (id: string) => void;
}) {
  const issues =
    workspace.analysis?.constraints.filter((item) => item.blocking) ?? [];
  const [file, setFile] = useState<File | null>(null);
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const models =
    sources.data?.filter(
      (item) => item.source.kind === "BIM" && item.latest_revision_id,
    ) ?? [];
  const model = models.length === 1 ? models[0] : undefined;
  useEffect(() => {
    if (!model?.latest_revision_id) {
      setFile(null);
      return;
    }
    let cancelled = false;
    void readSource(
      `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(model.source.id)}/revisions/${encodeURIComponent(model.latest_revision_id)}/content`,
    )
      .then((blob) => {
        if (!cancelled) setFile(new File([blob], "current-model.ifc"));
      })
      .catch(() => {
        if (!cancelled) setFile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project, model?.source.id, model?.latest_revision_id]);
  const impacted = [
    ...new Set(
      (workspace.analysis?.evidence ?? [])
        .filter((entry) =>
          issues.some((issue) => issue.evidence_ids.includes(entry.id)),
        )
        .flatMap((entry) => entry.element_ids),
    ),
  ];
  return (
    <section className="issue-workspace" aria-label="空间问题">
      <div className="issue-stage">
        <BIMWorkspace
          project={project}
          workspace={workspace}
          issues={issues}
          mode="issues"
          focusId={selectedElement || undefined}
          selectedIssueId={selectedIssue}
          onViewerSelected={onElementSelected}
          onIssueSelected={onIssueSelected}
          onIssueResolution={(id) => {
            const issue = issues.find((entry) => entry.id === id);
            if (issue) onSelectWorkPackage?.(issue.work_package_id);
            // Package navigation clears spatial selection; keep this explicit issue.
            onIssueSelected?.(id);
            onResolve?.(id);
          }}
          impacted={impacted}
          externalFile={file ?? localFile ?? undefined}
          localFile={localFile}
          onLocalFile={onLocalFile}
          onWorkPackage={onWorkPackage}
          autoProjectModel
          hideSourceActions={!!file}
        />
      </div>
    </section>
  );
}
