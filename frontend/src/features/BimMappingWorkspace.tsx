import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  api,
  readSource,
  type DTO,
  type InvestigationReport,
  type Workspace,
} from "../api/client";
import { Button } from "../components/ui/button";
import { AppSelect } from "../components/ui/AppSelect";
import BIMWorkspace from "../viewers/BIMWorkspace";
import { demoWorkPackageName } from "../ui/demo/demoPresentation";
import { MappingDock } from "./MappingDock";

export function filterBimCandidates(
  elements: readonly DTO<"BimElementSnapshot">[],
  filters: { storey: string; space: string; ifcClass: string },
) {
  return elements.filter(
    (item) =>
      (!filters.storey || item.storey === filters.storey) &&
      (!filters.space || item.space === filters.space) &&
      (!filters.ifcClass || item.ifc_class === filters.ifcClass),
  );
}

export type BimMappingContext = {
  intent?: "inspect";
  sourceId?: string;
  fromRevisionId?: string;
  fromRevisionLabel?: string;
  revisionId?: string;
  revisionLabel?: string;
  highlightIds?: string[];
  changes?: DTO<"BimElementChange">[];
};

type Props = {
  project: string;
  workPackageId: string;
  workspace?: Workspace;
  initial?: BimMappingContext;
  report?: InvestigationReport | null;
  investigationProgress?: ReactNode;
  condensed?: boolean;
  onContext: (
    sourceId: string,
    revisionId: string,
    elementIds: string[],
    fromRevisionId?: string,
    revisionLabel?: string,
    fromRevisionLabel?: string,
  ) => void;
  onInvestigate: (
    sourceId: string,
    revisionId: string,
    elementIds: string[],
    fromRevisionId?: string,
  ) => void;
  onOpenInvestigation?: () => void;
  onWorkPackage?: () => void;
  onModels?: () => void;
};

/** A new intent cannot inherit a selection or a pending mutation from another WP. */
export function BimMappingWorkspace(props: Props) {
  return (
    <MappingSource
      key={JSON.stringify([
        props.project,
        props.workPackageId,
        props.initial?.sourceId,
        props.initial?.revisionId,
        props.initial?.fromRevisionId,
      ])}
      {...props}
    />
  );
}

