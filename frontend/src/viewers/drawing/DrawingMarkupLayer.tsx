import { cloudPath } from "../../../vendor/opentakeoff/geometry.js";
import type {
  DrawingMarkup,
  DrawingPoint,
  DrawingTool,
} from "./drawingInteraction";
export function DrawingMarkupLayer({
  dimensions,
  tool,
  points,
  markups,
  onPoint,
}: {
  dimensions: { width: number; height: number };
  tool: DrawingTool;
  points: DrawingPoint[];
  markups: DrawingMarkup[];
  onPoint: (point: DrawingPoint) => void;
}) {
  return (
    <svg
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      aria-label="Drawing markup layer"
      role="img"
      onPointerDown={(event) => {
        if (tool === "navigate") return;
        const bounds = event.currentTarget.getBoundingClientRect();
        onPoint([
          ((event.clientX - bounds.left) / bounds.width) * dimensions.width,
          ((event.clientY - bounds.top) / bounds.height) * dimensions.height,
        ]);
      }}
    >
      {markups.map((markup) =>
        markup.tool === "cloud" && markup.points.length === 2 ? (
          <path
            key={markup.id}
            d={cloudPath(...markup.points[0], ...markup.points[1])}
            fill="none"
            stroke="#b91c1c"
            strokeWidth="2"
          />
        ) : (
          <polyline
            key={markup.id}
            points={[
              ...markup.points,
              ...(markup.tool === "area" ? [markup.points[0]] : []),
            ]
              .map((p) => p.join(","))
              .join(" ")}
            fill={markup.tool === "area" ? "#3b82f622" : "none"}
            stroke="#1d4ed8"
            strokeWidth="2"
          />
        ),
      )}
      <polyline
        points={points.map((point) => point.join(",")).join(" ")}
        fill="none"
        stroke="#b91c1c"
        strokeWidth="2"
      />
      {points.map((point, index) => (
        <circle key={index} cx={point[0]} cy={point[1]} r="3" fill="#b91c1c" />
      ))}
    </svg>
  );
}
