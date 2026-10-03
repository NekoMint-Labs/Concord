import type { ReactNode, PointerEvent, MouseEvent, RefObject } from "react";
export type Point = [number, number];
export interface DonorAnnotation {
  id: string;
  sheet_id: string;
  type: "arrow" | "highlight" | "callout" | "cloud" | "text";
  text?: string;
  from?: Point;
  to?: Point;
  at?: Point;
  target?: Point;
  note_at?: Point;
  rect?: Point[];
  pts?: Point[];
  quads?: Point[][];
  color?: string;
  w?: number;
  annotation_style?: Record<string, string | number | boolean>;
}
export interface DonorPanel {
  key: string;
  xOffset: number;
  img: { w: number; h: number };
}
export interface NativeTextRun {
  text: string;
  quad: Point[];
  rect: Point[];
}
export function useAnnotationWorkbench(options: {
  tool: string;
  setTool: (tool: string) => void;
  panels: DonorPanel[];
  tf: RefObject<{ scale: number }>;
  zoom: number;
  toImage: (x: number, y: number) => Point;
  spaceRef: RefObject<boolean>;
  markups: DonorAnnotation[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  commit: (markups: DonorAnnotation[]) => void;
  message: (message: string) => void;
  ready: boolean;
  storageKey: string;
  visible: boolean;
  compact: boolean;
  keysHeld: () => boolean;
  resetDraft: () => void;
  readText: (key: string) => Promise<NativeTextRun[]>;
}): {
  toolbar: ReactNode;
  layer: ReactNode;
  active: boolean;
  onPointerDownCapture: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMoveCapture: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUpCapture: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerCancelCapture: (event: PointerEvent<SVGSVGElement>) => void;
  onDoubleClickCapture: (event: MouseEvent<SVGSVGElement>) => void;
  render: (markup: DonorAnnotation, panel: DonorPanel) => ReactNode;
};
