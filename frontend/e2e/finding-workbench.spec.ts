import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import type { DTO } from "../src/api/client";
import {
  expectDonorTable,
  expectReducedMotion,
  openWorkPanel,
  toolRail,
  workPanel,
} from "./donor-conformance";

const headers = { Authorization: "Bearer local-demo-admin" };
const stage = process.env.CONCORD_DONOR_STAGE ?? "after";
const screenshots = resolve(
  "..",
  ".verification-work",
  "issue-16-donor-conformance",
  stage,
);
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];

async function capture(page: Page, name: string) {
  mkdirSync(screenshots, { recursive: true });
  const viewport = page.viewportSize()!;
  await page.screenshot({
    path: resolve(
      screenshots,
      `${name}-${viewport.width}x${viewport.height}.png`,
    ),
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
}

async function openProject(page: Page, project: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((id) => {
    sessionStorage.setItem("cca-token", "local-demo-admin");
    localStorage.setItem("concord:last-project", id);
  }, project);
  await page.goto("/");
  await toolRail(page)
    .getByRole("button", { name: "工作", exact: true })
    .click();
  await openWorkPanel(page);
}

async function createProject(request: APIRequestContext) {
  const response = await request.post("/api/projects", {
    headers,
    data: {
      name: `Finding API 验证 ${randomUUID().slice(0, 8)}`,
    } satisfies DTO<"CreateProject">,
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as DTO<"Project">;
}

// Publication deliberately has NO public HTTP endpoint. This trusted test setup
// calls the existing publisher in the isolated e2e server's repository only.
// It creates synthetic provider records, NOT measured/verified engineering data.
function publishTestEvidence(
  project: string,
  revisions: DTO<"ProjectSourceRevision">[],
) {
  const python =
    process.env.CCA_E2E_PYTHON ?? resolve("..", ".venv", "bin", "python");
  const output = execFileSync(
    python,
    [
      "-c",
      `
import json, sys
from pathlib import Path
from app.adapters.persistence.database import SQLRepositoryFactory, make_engine
from app.application.engineering_publication import EngineeringPublisher
from app.domain.engineering import EngineeringPublication
from app.domain.models import Evidence, ProjectSnapshot, utcnow
from app.domain.errors import NotFound
project, revisions = json.loads(sys.argv[1])
root = Path(sys.argv[2]).resolve()
for folder in root.glob("playwright-*"):
    database = folder / "app.db"
    if not database.is_file():
        continue
    engine = make_engine("sqlite:///" + str(database))
    factory = SQLRepositoryFactory(engine)
    try:
        with factory.open() as repo:
            repo.state(project)
    except NotFound:
        engine.dispose()
        continue
    break
else:
    raise RuntimeError("Unique test project not found in isolated Playwright storage")
with factory.open(project, write=True) as repo:
    state = repo.state(project)
    snapshot = ProjectSnapshot(project_id=project, version=state.version, sources=state.sources)
    repo.save_snapshot(snapshot)
r = revisions
specs = [
    (0, "图纸区域变更", "structured", {"kind":"drawing", "source_revision_id":r[0]["id"], "page":5, "normalized_bbox":[0.32,0.28,0.62,0.52]}),
    (1, "模型净高复核", "structured", {"kind":"bim", "source_revision_id":r[1]["id"], "global_ids":["E2E-GlobalId-A","E2E-GlobalId-B"], "viewpoint":[1,2,3,4,5,6]}),
    (2, "文档提取条款", "extracted", {"kind":"document", "source_revision_id":r[2]["id"], "page":2, "structural_path":["设计变更023","结构梁调整"], "location":"原始文档位置"}),
    (0, "CAD 未提供图层", "extracted", {"kind":"cad", "source_revision_id":r[0]["id"], "entity_id":"A17", "view_bounds":[10,20,40,60]}),
    (0, "CAD 空图层", "extracted", {"kind":"cad", "source_revision_id":r[0]["id"], "entity_id":"A18", "layer":None}),
    (0, "CAD 原始图层", "extracted", {"kind":"cad", "source_revision_id":r[0]["id"], "entity_id":"A19", "layer":"MEP-original-layer"}),
    (2, "专业建议未验证", "inferred", None),
]
evidence = tuple(Evidence(snapshot_id=snapshot.id, provider="trusted-e2e-synthetic-provider", source_id=r[i]["source_id"], source_revision_id=r[i]["id"], source_revision=r[i]["sha256"], observed_at=utcnow(), fact=fact, quality=quality, viewer_target=target, page=9, location="旧版位置不得推断定位", element_ids=("E2E-element-A",)) for i, fact, quality, target in specs)
EngineeringPublisher(factory).publish(project, EngineeringPublication(operation_id="trusted-e2e:"+project, evidence=evidence))
print(json.dumps([item.model_dump(mode="json") for item in evidence]))
engine.dispose()
`,
      JSON.stringify([project, revisions]),
      resolve("..", ".verification-work"),
    ],
    {
      cwd: resolve(".."),
      env: { ...process.env, PYTHONPATH: resolve("..", "backend") },
      encoding: "utf8",
    },
  );
  return JSON.parse(output) as DTO<"Evidence">[];
}

async function propose(request: APIRequestContext, project: string) {
  const revisions: DTO<"ProjectSourceRevision">[] = [];
  for (const [kind, name] of [
    ["DRAWING", "图纸"],
    ["BIM", "模型"],
    ["DOCUMENT", "变更文档"],
  ] as const) {
    const sourceResponse = await request.post(
      `/api/projects/${project}/sources`,
      { headers, data: { kind, name } satisfies DTO<"CreateProjectSource"> },
    );
    expect(sourceResponse.status()).toBe(201);
    const source = (await sourceResponse.json()) as DTO<"ProjectSource">;
    const upload = await request.post(
      `/api/projects/${project}/sources/${source.id}/revisions`,
      {
        headers,
        multipart: {
          file: {
            name: "synthetic-provider-input.txt",
            mimeType: "text/plain",
            buffer: Buffer.from(
              `Trusted e2e synthetic ${kind}; not engineering geometry`,
            ),
          },
        },
      },
    );
    expect(upload.ok()).toBe(true);
    revisions.push(
      ((await upload.json()) as DTO<"RevisionUploadResult">).revision,
    );
  }
  const evidence = publishTestEvidence(project, revisions);
  const target = evidence[0].viewer_target!;
  const draft = {
    title: "东翼净高变更需要人工判断",
    what_changed:
      "来源 R1 图纸与模型定位记录发生变化；测试 provider 未执行真实几何检测。",
    why_it_matters: "需工程师复核跨专业净高与设计变更。",
    evidence_ids: evidence.map((item) => item.id),
    dependencies: [
      {
        source_id: evidence[0].source_id,
        source_revision_id: target.source_revision_id,
        capability: "e2e-unavailable-clearance",
        expected_condition: "净高需工程验证",
        target,
      },
    ],
    impact: {
      work_package_ids: [],
      area_ids: [],
      element_ids: ["E2E-element-A"],
      disciplines: ["MEP", "Structure"],
    },
    suggested_discipline: "机电",
    suggested_action: "复核新版机电模型与结构梁净高",
    confidence: 0.71,
    limitations: ["合成 provider 数据；不代表真实测量或施工依据"],
  } satisfies DTO<"FindingDraft">;
  const response = await request.post(
    `/api/projects/${project}/engineering/findings`,
    { headers, data: draft },
  );
  expect(response.status()).toBe(201);
  return { finding: (await response.json()) as DTO<"Finding">, evidence };
}

for (const viewport of viewports) {
  test(`actual HTTP Finding propose / evidence / decisions / ReCheck ${viewport.width}×${viewport.height}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const project = await createProject(request);
    const { finding, evidence } = await propose(request, project.id);
    // Only timing is controlled; list/detail response bodies are actual backend DTOs.
    let releaseList!: () => void;
    let releaseDetail!: () => void;
    const listGate = new Promise<void>((done) => {
      releaseList = done;
    });
    const detailGate = new Promise<void>((done) => {
      releaseDetail = done;
    });
    const base = `/api/projects/${project.id}/engineering/findings`;
    await page.route(`**${base}`, async (route) => {
      await listGate;
      await route.continue();
    });
    await page.route(`**${base}/${finding.id}`, async (route) => {
      await detailGate;
      await route.continue();
    });
    await openProject(page, project.id);
    // The Findings list is gated. The panel merges project work, so the
    // Findings-only loading placeholder is not shown when a work row already
    // exists; the guarantee to keep is that the Finding is not fabricated while
    // its response is still in flight.
    await expect(
      page.getByRole("button", { name: new RegExp(finding.title) }),
    ).toHaveCount(0);
    await capture(page, "actual-list-loading");
    releaseList();
    const title = page.getByRole("button", { name: new RegExp(finding.title) });
    await expect(title).toBeVisible();
    await expectReducedMotion(page);
    // The Work surface is the adapted WorkspacePanel (plain controls), not a
    // donor Lit panel: assert its own composition rather than shadow-DOM substrate.
    await expect(
      page
        .getByRole("complementary", { name: "工作与审核" })
        .locator(".workspace-summary"),
    ).toBeVisible();
    await capture(page, "actual-list");
    await page.getByRole("button", { name: "浏览", exact: true }).click();
    // Donor tables virtualize rows; scroll the actual engineering group into view.
    await page
      .getByRole("region", { name: "工程判断", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: `打开 ${finding.title}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `打开 ${evidence[0].fact}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("正在读取项目记录…")).toHaveCount(0);
    await capture(page, "actual-browse-landing");
    await page
      .getByRole("searchbox", { name: "搜索项目对象" })
      .fill(finding.title);
    await capture(page, "actual-browse-results");
    await toolRail(page)
      .getByRole("button", { name: "工作", exact: true })
      .click();
    await title.click();
    const panel = page.getByRole("complementary", {
      name: "工作与审核",
    });
    await expect(panel.getByText("正在读取 Finding 详情…")).toBeVisible();
    await capture(page, "actual-detail-loading");
    releaseDetail();
    await expect(
      panel.getByRole("heading", { name: finding.title, exact: true }),
    ).toBeVisible();
    // Selecting a Finding does not replace the Work list with another mode.
    await expect(panel.locator(".workspace-list")).toBeVisible();
    await expect(title).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "搜索工作" })).toBeVisible();
    await expect(
      panel.getByRole("region", { name: "结构化与提取证据" }),
    ).toContainText("结构化 · 已验证");
    await expect(
      panel.getByRole("region", { name: "结构化与提取证据" }),
    ).toContainText("提取 · 来源内容");
    await expect(
      panel.getByRole("region", { name: "推断与 AI 建议" }),
    ).toContainText("不是已验证工程事实");
    await expect(
      panel.getByRole("region", { name: "结构化与提取证据" }),
    ).not.toContainText("专业建议未验证");
    // The engineering triad (change, consequence, next action) must be fully
    // readable in the docked receipt. The single panel now shows the list and
    // the receipt together, so at 1280×720 the receipt scrolls; bring each fact
    // into the receipt's own frame and require it to be wholly visible there.
    const receipt = panel.getByRole("region", { name: "Finding 详情" });
    for (const text of [
      finding.what_changed,
      finding.why_it_matters,
      finding.suggested_action!,
    ]) {
      const fact = receipt.getByText(text, { exact: true });
      await fact.scrollIntoViewIfNeeded();
      const bounds = await fact.boundingBox();
      const frame = await receipt.boundingBox();
      expect(bounds).not.toBeNull();
      // 1px tolerance absorbs sub-pixel scroll rounding at the frame edge.
      expect(bounds!.y).toBeGreaterThanOrEqual(frame!.y - 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
        frame!.y + frame!.height + 1,
      );
    }
    const findingDetails = receipt.locator("details");
    await expect(findingDetails).not.toHaveAttribute("open", "");
    await findingDetails.locator("summary").click();
    expect(
      JSON.parse(
        (await findingDetails
          .getByLabel("Exact Finding record")
          .textContent())!,
      ),
    ).toEqual(finding);
    await findingDetails.locator("summary").click();
    await receipt.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(panel.locator(".workspace-list")).toBeVisible();
    await capture(page, "actual-selected-finding");
    await page.getByRole("button", { name: "专注", exact: true }).click();
    await capture(page, "actual-selected-focus");
    await page.keyboard.press("f");
    for (const item of evidence) {
      await panel.getByRole("button", { name: new RegExp(item.fact) }).click();
      const host = page.locator(`[data-evidence-id="${item.id}"]`);
      await expect(host).toBeVisible();
      await expect(host).toHaveAttribute(
        "data-navigation-state",
        item.viewer_target ? "navigation_failed" : "missing_viewer_target",
      );
      await expect(host).toHaveAttribute("data-evidence-id", item.id);
      if (item.viewer_target) {
        // Pydantic canonical serialization materializes absent optional fields as null.
        const details = host.locator("details.evidence-technical-details");
        await expect(details).toHaveCount(1);
        await expect(details).not.toHaveAttribute("open", "");
        await details.locator("summary").click();
        expect(
          JSON.parse(
            (await host.getByLabel("Exact viewer target").textContent())!,
          ),
        ).toEqual(item.viewer_target);
        for (const value of [
          item.id,
          item.provider,
          item.source_revision,
          item.observed_at,
        ])
          await expect(details).toContainText(value);
        await details.locator("summary").click();
        await host.locator(".evidence-host-stage").evaluate((element) => {
          element.scrollTop = 0;
        });
        await expect(host).toHaveAttribute(
          "data-source-revision-id",
          item.viewer_target.source_revision_id,
        );
      } else {
        await expect(host).not.toHaveAttribute("data-viewer-target-kind");
        await expect(host).toContainText("不从旧版页码或位置推断目标");
      }
      await receipt.evaluate((element) => {
        element.scrollTop = 0;
      });
      await capture(page, `actual-evidence-${item.fact}`);
    }
    for (const action of ["确认", "忽略", "编辑", "证据不足"]) {
      const trigger = panel.getByRole("button", { name: action, exact: true });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      if (action === "证据不足") {
        await expect(page.getByRole("dialog")).toContainText("不可提交");
        await expect(
          page.getByRole("button", { name: "提交人工判断" }),
        ).toHaveCount(0);
      }
      await capture(page, `actual-action-${action}`);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    await panel.getByRole("button", { name: "编辑", exact: true }).click();
    let dialog = page.getByRole("dialog", {
      name: "编辑 Finding",
      exact: true,
    });
    await expect(
      dialog.getByRole("button", { name: "提交人工判断" }),
    ).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: "建议行动", exact: true })
      .fill("人工复核净高与吊顶");
    await dialog
      .getByRole("textbox", { name: "判断说明" })
      .fill("工程师调整建议行动");
    await dialog.getByRole("button", { name: "提交人工判断" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(panel).toContainText("人工复核净高与吊顶");
    await panel.getByRole("button", { name: "确认", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "提交人工判断" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      panel.getByRole("status").filter({ hasText: "已确认" }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "协调 / 复核", exact: true })
      .click();
    dialog = page.getByRole("dialog", {
      name: "协调 / ReCheck",
      exact: true,
    });
    await expect(
      dialog.getByRole("region", { name: "人工决策历史" }),
    ).toContainText("EDITED");
    await expect(
      dialog.getByRole("region", { name: "人工决策历史" }),
    ).toContainText("CONFIRMED");
    await dialog
      .getByRole("button", { name: "请求当前版本复核", exact: true })
      .click();
    const checksURL = `${base}/${finding.id}/rechecks`;
    await expect
      .poll(async () => {
        const checks = (await (
          await request.get(checksURL, { headers })
        ).json()) as DTO<"ReCheck">[];
        return checks.some((check) => check.outcome === "NEEDS_REVIEW");
      })
      .toBe(true);
    // Reopen the modal after the separate run/outcome queries have reconciled.
    await expect(
      dialog.getByRole("list", { name: "ReCheck 历史" }),
    ).toContainText("NEEDS_REVIEW");
    await expect(
      dialog.getByRole("list", { name: "ReCheck 历史" }),
    ).toContainText("COMPLETED");
    await capture(page, "actual-needs-review-history");
    await page.keyboard.press("Escape");
    await panel.getByRole("button", { name: "关闭", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "关闭 Finding", exact: true });
    await dialog
      .getByRole("textbox", { name: "判断说明" })
      .fill("不得用执行完成替代工程解决");
    const rejection = page.waitForResponse(
      (response) =>
        response.url().endsWith(`${finding.id}/decisions`) &&
        response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "提交人工判断" }).click();
    expect((await rejection).status()).toBe(409);
    await expect(dialog.getByRole("alert")).toBeVisible();
    await capture(page, "actual-close-rejected");
    await page.keyboard.press("Escape");
    for (const action of ["忽略", "重新打开"]) {
      await panel.getByRole("button", { name: action, exact: true }).click();
      const decision = page.getByRole("dialog");
      await decision
        .getByRole("textbox", { name: "判断说明" })
        .fill(`人工${action}，保留历史记录`);
      await decision.getByRole("button", { name: "提交人工判断" }).click();
      await expect(decision).toHaveCount(0);
    }
    const saved = (await (
      await request.get(`${base}/${finding.id}`, { headers })
    ).json()) as DTO<"Finding">;
    expect(saved.state).toBe("PROPOSED");
    expect(saved.suggested_action).toBe("人工复核净高与吊顶");
    const history = (await (
      await request.get(`${base}/${finding.id}/coordination`, { headers })
    ).json()) as DTO<"Coordination">[];
    expect(history.map((record) => record.decision).sort()).toEqual([
      "CONFIRMED",
      "DISMISSED",
      "EDITED",
      "REOPENED",
    ]);
    await panel
      .getByRole("button", { name: "协调 / 复核", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByRole("region", { name: "人工决策历史" }),
    ).toContainText("REOPENED");
    await capture(page, "actual-append-only-history");
    await page.keyboard.press("Escape");
    await page.reload();
    await toolRail(page)
      .getByRole("button", { name: "工作", exact: true })
      .click();
    await openWorkPanel(page);
    await page.getByRole("button", { name: new RegExp(saved.title) }).click();
    await expect(panel).toContainText("人工复核净高与吊顶");
    await panel.getByRole("button", { name: "关闭工作与审核面板" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".calm-work")).toBeFocused();
    await page.locator(".calm-work").click();
    await expect(panel).toBeVisible();
    await capture(page, "actual-panel-restored");
    expect(errors).toEqual([]);
    // Keep visual conformance strict, after exercising the HTTP/domain workflow.
    await page.getByRole("button", { name: "浏览", exact: true }).click();
    await page
      .getByRole("searchbox", { name: "搜索项目对象" })
      .fill(saved.title);
    await expectDonorTable(
      page.locator('bim-table[aria-label="工程判断对象"]'),
    );
  });

  test(`transport-mocked canonical DTO empty / read errors ${viewport.width}×${viewport.height}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const project = await createProject(request);
    let mode: "empty" | "list-error" | "detail-error" | "evidence-error" =
      "empty";
    const now = "2026-03-22T10:15:00Z";
    const finding = {
      id: "opaque-finding-id",
      project_id: project.id,
      snapshot_id: "snapshot-19",
      work_package_id: "",
      conclusion: "需人工复核",
      reasoning_summary: "来源变更",
      confidence: 0.7,
      limitations: [],
      created_at: now,
      updated_at: now,
      title: "服务读取故障验证",
      what_changed: "来源变更",
      why_it_matters: "需人工复核",
      evidence_ids: ["missing-evidence"],
      change_ids: [],
      dependencies: [],
      impact: null,
      suggested_discipline: null,
      suggested_action: null,
      state: "PROPOSED",
    } satisfies DTO<"Finding">;
    const base = `/api/projects/${project.id}/engineering`;
    // Only the engineering transport is mocked; project/auth/workspace are actual HTTP.
    await page.route(`**${base}/**`, async (route) => {
      expect(route.request().headers().authorization).toBe(
        headers.Authorization,
      );
      const path = new URL(route.request().url()).pathname;
      if (
        (mode === "list-error" && path === `${base}/findings`) ||
        (mode === "detail-error" &&
          path === `${base}/findings/${finding.id}`) ||
        path.includes("/evidence/")
      ) {
        await route.fulfill({
          status: 503,
          json: { detail: "工程服务暂不可用" },
        });
      } else
        await route.fulfill({
          json:
            path === `${base}/findings`
              ? mode === "empty"
                ? []
                : [finding]
              : path === `${base}/findings/${finding.id}`
                ? finding
                : [],
        });
    });
    await openProject(page, project.id);
    const panel = workPanel(page);
    await expect(panel).toBeVisible();
    // An empty project shows the empty receipt, not the "选择一项工程判断"
    // placeholder (which only renders when rows exist and nothing is selected).
    await expect(panel.getByText("还没有工作事项")).toBeVisible();
    await expect(panel).toContainText(
      "当前项目尚无资料版本或工程判断可供检查。",
    );
    await capture(page, "transport-mocked-empty");
    for (const next of [
      "list-error",
      "detail-error",
      "evidence-error",
    ] as const) {
      mode = next;
      await page.reload();
      await toolRail(page)
        .getByRole("button", { name: "工作", exact: true })
        .click();
      await openWorkPanel(page);

      if (next === "list-error") {
        await expect(
          page.getByRole("alert").filter({ hasText: "工程 Findings 不可用" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "重试读取 Findings" }),
        ).toBeEnabled();
      } else {
        await page
          .getByRole("button", { name: new RegExp(finding.title) })
          .click();
        if (next === "detail-error") {
          await expect(
            page.getByRole("alert").filter({ hasText: "Finding 读取失败" }),
          ).toBeVisible();
          await expect(
            page.getByRole("button", { name: "重试详情" }),
          ).toBeEnabled();
        } else {
          await expect(
            page.getByRole("alert").filter({ hasText: "Evidence 读取失败" }),
          ).toBeVisible();
          await expect(
            page.getByText("所选依据暂不可读，保留选择，不制造定位信息。"),
          ).toBeVisible();
          await expect(page.locator("[data-evidence-id]")).toHaveCount(0);
        }
      }
      await capture(page, `transport-mocked-${next}`);
    }
  });
}

test("actual empty project command / docking / layout / focus; no synthetic Finding", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = await createProject(request);
  await openProject(page, project.id);
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "搜索对象或操作" })
    .fill("工作 · Work");
  await page.keyboard.press("Enter");
  // The command navigates to the Work destination; the docked panel is a
  // togglable dock, so open it before reading it.
  const toggle = page.locator(".calm-work");
  await openWorkPanel(page);
  const panel = workPanel(page);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("当前项目尚无资料版本或工程判断可供检查。");
  await toggle.click();
  await expect(panel).toHaveCount(0);
  await toggle.click();
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "布局", exact: true }).click();
  const layout = page.getByRole("dialog", { name: "你的工作区" });
  await layout.getByRole("checkbox", { name: "锁定面板位置和尺寸" }).uncheck();
  await layout.getByRole("textbox", { name: "布局名称" }).fill("工程审查 API");
  await layout.getByRole("button", { name: "保存当前布局" }).click();
  await capture(page, "actual-layout");
  await layout.getByRole("button", { name: "完成", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "布局", exact: true }),
  ).toBeFocused();
  // Panel width and dock order are layout-dialog controls now, not a keyboard
  // separator or a grip on the work plane.
  const before = (await panel.boundingBox())!.width;
  await page.getByRole("button", { name: "布局", exact: true }).click();
  await layout.getByRole("slider", { name: "工作面板宽度" }).fill("440");
  await expect
    .poll(async () => (await panel.boundingBox())!.width)
    .toBeGreaterThan(before);
  const dock = layout.getByRole("combobox", { name: "工作与审核位置" });
  await dock.selectOption("left");
  await expect(panel).toHaveAttribute("data-dock-side", "left");
  await dock.selectOption("right");
  await expect(panel).toHaveAttribute("data-dock-side", "right");
  await layout.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("button", { name: "专注", exact: true }).click();
  await expect(page.locator(".calm-header")).toHaveCount(0);
  // Focus mode hides the chrome but keeps the docked Work surface mounted.
  await expect(panel).toBeVisible();
  await capture(page, "actual-focus");
  await page.keyboard.press("f");
  await expect(page.locator(".calm-header")).toBeVisible();
});

test("transport-mocked unavailable desktop service preserves recovery boundary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: () => Promise.reject(new Error("local service unavailable")),
    };
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toHaveText(
    "无法连接 Concord 本地服务。",
  );
  await expect(page.getByRole("button", { name: "重新连接" })).toBeEnabled();
  await expect(
    page.getByRole("complementary", { name: "工作与审核" }),
  ).toHaveCount(0);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("alert")).toHaveText(
      "无法连接 Concord 本地服务。",
    );
    await capture(page, "transport-mocked-service-unavailable");
  }
});
