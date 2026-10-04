import { useEffect, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isDesktop, setToken, type DTO } from "./api/client";
import { Button } from "./components/ui/button";
import { icon } from "./components/ui/icon";
import { AppToaster } from "./components/ui/AppToaster";
import { AppTooltip } from "./components/ui/AppTooltip";
import {
  AppMenu,
  AppMenuItem,
  AppMenuSeparator,
} from "./components/ui/AppMenu";
import { EventComposer } from "./features/EventComposer";
import type { WorkspaceInspectorView } from "./features/InvestigationInspector";
import { AdvancedMenu } from "./app/AdvancedMenu";
import { ProjectSidebar } from "./app/ProjectSidebar";
import { StartupView } from "./app/StartupView";
import {
  WorkspaceChrome,
  WorkspaceCommandMenu,
  WorkspaceNavigator,
} from "./app/WorkspaceChrome";
import { WorkspaceViews } from "./app/WorkspaceViews";
import { browseNavigatorItems } from "./app/BrowseStage";
import { projectNavigatorItems } from "./app/ProjectStage";
import {
  stageKey,
  stageObject,
  type StageObject,
} from "./app/stageContracts";
import type { WorkspaceTab } from "./app/destinations";
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
import {
  demoAreaName,
  demoProjectName,
  demoWorkPackageName,
} from "./ui/demo/demoPresentation";
import { FindingWorkbench } from "./features/FindingWorkbench";
import { findingStateLabels } from "./features/WorkPanel";
import { useEngineeringFindings } from "./features/useEngineeringFindings";
import type { ExplorerEntry } from "./features/ProjectExplorer";
import { Icon } from "./vendor/opentakeoff/brand/icons";
import {
  DockHandle,
  useWorkspaceLayout,
  WorkspaceLayoutDialog,
} from "./layout/WorkspaceLayout";
import {
  getFocusMode,
  onFocusModeChange,
  toggleFocusMode,
} from "./layout/focusMode";

