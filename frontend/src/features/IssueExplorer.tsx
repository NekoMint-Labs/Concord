import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, readSource, type Workspace } from "../api/client";
import BIMWorkspace from "../viewers/BIMWorkspace";
import { Inspector, type InspectorView } from "./Inspector";
import {
  demoConstraintKind,
  demoConstraintText,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";

/** Coordination constraints are the current issue signal; there is no persisted Issue/viewpoint contract yet. */
export function IssueExplorer({
  project,
  workspace,
  perform,
}: {
  project: string;
  workspace: Workspace;
  perform: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const constraints =
    workspace.analysis?.constraints.filter((item) => item.blocking) ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<InspectorView>("blocker");
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
  const selected = constraints.find((item) => item.id === selectedId);
  const linked =
    workspace.analysis?.evidence.filter((item) =>
      selected?.evidence_ids.includes(item.id),
    ) ?? [];
  const elementIds = [...new Set(linked.flatMap((item) => item.element_ids))];
  return (
    <section className="issue-workspace" aria-label="空间问题">
      <aside className="issue-explorer" aria-label="问题列表">
        <header className="spatial-pane-heading">
          问题 <small>{constraints.length}</small>
        </header>
        <div className="change-list">
          {constraints.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selectedId === item.id}
              onClick={() => {
                setSelectedId(item.id);
                setView("blocker");
              }}
            >
              <strong>{demoConstraintText(item.kind, item.description)}</strong>
              <small>
                {demoConstraintKind(item.kind)} ·{" "}
                {demoWorkPackageName(
                  item.work_package_id,
                  workspace.state.work_packages.find(
                    (wp) => wp.id === item.work_package_id,
                  )?.name ?? item.work_package_id,
                )}
              </small>
            </button>
          ))}
          {!constraints.length && (
            <p className="pane-empty quiet-message">
              本次检查没有未解决的阻塞条件。
            </p>
          )}
        </div>
      </aside>
      <div className="issue-stage">
        <BIMWorkspace
          project={project}
          impacted={elementIds}
          externalFile={file}
          hideSourceActions
        />
        {selected && !elementIds.length && (
          <p className="issue-location-note">
            此问题尚无关联构件或空间坐标；查看右侧依据。
          </p>
        )}
      </div>
      <div className="issue-detail">
        {selected ? (
          <Inspector
            workspace={workspace}
            selected={selected.work_package_id}
            selectedConstraint={selected.id}
            view={view}
            perform={perform}
            onClose={() => setSelectedId("")}
            onView={setView}
          />
        ) : (
          <aside className="spatial-inspector">
            <header className="spatial-pane-heading">选择问题</header>
            <p className="pane-empty quiet-message">
              选择左侧问题，查看判断依据及可审查的处理方案。
            </p>
          </aside>
        )}
      </div>
    </section>
  );
}
