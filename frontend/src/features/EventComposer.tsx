import { useState } from "react";
import type { DTO, WorkPackage } from "../api/client";
import { Button } from "../components/ui/button";
import { AppDialog, DialogClose } from "../components/ui/AppDialog";
import { AppSelect } from "../components/ui/AppSelect";
import { domainLabel } from "../ui/labels";
import { demoWorkPackageName } from "../ui/demo/demoPresentation";

/*
 * The submitted enum values are the API contract and never change; only the
 * visible words do. They are read from the label layer so the composer and the
 * rest of the product cannot drift apart.
 */
const CHANGE_KINDS = [
  "design_revision",
  "workforce",
  "predecessor",
  "material",
  "equipment",
  "inspection",
  "external",
] as const;

const KIND_OPTIONS = CHANGE_KINDS.map((value) => ({
  value,
  label: domainLabel("eventKind", value),
}));

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
      title: `${domainLabel("eventKind", kind)} / ${wp.id}`,
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
      description={`${wp.id} / ${demoWorkPackageName(wp.id, wp.name)}`}
      className="event-dialog"
    >
      <label className="form-label">
        变更类型
        <AppSelect
          label="变更类型"
          value={kind}
          onChange={(next) => {
            const k = next as typeof kind;
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
          options={KIND_OPTIONS}
        />
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