function MappingSource(props: Props) {
  const sources = useQuery({
    queryKey: ["sources", props.project],
    queryFn: () => api.sourceStatuses(props.project),
  });
  const models = (sources.data ?? []).filter(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  const [chosenSource, setChosenSource] = useState(
    props.initial?.sourceId ?? "",
  );
  const sourceId = chosenSource || models[0]?.source.id || "";
  const source = models.find((item) => item.source.id === sourceId);
  const revisionId =
    props.initial?.sourceId === sourceId
      ? (props.initial.revisionId ?? source?.latest_revision_id ?? "")
      : (source?.latest_revision_id ?? "");
  const selector = (
    <label className="form-label">
      项目模型
      <AppSelect
        label="项目模型"
        value={sourceId || "__none__"}
        onChange={(value) => setChosenSource(value === "__none__" ? "" : value)}
        options={[
          { value: "__none__", label: "选择项目模型" },
          ...models.map((item) => ({
            value: item.source.id,
            label: item.source.name,
            hint: item.has_pending_revision
              ? "新版本待审核"
              : item.accepted_revision_id
                ? "当前基线"
                : "尚未确认基线",
          })),
        ]}
      />
    </label>
  );
  return (
    <MappingSession
      key={JSON.stringify([
        props.project,
        props.workPackageId,
        sourceId,
        revisionId,
      ])}
      {...props}
      sourceId={sourceId}
      revisionId={revisionId}
      sourceName={source?.source.name}
      selector={selector}
      noModels={sources.isSuccess && !models.length}
    />
  );
}

function MappingSession({
  project,
  workPackageId,
  initial,
  report,
  investigationProgress,
  condensed,
  workspace: suppliedWorkspace,
  onContext,
  onInvestigate,
  onOpenInvestigation,
  onWorkPackage,
  onModels,
  sourceId,
  revisionId,
  sourceName,
  selector,
  noModels,
}: Props & {
  sourceId: string;
  revisionId: string;
  sourceName?: string;
  selector: ComponentProps<typeof BIMWorkspace>["toolbar"];
  noModels: boolean;
}) {
  const cache = useQueryClient();
  const workspace = useQuery({
    queryKey: ["workspace", project],
    queryFn: () => api.workspace(project),
    enabled: !suppliedWorkspace,
  });
  const data = suppliedWorkspace ?? workspace.data;
  const workPackage = data?.state.work_packages.find(
    (item) => item.id === workPackageId,
  );
  const name = workPackage
    ? demoWorkPackageName(workPackage.id, workPackage.name)
    : workPackageId;
  const inspectionMode =
    initial?.intent === "inspect" || !!initial?.fromRevisionId;
  const comparisonScope = inspectionMode && initial.sourceId === sourceId;
  const fromRevisionId = comparisonScope ? initial?.fromRevisionId : undefined;
  const snapshot = useQuery({
    queryKey: ["bim-snapshot", project, sourceId, revisionId],
    queryFn: () => api.bimSnapshot(project, sourceId, revisionId),
    enabled: !!sourceId && !!revisionId,
    retry: false,
  });
  const bindings = useQuery({
    queryKey: ["bim-bindings", project, sourceId, revisionId],
    queryFn: () => api.bimBindings(project, sourceId, revisionId),
    enabled: !!sourceId && !!revisionId,
  });
  const revisions = useQuery({
    queryKey: ["source-revisions", project, sourceId],
    queryFn: () => api.sourceRevisions(project, sourceId),
    enabled: !!sourceId,
  });
  const labelFor = (id: string) => {
    const revision = revisions.data?.find((item) => item.id === id);
    return revision
      ? `R${revision.sequence}${revision.external_label ? ` · ${revision.external_label}` : ""}`
      : id;
  };
  const revisionLabel =
    initial?.sourceId === sourceId
      ? (initial.revisionLabel ?? labelFor(revisionId))
      : labelFor(revisionId);
  const fromRevisionLabel = fromRevisionId
    ? (initial?.fromRevisionLabel ?? labelFor(fromRevisionId))
    : undefined;
  const exactSnapshot =
    snapshot.data?.project_id === project &&
    snapshot.data.source_id === sourceId &&
    snapshot.data.revision_id === revisionId
      ? snapshot.data
      : undefined;
  const model = useQuery({
    queryKey: ["bim-content", project, sourceId, revisionId],
    queryFn: async () =>
      new File(
        [
          await readSource(
            `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(sourceId)}/revisions/${encodeURIComponent(revisionId)}/content`,
          ),
        ],
        "project-revision.ifc",
      ),
    enabled: !!exactSnapshot,
    retry: false,
    staleTime: Infinity,
  });
  const [filters, setFilters] = useState({
    storey: "",
    space: "",
    ifcClass: "",
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState(
    initial?.sourceId === sourceId ? (initial?.highlightIds?.[0] ?? "") : "",
  );
  const elements = exactSnapshot?.elements ?? [];
  const historyRevisionIds = [
    ...new Set([
      ...(fromRevisionId ? [fromRevisionId] : []),
      ...(bindings.data ?? [])
        .filter(
          (entry) =>
            entry.state === "missing" &&
            entry.binding.work_package_id === workPackageId,
        )
        .map((entry) => entry.binding.confirmation_revision_id),
    ]),
  ].filter((id) => id !== revisionId);
  const history = useQueries({
    queries: historyRevisionIds.map((id) => ({
      queryKey: ["bim-snapshot", project, sourceId, id],
      queryFn: () => api.bimSnapshot(project, sourceId, id),
      retry: false,
    })),
  });
  const inspectableElements = [
    ...elements,
    ...history
      .flatMap((query) => query.data?.elements ?? [])
      .filter(
        (item) =>
          !elements.some((current) => current.global_id === item.global_id),
      ),
  ];
  const candidates = useMemo(
    () =>
      filterBimCandidates(
        inspectionMode
          ? elements.filter((item) =>
              initial?.highlightIds?.includes(item.global_id),
            )
          : elements,
        filters,
      ),
    [elements, filters, inspectionMode, initial?.highlightIds],
  );
  const candidateIds = useMemo(
    () => candidates.map((item) => item.global_id),
    [candidates],
  );
  const allowedIds = useMemo(
    () => elements.map((item) => item.global_id),
    [elements],
  );
  const validSelected = useMemo(
    () => selected.filter((id) => allowedIds.includes(id)),
    [allowedIds, selected],
  );
  const changes = comparisonScope ? (initial?.changes ?? []) : [];
  const inspectionIds = comparisonScope ? (initial?.highlightIds ?? []) : [];
  useEffect(() => {
    if (comparisonScope) setActiveId(initial?.highlightIds?.[0] ?? "");
  }, [comparisonScope, initial?.highlightIds]);
  const intentIds = inspectionMode ? inspectionIds : validSelected;
  const existing = (bindings.data ?? []).filter(
    (item) =>
      item.binding.project_id === project &&
      item.binding.source_id === sourceId &&
      item.binding.work_package_id === workPackageId &&
      !item.binding.retired_at,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (sourceId && revisionId)
      onContext(
        sourceId,
        revisionId,
        intentIds,
        fromRevisionId,
        inspectionMode ? revisionLabel : undefined,
        inspectionMode ? fromRevisionLabel : undefined,
      );
  }, [
    sourceId,
    revisionId,
    intentIds.join("|"),
    fromRevisionId,
    revisionLabel,
    fromRevisionLabel,
    inspectionMode,
    onContext,
  ]);
  const submission = useRef(false);
  const confirm = useMutation({
    mutationFn: (ids: string[]) => {
      if (
        !mounted.current ||
        inspectionMode ||
        !exactSnapshot ||
        !ids.length ||
        ids.some((id) => !allowedIds.includes(id))
      )
        throw new Error("选择已失效，请重新选择当前版本构件。");
      return api.confirmBimBindings(project, sourceId, {
        revision_id: revisionId,
        bindings: [{ work_package_id: workPackageId, global_ids: ids }],
      });
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["bim-bindings", project, sourceId],
        }),
        cache.invalidateQueries({ queryKey: ["workspace", project] }),
      ]);
      if (mounted.current) onWorkPackage?.();
    },
    onSettled: () => {
      submission.current = false;
    },
  });
  const toggle = (id: string, checked: boolean) => {
    if (!mounted.current || inspectionMode || !allowedIds.includes(id)) return;
    setActiveId(id);
    setSelected((ids) =>
      checked
        ? [...new Set([...ids, id])]
        : ids.filter((value) => value !== id),
    );
  };
  const select = (id: string) => {
    if (!mounted.current) return;
    if (inspectionMode) {
      if (
        allowedIds.includes(id) ||
        changes.some((item) => item.global_id === id) ||
        existing.some((item) => item.binding.global_id === id)
      )
        setActiveId(id);
    } else toggle(id, !validSelected.includes(id));
  };
  const contextBar = (
    <header className="mapping-context-bar">
      <div>
        <span className="eyebrow">
          {inspectionMode ? "影响检查 · 只读" : "关联 BIM"}
        </span>
        <strong>{name}</strong>
        <small>
          {sourceName} · {fromRevisionLabel ? `${fromRevisionLabel} → ` : ""}
          {revisionLabel}
        </small>
      </div>
      {onWorkPackage && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected([]);
            setActiveId("");
            onWorkPackage();
          }}
        >
          {inspectionMode ? "返回工作包" : "取消 / 返回工作包"}
        </Button>
      )}
      {!inspectionMode && (
        <Button
          disabled={
            !validSelected.length || !exactSnapshot || confirm.isPending
          }
          onClick={() => {
            if (submission.current || !mounted.current) return;
            submission.current = true;
            confirm.mutate([...validSelected]);
          }}
        >
          确认关联 {validSelected.length} 个构件
        </Button>
      )}
    </header>
  );
  const dock = (
    <MappingDock
      investigationProgress={investigationProgress}
      selector={selector}
      inspectionMode={inspectionMode}
      filters={filters}
      onFilters={setFilters}
      elements={elements}
      inspectableElements={inspectableElements}
      candidates={candidates}
      candidateIds={candidateIds}
      validSelected={validSelected}
      sourceId={sourceId}
      revisionId={revisionId}
      intentIds={intentIds}
      fromRevisionId={fromRevisionId}
      noModels={noModels}
      snapshotError={snapshot.isError}
      modelError={model.error}
      confirmPending={confirm.isPending}
      confirmSuccess={confirm.isSuccess}
      confirmedCount={confirm.variables?.length ?? 0}
      confirmError={confirm.error}
      changes={changes}
      allowedIds={allowedIds}
      activeId={activeId}
      existing={existing}
      report={report}
      workPackageId={workPackageId}
      onOpenInvestigation={onOpenInvestigation}
      onModels={onModels}
      onInvestigate={onInvestigate}
      onToggle={toggle}
      onActivate={select}
      onSelectAll={() => {
        setSelected(candidateIds);
        setActiveId(candidateIds[0] ?? "");
      }}
      onClear={() => {
        setSelected([]);
        setActiveId("");
      }}
    />
  );
  return (
    <BIMWorkspace
      project={project}
      workspace={data}
      workPackage={workPackage}
      impacted={inspectionMode ? inspectionIds : []}
      condensed={condensed}
      externalFile={exactSnapshot ? (model.data ?? null) : null}
      hideSourceActions
      focusId={activeId}
      onViewerSelected={select}
      snapshots={inspectableElements}
      changes={changes}
      revisionScoped
      revisionLabel={revisionLabel}
      fromRevisionLabel={fromRevisionLabel}
      sourceName={sourceName}
      mode={inspectionMode ? "changes" : "model"}
      onInvestigate={(id) =>
        onInvestigate(sourceId, revisionId, [id], fromRevisionId)
      }
      mapping={{
        contextBar,
        dock,
        candidateIds,
        selectedIds: inspectionMode ? [] : validSelected,
        allowedIds,
      }}
    />
  );
}
