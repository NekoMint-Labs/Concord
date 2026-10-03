import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type AgentRun,
  type ProjectSourceStatus,
  type WorkPackage,
} from "../api/client";
import type { ConcordContext } from "./ConcordAgent";
import {
  engineeringContextKey,
  reportMatchesRun,
  runIsActive,
  scopeFor,
  type AgentContext,
} from "./agentContext";

/** One launcher for the header, sources, Work and model selections. */
export function useConcordAgent({
  project,
  projectName,
  workPackageId,
  workPackageName,
  sources,
  workPackages = [],
}: {
  project: string;
  projectName: string;
  workPackageId?: string;
  workPackageName?: string;
  sources?: ProjectSourceStatus[];
  workPackages?: WorkPackage[];
}) {
  const cache = useQueryClient();
  const fence = useRef({ project, attempt: 0 });
  if (fence.current.project !== project)
    fence.current = { project, attempt: fence.current.attempt + 1 };
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [scope, setScope] = useState<
    AgentContext & { workPackageId?: string | null }
  >({ elementIds: [] });
  const [active, setActive] = useState<{
    run: AgentRun;
    context?: AgentContext;
    identity?: { key: string };
  }>();
  useEffect(() => {
    setScope({ elementIds: [] });
    setActive(undefined);
    setError("");
    setPending(false);
  }, [project]);

  const context = useMemo<ConcordContext>(
    () => ({
      projectName,
      ...scope,
      elementIds: scope.elementIds ?? [],
      workPackageId:
        scope.workPackageId === null
          ? undefined
          : (scope.workPackageId ?? workPackageId),
      workPackageName:
        scope.workPackageId === null
          ? undefined
          : scope.workPackageId
            ? workPackages.find((item) => item.id === scope.workPackageId)?.name
            : workPackageName,
    }),
    [projectName, scope, workPackageId, workPackageName, workPackages],
  );

  // A new visit to the same engineering scope is not the old operation.
  const contextKey = engineeringContextKey(project, context);
  const contextIdentity = useRef({ key: contextKey });
  if (contextIdentity.current.key !== contextKey)
    contextIdentity.current = { key: contextKey };

  const history = useQuery({
    queryKey: ["runs", project],
    queryFn: () => api.runs(project),
    enabled: !!project,
  });
  const recent = history.data
    ?.filter(
      (run) => run.project_id === project && run.category === "investigation",
    )
    .slice()
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
  const remembered = active?.run.project_id === project ? active : undefined;
  const shownRun = remembered?.run ?? recent;
  const currentRun = useQuery({
    queryKey: ["current-operation-run", project, shownRun?.id],
    queryFn: () => api.run(shownRun!.id),
    enabled: !!shownRun,
    initialData: shownRun,
    refetchInterval: (query) => (runIsActive(query.state.data) ? 1200 : false),
  });
  const run =
    currentRun.data?.project_id === project &&
    currentRun.data.id === shownRun?.id
      ? currentRun.data
      : undefined;
  const reportQuery = useQuery({
    queryKey: [
      "investigation-report",
      project,
      run?.id,
      run?.generation,
      run?.analysis_id,
    ],
    queryFn: () => api.investigation(project, run!.id),
    enabled: !!run && run.category === "investigation",
    refetchInterval: (query) =>
      runIsActive(run) ||
      (!!run?.analysis_id && !reportMatchesRun(query.state.data, run))
        ? 1200
        : false,
  });
  const report = reportMatchesRun(reportQuery.data, run)
    ? reportQuery.data
    : undefined;

  useEffect(() => {
    if (!run?.analysis_id) return;
    for (const key of [
      "workspace",
      "sources",
      "bim-snapshot",
      "bim-bindings",
      "comparisons",
      "comparison",
      "runs",
    ]) {
      void cache.invalidateQueries({ queryKey: [key, project] });
    }
  }, [cache, project, run?.id, run?.generation, run?.analysis_id, run?.status]);

  const rememberRun = useCallback(
    (next: AgentRun) => {
      if (fence.current.project !== project || next.project_id !== project)
        return;
      // Externally launched imports/rechecks also supersede an in-flight investigation.
      fence.current.attempt++;
      setActive((previous) =>
        previous?.run.id === next.id
          ? { ...previous, run: next }
          : { run: next },
      );
      setError("");
      setPending(false);
      void cache.invalidateQueries({ queryKey: ["runs", project] });
      void cache.invalidateQueries({
        queryKey: ["current-operation-run", project, next.id],
      });
    },
    [project, cache],
  );

  const launch = useCallback(
    async (
      operation: () => Promise<AgentRun>,
      submitted?: AgentContext,
      identity?: { key: string },
    ) => {
      const attempt = ++fence.current.attempt;
      const current = () =>
        fence.current.project === project && fence.current.attempt === attempt;
      setError("");
      setPending(true);
      try {
        const next = await operation();
        if (!current() || next.project_id !== project) return;
        setActive({ run: next, context: submitted, identity });
        await cache.invalidateQueries({ queryKey: ["runs", project] });
        void cache.invalidateQueries({
          queryKey: ["current-operation-run", project, next.id],
        });
        if (current()) return next;
      } catch (cause) {
        if (current() && (!identity || identity === contextIdentity.current))
          setError(cause instanceof Error ? cause.message : "调查启动失败");
      } finally {
        if (current()) setPending(false);
      }
    },
    [cache, project],
  );
  const startInvestigation = useCallback(
    (instruction: string, submitted: AgentContext = context) => {
      const key = engineeringContextKey(project, submitted);
      // Callers may set scope and launch together before the next render.
      if (contextIdentity.current.key !== key)
        contextIdentity.current = { key };
      const identity = contextIdentity.current;
      return launch(
        () =>
          api.investigate(project, {
            instruction: instruction.trim(),
            scope: scopeFor(submitted),
          }),
        { ...submitted, elementIds: [...(submitted.elementIds ?? [])] },
        identity,
      );
    },
    [context, launch, project],
  );
  const retryRun = useCallback(
    (next: AgentRun = run!) => {
      if (
        !next ||
        next.project_id !== project ||
        !["FAILED", "CANCELLED", "EXPIRED"].includes(next.status)
      )
        return Promise.resolve(undefined);
      return launch(
        () => api.resume(next.id),
        remembered?.run.id === next.id ? remembered.context : undefined,
        remembered?.run.id === next.id ? remembered.identity : undefined,
      );
    },
    [launch, project, remembered, run],
  );

  const sourceContext = useCallback(
    (
      sourceId: string,
      revisionId?: string,
      revisionLabel?: string,
      fromRevisionId?: string,
      fromRevisionLabel?: string,
      elementIds: string[] = [],
    ) => {
      setScope({
        sourceId,
        sourceName:
          sources?.find((item) => item.source.id === sourceId)?.source.name ??
          sourceId,
        revisionId,
        revisionLabel,
        fromRevisionId,
        fromRevisionLabel,
        workPackageId: null,
        elementIds,
      });
    },
    [sources],
  );
  const bimContext = useCallback(
    (
      sourceId: string,
      revisionId: string,
      elementIds: string[],
      fromRevisionId?: string,
      revisionLabel?: string,
      fromRevisionLabel?: string,
    ) => {
      setScope({
        sourceId,
        sourceName:
          sources?.find((item) => item.source.id === sourceId)?.source.name ??
          sourceId,
        revisionId,
        revisionLabel,
        fromRevisionId,
        fromRevisionLabel,
        elementIds,
      });
    },
    [sources],
  );

  // Resolve saved scope labels from immutable revision metadata, not today's selection.
  const reportSource = report?.scope.source_id;
  const revisions = useQuery({
    queryKey: ["source-revisions", project, reportSource],
    queryFn: () => api.sourceRevisions(project, reportSource!),
    enabled: !!reportSource,
  });
  const revisionLabel = (id?: string | null) => {
    const revision = revisions.data?.find((item) => item.id === id);
    return revision
      ? `R${revision.sequence}${revision.external_label ? ` · ${revision.external_label}` : ""}`
      : id?.slice(0, 8);
  };
  const reportContext: ConcordContext = report
    ? {
        projectName,
        sourceId: report.scope.source_id ?? undefined,
        sourceName:
          sources?.find((item) => item.source.id === report.scope.source_id)
            ?.source.name ??
          report.scope.source_id ??
          undefined,
        fromRevisionId: report.scope.from_revision_id ?? undefined,
        fromRevisionLabel: revisionLabel(report.scope.from_revision_id),
        revisionId: report.scope.to_revision_id ?? undefined,
        revisionLabel: revisionLabel(report.scope.to_revision_id),
        workPackageId:
          report.scope.work_package_ids.length === 1
            ? report.scope.work_package_ids[0]
            : undefined,
        workPackageName:
          report.scope.work_package_ids
            .map(
              (id) =>
                workPackages.find((item) => item.id === id)?.name ??
                (id === workPackageId ? workPackageName : undefined) ??
                id,
            )
            .join("、") || undefined,
        elementIds: report.scope.element_ids,
      }
    : (() => {
        const saved =
          run?.category === "investigation"
            ? (remembered?.context ?? context)
            : context;
        return {
          projectName,
          sourceId: saved.sourceId,
          sourceName: saved.sourceName,
          fromRevisionId: saved.fromRevisionId,
          fromRevisionLabel: saved.fromRevisionLabel,
          revisionId: saved.revisionId,
          revisionLabel: saved.revisionLabel,
          workPackageId: saved.workPackageId ?? undefined,
          workPackageName: saved.workPackageName,
          elementIds: saved.elementIds ?? [],
        };
      })();

  // Import/recheck presentation is unchanged; only Investigations need scope association.
  const contextualRun =
    run?.category !== "investigation" ||
    (remembered?.identity === contextIdentity.current &&
      remembered.identity.key === contextKey)
      ? run
      : undefined;

  return {
    contextualRun,
    contextualReport: contextualRun ? report : undefined,
    activeRun: shownRun
      ? {
          id: shownRun.id,
          generation: run?.generation ?? shownRun.generation,
          category: shownRun.category,
          project,
        }
      : undefined,
    currentRun: { ...currentRun, data: run },
    investigation: { ...reportQuery, data: report },
    context,
    reportContext,
    pending,
    error,
    clearError: () => setError(""),
    clearScope: () => setScope({ elementIds: [] }),
    rememberRun,
    sourceContext,
    bimContext,
    startInvestigation,
    retryRun,
  };
}