const surfaceLabels: Record<string, string> = {
  work: "工作与审核",
  browse: "检索浏览",
  project: "项目资料",
  coordination: "工作包详情",
  history: "版本历史",
  settings: "项目设置",
  "work-packages": "工作包",
  sources: "模型与版本",
  bim: "模型",
  impact: "变更影响",
  packages: "空间问题",
  documents: "文档",
  operations: "活动与运行",
  gis: "现场地图",
  capabilities: "能力诊断",
};

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
  const [findingId, setFindingId] = useState("");
  const [findingEvidenceId, setFindingEvidenceId] = useState<string>();
  /* One selected engineering object for the whole workspace: the navigator sets
   * it, the central stage renders it and the contextual inspector describes it. */
  const [selectedObjectKey, setSelectedObjectKey] = useState("");
  const stageSelection = stageObject(selectedObjectKey);
  const findings = useEngineeringFindings(project);
  const [commandOpen, setCommandOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(true);
  const [workButtonRef, setWorkButtonRef] = useState<HTMLButtonElement | null>(
    null,
  );
  const prefs = useWorkspaceLayout();
  const [focusMode, setFocusMode] = useState(getFocusMode);
  useEffect(() => onFocusModeChange(setFocusMode), []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]'))
        return;
      if (
        event
          .composedPath()
          .some(
            (target) =>
              target instanceof HTMLElement &&
              (target.matches(
                "input, textarea, select, [contenteditable=true]",
              ) ||
                target.isContentEditable),
          )
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        toggleFocusMode();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
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
  const modelSource = projectModels.length === 1 ? projectModels[0] : undefined;
  const revisions = useQuery({
    queryKey: ["source-revisions", project, modelSource?.source.id],
    queryFn: () => api.sourceRevisions(project, modelSource!.source.id),
    enabled: !!modelSource,
  });
  const latest = revisions.data?.find(
    (item) => item.id === modelSource?.latest_revision_id,
  );
  const baselines = useQuery({
    queryKey: ["baselines", project],
    queryFn: () => api.baselines(project),
    enabled: !!modelSource,
  });
  const baseline = baselines.data?.at(-1);
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
    }    if (!data.state.work_packages.some((item) => item.id === selected)) {
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

  /* The Work destination opens on a real finding: the docked panel shows one
   * list with one selection, and the stage already shows that Finding's
   * Evidence. Landing on an empty panel is not a product state. */
  useEffect(() => {
    if (tab !== "work" || findingId) return;
    const first = findings.data?.[0];
    if (first) setFindingId(first.id);
  }, [tab, findingId, findings.data]);

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

  function selectStageObject(next: StageObject | null) {
    setSelectedObjectKey(next ? stageKey(next) : "");
    setDetailsOpen(!!next);
  }

  function navigate(next: WorkspaceTab) {
    /* A destination is a work mode with its own overview: switching modes drops
     * the previously selected object instead of carrying a foreign surface
     * across destinations. */
    if (next !== tab) setSelectedObjectKey("");
    /* Destinations are work modes. The old standalone Source / History / Work
     * package pages are gone: those objects are selected in the navigator and
     * rendered by the Browse and Project stages. */
    if (next === "sources" || next === "history" || next === "browse") {
      const first = sourceCatalog.data?.[0]?.source.id;
      selectStageObject(first ? { kind: "source", id: first } : null);
      agent.clearScope();
      setMappingMode(false);
      setTab("browse");
      return;
    }
    if (next === "work-packages") {
      selectStageObject(
        selected ? { kind: "work-package", id: selected } : null,
      );
      setMappingMode(false);
      setTab("project");
      return;
    }
    if (next === "coordination") {
      selectStageObject(
        selected ? { kind: "work-package", id: selected } : null,
      );
      setTab("project");
      return;
    }
    if (next === "settings") {
      setSettingsOpen(true);
      return;
    }
    if (next !== "bim") setMappingMode(false);
    if (next === "work") agent.clearScope();
    if (next !== tab || inspectorView === "investigation") setDetailsOpen(false);
    setTab(next);
  }

  function openFinding(id: string, evidenceId?: string) {
    setFindingId(id);
    setFindingEvidenceId(evidenceId);
    navigate("work");
    if (!workOpen) setWorkOpen(true);
    // Evidence loading, not the first dependency, selects the exact Agent context.
    agent.clearScope();
    setDetailsOpen(false);
  }

  function createEvent(event: DTO<"ProjectEvent-Input">) {
    selectPackage(event.work_package_id);
    navigate("coordination");
    setEventDialog(false);
    void perform(() => api.events(project, event), "变更已记录。");
  }

  const investigateWork = (context: {
    sourceId: string;
    revisionId: string;
    fromRevisionId?: string;
    elementIds?: string[];
    revisionLabel?: string;
    fromRevisionLabel?: string;
  }) => {
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
  };

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

  const findingEntries: ExplorerEntry[] = (findings.data ?? []).flatMap(
    (finding) => [
      {
        target: { kind: "finding" as const, id: finding.id },
        title: finding.title,
        meta: finding.what_changed,
        type: "工程判断",
        state: findingStateLabels[finding.state],
        search: `${finding.id} ${finding.work_package_id} ${finding.what_changed}`,
      },
      ...finding.evidence_ids.map((id): ExplorerEntry => ({
        target: { kind: "finding", id: finding.id, evidenceId: id },
        title: "工程依据",
        meta: finding.title,
        type: "工程依据",
        search: id,
      })),
    ],
  );

  const projectName = demoProjectName(project, data.state.project.name);
  const pendingFindings = (findings.data ?? []).filter(
    (finding) => finding.state === "PROPOSED",
  ).length;
  /* The navigator is contextual: the same donor WorkspaceNavigator lists work
   * packages on Work, engineering objects on Browse and the project's own
   * sources/versions/packages on Project. There is no second object list. */
  const workNavigatorItems = data.state.work_packages.map((item) => ({
    key: `work-package:${item.id}`,
    label: demoWorkPackageName(item.id, item.name),
    file: demoAreaName(
      item.area_id,
      data.state.areas.find((area) => area.id === item.area_id)?.name ??
        item.area_id,
    ),
    count: (findings.data ?? []).filter(
      (finding) => finding.work_package_id === item.id,
    ).length,
  }));
  const navigator =
    tab === "browse" || tab === "history"
      ? {
          title: "工程对象",
          label: "工程对象导航",
          placeholder: "查找资料、版本或文档…",
          empty: "当前项目还没有可浏览的工程对象。",
          footerLabel: "在项目中查看资料",
          onFooter: () => navigate("project"),
          items: browseNavigatorItems({
            data,
            sources: sourceCatalog.data ?? [],
            findings: findings.data,
          }),
        }
      : tab === "work"
        ? {
            title: "工作包",
            label: "工作包导航",
            placeholder: "查找工作包…",
            empty: "当前项目还没有工作包。",
            footerLabel: "打开项目结构",
            onFooter: () => setStructureOpen(true),
            items: workNavigatorItems,
          }
        : {
            title: "项目对象",
            label: "项目对象导航",
            placeholder: "查找资料、版本或工作包…",
            empty: "当前项目还没有资料或工作包。",
            footerLabel: "打开项目结构",
            onFooter: () => setStructureOpen(true),
            items: projectNavigatorItems({
              data,
              sources: sourceCatalog.data ?? [],
            }),
          };
  const navigatorOpen = !focusMode && (navOpen || tab === "browse");
  const workSurface = {
    workspace: data,
    sources: sourceCatalog.data ?? [],
    report: agent.investigation.data,
    run: agent.currentRun.data,
    onSource: (id: string) => {
      selectStageObject({ kind: "source", id });
      setTab("browse");
    },
    onInvestigate: investigateWork,
    onPackage: (id: string) => {
      selectPackage(id);
      selectStageObject({ kind: "work-package", id });
      setTab("project");
    },
    onModels: () => navigate("browse"),
    onRecheck: () =>
      void perform(() => api.recheck(project), "重新检查已提交。"),
    onReport: () => {
      setInspectorView("investigation");
      setDetailsOpen(true);
    },
    onProject: () => navigate("project"),
  };

  return (
    /*
     * The workspace shell is the OpenTakeoff composition: one viewport-tall flex
     * column, the calm header and context band, then the docked canvas row
     * (`data-canvas-workspace`) holding the navigator, the tool rail, the primary
     * working surface and the docked Work and review panel. The classes and data
     * attributes are the donor's; Concord owns the data and the callbacks.
     */
    <div
      className="app-shell workspace-calm premium-workspace"
      data-workspace-look={prefs.layout.look}
      aria-busy={busy}
      onDragOver={(e) => e.preventDefault()}
      style={
        {
          position: "relative",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          "--workspace-glow-strength": prefs.layout.backlight / 100,
        } as CSSProperties
      }
    >
      {!focusMode && (
        <WorkspaceChrome
          title={projectName}
          subtitle={`${surfaceLabels[tab] ?? tab}${wp ? ` · ${demoWorkPackageName(wp.id, wp.name)}` : ""}`}
          onOpen={() => setOpenProjectOpen(true)}
          onNavigate={() => setNavOpen((value) => !value)}
          navigationOpen={navOpen}
          navigationLabel={
            tab === "work"
              ? "工作包"
              : tab === "browse" || tab === "history"
                ? "对象"
                : "项目对象"
          }
          onWork={() => setWorkOpen((value) => !value)}
          workOpen={workOpen}
          workButtonRef={setWorkButtonRef}
          pending={pendingFindings}
          running={agent.contextualRun?.status === "RUNNING"}
          onReport={() => {
            navigate("coordination");
            setInspectorView("investigation");
            setDetailsOpen(true);
          }}
          onFocus={toggleFocusMode}
          onControls={() => setControlsOpen((value) => !value)}
          controlsOpen={controlsOpen}
          onSearch={() => setCommandOpen(true)}
          fileMenu={
            <AppMenu label="项目" trigger={<span>项目</span>}>
              <AppMenuItem
                active
                onSelect={() => lifecycle.openProject(project)}
              >
                {projectName}
                {project === "harbor-east" && " · 示例项目"}
              </AppMenuItem>
              <AppMenuSeparator />
              <AppMenuItem onSelect={() => setNewProjectOpen(true)}>
                新建项目
              </AppMenuItem>
              <AppMenuItem onSelect={() => setOpenProjectOpen(true)}>
                打开项目…
              </AppMenuItem>
              <AppMenuItem onSelect={() => setSettingsOpen(true)}>
                项目设置
              </AppMenuItem>
              <AppMenuItem onSelect={() => setStructureOpen(true)}>
                项目结构
              </AppMenuItem>
              <AppMenuSeparator />
              <AppMenuItem onSelect={() => setWorkOpen((value) => !value)}>
                工作与审核面板
              </AppMenuItem>
              <AppMenuItem onSelect={() => setLayoutOpen(true)}>
                工作区布局…
              </AppMenuItem>
            </AppMenu>
          }
          pinControl={
            <ConcordAgent
              key={project}
              project={project}
              finding={
                tab === "work" && !!findingId
                  ? findings.data?.find((item) => item.id === findingId)
                  : undefined
              }
              context={agent.context}
              currentRun={agent.contextualRun}
              report={agent.contextualReport}
              onRun={agent.rememberRun}
              onInvestigate={(instruction, context) =>
                agent.startInvestigation(instruction, context)
              }
              onOpenReport={() => {
                if (tab === "work") navigate("coordination");
                setInspectorView("investigation");
                setDetailsOpen(true);
              }}
            />
          }
          layoutMenu={
            <button
              type="button"
              onClick={() => setLayoutOpen(true)}
              title="排列面板、锁定位置并保存布局"
            >
              <Icon name="sliders" size={16} />
              布局
            </button>
          }
          conditionControl={
            <>
              <label
                className="calm-condition-label"
                htmlFor="workspace-package"
              >
                工作包
              </label>
              <select
                id="workspace-package"
                value={selected}
                onChange={(e) => selectPackage(e.target.value)}
                title="当前工作包 — 面板与检索的作用范围"
              >
                {!data.state.work_packages.length && (
                  <option value="">无工作包</option>
                )}
                {data.state.work_packages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {demoWorkPackageName(item.id, item.name)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setStructureOpen(true)}
                title="打开项目结构"
                aria-label="打开项目结构"
              >
                <Icon name="plus" size={14} />
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                title="当前工作包与项目的属性"
              >
                属性
              </button>
            </>
          }
          history={
            <button
              type="button"
              onClick={() =>
                void perform(() => api.recheck(project), "重新检查已提交。")
              }
              title="提交重新检查 — 重新核对当前项目资料"
            >
              <Icon name="revisions" size={16} />
              重新检查
            </button>
          }
          aids={
            <>
              <button
                type="button"
                aria-pressed={tab === "bim"}
                onClick={() => navigate("bim")}
                title="在模型中查看当前工作包"
              >
                <Icon name="target" size={15} />
                模型
              </button>
              <button
                type="button"
                aria-pressed={tab === "documents"}
                onClick={() => navigate("documents")}
                title="在文档中查看当前工作包"
              >
                <Icon name="document" size={15} />
                文档
              </button>
            </>
          }
          action={
            <>
              {wp && tab === "coordination" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEventDialog(true)}
                >
                  记录变更
                </button>
              )}
              {wp && tab === "bim" && !mappingMode && (
                <button
                  type="button"
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
                  关联 BIM
                </button>
              )}
            </>
          }
          scaleMenu={
            latest ? (
              <button
                type="button"
                onClick={() => navigate("sources")}
                title="当前模型版本与已确认基线"
              >
                最新版本 R{latest.sequence}
                {baseline ? ` · 基线 B${baseline.sequence}` : " · 尚未确认基线"}
              </button>
            ) : null
          }
        />
      )}
      {controlsOpen && !focusMode && (
        <div className="calm-context" aria-label="所有控件">
          <div className="calm-context-scroll">
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
          </div>
        </div>
      )}
      {(error || agent.error || lifecycle.openDemo.error) && (
        <div className="alert" role="alert">
          {error || agent.error || lifecycle.openDemo.error?.message}
          <AppTooltip label="关闭提示">
            <Button
              variant="ghost"
              onClick={() => {
                setError("");
                agent.clearError();
                lifecycle.openDemo.reset();
              }}
              aria-label="关闭提示"
            >
              ×
            </Button>
          </AppTooltip>
        </div>
      )}
      <div
        data-canvas-workspace
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          minHeight: 0,
          position: "relative",
        }}
      >
        <WorkspaceNavigator
          open={navigatorOpen}
          title={navigator.title}
          label={navigator.label}
          placeholder={navigator.placeholder}
          empty={navigator.empty}
          emptySearch="没有匹配的对象。"
          footerLabel={navigator.footerLabel}
          items={navigator.items}
          current={
            tab === "work" ? `work-package:${selected}` : selectedObjectKey
          }
          onSelect={(key) => {
            const next = stageObject(key);
            if (next?.kind === "work-package") selectPackage(next.id);
            if (tab === "work") {
              setTab("project");
              selectStageObject(next);
              return;
            }
            selectStageObject(next);
            if (tab !== "browse" && tab !== "project") setTab("project");
          }}
          onClose={() => setNavOpen(false)}
          onFooter={navigator.onFooter}
          dockSide={prefs.layout.sheets}
          width={prefs.layout.sheetWidth}
          dockHandle={
            <DockHandle
              dock="sheets"
              label="对象导航"
              locked={prefs.layout.locked}
              onDrag={() => {}}
              onMove={prefs.move}
            />
          }
        />
        <nav
          data-tool-rail
          data-dock-side={prefs.layout.tools}
          role="toolbar"
          aria-label="工作区"
          style={{
            order: prefs.layout.tools === "right" ? 30 : -30,
            width: "var(--rail-w)",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--sp-1)",
            paddingTop: "var(--sp-2)",
            borderRight: "1px solid var(--ink-faint)",
            background: "var(--paper-bright)",
            overflowY: "auto",
            overflowX: "visible",
          }}
        >
          <DockHandle
            dock="tools"
            label="工作区导航"
            locked={prefs.layout.locked}
            onDrag={() => {}}
            onMove={prefs.move}
          />
          <ProjectSidebar
            tab={tab}
            onTab={navigate}
            onProjectSettings={() => setSettingsOpen(true)}
          />
        </nav>
        {tab === "work" ? (
          <FindingWorkbench
            prefs={prefs}
            key={project}
            project={project}
            open={workOpen}
            onClose={() => {
              setWorkOpen(false);
              workButtonRef?.focus();
            }}
            selectedId={findingId}
            evidenceId={findingEvidenceId}
            onSelect={(id) => openFinding(id)}
            onEvidenceContext={(evidence) => {
              if (!evidence?.source_revision_id) {
                agent.clearScope();
                return;
              }
              agent.sourceContext(
                evidence.source_id,
                evidence.source_revision_id,
                undefined,
                undefined,
                undefined,
                evidence.viewer_target?.kind === "bim"
                  ? (evidence.viewer_target.global_ids ?? [])
                  : [],
              );
            }}
            work={workSurface}
          />
        ) : (
          <main
            className="workspace-stage"
            aria-label={surfaceLabels[tab] ?? tab}
          >
            <WorkspaceViews
              onOpenFinding={openFinding}
              stage={stageSelection}
              onStage={selectStageObject}
              project={project}
              data={data}
              modelSource={modelSource}
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
              detailsOpen={detailsOpen || tab === "browse" || tab === "project"}
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
              onInvestigateWork={investigateWork}
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
        )}
      </div>
      {/* The donor's instrument strip (TakeoffCanvas.jsx `footer.ink-panel.ticks`),
       * bound to the Concord workspace verbs and counts. */}
      <footer
        className="ink-panel ticks"
        style={{
          height: "var(--status-h)",
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 14px",
          fontFamily: "var(--f-mono)",
          fontSize: "var(--fs-xs)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          overflow: "hidden",
          userSelect: "none",
        }}
      >
        <span style={{ color: "var(--status-acc)" }}>
          {surfaceLabels[tab] ?? tab}
        </span>
        <span style={{ opacity: 0.25 }} aria-hidden="true">
          |
        </span>
        <span aria-hidden="true" style={{ minWidth: 150 }}>
          {wp
            ? `${demoAreaName(
                wp.area_id,
                data.state.areas.find((area) => area.id === wp.area_id)?.name ??
                  wp.area_id,
              )} · ${demoWorkPackageName(wp.id, wp.name)}`
            : "未选择工作包"}
        </span>
        <span style={{ opacity: 0.25 }} aria-hidden="true">
          |
        </span>
        <span>
          {latest ? `最新版本 R${latest.sequence}` : "尚无模型版本"}
          {baseline ? ` · 基线 B${baseline.sequence}` : " · 尚未确认基线"}
        </span>
        {busy && <span style={{ color: "var(--c-warning)" }}>正在提交…</span>}
        <span
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 12,
            opacity: 0.75,
          }}
          aria-live="polite"
        >
          <span>{workNavigatorItems.length} 工作包</span>
          <span>{(sourceCatalog.data ?? []).length} 资料</span>
        </span>
      </footer>
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
      <WorkspaceLayoutDialog
        open={layoutOpen}
        onClose={() => setLayoutOpen(false)}
        prefs={prefs}
      />
      <WorkspaceCommandMenu
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        actions={[
          ...(
            [
              ["work", "工作 · Work"],
              ["project", "项目 · Project"],
              ["browse", "浏览 · Browse"],
              ["bim", "打开模型工作区"],
              ["documents", "打开文档工作区"],
            ] as const
          ).map(([id, label]) => ({
            id,
            label,
            group: "工作台",
            run: () => navigate(id),
          })),
          ...findingEntries.map((entry) => ({
            id: `finding-${entry.target.id}-${entry.target.kind === "finding" ? (entry.target.evidenceId ?? "") : ""}`,
            label: entry.title,
            group: entry.type,
            run: () => {
              if (entry.target.kind === "finding")
                openFinding(entry.target.id, entry.target.evidenceId);
            },
          })),
          {
            id: "layout",
            label: "工作台布局偏好",
            group: "仅保存在本机",
            run: () => setLayoutOpen(true),
          },
          {
            id: "focus",
            label: "切换专注模式",
            shortcut: "F",
            run: toggleFocusMode,
          },
          ...data.state.work_packages.map((item) => ({
            id: `package-${item.id}`,
            label: demoWorkPackageName(item.id, item.name),
            group: "工作包",
            run: () => {
              selectPackage(item.id);
              navigate("coordination");
            },
          })),
          ...(sourceCatalog.data ?? []).map((item) => ({
            id: `source-${item.source.id}`,
            label: item.source.name,
            group: "资料",
            run: () => {
              navigate("project");
              setProjectSourceId(item.source.id);
            },
          })),
        ]}
      />
      <AppToaster />
    </div>
  );
}
