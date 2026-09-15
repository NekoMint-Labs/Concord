import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine } from "lucide-react";
import { api, isDesktop, setToken, type DTO } from "./api/client";
import { Button } from "./components/ui/button";
import { icon } from "./components/ui/icon";
import { AppToaster } from "./components/ui/AppToaster";
import { AppTooltip } from "./components/ui/AppTooltip";
import { Timeline } from "./features/Timeline";
import { EventComposer } from "./features/EventComposer";
import type { InspectorView } from "./features/Inspector";
import { Pane, PaneDivider, PaneSplit, usePanelRef } from "./layout/PaneSplit";
import { AdvancedMenu } from "./app/AdvancedMenu";
import { ProjectSidebar } from "./app/ProjectSidebar";
import { StartupView } from "./app/StartupView";
import { WorkspaceHeader } from "./app/WorkspaceHeader";
import { WorkspaceViews, type WorkspaceTab } from "./app/WorkspaceViews";
import { useWorkspace } from "./app/useWorkspace";
import { useWorkspaceMutation } from "./app/useWorkspaceMutation";

export function App() {
  const cache = useQueryClient();
  const [project, setProject] = useState("harbor-east");
  const [selected, setSelected] = useState("WP-200");
  const [selectedConstraint, setSelectedConstraint] = useState("");
  const [tab, setTab] = useState<WorkspaceTab>("coordination");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inspectorView, setInspectorView] = useState<InspectorView>("blocker");
  const [eventDialog, setEventDialog] = useState(false);
  /*
   * Navigation is a frontend working posture, not project state: it says how much
   * room this user wants for the work plane right now, changes nothing about the
   * project, and is deliberately not sent anywhere.
   *
   * The column is a real pane now (`navPanel` below), so the posture is expressed
   * with the pane's own collapse rather than with a CSS margin: the library keeps
   * the width the user last chose in memory while the column is collapsed, and
   * `expand()` returns to it, which is the session-only restore this pass wanted.
   * Nothing is written to storage - a width remembered across launches is a
   * preference, and preferences are their own pass.
   */
  const [navOpen, setNavOpen] = useState(true);
  const navPanel = usePanelRef();
  const { projects, workspace } = useWorkspace(project);
  const { perform, busy, error, setError } = useWorkspaceMutation();
  /*
   * Demo fixture tools are shown for the local demonstration/development profile
   * only, and only once that profile has actually answered - the gate and its
   * reasoning live with the menu itself (frontend/src/app/AdvancedMenu.tsx).
   */
  const profile = useQuery({ queryKey: ["profile"], queryFn: api.profile });
  const data = workspace.data;

  function createEvent(event: DTO<"ProjectEvent-Input">) {
    setSelected(event.work_package_id);
    setSelectedConstraint("");
    setTab("coordination");
    setDetailsOpen(false);
    setEventDialog(false);
    void perform(() => api.events(project, event), "变更已记录。");
  }

  const wp =
    data?.state.work_packages.find((item) => item.id === selected) ??
    data?.state.work_packages[0];
  /*
   * The window before the workspace exists. A packaged desktop build starts its
   * own local service and is handed a per-launch credential, so the failure copy
   * and the recovery actions are product language, and the technical detail -
   * including the manual credential entry browser development still needs - sits
   * behind the diagnostics (frontend/src/app/StartupView.tsx).
   */
  if (!data || !wp)
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
      {/*
        The navigation column and the work plane are one adjustable pane split -
        the same boundary the Inspector, the document source list and the BIM
        element list already use (frontend/src/layout/PaneSplit.tsx). A column the
        user works in beside other columns that resize is a column the user can
        size.

        200 / 232 / 320 is the range those numbers were checked against: 232 is
        the width the column was designed around, 200 is the floor at which its
        rows - a package name above its id and discipline - still read without
        truncating, and 320 is where the column starts competing with the work
        plane at the narrowest window this product supports.

        `collapsible` makes that same pane the collapse: the control in the
        column's own header closes it to nothing, and the work plane takes the
        whole window.
      */}
      <PaneSplit id="shell">
        <Pane
          id="sidebar-pane"
          className="sidebar-pane"
          panelRef={navPanel}
          collapsible
          collapsedSize="0px"
          defaultSize="232px"
          minSize="200px"
          maxSize="320px"
          /*
           * The pane is the source of truth for whether the column is on screen: a
           * drag that closes it is a collapse like any other, so the column's own
           * `inert` state and the divider's place in the tab order have to follow
           * the pointer as well as the button.
           */
          onResize={(size) => setNavOpen(size.inPixels > 0)}
        >
          <ProjectSidebar
            data={data}
            project={project}
            projects={projects.data}
            selected={wp.id}
            collapsed={!navOpen}
            onCollapse={() => {
              navPanel.current?.collapse();
              setNavOpen(false);
            }}
            onProject={setProject}
            onSelect={(id) => {
              setSelected(id);
              setSelectedConstraint("");
              setDetailsOpen(false);
            }}
          />
        </Pane>
        {/*
          The divider stays mounted in both states and is disabled while the column
          is collapsed. The library takes a disabled separator out of the tab order,
          which is the guarantee needed here - there is no pane edge to grab - and
          unmounting it instead would remove the element the pointer may still be
          dragging.
        */}
        <PaneDivider label="调整导航宽度" disabled={!navOpen} />
        <Pane className="main-pane">
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
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setEventDialog(true)}
              >
                {/* the one action in the shell that writes: a mark says "this
                    records something" before the label is read */}
                <PenLine {...icon} />
                记录变更
              </Button>
              {/*
                The one door to everything that is not the workflow: the
                diagnostics and the demonstration tools live here rather than in
                the view strip beside 协调 and BIM (frontend/src/app/
                AdvancedMenu.tsx documents the containment).
              */}
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
            {/* Reserved for global failures; a stale judgement is a work-package
                condition and is reported inside the coordination workspace. */}
            {error && (
              <div className="alert" role="alert">
                {error}
                <AppTooltip label="关闭提示">
                  <button onClick={() => setError("")} aria-label="关闭提示">
                    ×
                  </button>
                </AppTooltip>
              </div>
            )}
            <WorkspaceViews
              project={project}
              data={data}
              selected={wp.id}
              selectedConstraint={selectedConstraint}
              tab={tab}
              busy={busy}
              detailsOpen={detailsOpen}
              inspectorView={inspectorView}
              perform={perform}
              onTab={setTab}
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
            />
            <Timeline run={data.run} perform={perform} />
          </main>
        </Pane>
      </PaneSplit>
      {eventDialog && (
        <EventComposer
          wp={wp}
          project={project}
          onCreate={createEvent}
          onClose={() => setEventDialog(false)}
        />
      )}
      {/* The one toast mount point. Feedback is ephemeral; authoritative run,
          readiness, and blocking state stays in the workspace itself. */}
      <AppToaster />
    </div>
  );
}
