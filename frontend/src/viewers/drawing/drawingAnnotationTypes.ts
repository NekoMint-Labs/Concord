/** Concord-owned annotation events. Coordinates are normalized to the selected sheet. */
type Point = [number, number];
export interface DrawingAnnotation {
  id: string;
  sourceRevisionId: string;
  sourceHash: string;
  page: number;
  kind: "arrow" | "highlight" | "callout" | "cloud" | "text";
  text: string;
  geometry: {
    start?: Point;
    end?: Point;
    anchor?: Point;
    target?: Point;
    noteAnchor?: Point;
    box?: Point[];
    points?: Point[];
    quads?: Point[][];
  };
  style: Record<string, string | number | boolean>;
}
