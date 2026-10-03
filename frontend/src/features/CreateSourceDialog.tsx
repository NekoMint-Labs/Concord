import { useState, type FormEvent } from "react";
import type { DTO, ProjectSourceStatus } from "../api/client";
import { AppDialog } from "../components/ui/AppDialog";
import { AppSelect } from "../components/ui/AppSelect";
import { Button } from "../components/ui/button";

type FileEntry = {
  file: File;
  name: string;
  target: string;
  createdSourceId?: string;
  result?: DTO<"RevisionUploadResult">;
  error?: string;
};
export type AddSourcesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: readonly ProjectSourceStatus[];
  supportedFormats: readonly string[];
  /** Add Revision locks every file to this logical source. */
  sourceId?: string;
  onCreate: (
    input: DTO<"CreateProjectSource">,
  ) => Promise<DTO<"ProjectSource">>;
  onUpload: (input: {
    source: string;
    file: File;
    label: string;
  }) => Promise<DTO<"RevisionUploadResult">>;
  onUploaded?: (sourceId: string) => void;
};

export function AddSourcesDialog({
  open,
  onOpenChange,
  sources,
  supportedFormats,
  sourceId,
  onCreate,
  onUpload,
  onUploaded,
}: AddSourcesDialogProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const update = (index: number, patch: Partial<FileEntry>) =>
    setEntries((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const selected = sources.find((item) => item.source.id === sourceId);
  const formats = supportedFormats.filter(
    (format) =>
      !selected || (selected.source.kind === "BIM") === (format === ".ifc"),
  );
  const remaining = entries.filter((entry) => !entry.result);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      for (const [index, entry] of entries.entries()) {
        if (entry.result) continue;
        setActiveIndex(index);
        update(index, { error: undefined });
        try {
          const extension = `.${entry.file.name.split(".").at(-1)?.toLowerCase()}`;
          if (!formats.includes(extension))
            throw new Error("当前服务不支持此文件格式。");
          let target = entry.createdSourceId || entry.target;
          if (!target) {
            if (!entry.name.trim()) throw new Error("请为新资料填写名称。");
            const source = await onCreate({
              name: entry.name.trim(),
              kind: extension === ".ifc" ? "BIM" : "DOCUMENT",
            });
            target = source.id;
            update(index, { createdSourceId: target });
          }
          const result = await onUpload({
            source: target,
            file: entry.file,
            label: "",
          });
          update(index, { result });
          onUploaded?.(target);
        } catch (cause) {
          update(index, {
            error:
              cause instanceof Error ? cause.message : "上传失败，请重试。",
          });
        }
      }
    } finally {
      setBusy(false);
      setActiveIndex(-1);
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      className="sources-add-dialog"
      title={selected ? `添加版本 · ${selected.source.name}` : "添加资料"}
      description="每个文件明确选择新资料或已有资料的新版本。上传后自动开始处理，不会自动确认基线。"
    >
      <form className="project-form sources-add-form" onSubmit={submit}>
        <label className="form-label">
          选择文件（可多选）
          <input
            type="file"
            multiple
            accept={formats.join(",")}
            disabled={busy || !formats.length}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              setEntries((items) => [
                ...items,
                ...files.map((file) => ({
                  file,
                  name: file.name.replace(/\.[^.]+$/, ""),
                  target: sourceId ?? "",
                })),
              ]);
              event.target.value = "";
            }}
          />
        </label>
        <p className="quiet-message">
          {formats.length
            ? `支持 ${formats.map((format) => format.slice(1).toUpperCase()).join(" / ")}。`
            : "当前没有可用的文件解析能力。"}
          TXT 为 UTF-8，最多 1 MiB；复杂文档依赖已安装的解析能力与本地模型资源。
        </p>
        <div className="sources-upload-list">
          {entries.map((entry, index) => {
            const isBim = entry.file.name.toLowerCase().endsWith(".ifc");
            const locked = busy || !!entry.result || !!entry.createdSourceId;
            return (
              <fieldset
                key={index}
                disabled={locked}
                className="sources-upload-entry"
              >
                <legend>{entry.file.name}</legend>
                {!selected && (
                  <AppSelect
                    label={`资料归属 · ${entry.file.name}`}
                    value={entry.target || "new"}
                    onChange={(value) =>
                      update(index, {
                        target: value === "new" ? "" : value,
                        error: undefined,
                      })
                    }
                    options={[
                      { value: "new", label: "新建逻辑资料" },
                      ...sources
                        .filter(
                          (item) => (item.source.kind === "BIM") === isBim,
                        )
                        .map((item) => ({
                          value: item.source.id,
                          label: `${item.source.name} · 添加版本`,
                        })),
                    ]}
                  />
                )}
                {selected ? (
                  <p>已有资料：{selected.source.name} · 添加新版本</p>
                ) : (
                  !entry.target && (
                    <label className="form-label">
                      新资料名称 · {entry.file.name}
                      <input
                        required
                        maxLength={180}
                        value={entry.name}
                        onChange={(event) =>
                          update(index, { name: event.target.value })
                        }
                      />
                    </label>
                  )
                )}
                {entry.result && (
                  <p role="status">
                    {entry.result.duplicate ? "内容已存在" : "已上传"} · R
                    {entry.result.revision.sequence} ·
                    处理状态见资料记录，基线未变
                  </p>
                )}
                {busy && activeIndex === index && (
                  <p role="status">正在上传并开始处理…</p>
                )}
                {entry.error && (
                  <p className="sources-error" role="alert">
                    {entry.error}
                    {entry.createdSourceId && " 资料已创建，重试只上传文件。"}
                  </p>
                )}
                {!entry.result && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setEntries((items) => items.filter((_, i) => i !== index))
                    }
                  >
                    移除文件
                  </Button>
                )}
              </fieldset>
            );
          })}
        </div>
        <div className="dialog-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {remaining.length ? "关闭" : "完成"}
          </Button>
          {!!remaining.length && (
            <Button type="submit" disabled={busy}>
              {busy
                ? "正在上传…"
                : entries.some((entry) => entry.error)
                  ? "重试未上传文件"
                  : "上传并处理"}
            </Button>
          )}
        </div>
      </form>
    </AppDialog>
  );
}

export const CreateSourceDialog = AddSourcesDialog;
