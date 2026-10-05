import {
  closedMetrics,
  openLen,
} from "../../../vendor/opentakeoff/geometry.js";
/** OpenTakeoff's page-space geometry and calibrated units-per-pixel convention. */
export type DrawingPoint = [number, number];
export type DrawingTool =
  "navigate" | "calibrate" | "distance" | "area" | "cloud" | "annotation";
export interface DrawingMarkup {
  id: string;
  page: number;
  tool: "distance" | "area" | "cloud";
  points: DrawingPoint[];
}
export function calibratedScale(points: DrawingPoint[], knownLength: number) {
  if (points.length !== 2 || !Number.isFinite(knownLength) || knownLength <= 0)
    throw new Error(
      "Choose two calibration points and a positive known length",
    );
  const length = openLen(points);
  if (length < 0.01) throw new Error("Calibration points must be distinct");
  return knownLength / length;
}
export function markupMetrics(markup: DrawingMarkup, unitsPerPoint?: number) {
  if (!unitsPerPoint) return "Uncalibrated";
  if (markup.tool === "area") {
    const value = closedMetrics(markup.points);
    return `${(value.area * unitsPerPoint ** 2).toFixed(2)} m² / ${(value.perim * unitsPerPoint).toFixed(2)} m perimeter`;
  }
  return `${(openLen(markup.points) * unitsPerPoint).toFixed(2)} m`;
}
export function appendDrawingPoint(
  points: DrawingPoint[],
  point: DrawingPoint,
  tool: DrawingTool,
) {
  if (["navigate", "annotation"].includes(tool)) return points;
  if (tool === "area") return [...points, point];
  return points.length >= 2 ? [point] : [...points, point];
}
