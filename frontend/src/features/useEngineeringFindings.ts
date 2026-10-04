import { useEffect, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FindingDecision } from "../api/client";
import { runIsActive } from "./agentContext";

export const engineeringKeys = {
  findings: (project: string) => ["engineering-findings", project] as const,
  finding: (project: string, id: string) =>
    ["engineering-finding", project, id] as const,
  evidence: (project: string, id: string) =>
    ["engineering-evidence", project, id] as const,
  coordination: (project: string, id: string) =>
    ["engineering-coordination", project, id] as const,
  rechecks: (project: string, id: string) =>
    ["engineering-rechecks", project, id] as const,
  pendingRecheck: (project: string, id: string) =>
    ["engineering-pending-recheck", project, id] as const,
};

export function useEngineeringFindings(project: string) {
  return useQuery({
    queryKey: engineeringKeys.findings(project),
    queryFn: () => api.engineeringFindings(project),
    enabled: !!project,
    select: (items) => items.filter((item) => item.project_id === project),
  });
}

/** Engineering facts are server-owned; mutations never optimistically change them. */
export function useEngineeringFinding(project: string, id = "") {
  const cache = useQueryClient();
  const enabled = !!project && !!id;
  const scope = JSON.stringify([project, id]);
  const fence = useRef({ scope, busy: false, mounted: true });
  if (fence.current.scope !== scope)
    fence.current = { scope, busy: false, mounted: true };
  const identity = fence.current;
  useEffect(() => {
    identity.mounted = true;
    return () => {
      identity.mounted = false;
    };
  }, [identity]);
  const [mutation, setMutation] = useState({
    identity,
    busy: false,
    error: "",
  });
  const finding = useQuery({
    queryKey: engineeringKeys.finding(project, id),
    queryFn: () => api.engineeringFinding(project, id),
    enabled,
    select: (item) =>
      item.project_id === project && item.id === id ? item : undefined,
  });
  const coordination = useQuery({
    queryKey: engineeringKeys.coordination(project, id),
    queryFn: () => api.engineeringCoordination(project, id),
    enabled,
    select: (items) =>
      items.filter(
        (item) => item.project_id === project && item.finding_id === id,
      ),
  });
  const rechecks = useQuery({
    queryKey: engineeringKeys.rechecks(project, id),
    queryFn: () => api.engineeringRechecks(project, id),
    enabled,
    select: (items) =>
      items.filter(
        (item) => item.project_id === project && item.finding_id === id,
      ),
  });
  const checks = rechecks.data ?? [];
  const evidenceIds = [
    ...new Set([
      ...(finding.data?.evidence_ids ?? []),
      ...checks.flatMap((check) => check.evidence_ids),
    ]),
  ];
  const evidence = useQueries({
    queries: evidenceIds.map((evidenceId) => ({
      queryKey: engineeringKeys.evidence(project, evidenceId),
      queryFn: () => api.engineeringEvidence(project, evidenceId),
      enabled,
      // Evidence currently has no project_id in its DTO; validate it when supplied.
      select: (
        item: Awaited<ReturnType<typeof api.engineeringEvidence>> & {
          project_id?: string | null;
        },
      ) =>
        item.id === evidenceId &&
        (item.project_id === undefined || item.project_id === project)
          ? item
          : undefined,
    })),
  });
  const runs = useQueries({
    queries: checks.map((check) => ({
      // Share execution state with the existing operation-run query infrastructure.
      queryKey: ["current-operation-run", project, check.id],
      queryFn: () => api.run(check.id),
      enabled,
      select: (run: Awaited<ReturnType<typeof api.run>>) =>
        run.project_id === project && run.id === check.id ? run : undefined,
      refetchInterval: (query: {
        state: { data?: Awaited<ReturnType<typeof api.run>> };
      }) => (runIsActive(query.state.data) ? 1200 : false),
    })),
  });

  async function reconcile(includeRuns = true) {
    const keys: ReadonlyArray<readonly unknown[]> = [
      engineeringKeys.findings(project),
      engineeringKeys.finding(project, id),
      engineeringKeys.coordination(project, id),
      engineeringKeys.rechecks(project, id),
      ...evidenceIds.map((evidenceId) =>
        engineeringKeys.evidence(project, evidenceId),
      ),
      ["workspace", project],
      ["runs", project],
      ...(includeRuns
        ? checks.map((check) => ["current-operation-run", project, check.id])
        : []),
    ];
    await Promise.all(
      keys.map(async (queryKey) => {
        const filter = { queryKey, exact: true };
        // A GET started before the write must not win reconciliation.
        await cache.cancelQueries(filter);
        await cache.invalidateQueries(filter);
      }),
    );
  }

  const terminalRuns = JSON.stringify(
    runs.flatMap((query) =>
      query.data && !runIsActive(query.data)
        ? [[query.data.id, query.data.generation, query.data.status]]
        : [],
    ),
  );
  const observed = useRef(new Set<string>());
  useEffect(() => {
    if (terminalRuns === "[]") return;
    const signature = JSON.stringify([scope, terminalRuns]);
    if (observed.current.has(signature)) return;
    observed.current.add(signature);
    // COMPLETED is not RESOLVED: fetch the separately persisted business outcomes.
    void reconcile(false);
    // Reconcile only when execution identity changes, not on every outcome fetch.
  }, [cache, scope, terminalRuns]);

  async function perform<T>(operation: () => Promise<T>) {
    const current = () => fence.current === identity && identity.mounted;
    if (!enabled || !current() || identity.busy) return;
    identity.busy = true;
    setMutation({ identity, busy: true, error: "" });
    let result: T | undefined;
    let error = "";
    try {
      result = await operation();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "操作失败";
    } finally {
      try {
        // Rejections can indicate a concurrent revision/decision; reconcile those too.
        await reconcile();
      } finally {
        identity.busy = false;
        if (current()) setMutation({ identity, busy: false, error });
      }
    }
    return current() ? result : undefined;
  }

  return {
    finding,
    evidence,
    coordination,
    rechecks,
    runs,
    busy: mutation.identity === identity && mutation.busy,
    error: mutation.identity === identity ? mutation.error : "",
    decide: (input: FindingDecision) =>
      perform(() => api.engineeringDecision(project, id, input)),
    requestRechecks: () =>
      perform(async () => {
        const operationKey = engineeringKeys.pendingRecheck(project, id);
        // Pending IDs survive unmounts/cache GC, scoped to this QueryClient.
        cache.setQueryDefaults(operationKey, { gcTime: Infinity });
        const operationId =
          cache.getQueryData<string>(operationKey) ?? crypto.randomUUID();
        cache.setQueryData(operationKey, operationId);
        const result = await api.requestEngineeringRechecks(project, id, {
          operation_id: operationId,
        });
        // Only a successful POST permits a new logical request ID.
        if (cache.getQueryData<string>(operationKey) === operationId)
          cache.removeQueries({ queryKey: operationKey, exact: true });
        return result;
      }),
  };
}
