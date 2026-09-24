import { api, type DTO, type Workspace } from "../api/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useChangeComparison } from "./useChangeComparison";
import BIMWorkspace from "../viewers/BIMWorkspace";

/** Revision changes remain in model space, with a contextual list and inspector. */
export function ChangeExplorer({
  project,
  workspace,
  localFile,
  onLocalFile,
  onModels,
  onInspect,
  onInvestigate,
}: {
  project: string;
  workspace: Workspace;
  localFile?: File | null;
  onLocalFile?: (file: File | null) => void;
  onModels: () => void;
  onInspect: (
    workPackageId: string,
    sourceId: string,
    comparison: DTO<"RevisionComparison">,
    change: DTO<"BimElementChange">,
  ) => void;
  onInvestigate: (
    sourceId: string,
    revisionId: string,
    fromRevisionId: string,
    elementIds: string[],
  ) => void;
}) {
  const state = useChangeComparison(project);
  const baselines = useQuery({
    queryKey: ["baselines", project],
    queryFn: () => api.baselines(project),
  });
  const {
    models,
    sourceId,
    setSourceId,
    revisions,
    comparison,
    detail,
    file,
    fileError,
    compare,
    selectedId,
    setSelectedId,
    shownRevision,
    setShownRevision,
  } = state;
  const changes = detail.data?.changes ?? [];
  const [kind, setKind] = useState<"all" | "added" | "deleted" | "changed">(
    "all",
  );
  const filtered =
    kind === "all"
      ? changes
      : changes.filter((item) => item.change_kind === kind);
  const highlighted = changes
    .filter((item) => item.change_kind === "changed")
    .map((item) => item.global_id);
  useEffect(() => {
    if (selectedId || !state.newModel.data) return;
    // Spatial containers such as IfcSpace have no useful camera target.
    const visible = (entry: (typeof changes)[number]) => {
      const category = state.newModel.data?.elements.find(
        (element) => element.global_id === entry.global_id,
      )?.ifc_class;
      return (
        !!category &&
        !/^Ifc(Space|Project|Site|Building|BuildingStorey)$/.test(category)
      );
    };
    setSelectedId(
      changes.find((entry) => entry.change_kind === "changed" && visible(entry))
        ?.global_id ??
        changes.find((entry) => entry.change_kind === "added" && visible(entry))
          ?.global_id ??
        "",
    );
  }, [selectedId, detail.data, state.newModel.data]);
  const from = revisions.data?.find(
    (item) => item.id === comparison?.from_revision_id,
  );
  const to = revisions.data?.find(
    (item) => item.id === comparison?.to_revision_id,
  );
  const snapshots =
    (shownRevision === "from" ? state.oldModel.data : state.newModel.data)
      ?.elements ?? [];
  const baseline = baselines.data?.find((entry) =>
    entry.entries.some(
      (item) =>
        item.source_id === sourceId &&
        item.revision_id === comparison?.from_revision_id,
    ),
  );
  const issues =
    workspace.analysis?.constraints.filter((entry) => entry.blocking) ?? [];
  return (
    <section className="change-workspace" aria-label="版本变更">
      <div className="change-stage">
        {fileError && (
          <p className="alert" role="alert">
            {fileError}
          </p>
        )}
        <BIMWorkspace
          project={project}
          workspace={workspace}
          changes={filtered}
          snapshots={snapshots}
          mode="changes"
          issues={issues}
          impacted={
            highlighted.length
              ? highlighted
              : (workspace.analysis?.impact.element_ids ?? [])
          }
          focusId={selectedId || undefined}
          externalFile={comparison ? file : (localFile ?? undefined)}
          localFile={localFile}
          onLocalFile={onLocalFile}
          autoProjectModel={!comparison}
          hideSourceActions={!!comparison}
          onViewerSelected={setSelectedId}
          revisionLabel={
            comparison
              ? `R${to?.sequence ?? "?"} vs ${baseline ? `B${baseline.sequence}` : `R${from?.sequence ?? "?"}`}`
              : undefined
          }
          onInvestigate={(id) =>
            comparison &&
            onInvestigate(
              sourceId,
              comparison.to_revision_id,
              comparison.from_revision_id,
              [id],
            )
          }
          toolbar={
            <>
              <select
                aria-label="Model"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
              >
                {models.map((item) => (
                  <option key={item.source.id} value={item.source.id}>
                    {item.source.name}
                  </option>
                ))}
              </select>
              {comparison && (
                <div className="compare-filter" aria-label="Change types">
                  {(["all", "added", "deleted", "changed"] as const).map(
                    (value) => (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={kind === value}
                        onClick={() => setKind(value)}
                      >
                        {value === "all"
                          ? "All"
                          : value === "deleted"
                            ? "Removed"
                            : value[0].toUpperCase() + value.slice(1)}{" "}
                        <small>
                          {value === "all"
                            ? changes.length
                            : changes.filter(
                                (entry) => entry.change_kind === value,
                              ).length}
                        </small>
                      </button>
                    ),
                  )}
                </div>
              )}
              {comparison ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShownRevision("from")}
                    aria-pressed={shownRevision === "from"}
                  >
                    R{from?.sequence} Before
                  </button>
                  <button
                    type="button"
                    onClick={() => setShownRevision("to")}
                    aria-pressed={shownRevision === "to"}
                  >
                    R{to?.sequence} Current
                  </button>
                </>
              ) : revisions.data && revisions.data.length >= 2 ? (
                <button
                  type="button"
                  onClick={() => compare.mutate()}
                  disabled={compare.isPending}
                >
                  Compare latest versions
                </button>
              ) : (
                <button type="button" onClick={onModels}>
                  Model lifecycle
                </button>
              )}
              {selectedId &&
                comparison &&
                detail.data?.affected_work_packages
                  .filter((entry) =>
                    entry.changes.some(
                      (change) => change.global_id === selectedId,
                    ),
                  )
                  .map((entry) => (
                    <button
                      key={entry.work_package_id}
                      type="button"
                      onClick={() => {
                        const change = changes.find(
                          (item) => item.global_id === selectedId,
                        );
                        if (change)
                          onInspect(
                            entry.work_package_id,
                            sourceId,
                            comparison,
                            change,
                          );
                      }}
                    >
                      Work Package →
                    </button>
                  ))}
            </>
          }
        />
      </div>
    </section>
  );
}
