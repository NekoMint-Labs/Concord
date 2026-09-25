import { afterEach, expect, it } from "vitest";
import {
  demoAreaName,
  demoConstraintText,
  demoEvidenceFact,
  demoInvestigationText,
  demoProposalExplanation,
  demoProposalTitle,
  demoSourceLabel,
  demoWorkPackageName,
  setDemoLocale,
} from "./demoPresentation";

afterEach(() => setDemoLocale("zh"));

it("localizes known deterministic fixture content in Chinese", () => {
  expect(demoWorkPackageName("WP-200", "East-wing duct installation")).toBe(
    "东翼风管安装",
  );
  expect(demoWorkPackageName("WP-100", "Structure handover")).toBe("结构交接");
  expect(demoAreaName("L02-E", "Level 02 / East wing")).toBe("L02 东翼");
  expect(
    demoConstraintText(
      "design",
      "Drawing V17 is current; workface acknowledged V16.",
    ),
  ).toBe("图纸已更新至 V17，但当前施工面仍基于 V16。");
  expect(
    demoEvidenceFact(
      "inspection/WP-200",
      "Inspection acceptance has not passed.",
    ),
  ).toBe("验收尚未通过。");
  // The live demo records its design change under the `drawing` source.
  expect(
    demoEvidenceFact(
      "drawing/WP-200",
      "Drawing V17 is current; workface acknowledged V16.",
    ),
  ).toBe("图纸已更新至 V17，但当前施工面仍基于 V16。");
  // A workforce source may have produced either a crew or a qualification row.
  expect(
    demoEvidenceFact(
      "workforce/WP-300",
      "Missing qualifications: electrician.",
    ),
  ).toBe("缺少资质：electrician。");
  expect(demoSourceLabel("drawing/WP-200")).toBe("图纸");
  expect(demoSourceLabel("project_state")).toBe("项目状态");
  expect(
    demoInvestigationText(
      "Recorded project version 1; showing 1 scoped work packages; 0 returned sources differ from baseline.",
    ),
  ).toBe("已记录项目版本 1；当前范围包含 1 个工作包；0 个工程来源与基准不同。");
  expect(
    demoInvestigationText(
      "Compared IFC revisions: 61 added, 4 deleted, 5 changed; GlobalId continuity 7.6%.",
    ),
  ).toBe("IFC 版本对比：新增 61、删除 4、修改 5；构件标识连续率 7.6%。");
  expect(
    demoInvestigationText(
      "File metadata does not establish BIM changes or engineering readiness.",
    ),
  ).toBe("文件元数据不足以判断 BIM 变更或工程就绪状态。");
  expect(
    demoProposalTitle("WP-200", "Coordinate East-wing duct installation"),
  ).toBe("协调东翼风管安装");
});

it("keeps engineering identifiers legible in Chinese copy", () => {
  expect(
    demoConstraintText("predecessor", "Predecessor WP-100 is incomplete."),
  ).toBe("前置工作包 WP-100 尚未完成。");
  expect(demoConstraintText("workforce", "Crew available 1; required 4.")).toBe(
    "可用班组 1 人，需要 4 人。",
  );
  expect(
    demoProposalExplanation(
      "Obtain the listed confirmations from responsible owners, then refresh and re-check. Demo execution simulates confirmations; it does not perform site work or certify safety.",
    ),
  ).toBe("完成相关负责人确认后，重新检查当前施工条件。");
});

it("renders the original English fixture copy in the English locale", () => {
  setDemoLocale("en");
  expect(demoWorkPackageName("WP-200", "East-wing duct installation")).toBe(
    "East-wing duct installation",
  );
  expect(
    demoConstraintText(
      "design",
      "Drawing V17 is current; workface acknowledged V16.",
    ),
  ).toBe("Drawing V17 is current; workface acknowledged V16.");
  expect(
    demoProposalTitle("WP-200", "Coordinate East-wing duct installation"),
  ).toBe("Coordinate East-wing duct installation");
});

it("passes unknown and runtime-authored strings through unchanged", () => {
  expect(demoWorkPackageName("WP-999", "Tower crane setup")).toBe(
    "Tower crane setup",
  );
  expect(demoAreaName("L09-W", "Level 09 / West wing")).toBe(
    "Level 09 / West wing",
  );
  // A user-authored event title and a document-derived fact must survive intact.
  expect(demoConstraintText("design", "Browser E2E design update")).toBe(
    "Browser E2E design update",
  );
  expect(
    demoEvidenceFact(
      "docling/upload-1",
      "Drawing V17 differs from the current V16 work package.",
    ),
  ).toBe("Drawing V17 differs from the current V16 work package.");
  // A workforce source must not translate a sentence it cannot have produced.
  expect(
    demoEvidenceFact(
      "workforce/WP-300",
      "Material duct-section is unavailable.",
    ),
  ).toBe("Material duct-section is unavailable.");
  expect(demoProposalTitle("WP-999", "Coordinate Tower crane setup")).toBe(
    "Coordinate Tower crane setup",
  );
});
