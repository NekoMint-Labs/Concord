import { useViewerFailure } from "../useViewerFailure";
import { useEffect, useState } from "react";
import { useDrawingAnnotations } from "./useDrawingAnnotations";
import type { DrawingAnnotation } from "./drawingAnnotationTypes";
import { useDrawingDocument } from "./useDrawingDocument";
import {
  appendDrawingPoint,
  calibratedScale,
  markupMetrics,
} from "./drawingInteraction";
import { DrawingMarkupLayer } from "./DrawingMarkupLayer";
import type {
  DrawingMarkup,
  DrawingPoint,
  DrawingTool,
} from "./drawingInteraction";
import { validateDrawingTarget, toDrawingNavigation } from "./drawingContract";
import type { DrawingTarget } from "./drawingContract";
import type { DrawingSource } from "./pdfDiffTypes";
import "./drawing.css";
/** C's engineering surface. B controls workspace composition and persisted navigation. */
export default function DrawingSurface({
  source,
  target,
  onMarkups,
  onAnnotations,
  onError,
}: {
  source: DrawingSource;
  target?: DrawingTarget;
  onMarkups?: (markups: DrawingMarkup[]) => void;
  onAnnotations?: (annotations: DrawingAnnotation[]) => void;
  onError?: (message: string | null) => void;
}) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<DrawingTool>("navigate");
  const [points, setPoints] = useState<DrawingPoint[]>([]);
  const [markups, setMarkups] = useState<DrawingMarkup[]>([]);
  const [scales, setScales] = useState<Record<number, number>>({});
  const [knownLength, setKnownLength] = useState("1");
  const [error, setError] = useState("");
  const [annotationMessage, setAnnotationMessage] = useState("");
  const view = useDrawingDocument(source, page, zoom);
  let targetError = "";
  let navigation: ReturnType<typeof toDrawingNavigation> | undefined;
  if (target) {
    try {
      validateDrawingTarget(source, target);
      if (view.pages && target.page > view.pages)
        throw new Error("Requested drawing page is unavailable");
      if (!view.status && !view.error && page === target.page)
        navigation = toDrawingNavigation(target, source, view.dimensions);
    } catch (failure) {
      targetError =
        failure instanceof Error ? failure.message : String(failure);
    }
  }
  useViewerFailure(targetError || view.error || error, onError);
  const annotations = useDrawingAnnotations({
    source,
    page,
    dimensions: view.dimensions,
    zoom,
    ready: !view.status && !view.error,
    tool,
    setTool,
    resetDraft: () => setPoints([]),
    readText: view.readText,
    message: setAnnotationMessage,
    onAnnotations,
  });
  useEffect(() => {
    setPage(1);
    setMarkups([]);
    setScales({});
    setPoints([]);
  }, [source]);
  useEffect(() => {
    if (target) {
      try {
        validateDrawingTarget(source, target);
      } catch {
        return;
      }
      if (!view.pages || target.page > view.pages) return;
      setPage(target.page);
      setPoints([]);
    }
  }, [source, target, view.pages]);
  useEffect(() => {
    setPoints([]);
    setError("");
    setAnnotationMessage("");
  }, [page, tool]);
  const finish = () => {
    try {
      if (tool === "calibrate") {
        setScales((values) => ({
          ...values,
          [page]: calibratedScale(points, Number(knownLength)),
        }));
        setPoints([]);
        return;
      }
      if (
        (tool === "area" && points.length < 3) ||
        points.length < 2 ||
        ["navigate", "annotation"].includes(tool)
      )
        throw new Error("Select enough points before finishing");
      const next = [
        ...markups,
        { id: crypto.randomUUID(), page, tool, points } as DrawingMarkup,
      ];
      setMarkups(next);
      onMarkups?.(next);
      setPoints([]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return (
    <section
      className="engineering-drawing"
      aria-label="Drawing viewer"
      data-cache-hit={view.diagnostics?.cacheHit}
      data-preparation-ms={view.diagnostics?.preparationMs}
    >
      <div className="engineering-drawing-toolbar">
        <button
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous sheet
        </button>
        <label>
          Sheet{" "}
          <input
            type="number"
            min="1"
            max={view.pages || 1}
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
          />
        </label>
        <span>of {view.pages}</span>
        <button
          disabled={page >= view.pages}
          onClick={() => setPage((value) => value + 1)}
        >
          Next sheet
        </button>
        <button
          onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
          aria-label="Zoom in"
        >
          +
        </button>
        <button onClick={() => setZoom(1)}>Fit sheet</button>
        <label>
          Tool{" "}
          <select
            aria-label="Drawing tool"
            value={tool}
            onChange={(event) => setTool(event.target.value as DrawingTool)}
          >
            <option value="navigate">Navigate</option>
            <option value="calibrate">Calibrate</option>
            <option value="distance">Distance</option>
            <option value="area">Area</option>
            <option value="cloud">Revision cloud</option>
            <option value="annotation">Annotation</option>
          </select>
        </label>
        {tool === "calibrate" && (
          <label>
            Known length (m){" "}
            <input
              type="number"
              min="0.001"
              step="any"
              value={knownLength}
              onChange={(event) => setKnownLength(event.target.value)}
            />
          </label>
        )}
        {!["navigate", "annotation"].includes(tool) && (
          <>
            <button onClick={finish}>Finish</button>
            <button onClick={() => setPoints((values) => values.slice(0, -1))}>
              Undo point
            </button>
            <button onClick={() => setPoints([])}>Cancel</button>
          </>
        )}
      </div>
      {annotations.toolbar}
      {annotationMessage && <p>{annotationMessage}</p>}
      <div className="engineering-drawing-toolbar">{annotations.controls}</div>
      {view.status && <p role="status">{view.status}</p>}
      {(targetError || view.error || error) && (
        <p role="alert">{targetError || view.error || error}</p>
      )}
      <p>
        {scales[page]
          ? "Calibrated in metres."
          : "Measurements require calibration for this sheet."}{" "}
        Scroll to pan.
      </p>
      <div className="engineering-drawing-paper">
        <div
          className="engineering-drawing-sheet"
          style={{
            width: `${900 * zoom}px`,
            aspectRatio: `${view.dimensions.width}/${view.dimensions.height}`,
          }}
        >
          <canvas ref={view.canvas} aria-label={`Drawing sheet ${page}`} />
          <DrawingMarkupLayer
            dimensions={view.dimensions}
            tool={tool}
            points={points}
            markups={markups.filter((markup) => markup.page === page)}
            onPoint={(point) =>
              setPoints((values) => appendDrawingPoint(values, point, tool))
            }
          />
          {annotations.layer}
          {!targetError &&
            navigation?.region &&
            navigation.page === page &&
            !view.status && (
              <svg
                viewBox={`0 0 ${view.dimensions.width} ${view.dimensions.height}`}
                style={{ pointerEvents: "none" }}
                aria-label="Requested source region"
              >
                <rect
                  x={navigation.region.x}
                  y={navigation.region.y}
                  width={navigation.region.width}
                  height={navigation.region.height}
                  fill="none"
                  stroke="#b91c1c"
                  strokeWidth="3"
                />
              </svg>
            )}
        </div>
      </div>
      <ol aria-label="Drawing measurements">
        {markups
          .filter((markup) => markup.page === page)
          .map((markup) => (
            <li key={markup.id}>
              {markup.tool}: {markupMetrics(markup, scales[page])}
              <button
                onClick={() => {
                  const next = markups.filter(
                    (value) => value.id !== markup.id,
                  );
                  setMarkups(next);
                  onMarkups?.(next);
                }}
              >
                Remove
              </button>
            </li>
          ))}
      </ol>
    </section>
  );
}
