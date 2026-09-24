import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  ChevronRight,
  FolderOpen,
  MoreHorizontal,
  PackageOpen,
} from "lucide-react";
import { api, readSource, type DTO, type Workspace } from "../api/client";
import { useBIMSource } from "./useBIMSource";
import { propertySections } from "./bimProperties";
import {
  demoConstraintText,
  demoElementName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { statusLabel } from "../ui/labels";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { notify } from "../components/ui/AppToaster";

const IFCViewer = lazy(() => import("./IFCViewer"));
type Change = DTO<"BimElementChange">;
type Snapshot = DTO<"BimElementSnapshot">;
type Issue = DTO<"Constraint">;

/** The same spatial surface serves the current model, revision comparisons and issues. */
export default function BIMWorkspace({
  project,
  impacted,
  externalFile,
  localFile,
  onLocalFile,
  hideSourceActions = false,
  onViewerSelected,
  focusId,
  autoProjectModel = false,
  workspace,
  changes = [],
  snapshots = [],
  issues = [],
  revisionLabel,
  toolbar,
  onInvestigate,
  onModels,
  onWorkPackage,
  mode = "model",
  onIssueResolution,
}: {
  project: string;
  impacted: readonly string[];
  condensed?: boolean;
  externalFile?: File | null;
  localFile?: File | null;
  onLocalFile?: (file: File | null) => void;
  hideSourceActions?: boolean;
  onViewerSelected?: (id: string) => void;
  focusId?: string;
  autoProjectModel?: boolean;
  workspace?: Workspace;
  changes?: Change[];
  snapshots?: Snapshot[];
  issues?: Issue[];
  revisionLabel?: string;
  toolbar?: ReactNode;
  onInvestigate?: (id: string) => void;
  onModels?: () => void;
  onWorkPackage?: (id: string) => void;
  mode?: "model" | "changes" | "issues";
  onIssueResolution?: (id: string) => void;
}) {
  const elements = useQuery({
    queryKey: ["bim", project],
    queryFn: () => api.bim(project),
  });
  const {
    selected,
    setSelected,
    file,
    setFile,
    error,
    notice,
    busy,
    imported,
    importSource,
    openImported,
    chooseFile,
  } = useBIMSource(project);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (localFile && file !== localFile) setFile(localFile);
  }, [file, localFile, setFile]);
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
    enabled: autoProjectModel && externalFile === undefined,
  });
  const source = sources.data?.find(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  const revision = useQuery({
    queryKey: [
      "model-content",
      project,
      source?.source.id,
      source?.latest_revision_id,
    ],
    enabled: !!source?.latest_revision_id && autoProjectModel,
    retry: false,
    queryFn: async () =>
      new File(
        [
          await readSource(
            `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(source!.source.id)}/revisions/${encodeURIComponent(source!.latest_revision_id!)}/content`,
          ),
        ],
        "project-model.ifc",
      ),
  });
  const viewFile =
    externalFile === undefined ? (file ?? revision.data ?? null) : externalFile;
  useEffect(() => {
    if (viewFile && !selected && !focusId && impacted.length)
      setSelected(impacted[0]);
  }, [viewFile, selected, focusId, impacted, setSelected]);
  const [context, setContext] = useState<"changes" | "issues">("changes");
  const [listOpen, setListOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<
    "overview" | "changes" | "issues" | "documents"
  >("overview");
  const [selectedIssue, setSelectedIssue] = useState("");
  const [viewerProperties, setViewerProperties] = useState<unknown>(null);
  const viewerRecord =
    viewerProperties && typeof viewerProperties === "object"
      ? (viewerProperties as Record<string, unknown>)
      : null;
  const viewerName = viewerRecord?.Name;
  const modelName =
    typeof viewerName === "string"
      ? viewerName
      : viewerName && typeof viewerName === "object" && "value" in viewerName
        ? String(viewerName.value)
        : "";
  const activeId = focusId ?? selected;
  const item = elements.data?.find((element) => element.id === activeId);
  const snapshot = snapshots.find((element) => element.global_id === activeId);
  const change =
    changes.find((entry) => entry.global_id === activeId) ??
    (impacted.includes(activeId)
      ? {
          global_id: activeId,
          change_kind: "changed" as const,
          changed_aspects: ["impact"],
        }
      : undefined);
  const linkedIssues = issues.filter((issue) => {
    const evidence = workspace?.analysis?.evidence.filter((entry) =>
      issue.evidence_ids.includes(entry.id),
    );
    return !activeId
      ? issue.id === selectedIssue
      : evidence?.some((entry) => entry.element_ids.includes(activeId));
  });
  const title =
    snapshot?.name ||
    (item && demoElementName(item.id, item.name)) ||
    modelName ||
    (activeId ? "Selected element" : "Select an element");
  const classification =
    snapshot?.ifc_class ??
    item?.type ??
    (typeof viewerRecord?.type === "string"
      ? viewerRecord.type
      : "Model element");
  const select = (id: string) => {
    setSelected(id);
    setSelectedIssue("");
    onViewerSelected?.(id);
  };
  const chooseIssue = (issue: Issue) => {
    setContext("issues");
    setSelectedIssue(issue.id);
    setInspectorTab("issues");
    const id = workspace?.analysis?.evidence
      .filter((entry) => issue.evidence_ids.includes(entry.id))
      .flatMap((entry) => entry.element_ids)[0];
    if (id) select(id);
    setSelectedIssue(issue.id);
  };
  useEffect(() => {
    if (mode === "issues" && !selectedIssue && issues[0])
      chooseIssue(issues[0]);
  }, [mode, selectedIssue, issues[0]?.id]);
  useEffect(() => {
    if (imported.data?.status === "COMPLETED") notify.success("IFC 导入完成");
    if (imported.data?.status === "FAILED")
      notify.error("IFC 导入失败", imported.data.error ?? undefined);
  }, [imported.data?.status, imported.data?.error]);
  const issue = issues.find((entry) => entry.id === selectedIssue);
  const packageFor = (id: string) =>
    workspace?.state.work_packages.find((wp) => wp.element_ids.includes(id));
  const workPackage =
    packageFor(activeId) ??
    workspace?.state.work_packages.find(
      (wp) => wp.id === issue?.work_package_id,
    );
  const readinessFor = (id: string) =>
    workspace?.analysis?.readiness.find(
      (entry) => entry.work_package_id === packageFor(id)?.id,
    )?.status;
  const rows = changes.length
    ? changes
    : (elements.data ?? [])
        .filter((element) => impacted.includes(element.id))
        .map((element) => ({
          global_id: element.id,
          change_kind: "changed" as const,
          changed_aspects: ["impact"],
        }));
  const description = (aspects: string[]) =>
    aspects
      .map(
        (aspect) =>
          ({
            placement: "Position changed",
            geometry: "Geometry changed",
            attributes: "Attributes changed",
            properties: "Properties changed",
            impact: "Affected by design change",
          })[aspect] ?? aspect,
      )
      .join(" · ");

  return (
    <section
      className={`bim-workspace spatial-workspace is-${mode}${listOpen ? " is-list-open" : ""}`}
      aria-label="模型工作区"
    >
      <div className="spatial-stage">
        {viewFile ? (
          <Suspense
            fallback={<div className="loading-view">正在加载 IFC 查看器…</div>}
          >
            <IFCViewer
              file={viewFile}
              impacted={impacted}
              onSelected={select}
              focusId={activeId || undefined}
              selectedLabel={activeId ? title : undefined}
              issueLabel={
                issue || linkedIssues[0]
                  ? demoConstraintText(
                      (issue ?? linkedIssues[0]).kind,
                      (issue ?? linkedIssues[0]).description,
                    )
                  : undefined
              }
              onProperties={setViewerProperties}
            />
          </Suspense>
        ) : (
          <div className="spatial-stage-empty">
            <Box aria-hidden="true" />
            <strong>Open a model to explore its geometry</strong>
            <span>
              {revision.isPending && source
                ? "正在打开项目模型…"
                : "Choose an IFC file or open a project model."}
            </span>
          </div>
        )}
        {toolbar && <div className="spatial-context-controls">{toolbar}</div>}
        {!hideSourceActions && (
          <details
            key={viewFile ? "loaded" : "empty"}
            className={`spatial-source-actions${viewFile ? " is-loaded" : ""}`}
            open={!viewFile}
          >
            <summary>Model</summary>
            <div>
              <input
                ref={input}
                hidden
                type="file"
                accept=".ifc"
                disabled={busy}
                aria-label="本地 IFC 文件"
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  chooseFile(chosen);
                  onLocalFile?.(
                    chosen &&
                      chosen.size <= 25 * 1024 * 1024 &&
                      chosen.size &&
                      chosen.name.toLowerCase().endsWith(".ifc")
                      ? chosen
                      : null,
                  );
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={busy}
              >
                <FolderOpen size={14} /> Open IFC
              </button>
              <button
                type="button"
                onClick={() => void openImported()}
                disabled={busy}
              >
                <PackageOpen size={14} /> Project IFC
              </button>
              {file && (
                <button
                  type="button"
                  onClick={() => void importSource()}
                  disabled={busy}
                >
                  Import to project
                </button>
              )}
              {file && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    onLocalFile?.(null);
                    select("");
                  }}
                >
                  Close local view
                </button>
              )}
              {onModels && (
                <button type="button" onClick={onModels}>
                  Model lifecycle →
                </button>
              )}
            </div>
          </details>
        )}
        {(error ||
          elements.error ||
          imported.error ||
          imported.data?.error) && (
          <div className="alert spatial-feedback" role="alert">
            {error ||
              elements.error?.message ||
              imported.error?.message ||
              imported.data?.error}
          </div>
        )}
        {(notice || imported.data) && (
          <div className="viewer-status spatial-feedback" role="status">
            {[
              notice,
              imported.data && `导入 ${statusLabel(imported.data.status)}。`,
            ]
              .filter(Boolean)
              .join(" ")}
          </div>
        )}
      </div>
      <aside className="spatial-inspector" aria-label="构件详情">
        <header className="spatial-inspector-head">
          <Box size={18} strokeWidth={1.6} />
          <div>
            <h2>
              {mode === "issues" && issue ? "Issue · " + issue.kind : title}
            </h2>
            <span>
              {mode === "issues" && issue
                ? demoConstraintText(issue.kind, issue.description)
                : classification}
            </span>
          </div>
          <MoreHorizontal size={16} aria-hidden="true" />
        </header>
        {mode !== "issues" && (
          <div
            className="spatial-inspector-tabs"
            role="tablist"
            aria-label="Element context"
          >
            {(["overview", "changes", "issues", "documents"] as const).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === tab}
                  onClick={() => setInspectorTab(tab)}
                >
                  {tab[0].toUpperCase() + tab.slice(1)}
                  {tab === "changes" && changes.length > 0 ? (
                    <small>{changes.length}</small>
                  ) : tab === "issues" && linkedIssues.length > 0 ? (
                    <small>{linkedIssues.length}</small>
                  ) : null}
                </button>
              ),
            )}
          </div>
        )}
        <div className="spatial-inspector-body">
          {mode === "changes" && change && (
            <section className="comparison-inspection">
              <span className="context-status">
                {change.change_kind === "added"
                  ? "Added"
                  : change.change_kind === "deleted"
                    ? "Removed"
                    : "Modified"}
              </span>
              <h3>Revision history</h3>
              <div className="comparison-step">
                <strong>R2</strong>
                <span>{description(change.changed_aspects)}</span>
              </div>
              <div className="comparison-step">
                <strong>R1</strong>
                <span>Previous model revision</span>
              </div>
              <h3>Change visualization</h3>
              <p>
                Selected geometry is blue. Other modified elements are amber.
              </p>
              <button
                type="button"
                onClick={() => {
                  setContext("changes");
                  setListOpen(true);
                }}
              >
                View in change list →
              </button>
            </section>
          )}
          {mode === "issues" && issue && (
            <section className="issue-inspection issue-primary">
              <h3>Details</h3>
              <dl className="element-facts">
                <div>
                  <dt>Type</dt>
                  <dd>{issue.kind}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd className="issue-priority">Blocking</dd>
                </div>
                <div>
                  <dt>Work Package</dt>
                  <dd>
                    {workPackage
                      ? demoWorkPackageName(workPackage.id, workPackage.name)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Level</dt>
                  <dd>{snapshot?.storey ?? item?.storey ?? "—"}</dd>
                </div>
              </dl>
              <h3>Description</h3>
              <p>{demoConstraintText(issue.kind, issue.description)}</p>
              <h3>Evidence</h3>
              <p>
                {workspace?.analysis?.evidence
                  .filter((entry) => issue.evidence_ids.includes(entry.id))
                  .map((entry) => demoConstraintText(issue.kind, entry.fact))
                  .join(" · ") || "No spatial evidence linked."}
              </p>
              {onIssueResolution && (
                <button
                  type="button"
                  className="issue-resolution"
                  onClick={() => onIssueResolution(issue.id)}
                >
                  Review resolution →
                </button>
              )}
            </section>
          )}
          {mode !== "issues" &&
            (item || snapshot || (activeId && viewerRecord)) && (
              <>
                {inspectorTab === "overview" && (
                  <>
                    <div className="element-identity">
                      <Box size={44} strokeWidth={1} />
                      <span>{classification}</span>
                    </div>
                    <dl className="element-facts">
                      <div>
                        <dt>Category</dt>
                        <dd>{classification}</dd>
                      </div>
                      <div>
                        <dt>System</dt>
                        <dd>{item?.space ?? snapshot?.space ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Level</dt>
                        <dd>{snapshot?.storey ?? item?.storey ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Work Package</dt>
                        <dd>
                          {workPackage
                            ? demoWorkPackageName(
                                workPackage.id,
                                workPackage.name,
                              )
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Model</dt>
                        <dd>
                          {revisionLabel ??
                            source?.source.name ??
                            viewFile?.name ??
                            "—"}
                        </dd>
                      </div>
                    </dl>
                  </>
                )}
                {(inspectorTab === "overview" ||
                  inspectorTab === "changes") && (
                  <section className="element-section">
                    <h3>
                      Changes <small>{change ? 1 : 0}</small>
                    </h3>
                    {change ? (
                      <button
                        type="button"
                        className="element-context-row"
                        onClick={() => {
                          setContext("changes");
                          setListOpen(true);
                        }}
                      >
                        <i className="dot amber" />
                        {description(change.changed_aspects)}
                        <ChevronRight size={13} />
                      </button>
                    ) : (
                      <p className="quiet-message">
                        No changes for this element.
                      </p>
                    )}
                  </section>
                )}
                {(inspectorTab === "overview" || inspectorTab === "issues") && (
                  <section className="element-section">
                    <h3>
                      Issues <small>{linkedIssues.length}</small>
                    </h3>
                    {linkedIssues.map((entry) => (
                      <button
                        type="button"
                        className="element-context-row"
                        key={entry.id}
                        onClick={() => chooseIssue(entry)}
                      >
                        <i className="dot red" />
                        {demoConstraintText(entry.kind, entry.description)}
                        <ChevronRight size={13} />
                      </button>
                    ))}
                    {!linkedIssues.length && (
                      <p className="quiet-message">No linked issues.</p>
                    )}
                  </section>
                )}
                {inspectorTab === "documents" && (
                  <p className="quiet-message">
                    No linked documents for this element.
                  </p>
                )}
                {inspectorTab === "overview" && (
                  <>
                    <section className="element-section">
                      <h3>Related</h3>
                      {item?.related_ids.map((id) => (
                        <button
                          type="button"
                          className="element-context-row"
                          key={id}
                          onClick={() => select(id)}
                        >
                          <Box size={13} />
                          {demoElementName(
                            id,
                            elements.data?.find((e) => e.id === id)?.name ?? id,
                          )}
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    </section>
                    <AppDisclosure label="Technical details">
                      <dl className="element-facts">
                        <div>
                          <dt>GlobalId</dt>
                          <dd className="mono">{activeId}</dd>
                        </div>
                        <div>
                          <dt>Revision</dt>
                          <dd>{item?.revision ?? snapshot?.revision_id}</dd>
                        </div>
                      </dl>
                      {propertySections(
                        item?.properties ?? viewerProperties,
                      ).map((section, i) => (
                        <div key={i} className="technical-properties">
                          <strong>{section.title ?? "Properties"}</strong>
                          <dl>
                            {section.fields.map((field, j) => (
                              <div key={j}>
                                <dt>{field.label}</dt>
                                <dd>{field.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))}
                    </AppDisclosure>
                  </>
                )}
              </>
            )}
          {mode !== "issues" && issue && (
            <section className="element-section issue-inspection">
              <h3>Issue context</h3>
              <p>{demoConstraintText(issue.kind, issue.description)}</p>
              <small>
                Work Package ·{" "}
                {demoWorkPackageName(
                  issue.work_package_id,
                  workspace?.state.work_packages.find(
                    (wp) => wp.id === issue.work_package_id,
                  )?.name ?? issue.work_package_id,
                )}
              </small>
            </section>
          )}
          {!item && !snapshot && !issue && (
            <p className="quiet-message">
              Select geometry or a row below to inspect its context.
            </p>
          )}
          {change && onInvestigate && (
            <button
              type="button"
              className="investigate-link"
              onClick={() => onInvestigate(activeId)}
            >
              Investigate change →
            </button>
          )}
        </div>
      </aside>
      <section className="spatial-context" aria-label="Model context">
        <header className="spatial-context-header">
          <div className="spatial-context-tabs">
            <button
              type="button"
              className={context === "changes" ? "active" : ""}
              onClick={() => {
                setContext("changes");
                setListOpen(true);
              }}
            >
              Changes <small>{rows.length}</small>
            </button>
            <button
              type="button"
              className={context === "issues" ? "active" : ""}
              onClick={() => {
                setContext("issues");
                setListOpen(true);
              }}
            >
              Issues <small>{issues.length}</small>
            </button>
            <button
              type="button"
              disabled={!workPackage || !onWorkPackage}
              onClick={() => workPackage && onWorkPackage?.(workPackage.id)}
            >
              Work Package
            </button>
          </div>
          <span>{revisionLabel}</span>
          <button
            type="button"
            aria-label={
              listOpen ? "Collapse context list" : "Expand context list"
            }
            aria-expanded={listOpen}
            onClick={() => setListOpen((open) => !open)}
          >
            <MoreHorizontal size={16} />
          </button>
        </header>
        <div className="spatial-context-scroll">
          {context === "changes" ? (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Element</th>
                  <th>Description</th>
                  <th>Impact</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr
                    key={entry.global_id}
                    className={activeId === entry.global_id ? "selected" : ""}
                    onClick={() => select(entry.global_id)}
                  >
                    <td>
                      <i className="dot blue" />
                      {entry.change_kind === "added"
                        ? "Added"
                        : entry.change_kind === "deleted"
                          ? "Removed"
                          : "Modified"}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => select(entry.global_id)}
                      >
                        {snapshots.find((s) => s.global_id === entry.global_id)
                          ?.name ||
                          demoElementName(
                            entry.global_id,
                            elements.data?.find((e) => e.id === entry.global_id)
                              ?.name ?? entry.global_id,
                          )}
                      </button>
                    </td>
                    <td>{description(entry.changed_aspects)}</td>
                    <td>{packageFor(entry.global_id)?.name ?? "—"}</td>
                    <td>
                      <span
                        className={`context-status${readinessFor(entry.global_id) === "READY" ? " is-ready" : ""}`}
                      >
                        {readinessFor(entry.global_id) === "READY"
                          ? "Ready"
                          : "Needs review"}
                      </span>
                    </td>
                    <td>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Work Package</th>
                  <th>Context</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {issues.map((entry) => (
                  <tr
                    key={entry.id}
                    className={selectedIssue === entry.id ? "selected" : ""}
                    onClick={() => chooseIssue(entry)}
                  >
                    <td>
                      <i className="dot red" />
                      {demoConstraintText(entry.kind, entry.description)}
                    </td>
                    <td>
                      {demoWorkPackageName(
                        entry.work_package_id,
                        workspace?.state.work_packages.find(
                          (wp) => wp.id === entry.work_package_id,
                        )?.name ?? entry.work_package_id,
                      )}
                    </td>
                    <td>{entry.kind}</td>
                    <td>
                      <span className="context-status is-open">Open</span>
                    </td>
                    <td>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(context === "changes" ? !rows.length : !issues.length) && (
            <p className="context-empty">
              {context === "changes"
                ? "No model changes in this context."
                : "No spatial issues in this context."}
            </p>
          )}
        </div>
      </section>
    </section>
  );
}
