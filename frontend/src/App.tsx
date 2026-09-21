import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine } from "lucide-react";
import { api, isDesktop, setToken, type DTO } from "./api/client";
import { Button } from "./components/ui/button";
import { icon } from "./components/ui/icon";
import { AppToaster } from "./components/ui/AppToaster";
import { AppTooltip } from "./components/ui/AppTooltip";
import { Timeline } from "./features/Timeline";
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
import { useConcordAgent } from "./features/useConcordAgent";
import type { BimMappingContext } from "./features/BimMappingWorkspace";

export function App() {
  const cache = useQueryClient();
  const lifecycle = useProjectLifecycle();
  const project = lifecycle.project;
  const [selected, setSelected] = useState("");
  const [selectedConstraint, setSelectedConstraint] = useState("");
  const [tab, setTab] = useState<WorkspaceTab>("coordination");
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
  const { workspace } = useWorkspace(project);
  const { perform, busy, error, setError } = useWorkspaceMutation();
  const profile = useQuery({ queryKey: ["profile"], queryFn: api.profile });
  const sourceCatalog = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
    enabled: !!project,
  });
  const data = workspace.data;
  const wp = data?.state.work_packages.find((item) => item.id === selected);
  const agent = useConcordAgent({
    project,
    projectName: data?.state.project.name ?? project,
    workPackageId: selected || undefined,
    sources: sourceCatalog.data,
  });

  useEffect(() => {
    setSelected("");
    setSelectedConstraint("");
    setDetailsOpen(false);
    setMappingMode(false);
    setMappingContext(undefined);
  }, [project]);
  useEffect(() => {
    if (!data) return;
    if (!data.state.work_packages.length) {
      setSelected("");
      setTab("coordination");
      return;
    }
    if (!data.state.work_packages.some((item) => item.id === selected))
      setSelected(data.state.work_packages[0].id);
  }, [data, selected]);

  function createEvent(event: DTO<"ProjectEvent-Input">) {
    setSelected(event.work_package_id);
    setSelectedConstraint("");
    setTab("coordination");
    setDetailsOpen(false);
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
      <StartupView
        pending={workspace.isPending}
        message={workspace.error?.message}
        desktop={isDesktop}
        onReconnect={() => void cache.invalidateQueries()}
        onToken={(next) => {
          setToken(next);
          void cache.invalidateQueries();
        }}
      />
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
          defaultSize="232px"
          minSize="200px"
          maxSize="320px"
          onResize={(size) => setNavOpen(size.inPixels > 0)}
        >
          <ProjectSidebar
            data={data}
            project={project}
            projects={lifecycle.projects.data}
            recent={lifecycle.recent}
            selected={selected}
            collapsed={!navOpen}
            onCollapse={() => {
              navPanel.current?.collapse();
              setNavOpen(false);
            }}
            onProject={lifecycle.openProject}
            onNewProject={() => setNewProjectOpen(true)}
            onOpenProject={() => setOpenProjectOpen(true)}
            onProjectSettings={() => setSettingsOpen(true)}
            onStructure={() => setStructureOpen(true)}
            onLinkBim={(workPackageId) => {
              setSelected(workPackageId);
              setMappingMode(true);
              setMappingContext(undefined);
              setTab("bim");
            }}
            onSelect={(id) => {
              setSelected(id);
              setSelectedConstraint("");
              setDetailsOpen(false);
            }}
          />
        </Pane>
        <PaneDivider label="调整导航宽度" disabled={!navOpen} />
        <Pane className="main-pane pane-stack">
          <main className="main-shell">
            <WorkspaceHeader
              data={data}
              wp={wp}
              navCollapsed={!navOpen}
              onToggleNav={() => {
                navPanel.current?.expand();
                setNavOpen(true);
              }}
            >
              {wp && (
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
              <ConcordAgent
                project={project}
                context={agent.context}
                currentRun={agent.currentRun.data}
                report={agent.investigation.data}
                onRun={agent.rememberRun}
                onOpenReport={() => {
                  setInspectorView("investigation");
                  setDetailsOpen(true);
                }}
              />
              <AdvancedMenu
                tab={tab}
                onTab={setTab}
                project={project}
                busy={busy}
                profile={profile.data}
                createEvent={createEvent}
                onReset={() => {
                  setSelectedConstraint("");
                  setDetailsOpen(false);
                  setTab("coordination");
                  void perform(api.reset, "演示项目已重置。");
                }}
              />
            </WorkspaceHeader>
            {(error || agent.error) && (
              <div className="alert" role="alert">
                {error || agent.error}
                <AppTooltip label="关闭提示">
                  <button
                    onClick={() => {
                      setError("");
                      agent.clearError();
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
              selected={selected}
              selectedConstraint={selectedConstraint}
              tab={tab}
              busy={busy}
              detailsOpen={detailsOpen}
              inspectorView={inspectorView}
              perform={perform}
              onTab={(next) => {
                if (next !== "bim") setMappingMode(false);
                setTab(next);
              }}
              onSelected={setSelected}
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
              mappingMode={mappingMode}
              mappingContext={mappingContext}
              report={agent.investigation.data}
              run={agent.currentRun.data}
              investigationContext={agent.context}
              onSourceContext={agent.sourceContext}
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
                );
                void agent.startInvestigation("调查当前工程来源版本", {
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
                void agent.startInvestigation(
                  "调查当前工作包与选中的 BIM 构件",
                  {
                    sourceId,
                    fromRevisionId,
                    revisionId,
                    workPackageId: selected,
                    elementIds,
                  },
                );
              }}
              onInspectImpact={(workPackageId, context) => {
                setSelected(workPackageId);
                setMappingMode(true);
                setMappingContext(context);
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
            <Timeline
              run={agent.activeRun ? agent.currentRun.data : data.run}
              perform={perform}
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
          setSelected(id);
          setTab("coordination");
        }}
      />
      <AppToaster />
    </div>
  );
}
