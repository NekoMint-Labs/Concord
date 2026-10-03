/** C-owned staging surfaces; A supplies persistent ViewerTarget contracts. */
export interface IfcSource {
  revisionId: string;
  sourceHash: string;
  name: string;
  data: ArrayBuffer;
}
export interface IfcElementReference {
  sourceRevisionId: string;
  sourceHash: string;
  globalId: string;
}
export type IfcNavigation = IfcElementReference;
export interface IfcModelSummary {
  sourceRevisionId: string;
  sourceHash: string;
  elementCount: number;
  fromCache: boolean;
  elapsedMs: number;
}
export interface IfcDiagnostics {
  builds: number;
  hits: number;
  writes: number;
  failures: number;
}
export type IfcPanel =
  "properties" | "scene" | "measurement" | "section" | "plans";
export interface IfcCamera {
  position: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  up?: { x: number; y: number; z: number };
  fieldOfView: number;
  cameraKind?: "perspective" | "orthogonal";
  viewToWorldScale?: number;
  aspectRatio?: number;
}

export interface IfcBcfScope {
  sourceRevisionId: string;
  sourceHash: string;
}
export interface IfcBcfSummary {
  topicGuid: string;
  viewpointGuid: string;
  selected: IfcElementReference[];
}
export interface IfcBcfExport extends IfcBcfSummary {
  data: ArrayBuffer;
  scope: IfcBcfScope[];
  format: "bcf3.0";
}
