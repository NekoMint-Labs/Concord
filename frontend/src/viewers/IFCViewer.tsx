import { Box, Focus, Layers3, MousePointer2, Sun, Undo2 } from "lucide-react";
import { useIFCViewer } from "./useIFCViewer";

/** Geometry and controls remain on the canvas, not in a second technical pane. */
export default function IFCViewer({
  file,
  impacted,
  onSelected,
  focusId,
  selectedLabel,
  issueLabel,
  onProperties,
}: {
  file: File;
  impacted: readonly string[];
  onSelected: (id: string) => void;
  focusId?: string;
  selectedLabel?: string;
  issueLabel?: string;
  onProperties?: (properties: unknown) => void;
}) {
  const { container, ready, message, error, busy, act, anchor } = useIFCViewer(
    file,
    impacted,
    onSelected,
    focusId,
    onProperties,
  );
  return (
    <div className="bim-stage" ref={container} aria-label="IFC 模型查看器">
      <div className="viewer-actions" aria-label="模型工具">
        <button type="button" title="选择" aria-label="选择">
          <MousePointer2 size={17} />
        </button>
        <button
          type="button"
          title="聚焦"
          aria-label="聚焦"
          disabled={!ready || busy}
          onClick={() => void act("focus")}
        >
          <Focus size={17} />
        </button>
        <button
          type="button"
          title="隔离"
          aria-label="隔离"
          disabled={!ready || busy}
          onClick={() => void act("isolate")}
        >
          <Box size={17} />
        </button>
        <button
          type="button"
          title="显示全部"
          aria-label="显示全部"
          disabled={!ready || busy}
          onClick={() => void act("showAll")}
        >
          <Layers3 size={17} />
        </button>
      </div>
      <div className="viewer-orientation" aria-hidden="true">
        <span>Z</span>
        <span>Y　 ◇　 X</span>
      </div>
      <span className="viewer-light" aria-hidden="true">
        <Sun size={17} />
      </span>
      {ready && selectedLabel && anchor && (
        <div
          className="viewer-object-label"
          style={{ left: anchor.x, top: anchor.y }}
        >
          {selectedLabel}
        </div>
      )}
      {ready && issueLabel && (
        <div
          className="viewer-issue-label"
          style={
            anchor
              ? {
                  left: Math.max(
                    12,
                    Math.min(
                      anchor.x + 80,
                      (container.current?.clientWidth ?? 0) - 200,
                    ),
                  ),
                  top: Math.max(16, anchor.y - 100),
                  right: "auto",
                }
              : undefined
          }
        >
          <span className="dot red" />
          {issueLabel}
        </div>
      )}
      <div className="viewer-bottom-tools" aria-label="查看器操作">
        <button type="button" title="选择">
          <MousePointer2 size={15} />
        </button>
        <button
          type="button"
          title="聚焦"
          onClick={() => void act("focus")}
          disabled={!ready}
        >
          <Focus size={15} />
        </button>
        <button
          type="button"
          title="隔离"
          onClick={() => void act("isolate")}
          disabled={!ready}
        >
          <Box size={15} />
        </button>
        <button
          type="button"
          title="显示全部"
          onClick={() => void act("showAll")}
          disabled={!ready}
        >
          <Undo2 size={15} />
        </button>
        <span>2D</span>
        <strong>3D</strong>
      </div>
      <div
        className="viewer-message"
        role={error ? "alert" : "status"}
        hidden={ready && !error}
      >
        {error
          ? `3D 查看器不可用：${error}。结构化 BIM 数据仍可使用。`
          : message}
      </div>
      {ready && (
        <span className="sr-only" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
