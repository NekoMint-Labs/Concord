import { useState } from "react";
import type { ProjectSourceStatus, Workspace } from "../api/client";
import { ProjectOverview } from "../features/ProjectOverview";
import { ProjectContextPane } from "../features/ProjectContextPane";
import { ProjectSourceRegister } from "../features/ProjectSourceRegister";
import {
  SourceContextPane,
  type SourceContextPaneProps,
} from "../features/SourceContextPane";
import { useProjectContext } from "./useProjectContext";
import type { WorkspaceTab } from "./destinations";

export function ProjectHome({
  workspace,
  sources,
  onTab,
  onPackage,
  selected,
  onStructure,
  sourceId,
  onSourceSelected,
  sourceContext,
  onDocument,
  onSource,
  onModel,
}: {
  workspace: Workspace;
  sources: ProjectSourceStatus[];
  onTab: (tab: WorkspaceTab) => void;
  onPackage: (id: string) => void;
  selected?: string;
  onDocument?: (id: string) => void;
  onSource?: (id: string, revisionId?: string) => void;
  onModel?: (sourceId: string, revisionId: string) => void;
  onStructure?: () => void;
  sourceId?: string;
  onSourceSelected?: (id: string) => void;
  sourceContext?: Omit<
    SourceContextPaneProps,
    "project" | "sourceId" | "workPackages" | "onClose"
  >;
}) {
  const project = workspace.state.project.id;
  const context = useProjectContext(project, sources);
  const [localSource, setLocalSource] = useState("");
  const selectedSource = sourceId ?? localSource;
  const selectSource = (id: string) => {
    setLocalSource(id);
    onSourceSelected?.(id);
    const source = sources.find((item) => item.source.id === id);
    sourceContext?.onContext?.(
      id,
      source?.latest_revision_id ?? undefined,
      undefined,
      source?.accepted_revision_id ?? undefined,
    );
  };
  return (
    <section className="project-home" aria-label="项目管理">
      <div className="project-workspace">
        <ProjectOverview
          workspace={workspace}
          context={context}
          onTab={onTab}
          onPackage={onPackage}
          selected={selected}
          onStructure={onStructure}
          onSource={onSource}
          sourcesRegister={
            <ProjectSourceRegister
              project={project}
              sourceId={selectedSource}
              onSelectSource={selectSource}
              onRun={sourceContext?.onRun}
            />
          }
        />
        {selectedSource ? (
          <SourceContextPane
            key={selectedSource}
            project={project}
            sourceId={selectedSource}
            workPackages={workspace.state.work_packages}
            {...sourceContext}
            onClose={() => selectSource("")}
          />
        ) : (
          <ProjectContextPane
            workspace={workspace}
            context={context}
            onTab={onTab}
            onPackage={onPackage}
            onDocument={onDocument}
            onSource={onSource}
            onModel={onModel}
          />
        )}
      </div>
    </section>
  );
}
