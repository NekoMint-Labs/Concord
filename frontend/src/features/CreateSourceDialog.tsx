import { useState, type FormEvent } from "react";
import type { DTO } from "../api/client";
import { AppDialog, DialogClose } from "../components/ui/AppDialog";
import { AppSelect } from "../components/ui/AppSelect";
import { Button } from "../components/ui/button";

export function CreateSourceDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: DTO<"CreateProjectSource">) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DTO<"CreateProjectSource">["kind"]>("BIM");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onCreate({ name, kind });
      setName("");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "来源创建失败");
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="新建逻辑来源"
      description="后续不同文件名仍可作为同一来源的 R2、R3。"
    >
      <form className="project-form" onSubmit={submit}>
        <label className="form-label">
          来源名称
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="form-label">
          类型
          <AppSelect
            label="来源类型"
            value={kind}
            onChange={(value) => setKind(value as typeof kind)}
            options={[
              { value: "BIM", label: "BIM 模型" },
              { value: "DOCUMENT", label: "文档" },
              { value: "DRAWING", label: "图纸" },
              { value: "SCHEDULE", label: "进度计划" },
            ]}
          />
        </label>
        {error && <p className="alert">{error}</p>}
        <div className="dialog-actions">
          <DialogClose asChild>
            <Button variant="secondary">取消</Button>
          </DialogClose>
          <Button type="submit">创建来源</Button>
        </div>
      </form>
    </AppDialog>
  );
}
