/** UI-only deterministic fixture for #16. Not an API, persistence model or canonical schema.
 * Replace this input with A's generated ViewerTarget/Finding contracts after #18;
 * C's #17 surfaces consume the target at the host seam. No SDK/donor IDs cross it.
 */
export type FixtureViewerTarget =
  | {
      kind: "drawing";
      source_revision_id: string;
      page: number;
      normalized_bbox: [number, number, number, number];
    }
  | { kind: "bim"; source_revision_id: string; global_ids: string[] }
  | {
      kind: "document";
      source_revision_id: string;
      page: number;
      structural_path: string[];
    };

export type FixtureEvidence = {
  id: string;
  quality: "structured" | "extracted";
  label: string;
  title: string;
  source: string;
  method: string;
  target: FixtureViewerTarget;
};

export const findingFixture = {
  id: "fixture-finding-001",
  title: "结构梁调整后，与送风管 M-038 发生碰撞",
  whatChanged: "结构模型 R2 中，梁 B-142 的几何位置相较 R1 调整。",
  whyItMatters:
    "梁与送风管的空间占用重叠，可能影响安装净高与机电施工顺序；影响解释仍需工程师判断。",
  discipline: "机电 · Mechanical",
  action: "复核送风管 M-038 标高，并与结构专业协调。",
  evidence: [
    {
      id: "beam",
      quality: "structured",
      label: "Beam B-142 geometry changed",
      title: "梁 B-142 几何变化",
      source: "结构模型 · R1 → R2",
      method: "几何比较 · fixture",
      target: {
        kind: "bim",
        source_revision_id: "fixture-structure-r2",
        global_ids: ["fixture-globalid-B142"],
      },
    },
    {
      id: "clash",
      quality: "structured",
      label: "Clash B-142 × M-038 detected",
      title: "B-142 × M-038 碰撞",
      source: "结构 R2 × 机电 R1",
      method: "碰撞检测 · fixture",
      target: {
        kind: "bim",
        source_revision_id: "fixture-coordination-r2",
        global_ids: ["fixture-globalid-B142", "fixture-globalid-M038"],
      },
    },
    {
      id: "drawing",
      quality: "structured",
      label: "Structural drawing page 5 region changed",
      title: "结构图第 5 页区域变化",
      source: "结构图 S-05 · R1 → R2",
      method: "区域比较 · fixture",
      target: {
        kind: "drawing",
        source_revision_id: "fixture-drawing-r2",
        page: 5,
        normalized_bbox: [0.32, 0.28, 0.62, 0.52],
      },
    },
    {
      id: "document",
      quality: "extracted",
      label: "Design Change 023 relevant section",
      title: "设计变更 023 · 相关条款",
      source: "设计变更 023 · R1",
      method: "文本提取 · fixture",
      target: {
        kind: "document",
        source_revision_id: "fixture-document-r1",
        page: 2,
        structural_path: ["设计变更 023", "三、结构梁调整"],
      },
    },
  ],
} as const satisfies {
  id: string;
  title: string;
  whatChanged: string;
  whyItMatters: string;
  discipline: string;
  action: string;
  evidence: ReadonlyArray<FixtureEvidence>;
};
