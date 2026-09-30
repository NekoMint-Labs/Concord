import { Box, Focus, Layers3, MousePointer2 } from "lucide-react";
import { useIFCViewer, type MappingSelection } from "./useIFCViewer";

/** Geometry and controls remain on the canvas, not in a second technical pane. */
export default function IFCViewer({
  file,
  impacted,
  onSelected,
  focusId,
  selectedLabel,
  issueLabel,
  onProperties,
  mapping,
}: {
  file: File;
  impacted: readonly string[];
  onSelected: (id: string) => void;
  focusId?: string;
  selectedLabel?: string;
  issueLabel?: string;
  onProperties?: (properties: unknown, id?: string) => void;
  mapping?: MappingSelection;
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
    candidatesHighlighted,
    viewMode,
  } = useIFCViewer(file, impacted, onSelected, focusId, onProperties, mapping);
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
        {mapping && (
          <>
            <button
              type="button"
              aria-label="高亮候选"
              aria-pressed={candidatesHighlighted}
              className={candidatesHighlighted ? "is-active" : undefined}
              disabled={!ready || busy || !mapping.candidateIds.length}
              onClick={() => void act("highlightCandidates")}
            >
              高亮候选
            </button>
            <button
              type="button"
              aria-label="隔离候选"
              disabled={!ready || busy || !mapping.candidateIds.length}
              onClick={() => void act("isolateCandidates")}
            >
              隔离候选
            </button>
            <button
              type="button"
              aria-label="隔离已选"
              disabled={!ready || busy || !mapping.selectedIds.length}
              onClick={() => void act("isolateSelected")}
            >
              隔离已选
            </button>
          </>
        )}
      </div>
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
