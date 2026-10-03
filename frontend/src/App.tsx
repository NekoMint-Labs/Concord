import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, PenLine } from "lucide-react";
import { api, isDesktop, setToken, type DTO } from "./api/client";
import { Button } from "./components/ui/button";
import { icon } from "./components/ui/icon";
import { AppToaster } from "./components/ui/AppToaster";
import { AppTooltip } from "./components/ui/AppTooltip";
import { EventComposer } from "./features/EventComposer";
import type { WorkspaceInspectorView } from "./features/InvestigationInspector";
import { Pane, PaneDivider, PaneSplit, usePanelRef } from "./layout/PaneSplit";
import { AdvancedMenu } from "./app/AdvancedMenu";
import { ProjectSidebar } from "./app/ProjectSidebar";
import { StartupView } from "./app/StartupView";
import { WorkspaceHeader } from "./app/WorkspaceHeader";
import { WorkspaceViews, type WorkspaceTab } from "./app/WorkspaceViews";
import { useWorkspace } from "./app/useWorkspace";
import { useWorkspaceMutation } from "./app/useWorkspaceMutation";
import { useProjectLifecycle } from "./app/useProjectLifecycle";
import {
  NewProjectDialog,
  OpenProjectDialog,
  ProjectSettingsDialog,
  ProjectStructureDialog,
} from "./app/ProjectDialogs";
import { ConcordAgent } from "./features/ConcordAgent";
import { ContextRunProgress } from "./features/ContextRunProgress";
import { useConcordAgent } from "./features/useConcordAgent";
import type { BimMappingContext } from "./features/BimMappingWorkspace";
import { demoWorkPackageName } from "./ui/demo/demoPresentation";

export function App() {
  const lifecycle = useProjectLifecycle();
  // Project-local interactions never survive a project switch, including cached projects.
  return <ProjectApplication key={lifecycle.project} lifecycle={lifecycle} />;
}

