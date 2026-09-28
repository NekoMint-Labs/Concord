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
      setError(cause instanceof Error ? cause.message : "添加模型失败");
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="添加项目模型"
      description="为模型命名；以后上传的新 IFC 会成为这个模型的 R2、R3。"
    >
      <form className="project-form" onSubmit={submit}>
        <label className="form-label">
          模型名称
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="form-label">
          类型
          <AppSelect
            label="文件类型"
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
          <Button type="submit">添加模型</Button>
        </div>
      </form>
    </AppDialog>
  );
}
