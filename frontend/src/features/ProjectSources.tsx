import { useState } from "react";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import { BaselineHistory } from "./BaselineHistory";
import { ProjectSourceRegister } from "./ProjectSourceRegister";
import {
  SourceContextPane,
  type SourceContextPaneProps,
} from "./SourceContextPane";
import { useProjectSources } from "./useProjectSources";

export { revisionState, freshCheckAfterImport } from "./useProjectSources";
export type ProjectSourcesProps = Omit<SourceContextPaneProps, "sourceId"> & {
  historyOnly?: boolean;
  sourceId?: string;
  onSelectSource?: (sourceId: string) => void;
  // Retained for existing callers; acceptance follows the backend contract, not READY.
  readyForNewBaseline?: boolean;
  lastCheckAt?: string;
  checkFailed?: boolean;
  onRecheck?: () => void;
  onWorkPackage?: () => void;
  onChanges?: () => void;
  focusBaselineId?: string;
  onProject?: () => void;
};

/** Compatibility surface. ProjectHome can compose the same register and context exports. */
export function ProjectSources(props: ProjectSourcesProps) {
  const {
    project,
    historyOnly,
    sourceId: controlledSource,
    onSelectSource,
  } = props;
  const [selection, setSelection] = useState({ project, id: "" });
  const data = useProjectSources(project);
  const sourceId =
    controlledSource ??
    (selection.project === project &&
    data.sources.data?.some((item) => item.source.id === selection.id)
      ? selection.id
      : (data.sources.data?.[0]?.source.id ?? ""));

  if (historyOnly)
    return (
      <section className="sources-history-workspace" aria-label="资料历史">
        <header className="history-heading">
          <h1>历史</h1>
        </header>
        {data.baselines.isPending && <p role="status">正在读取基线历史…</p>}
        {data.baselines.error && (
          <div role="alert">
            <p>{data.baselines.error.message}</p>
            <button type="button" onClick={() => void data.baselines.refetch()}>
              重试读取历史
            </button>
          </div>
        )}
        {data.baselines.isSuccess && (
          <BaselineHistory
            focusBaselineId={props.focusBaselineId}
            onProject={props.onProject}
            baselines={data.baselines.data ?? []}
            statuses={data.sources.data ?? []}
            revisions={data.revisionCatalog}
          />
        )}
      </section>
    );

  return (
    <section className="sources-compat-workspace" aria-label="项目资料与版本">
      <PaneSplit id="project-sources" persist>
        <Pane
          className="sources-register-pane"
          defaultSize="60%"
          minSize="300px"
        >
          <ProjectSourceRegister
            project={project}
            sourceId={sourceId}
            onRun={props.onRun}
            onSelectSource={(id) => {
              setSelection({ project, id });
              onSelectSource?.(id);
            }}
          />
        </Pane>
        <PaneDivider label="调整资料上下文宽度" />
        <Pane className="sources-context-container" minSize="280px">
          <SourceContextPane {...props} sourceId={sourceId} />
        </Pane>
      </PaneSplit>
    </section>
  );
}
