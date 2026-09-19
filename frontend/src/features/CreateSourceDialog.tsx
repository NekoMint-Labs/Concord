import { useState, type FormEvent } from "react";
import type { DTO } from "../api/client";
import { AppDialog, DialogClose } from "../components/ui/AppDialog";
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
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="BIM">BIM</option>
            <option value="DOCUMENT">文档</option>
            <option value="DRAWING">图纸</option>
            <option value="SCHEDULE">进度</option>
          </select>
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
