import { Box, Focus, Layers3, MousePointer2, Sun } from "lucide-react";
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
  const {
    container,
    ready,
    message,
    error,
    busy,
    act,
    anchor,
    hasTarget,
    isolated,
    viewMode,
  } = useIFCViewer(file, impacted, onSelected, focusId, onProperties);
  const canTarget = ready && !busy && hasTarget;
  return (
    <div
      className="bim-stage"
      ref={container}
      aria-label="IFC 模型查看器"
      data-view-mode={viewMode}
      data-isolated={isolated}
    >
      <div className="viewer-actions" aria-label="模型工具">
        <button
          type="button"
          title={isolated ? "返回选择并显示全部构件" : "当前为选择模式"}
          aria-label="选择"
          aria-pressed={!isolated}
          className={!isolated ? "is-active" : undefined}
          disabled={!ready || busy || !isolated}
          onClick={() => void act("selectMode")}
        >
          <MousePointer2 size={17} />
        </button>
        <button
          type="button"
          title={hasTarget ? "聚焦当前或受影响构件" : "选择构件后聚焦"}
          aria-label="聚焦"
          disabled={!canTarget}
          onClick={() => void act("focus")}
        >
          <Focus size={17} />
        </button>
        <button
          type="button"
          title={hasTarget ? "仅显示当前或受影响构件" : "选择构件后隔离"}
          aria-label="隔离"
          aria-pressed={isolated}
          className={isolated ? "is-active" : undefined}
          disabled={!canTarget || isolated}
          onClick={() => void act("isolate")}
        >
          <Box size={17} />
        </button>
        <button
          type="button"
          title="显示全部构件"
          aria-label="显示全部"
          disabled={!ready || busy || !isolated}
          onClick={() => void act("showAll")}
        >
          <Layers3 size={17} />
        </button>
      </div>
      <div className="viewer-orientation" aria-hidden="true">
        <span>Z</span>
        <span>Y　◇　X</span>
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
      <div className="viewer-bottom-tools" aria-label="投影视图">
        <button
          type="button"
          title="正交顶视图"
          aria-label="2D"
          aria-pressed={viewMode === "2d"}
          className={viewMode === "2d" ? "is-active" : undefined}
          disabled={!ready || busy || viewMode === "2d"}
          onClick={() => void act("setViewMode", "2d")}
        >
          2D
        </button>
        <button
          type="button"
          title="透视轨道视图"
          aria-label="3D"
          aria-pressed={viewMode === "3d"}
          className={viewMode === "3d" ? "is-active" : undefined}
          disabled={!ready || busy || viewMode === "3d"}
          onClick={() => void act("setViewMode", "3d")}
        >
          3D
        </button>
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
