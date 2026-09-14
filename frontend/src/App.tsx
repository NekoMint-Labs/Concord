import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { api, setToken, type DTO } from "./api/client";
import { Button } from "./components/ui/button";
import { AppToaster } from "./components/ui/AppToaster";
import { Timeline } from "./features/Timeline";
import { EventComposer } from "./features/EventComposer";
import type { InspectorView } from "./features/Inspector";
import { DemoControls } from "./app/DemoControls";
import { ProjectSidebar } from "./app/ProjectSidebar";
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
  const [token, updateToken] = useState("");
  const { projects, workspace } = useWorkspace(project);
  const { perform, busy, error, setError } = useWorkspaceMutation();
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
  if (!data || !wp)
    return (
      <div className="startup">
        <Building2 size={36} />
        <h1>Concord</h1>
        {workspace.isPending ? (
          <p>正在连接项目工作区…</p>
        ) : (
          <>
            <p role="alert">{workspace.error?.message ?? "尚未初始化项目。"}</p>
            <p>启动 Python API 后，使用已配置的访问令牌连接。</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setToken(token);
                void cache.invalidateQueries();
              }}
            >
              <input
                type="password"
                aria-label="API token"
                value={token}
                onChange={(event) => updateToken(event.target.value)}
                placeholder="API bearer token"
              />
              <Button type="submit">连接</Button>
            </form>
          </>
        )}
      </div>
    );

  return (
    <div className="application-shell" aria-busy={busy}>
      <ProjectSidebar
        data={data}
        project={project}
        projects={projects.data}
        selected={wp.id}
        onProject={setProject}
        onSelect={(id) => {
          setSelected(id);
          setSelectedConstraint("");
          setDetailsOpen(false);
        }}
      />
      <main className="main-shell">
        <WorkspaceHeader data={data} wp={wp}>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setEventDialog(true)}
          >
            记录变更
          </Button>
          <DemoControls
            project={project}
            busy={busy}
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
            <button onClick={() => setError("")} aria-label="关闭提示">
              ×
            </button>
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
