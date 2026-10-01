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
  onWorkPackage,
  onModels,
  onInspect,
  onInvestigate,
  initialElement = "",
  onElementSelected,
}: {
  project: string;
  workspace: Workspace;
  initialElement?: string;
  onElementSelected?: (id: string) => void;
  localFile?: File | null;
  onLocalFile?: (file: File | null) => void;
  onWorkPackage?: (id: string) => void;
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
    fromRevisionId,
    selectedId,
    setSelectedId,
    shownRevision,
    setShownRevision,
  } = state;
  const latestRevision = revisions.data?.at(-1);
  const latestImport = useQuery({
    queryKey: ["revision-import", project, sourceId, latestRevision?.id],
    queryFn: () => api.revisionImport(project, sourceId, latestRevision!.id),
    enabled: !!sourceId && !!latestRevision,
    refetchInterval: (query) =>
      ["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "")
        ? 1500
        : false,
  });
  const needsComparison =
    !!latestRevision &&
    !!fromRevisionId &&
    fromRevisionId !== latestRevision.id &&
    (!comparison ||
      comparison.from_revision_id !== fromRevisionId ||
      comparison.to_revision_id !== latestRevision.id);
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
    if (
      initialElement &&
      changes.some((entry) => entry.global_id === initialElement)
    ) {
      setSelectedId(initialElement);
    }
  }, [initialElement, detail.data]);
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
      (initialElement &&
      changes.some((entry) => entry.global_id === initialElement)
        ? initialElement
        : (changes.find(
            (entry) => entry.change_kind === "changed" && visible(entry),
          )?.global_id ??
          changes.find(
            (entry) => entry.change_kind === "added" && visible(entry),
          )?.global_id)) ?? "",
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
        {needsComparison && (
          <p className="viewer-status" role="status">
            {latestImport.data?.status === "COMPLETED"
              ? `新版本 R${latestRevision!.sequence} 已处理；当前基线未变。${comparison ? "当前显示的是历史比较。" : ""}`
              : `新版本 R${latestRevision!.sequence} 尚未处理完成。请到模型版本查看进度。`}
            {latestImport.data?.status === "COMPLETED" && (
              <button
                type="button"
                disabled={compare.isPending}
                onClick={() => compare.mutate()}
              >
                {compare.isPending ? "正在比较…" : "查看与当前基线的变化"}
              </button>
            )}
          </p>
        )}
        {compare.isError && (
          <p className="alert" role="alert">
            暂时无法比较模型版本，请确认模型处理完成后重试。
          </p>
        )}
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
          onWorkPackage={onWorkPackage}
          autoProjectModel={!comparison}
          hideSourceActions={!!comparison}
          onViewerSelected={(id) => {
            setSelectedId(id);
            onElementSelected?.(id);
          }}
          revisionLabel={
            comparison
              ? `R${to?.sequence ?? "?"} 对比 ${baseline ? `B${baseline.sequence}` : `R${from?.sequence ?? "?"}`}`
              : undefined
          }
          onInvestigate={
            comparison
              ? (id) =>
                  onInvestigate(
                    sourceId,
                    comparison.to_revision_id,
                    comparison.from_revision_id,
                    [id],
                  )
              : undefined
          }
          toolbar={
            <>
              <select
                aria-label="模型"
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
                <div className="compare-filter" aria-label="变更类型">
                  {(["all", "added", "deleted", "changed"] as const).map(
                    (value) => (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={kind === value}
                        onClick={() => setKind(value)}
                      >
                        {
                          {
                            all: "全部",
                            added: "新增",
                            deleted: "移除",
                            changed: "变更",
                          }[value]
                        }{" "}
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
                    R{from?.sequence} 变更前
                  </button>
                  <button
                    type="button"
                    onClick={() => setShownRevision("to")}
                    aria-pressed={shownRevision === "to"}
                  >
                    R{to?.sequence} 当前版本
                  </button>
                </>
              ) : revisions.data && revisions.data.length >= 2 ? (
                <button
                  type="button"
                  onClick={() => compare.mutate()}
                  disabled={
                    compare.isPending ||
                    latestImport.data?.status !== "COMPLETED"
                  }
                >
                  查看变化
                </button>
              ) : (
                <button type="button" onClick={onModels}>
                  模型版本
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
                      工作包 →
                    </button>
                  ))}
            </>
          }
        />
      </div>
    </section>
  );
}
