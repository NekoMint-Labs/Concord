export const advancedTabs = [
  { id: "operations", label: "Activity / Runs" },
  { id: "gis", label: "现场地图" },
  { id: "capabilities", label: "能力诊断" },
] as const;

export type WorkspaceTab =
  | "coordination"
  | "work-packages"
  | "bim"
  | "sources"
  | "impact"
  | "packages"
  | "documents"
  | "operations"
  | "gis"
  | (typeof advancedTabs)[number]["id"];