function ProjectApplication({
  lifecycle,
}: {
  lifecycle: ReturnType<typeof useProjectLifecycle>;
}) {
  const cache = useQueryClient();
  const project = lifecycle.project;
  const [selected, setSelected] = useState("");
  const [selectedConstraint, setSelectedConstraint] = useState("");
  const [selectedElement, setSelectedElement] = useState("");
  const [selectedSpatialIssue, setSelectedSpatialIssue] = useState("");
  const [projectSourceId, setProjectSourceId] = useState("");
  const [localIfc, setLocalIfc] = useState<{
    project: string;
    file: File;
  } | null>(null);
  const localIfcFile = localIfc?.project === project ? localIfc.file : null;
  const [tab, setTab] = useState<WorkspaceTab>(
    lifecycle.newProjectId === project ? "project" : "work",
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inspectorView, setInspectorView] =
    useState<WorkspaceInspectorView>("blocker");
  const [eventDialog, setEventDialog] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [mappingMode, setMappingMode] = useState(false);
  const [mappingContext, setMappingContext] = useState<BimMappingContext>();
  const [navOpen, setNavOpen] = useState(true);
  const navPanel = usePanelRef();
  useEffect(() => {
    if (!navOpen)
      document
        .querySelector<HTMLButtonElement>('.app-header [aria-label="展开侧栏"]')
        ?.focus();
  }, [navOpen]);
  const { workspace } = useWorkspace(project);
  const { perform, busy, error, setError } = useWorkspaceMutation();
  const profile = useQuery({ queryKey: ["profile"], queryFn: api.profile });
  const sourceCatalog = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
    enabled: !!project,
  });
  const data = workspace.data;
  const projectModels =
    sourceCatalog.data?.filter(
      (item) => item.source.kind === "BIM" && item.latest_revision_id,
    ) ?? [];
  const wp = data?.state.work_packages.find((item) => item.id === selected);
  const agent = useConcordAgent({
    project,
    projectName: data?.state.project.name ?? project,
    workPackageId:
      tab === "coordination" || tab === "bim"
        ? selected || undefined
        : undefined,
    workPackageName:
      wp && (tab === "coordination" || tab === "bim")
        ? demoWorkPackageName(wp.id, wp.name)
        : undefined,
    sources: sourceCatalog.data,
    workPackages: data?.state.work_packages,
  });

  useEffect(() => {
    setSelected("");
    setTab(lifecycle.newProjectId === project ? "project" : "work");
    setSelectedConstraint("");
    setSelectedElement("");
    setSelectedSpatialIssue("");
    setLocalIfc(null);
    setDetailsOpen(false);
    setMappingMode(false);
    setMappingContext(undefined);
  }, [project, lifecycle.newProjectId]);
  useEffect(() => {
    if (!data) return;
    if (!data.state.work_packages.length) {
      setSelected("");
      return;
    }
    if (!data.state.work_packages.some((item) => item.id === selected)) {
      let remembered: string | null = null;
      try {
        remembered = localStorage.getItem(`concord:package:${project}`);
      } catch {
        // Project state still loads when storage is unavailable.
      }
      setSelected(
        data.state.work_packages.find((item) => item.id === remembered)?.id ??
          data.state.work_packages[0].id,
      );
    }
  }, [data, project, selected]);

  function selectPackage(id: string) {
    if (id !== selected) {
      setSelectedElement("");
      setSelectedSpatialIssue("");
      setMappingContext(undefined);
    }
    agent.clearScope();
    setProjectSourceId("");
    setSelected(id);
    try {
      localStorage.setItem(`concord:package:${project}`, id);
    } catch {
      // Remembering a selection must not block navigation.
    }
    setSelectedConstraint("");
    setDetailsOpen(false);
    setMappingMode(false);
  }

  function navigate(next: WorkspaceTab) {
    if (next === "sources") {
      setProjectSourceId(
        (id) => id || sourceCatalog.data?.[0]?.source.id || "",
      );
      agent.clearScope();
      setMappingMode(false);
      setDetailsOpen(false);
      setTab("project");
      return;
    }
    if (next === "settings") {
      setSettingsOpen(true);
      return;
    }
    if (next !== "bim") setMappingMode(false);
    if (next === "work" || next === "project") agent.clearScope();
    if (next !== tab || inspectorView === "investigation")
      setDetailsOpen(false);
    setTab(next);
  }

  function createEvent(event: DTO<"ProjectEvent-Input">) {
    selectPackage(event.work_package_id);
    navigate("coordination");
    setEventDialog(false);
    void perform(() => api.events(project, event), "变更已记录。");
  }

  const dialogs = (
    <>
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreate={(input) => lifecycle.create.mutateAsync(input)}
      />
      <OpenProjectDialog
        open={openProjectOpen}
        projects={lifecycle.projects.data ?? []}
        current={project}
        onOpenChange={setOpenProjectOpen}
        onProject={lifecycle.openProject}
      />
    </>
  );

  if (lifecycle.projects.isPending || lifecycle.projects.isError)
    return (
      <StartupView
        pending={lifecycle.projects.isPending}
        message={lifecycle.projects.error?.message}
        desktop={isDesktop}
        onReconnect={() => void cache.invalidateQueries()}
        onToken={(next) => {
          setToken(next);
          void cache.invalidateQueries();
        }}
      />
    );

  if (!project)
    return (
      <>
        <StartupView
          pending={false}
          connected
          demoAvailable={!lifecycle.openDemo.isPending}
          demoError={lifecycle.openDemo.error?.message}
          desktop={isDesktop}
          onNewProject={() => setNewProjectOpen(true)}
          onOpenDemo={() => lifecycle.openDemo.mutate()}
          onReconnect={() => void cache.invalidateQueries()}
          onToken={() => {}}
        />
        {dialogs}
      </>
    );

  if (!data)
    return (
      <>
        {dialogs}
        <StartupView
          pending={workspace.isPending}
          onOpenProject={() => setOpenProjectOpen(true)}
          message={workspace.error?.message}
          desktop={isDesktop}
          onReconnect={() => void cache.invalidateQueries()}
          onToken={(next) => {
            setToken(next);
            void cache.invalidateQueries();
          }}
        />
      </>
    );

  return (
    <div
      className={`application-shell${navOpen ? "" : " is-nav-collapsed"}`}
      aria-busy={busy}
    >
      <PaneSplit id="shell">
        <Pane
          id="sidebar-pane"
          className="sidebar-pane pane-stack"
          panelRef={navPanel}
          collapsible
          collapsedSize="0px"
          defaultSize="88px"
          minSize="80px"
          maxSize="104px"
          onResize={(size) => setNavOpen(size.inPixels > 0)}
        >
          <ProjectSidebar
            data={data}
            project={project}
            projects={lifecycle.projects.data}
            recent={lifecycle.recent}
            sources={sourceCatalog.data ?? []}
            selected={selected}
            tab={tab}
            collapsed={!navOpen}
            onCollapse={() => {
              navPanel.current?.collapse();
              setNavOpen(false);
            }}
            onProject={lifecycle.openProject}
            onOpenDemo={() => lifecycle.openDemo.mutate()}
            onNewProject={() => setNewProjectOpen(true)}
            onOpenProject={() => setOpenProjectOpen(true)}
            onProjectSettings={() => setSettingsOpen(true)}
            onStructure={() => setStructureOpen(true)}
            onSelect={(id) => {
              selectPackage(id);
              navigate("coordination");
            }}
            onTab={navigate}
          />
        </Pane>
        <PaneDivider label="调整导航宽度" disabled={!navOpen} />
        <Pane className="main-pane pane-stack">
          <main className="main-shell">
            <WorkspaceHeader
              data={data}
              wp={wp}
              modelElementId={
                tab === "bim" && !mappingMode
                  ? localIfc
                    ? ""
                    : selectedElement
                  : undefined
              }
              tab={tab}
              navCollapsed={!navOpen}
              onToggleNav={() => {
                navPanel.current?.expand();
                setNavOpen(true);
              }}
              onNavigate={navigate}
            >
              {wp && tab === "coordination" && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setEventDialog(true)}
                >
                  <PenLine {...icon} />
                  记录变更
                </Button>
              )}
              {wp && tab === "bim" && !mappingMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!localIfcFile || !projectModels.length}
                  title={
                    localIfcFile
                      ? "本地 IFC 仅用于预览；添加到项目并处理后才能关联"
                      : !projectModels.length
                        ? "请先添加并处理项目 IFC 模型"
                        : undefined
                  }
                  onClick={() => {
                    setMappingContext(undefined);
                    setMappingMode(true);
                  }}
                >
                  <Link2 {...icon} />
                  关联 BIM
                </Button>
              )}
              <ConcordAgent
                key={project}
                project={project}
                context={agent.context}
                currentRun={agent.contextualRun}
                report={agent.contextualReport}
                onRun={agent.rememberRun}
                onInvestigate={(instruction, context) =>
                  agent.startInvestigation(instruction, context)
                }
                onOpenReport={() => {
                  setInspectorView("investigation");
                  setDetailsOpen(true);
                }}
              />
              <AdvancedMenu
                tab={tab}
                onTab={navigate}
                project={project}
                busy={busy}
                profile={profile.data}
                createEvent={createEvent}
                onReset={() => {
                  setSelectedConstraint("");
                  setDetailsOpen(false);
                  setTab("work");
                  void perform(api.reset, "演示项目已重置。");
                }}
              />
            </WorkspaceHeader>
            {(error || agent.error || lifecycle.openDemo.error) && (
              <div className="alert" role="alert">
                {error || agent.error || lifecycle.openDemo.error?.message}
                <AppTooltip label="关闭提示">
                  <button
                    onClick={() => {
                      setError("");
                      agent.clearError();
                      lifecycle.openDemo.reset();
                    }}
                    aria-label="关闭提示"
                  >
                    ×
                  </button>
                </AppTooltip>
              </div>
            )}
            <WorkspaceViews
              project={project}
              data={data}
              modelSource={
                projectModels.length === 1 ? projectModels[0] : undefined
              }
              modelSources={sourceCatalog.data ?? []}
              localIfcFile={localIfcFile}
              onLocalIfcFile={(file) =>
                setLocalIfc(file ? { project, file } : null)
              }
              selected={selected}
              selectedConstraint={selectedConstraint}
              selectedElement={selectedElement}
              selectedSpatialIssue={selectedSpatialIssue}
              onElementSelected={setSelectedElement}
              onSpatialIssueSelected={setSelectedSpatialIssue}
              tab={tab}
              busy={busy}
              detailsOpen={detailsOpen}
              inspectorView={inspectorView}
              perform={perform}
              onTab={navigate}
              onSelected={selectPackage}
              onConstraint={(id) => {
                setSelectedConstraint(id);
                setInspectorView("blocker");
                setDetailsOpen(true);
              }}
              onDetailsOpen={setDetailsOpen}
              onInspectorView={setInspectorView}
              onRecheck={() =>
                void perform(() => api.recheck(project), "重新检查已提交。")
              }
              onStructure={() => setStructureOpen(true)}
              onLinkBim={() => {
                agent.clearScope();
                setMappingContext(undefined);
                setMappingMode(true);
                setDetailsOpen(false);
                setTab("bim");
              }}
              onInvestigateWork={(context) => {
                agent.sourceContext(
                  context.sourceId,
                  context.revisionId,
                  context.revisionLabel,
                  context.fromRevisionId,
                  context.fromRevisionLabel,
                  context.elementIds,
                );
                setInspectorView("investigation");
                setDetailsOpen(true);
                void agent.startInvestigation("调查此资料版本与比较影响", {
                  ...context,
                  sourceName: sourceCatalog.data?.find(
                    (source) => source.source.id === context.sourceId,
                  )?.source.name,
                  workPackageId: null,
                });
              }}
              onInvestigateWorkPackage={(id) => {
                agent.clearScope();
                setInspectorView("investigation");
                setDetailsOpen(true);
                void agent.startInvestigation(
                  "调查当前工作包的变化、依据与处理建议",
                  { workPackageId: id, elementIds: [] },
                );
              }}
              projectSourceId={projectSourceId}
              onProjectSourceSelected={setProjectSourceId}
              mappingMode={mappingMode}
              mappingContext={mappingContext}
              report={agent.investigation.data}
              run={agent.currentRun.data}
              investigationContext={agent.reportContext}
              investigationProgress={
                <ContextRunProgress
                  run={
                    agent.currentRun.data?.category === "investigation"
                      ? agent.currentRun.data
                      : undefined
                  }
                  error={agent.error}
                  onRetry={() => void agent.retryRun()}
                />
              }
              investigationError={agent.error}
              onRetryInvestigation={() => void agent.retryRun()}
              onSourceContext={(...args) => {
                if (args[0]) agent.sourceContext(...args);
                else agent.clearScope();
              }}
              onBimContext={agent.bimContext}
              onAgentRun={agent.rememberRun}
              onInvestigateSource={(
                sourceId,
                revisionId,
                fromRevisionId,
                elementIds,
                revisionLabel,
                fromRevisionLabel,
              ) => {
                agent.sourceContext(
                  sourceId,
                  revisionId,
                  revisionLabel,
                  fromRevisionId,
                  fromRevisionLabel,
                  elementIds,
                );
                setInspectorView("investigation");
                setDetailsOpen(true);
                void agent.startInvestigation("查看模型版本变化及影响", {
                  sourceId,
                  fromRevisionId,
                  revisionId,
                  elementIds,
                });
              }}
              onInvestigateBim={(
                sourceId,
                revisionId,
                elementIds,
                fromRevisionId,
              ) => {
                agent.bimContext(
                  sourceId,
                  revisionId,
                  elementIds,
                  fromRevisionId,
                );
                setInspectorView("investigation");
                setDetailsOpen(true);
                void agent.startInvestigation("查看工作包与所选构件的影响", {
                  sourceId,
                  fromRevisionId,
                  revisionId,
                  workPackageId: selected,
                  elementIds,
                });
              }}
              onInspectImpact={(workPackageId, context) => {
                selectPackage(workPackageId);
                setSelectedElement(context.highlightIds?.[0] ?? "");
                setMappingMode(true);
                setMappingContext({ ...context, intent: "inspect" });
                if (context.sourceId && context.revisionId) {
                  agent.bimContext(
                    context.sourceId,
                    context.revisionId,
                    context.highlightIds ?? [],
                    context.fromRevisionId,
                    context.revisionLabel,
                    context.fromRevisionLabel,
                  );
                }
                setTab("bim");
              }}
            />
          </main>
        </Pane>
      </PaneSplit>
      {wp && eventDialog && (
        <EventComposer
          wp={wp}
          project={project}
          onCreate={createEvent}
          onClose={() => setEventDialog(false)}
        />
      )}
      {dialogs}
      <ProjectSettingsDialog
        open={settingsOpen}
        project={data.state.project}
        onOpenChange={setSettingsOpen}
        onStructure={() => setStructureOpen(true)}
      />
      <ProjectStructureDialog
        open={structureOpen}
        project={project}
        workspace={data}
        onOpenChange={setStructureOpen}
        onWorkPackage={(id) => {
          selectPackage(id);
          navigate("coordination");
        }}
      />
      <AppToaster />
    </div>
  );
}
