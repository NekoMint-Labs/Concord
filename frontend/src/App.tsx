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
  AppMenuLabel,
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
import { stageKey, stageObject, type StageObject } from "./app/stageContracts";
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
import { ConcordAgent, ConcordAgentSurface } from "./features/ConcordAgent";
import type { ConcordContext } from "./features/ConcordAgent";
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
  /* `null` means "no explicit choice yet": the navigator opens by default on the
   * surfaces where the object list *is* the work (Project, Browse) and stays closed on
   * Work, where the dock already carries the working list and the stage needs the width
   * for the evidence. A click sets an explicit choice that then persists. */
  const [navOpen, setNavOpen] = useState<boolean | null>(null);
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
  const prefs = useWorkspaceLayout();
  const [focusMode, setFocusMode] = useState(getFocusMode);
  useEffect(() => onFocusModeChange(setFocusMode), []);
  // The palette is keyed on the document, not only on the shell, because dialogs,
  // menus, popovers and tooltips are portalled out of the shell and would otherwise
  // resolve the light look inside a dark window.
  useEffect(() => {
    document.documentElement.dataset.concordLook =
      prefs.layout.look === "light" ? "light" : "dark";
  }, [prefs.layout.look]);
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
    if (next === "work") {
      agent.clearScope();
      setWorkOpen(true);
    }
    if (next !== tab || inspectorView === "investigation")
      setDetailsOpen(false);
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
  /* The navigator defaults to open everywhere except Work, where the dock already
   * carries the working list and the stage needs the width for the evidence. An
   * explicit toggle then wins over the default. */
  const navigatorOpen = !focusMode && (navOpen ?? tab !== "work");
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
      navigate("coordination");
      setInspectorView("investigation");
      setDetailsOpen(true);
    },
    onProject: () => navigate("project"),
  };

  const agentProps = {
    project,
    finding:
      tab === "work" && !!findingId
        ? findings.data?.find((item) => item.id === findingId)
        : undefined,
    context: agent.context,
    currentRun: agent.contextualRun,
    report: agent.contextualReport,
    onRun: agent.rememberRun,
    onInvestigate: (instruction: string, context: ConcordContext) =>
      agent.startInvestigation(instruction, context),
    onOpenReport: () => {
      if (tab === "work") navigate("coordination");
      setInspectorView("investigation");
      setDetailsOpen(true);
    },
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
          onNavigate={() => setNavOpen(!navigatorOpen)}
          navigationOpen={navigatorOpen}
          navigationLabel={
            tab === "work"
              ? "工作包"
              : tab === "browse" || tab === "history"
                ? "对象"
                : "项目对象"
          }
          onSearch={() => setCommandOpen(true)}
          busyLabel={busy ? "正在提交…" : undefined}
          /*
           * One disclosure on the identity block, not three separate menu buttons:
           * switching project, creating one, opening the structure and reading settings
           * are the same question - "what am I inside of".
           */
          fileMenu={
            <AppMenu
              label="项目菜单"
              className="concord-project-menu"
              trigger={<Icon name="chevronDown" size={14} />}
            >
              <AppMenuLabel>当前项目</AppMenuLabel>
              <AppMenuItem
                active
                onSelect={() => lifecycle.openProject(project)}
              >
                {projectName}
                <span className="menu-item-hint">
                  {project === "harbor-east"
                    ? "示例项目"
                    : data.state.project.timezone}
                </span>
              </AppMenuItem>
              {(lifecycle.recent ?? [])
                .filter((item) => item.id !== project)
                .map((item) => (
                  <AppMenuItem
                    key={item.id}
                    onSelect={() => lifecycle.openProject(item.id)}
                  >
                    {demoProjectName(item.id, item.name)}
                  </AppMenuItem>
                ))}
              <AppMenuSeparator />
              <AppMenuItem onSelect={() => setNewProjectOpen(true)}>
                新建项目…
              </AppMenuItem>
              <AppMenuItem onSelect={() => setOpenProjectOpen(true)}>
                打开项目…
              </AppMenuItem>
              <AppMenuSeparator />
              <AppMenuItem onSelect={() => setStructureOpen(true)}>
                项目结构
                <span className="menu-item-hint">区域、工作包与资料归属</span>
              </AppMenuItem>
              <AppMenuItem onSelect={() => setSettingsOpen(true)}>
                项目设置
                <span className="menu-item-hint">名称、时区与默认基线</span>
              </AppMenuItem>
            </AppMenu>
          }
          /*
           * Scope is the one global input: every surface below answers "within this
           * working context". It is a control, not a label, so it is shaped like one.
           */
          scope={
            <label
              className="concord-scope"
              htmlFor="workspace-package"
              title="当前工作包 — 面板、检索与助手的作用范围"
            >
              <span className="t-label">工作包</span>
              <select
                id="workspace-package"
                value={selected}
                onChange={(e) => selectPackage(e.target.value)}
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
            </label>
          }
          assistant={<ConcordAgent key={project} {...agentProps} />}
          action={
            wp && tab === "coordination" ? (
              <button
                type="button"
                className="concord-action"
                disabled={busy}
                onClick={() => setEventDialog(true)}
              >
                记录变更
              </button>
            ) : tab === "project" ? (
              <button
                type="button"
                className="concord-action"
                disabled={busy}
                onClick={() => setStructureOpen(true)}
              >
                添加资料
              </button>
            ) : tab === "work" && agent.investigation.data ? (
              <button
                type="button"
                className="concord-action"
                onClick={() => {
                  setInspectorView("investigation");
                  setDetailsOpen(true);
                }}
              >
                查看报告
              </button>
            ) : tab === "bim" && !mappingMode ? (
              <button
                type="button"
                className="concord-action"
                disabled={!!localIfcFile || !projectModels.length}
                title={
                  localIfcFile
                    ? "本地 IFC 仅用于预览；添加到项目并处理后才能关联"
                    : !projectModels.length
                      ? "请先添加并处理项目 IFC 模型"
                      : "把工作包构件关联到模型对象"
                }
                onClick={() => {
                  setMappingContext(undefined);
                  setMappingMode(true);
                }}
              >
                关联 BIM
              </button>
            ) : null
          }
          overflow={
            <AppMenu
              label="更多"
              className="concord-more"
              trigger={<Icon name="sliders" size={16} />}
            >
              <AppMenuLabel>项目状态</AppMenuLabel>
              <AppMenuItem onSelect={() => navigate("project")}>
                {latest ? `最新版本 R${latest.sequence}` : "尚无模型版本"}
                <span className="menu-item-hint">
                  {baseline
                    ? `已确认基线 B${baseline.sequence}`
                    : "尚未确认基线"}
                </span>
              </AppMenuItem>
              <AppMenuItem
                disabled={busy}
                onSelect={() =>
                  void perform(() => api.recheck(project), "重新检查已提交。")
                }
              >
                提交重新检查
                <span className="menu-item-hint">
                  重新核对当前项目资料与判断
                </span>
              </AppMenuItem>
              <AppMenuSeparator />
              <AppMenuLabel>工作区</AppMenuLabel>
              <AppMenuItem onSelect={() => navigate("bim")}>
                模型工作区
              </AppMenuItem>
              <AppMenuItem onSelect={() => navigate("documents")}>
                文档工作区
              </AppMenuItem>
              <AppMenuItem onSelect={() => setStructureOpen(true)}>
                项目结构…
              </AppMenuItem>
              <AppMenuSeparator />
              <AppMenuItem
                active={controlsOpen}
                onSelect={() => setControlsOpen((value) => !value)}
              >
                {controlsOpen ? "收起控制面板" : "控制面板…"}
                <span className="menu-item-hint">全部工作区控件与演示操作</span>
              </AppMenuItem>
              <AppMenuItem onSelect={() => setLayoutOpen(true)}>
                工作区布局…
                <span className="menu-item-hint">面板位置、尺寸与外观</span>
              </AppMenuItem>
              <AppMenuItem onSelect={toggleFocusMode} hint="F">
                专注模式
                <span className="menu-item-hint">
                  隐藏全部 chrome，只留当前工作区
                </span>
              </AppMenuItem>
            </AppMenu>
          }
        />
      )}
      {controlsOpen && !focusMode && (
        <div className="concord-band" aria-label="控制面板">
          <div className="concord-band-scroll">
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
            flexShrink: 0,
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
            attention={pendingFindings}
            onProjectSettings={() => setSettingsOpen(true)}
            onLayout={() => setLayoutOpen(true)}
            onDiagnostics={() => navigate("capabilities")}
          />
        </nav>
        {tab === "work" ? (
          <FindingWorkbench
            prefs={prefs}
            key={project}
            project={project}
            open={workOpen}
            agent={<ConcordAgentSurface {...agentProps} />}
            onClose={() => {
              setWorkOpen(false);
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
      {/*
       * The readout strip. It is the instrument's own instrumentation: mode, scope and
       * project state, in the same dark material as the bar, so the frame closes around
       * the workspace instead of trailing off in a third colour. Facts only - every verb
       * here also exists somewhere deliberate.
       */}
      <footer className="concord-status" aria-label="工作区状态">
        <span className="concord-status-mode">{surfaceLabels[tab] ?? tab}</span>
        <span className="concord-status-item">
          <span className="t-label">范围</span>
          {wp
            ? `${demoAreaName(
                wp.area_id,
                data.state.areas.find((area) => area.id === wp.area_id)?.name ??
                  wp.area_id,
              )} · ${demoWorkPackageName(wp.id, wp.name)}`
            : "未选择工作包"}
        </span>
        <span className="concord-status-item">
          <span className="t-label">基线</span>
          {baseline ? `B${baseline.sequence} 已确认` : "尚未确认基线"}
        </span>
        <span className="concord-status-item">
          <span className="t-label">版本</span>
          {latest ? `R${latest.sequence}` : "—"}
        </span>
        {busy && (
          <span className="concord-status-busy" role="status">
            正在提交…
          </span>
        )}

        <span className="concord-status-tail" aria-live="polite">
          <span>{workNavigatorItems.length} 工作包</span>
          <span>{(sourceCatalog.data ?? []).length} 资料</span>
          {pendingFindings > 0 ? (
            <span className="concord-status-attention">
              {pendingFindings} 项待人工判断
            </span>
          ) : null}
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
