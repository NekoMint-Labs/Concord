import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { DTO, WorkPackage } from "../api/client";
import { Button } from "../components/ui/button";
import { AppDialog, DialogClose } from "../components/ui/AppDialog";
import { icon } from "../components/ui/icon";

export function EventComposer({
  wp,
  project,
  onCreate,
  onClose,
}: {
  wp: WorkPackage;
  project: string;
  onCreate: (event: DTO<"ProjectEvent-Input">) => void;
  onClose: () => void;
}) {
  const [kind, setKind] =
    useState<DTO<"ProjectEvent-Input">["kind"]>("design_revision");
  const [value, setValue] = useState("V17");
  const [note, setNote] = useState("");
  function submit() {
    const change: DTO<"EventChange-Input"> = {};
    if (kind === "design_revision") change.revision = value;
    if (kind === "workforce") change.available_workers = Number(value);
    if (kind === "material" || kind === "equipment") {
      change.resource_id = value;
      change.available = false;
    }
    if (kind === "predecessor") {
      change.predecessor_id = value;
      change.complete = false;
    }
    if (kind === "inspection") change.inspection_passed = false;
    onCreate({
      id: crypto.randomUUID(),
      project_id: project,
      work_package_id: wp.id,
      kind,
      title: `${kind.replaceAll("_", " ")} / ${wp.id}`,
      note,
      source: "local-demo-ui",
      change,
    });
  }
  return (
    <AppDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      eyebrow={<span className="eyebrow">新建项目观察</span>}
      title="记录变更"
      description={`${wp.id} / ${wp.name}`}
      className="event-dialog"
    >
      <label className="form-label">
        变更类型
        {/* the native select keeps its own popup and keyboard behaviour; the
            field wrapper only owns the chevron that replaces the platform's */}
        <span className="select-field">
          <select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as typeof kind;
              setKind(k);
              setValue(
                k === "workforce"
                  ? "1"
                  : k === "material"
                    ? (Object.keys(wp.materials ?? {})[0] ?? "")
                    : k === "equipment"
                      ? (Object.keys(wp.equipment ?? {})[0] ?? "")
                      : k === "predecessor"
                        ? (wp.predecessors?.[0] ?? "")
                        : "V17",
              );
            }}
          >
            <option value="design_revision">设计修订</option>
            <option value="workforce">班组人员不足</option>
            <option value="predecessor">前置工作未完成</option>
            <option value="material">材料不可用</option>
            <option value="equipment">设备不可用</option>
            <option value="inspection">验收未通过</option>
            <option value="external">外部观察</option>
          </select>
          <ChevronDown {...icon} />
        </span>
      </label>
      {!["inspection", "external"].includes(kind) && (
        <label className="form-label">
          {kind === "design_revision"
            ? "新版本"
            : kind === "workforce"
              ? "可用人员"
              : "资源 / 前置工作 ID"}
          <input
            type={kind === "workforce" ? "number" : "text"}
            min={0}
            max={10000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      )}
      <label className="form-label">
        来源说明（不受信任内容）
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={4000}
        />
      </label>
      <div className="dialog-actions">
        <DialogClose asChild>
          <Button variant="secondary">取消</Button>
        </DialogClose>
        <Button onClick={submit}>提交并分析</Button>
      </div>
      <small>变更会更新已记录事实，但不会授予任何代理权限。</small>
    </AppDialog>
  );
}
