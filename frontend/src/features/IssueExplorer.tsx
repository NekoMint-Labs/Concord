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
  onResolve,
  onSelectWorkPackage,
  perform: _perform,
}: {
  project: string;
  workspace: Workspace;
  localFile?: File | null;
  onLocalFile?: (file: File | null) => void;
  onResolve?: (id: string) => void;
  onSelectWorkPackage?: (id: string) => void;
  perform: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const issues =
    workspace.analysis?.constraints.filter((item) => item.blocking) ?? [];
  const [file, setFile] = useState<File | null>(null);
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const model = sources.data?.find(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  useEffect(() => {
    if (!model?.latest_revision_id) return;
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
          onIssueResolution={(id) => {
            const issue = issues.find((entry) => entry.id === id);
            if (issue) onSelectWorkPackage?.(issue.work_package_id);
            onResolve?.(id);
          }}
          impacted={impacted}
          externalFile={file ?? localFile ?? undefined}
          localFile={localFile}
          onLocalFile={onLocalFile}
          autoProjectModel
          hideSourceActions={!!file}
        />
      </div>
    </section>
  );
}
