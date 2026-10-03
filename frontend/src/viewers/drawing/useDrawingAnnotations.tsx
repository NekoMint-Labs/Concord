import { useEffect, useRef, useState } from "react";
import { useAnnotationWorkbench } from "../../../vendor/opentakeoff/AnnotationWorkbench.jsx";
import {
  applyMarkupPatch,
  markupPatch,
} from "../../../vendor/opentakeoff/annotationTools.js";
import { recordCommand } from "../../../vendor/opentakeoff/recordCommand.js";
import type {
  DonorAnnotation,
  NativeTextRun,
} from "../../../vendor/opentakeoff/AnnotationWorkbench.jsx";
import type { MarkupPatch } from "../../../vendor/opentakeoff/annotationTools.js";
import type { DrawingAnnotation } from "./drawingAnnotationTypes";
import type { DrawingSource } from "./pdfDiffTypes";
/** Adapt the donor annotation editor; history and ink remain local to this surface. */
export function useDrawingAnnotations(options: {
  source: DrawingSource;
  page: number;
  dimensions: { width: number; height: number };
  ready: boolean;
  zoom: number;
  tool: string;
  setTool: (tool: "navigate" | "annotation") => void;
  resetDraft: () => void;
  readText: () => Promise<NativeTextRun[]>;
  message: (message: string) => void;
  onAnnotations?: (rows: DrawingAnnotation[]) => void;
}) {
  const surface = useRef<SVGSVGElement>(null);
  const tf = useRef({ scale: 1 });
  tf.current.scale = (900 * options.zoom) / options.dimensions.width;
  const spaceRef = useRef(false);
  const [rows, setRows] = useState<DonorAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useRef<{
    undo: MarkupPatch<DonorAnnotation>[];
    redo: MarkupPatch<DonorAnnotation>[];
  }>({ undo: [], redo: [] });
  const scope = `${options.source.revisionId}:${options.source.sourceHash}`;
  useEffect(() => {
    setRows([]);
    setSelectedId(null);
    history.current = { undo: [], redo: [] };
    options.onAnnotations?.([]);
  }, [scope]);
  const normalize = (values: DonorAnnotation[]): DrawingAnnotation[] =>
    values.map((row) => ({
      id: row.id,
      sourceRevisionId: options.source.revisionId,
      sourceHash: options.source.sourceHash,
      page: Number(row.sheet_id.slice(row.sheet_id.lastIndexOf(":") + 1)),
      kind: row.type,
      text: row.text ?? "",
      geometry: structuredClone({
        start: row.from,
        end: row.to,
        anchor: row.at,
        target: row.target,
        noteAnchor: row.note_at,
        box: row.rect,
        points: row.pts,
        quads: row.quads,
      }),
      style: {
        ...row.annotation_style,
        color: row.color ?? row.annotation_style?.color ?? "#dc3d43",
        ...(row.w ? { normalizedWidth: row.w } : {}),
      },
    }));
  const publish = (next: DonorAnnotation[]) => {
    setRows(next);
    options.onAnnotations?.(normalize(next));
  };
  const commit = (next: DonorAnnotation[]) => {
    if (
      next.length > 500 ||
      next.some((row) => (row.pts?.length ?? 0) > 10000)
    ) {
      options.message("Drawing annotation limit exceeded");
      return;
    }
    const patch = markupPatch(rows, next);
    if (!patch.ids.length) return;
    history.current = recordCommand(history.current.undo, patch);
    publish(next);
  };
  const replay = (side: "before" | "after") => {
    const from = side === "before" ? "undo" : "redo";
    const to = side === "before" ? "redo" : "undo";
    const patch = history.current[from].at(-1);
    if (!patch) return;
    history.current[from].pop();
    history.current[to].push(patch);
    publish(applyMarkupPatch(rows, patch, side));
    setSelectedId(null);
  };
  const panel = {
    key: `${scope}:${options.page}`,
    xOffset: 0,
    img: { w: options.dimensions.width, h: options.dimensions.height },
  };
  const donor = useAnnotationWorkbench({
    tool: options.tool === "navigate" ? "select" : options.tool,
    setTool: (tool) => {
      options.resetDraft();
      options.setTool(tool === "select" ? "navigate" : "annotation");
    },
    panels: [panel],
    tf,
    zoom: tf.current.scale,
    spaceRef,
    toImage: (x, y) => {
      const bounds = surface.current!.getBoundingClientRect();
      tf.current.scale = bounds.width / panel.img.w;
      return [
        ((x - bounds.left) / bounds.width) * panel.img.w,
        ((y - bounds.top) / bounds.height) * panel.img.h,
      ];
    },
    markups: rows,
    selectedId,
    setSelectedId,
    commit,
    message: options.message,
    ready: options.ready,
    storageKey: "concord_drawing_annotation_favorites_v1",
    visible: true,
    compact: false,
    keysHeld: () => !surface.current?.contains(document.activeElement),
    resetDraft: options.resetDraft,
    readText: async (key) => {
      if (key !== panel.key)
        throw new Error("Requested drawing sheet is stale");
      return options.readText();
    },
  });
  return {
    toolbar: donor.toolbar,
    controls: (
      <>
        <button
          onClick={() => replay("before")}
          disabled={!history.current.undo.length}
        >
          Undo annotation
        </button>
        <button
          onClick={() => replay("after")}
          disabled={!history.current.redo.length}
        >
          Redo annotation
        </button>
      </>
    ),
    layer: (
      <svg
        ref={surface}
        tabIndex={0}
        aria-label="Drawing annotation editor"
        viewBox={`0 0 ${panel.img.w} ${panel.img.h}`}
        style={{
          pointerEvents: ["navigate", "annotation"].includes(options.tool)
            ? "auto"
            : "none",
        }}
        onPointerDown={(event) =>
          event.currentTarget.focus({ preventScroll: true })
        }
        onPointerDownCapture={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          donor.onPointerDownCapture(event);
        }}
        onPointerMoveCapture={donor.onPointerMoveCapture}
        onPointerUpCapture={donor.onPointerUpCapture}
        onPointerCancelCapture={donor.onPointerCancelCapture}
        onDoubleClickCapture={donor.onDoubleClickCapture}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "z"
          ) {
            event.preventDefault();
            replay(event.shiftKey ? "after" : "before");
          }
        }}
      >
        {rows
          .filter((row) => row.sheet_id === panel.key)
          .map((row) => donor.render(row, panel))}
        {donor.layer}
      </svg>
    ),
  };
}
