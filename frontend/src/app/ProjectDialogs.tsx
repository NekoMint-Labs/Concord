import { useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type DTO, type Workspace } from "../api/client";
import { AppDialog, DialogClose } from "../components/ui/AppDialog";
import { Button } from "../components/ui/button";

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: DTO<"CreateProject">) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !timezone.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        timezone: timezone.trim(),
      });
      setName("");
      setDescription("");
      setAdvanced(false);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "项目创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="新建项目"
      className="project-dialog"
    >
      <form className="project-form" onSubmit={submit}>
        <label className="form-label project-name-field">
          项目名称
          <input
            required
            maxLength={180}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="form-label">
          说明 <span className="optional-label">（可选）</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="advanced-settings-toggle"
          aria-expanded={advanced}
          aria-controls="new-project-advanced"
          onClick={() => setAdvanced((value) => !value)}
        >
          <ChevronRight aria-hidden="true" />
          高级设置
        </button>
        {advanced && (
          <div className="advanced-settings" id="new-project-advanced">
            <label className="form-label">
              时区
              <input
                required
                maxLength={80}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              />
            </label>
          </div>
        )}
        {error && <p className="alert">{error}</p>}
        <div className="dialog-actions">
          <DialogClose asChild>
            <Button variant="secondary">取消</Button>
          </DialogClose>
          <Button
            type="submit"
            disabled={busy || !name.trim() || !timezone.trim()}
          >
            {busy ? "正在创建…" : "创建项目"}
          </Button>
        </div>
      </form>
    </AppDialog>
  );
}

export function OpenProjectDialog({
  open,
  projects,
  current,
  onOpenChange,
  onProject,
}: {
  open: boolean;
  projects: DTO<"Project">[];
  current: string;
  onOpenChange: (open: boolean) => void;
  onProject: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = projects.filter((item) =>
    `${item.name} ${item.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="打开项目"
      description="选择已保存在当前 Concord 服务中的项目。"
    >
      <label className="form-label">
        搜索项目
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="project-chooser" role="list">
        {matches.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === current ? "selected" : ""}
            onClick={() => {
              onProject(item.id);
              onOpenChange(false);
            }}
          >
            <strong>{item.name}</strong>
            <span>{item.description || item.timezone}</span>
            {item.id === "harbor-east" && <small>演示 / 示例</small>}
          </button>
        ))}
        {!matches.length && <p className="quiet-message">没有匹配项目。</p>}
      </div>
    </AppDialog>
  );
}

export function ProjectSettingsDialog({
  open,
  project,
  onOpenChange,
  onStructure,
}: {
  open: boolean;
  project?: DTO<"Project">;
  onOpenChange: (open: boolean) => void;
  onStructure: () => void;
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="项目设置"
      description="工程身份来自后端持久化项目。"
    >
      {project && (
        <dl className="project-facts">
          <dt>名称</dt>
          <dd>{project.name}</dd>
          <dt>说明</dt>
          <dd>{project.description || "—"}</dd>
          <dt>时区</dt>
          <dd>{project.timezone}</dd>
          <dt>项目 ID</dt>
          <dd className="mono">{project.id}</dd>
        </dl>
      )}
      <div className="dialog-actions">
        <Button
          variant="secondary"
          onClick={() => {
            onOpenChange(false);
            onStructure();
          }}
        >
          管理区域与工作包
        </Button>
        <DialogClose asChild>
          <Button>完成</Button>
        </DialogClose>
      </div>
    </AppDialog>
  );
}

export function ProjectStructureDialog({
  open,
  project,
  workspace,
  onOpenChange,
  onWorkPackage,
}: {
  open: boolean;
  project: string;
  workspace: Workspace;
  onOpenChange: (open: boolean) => void;
  onWorkPackage: (id: string) => void;
}) {
  const cache = useQueryClient();
  const [areaName, setAreaName] = useState("");
  const [floor, setFloor] = useState("");
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState("");
  const invalidate = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ["workspace", project] }),
      cache.invalidateQueries({ queryKey: ["project", project] }),
    ]);
  const area = useMutation({
    mutationFn: () => api.createArea(project, { name: areaName, floor }),
    onSuccess: async (created) => {
      setAreaName("");
      setFloor("");
      setAreaId(created.id);
      await invalidate();
    },
    onError: (cause) => setError(cause.message),
  });
  const workPackage = useMutation({
    mutationFn: () =>
      api.createWorkPackage(project, {
        name,
        area_id: areaId,
        discipline,
        owner,
      }),
    onSuccess: async (created) => {
      setName("");
      setDiscipline("");
      setOwner("");
      await invalidate();
      onWorkPackage(created.id);
    },
    onError: (cause) => setError(cause.message),
  });

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="区域与工作包"
      description="保存后会立即出现在项目侧栏，并在重启后保留。"
      className="structure-dialog"
    >
      <div className="structure-columns">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            area.mutate();
          }}
        >
          <h3>新建区域</h3>
          <label className="form-label">
            名称
            <input
              required
              value={areaName}
              onChange={(event) => setAreaName(event.target.value)}
            />
          </label>
          <label className="form-label">
            楼层
            <input
              value={floor}
              onChange={(event) => setFloor(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={area.isPending || !areaName.trim()}>
            保存区域
          </Button>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            workPackage.mutate();
          }}
        >
          <h3>新建工作包</h3>
          <label className="form-label">
            区域
            <select
              required
              value={areaId}
              onChange={(event) => setAreaId(event.target.value)}
            >
              <option value="">选择区域</option>
              {workspace.state.areas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.floor}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            名称
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="form-label">
            专业
            <input
              required
              value={discipline}
              onChange={(event) => setDiscipline(event.target.value)}
            />
          </label>
          <label className="form-label">
            负责人
            <input
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            disabled={
              workPackage.isPending ||
              !areaId ||
              !name.trim() ||
              !discipline.trim()
            }
          >
            保存工作包
          </Button>
        </form>
      </div>
      {error && <p className="alert">{error}</p>}
    </AppDialog>
  );
}
