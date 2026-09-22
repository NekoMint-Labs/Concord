import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Workspace } from "../src/api/client";

const headers = { Authorization: "Bearer local-demo-admin" };
const project = "/api/projects/harbor-east";
// Fail at test collection, rather than skip, when the real SDK fixture was not generated.
const fixture = fileURLToPath(
  new URL("../../fixtures/harbor-east.ifc", import.meta.url),
);
const fixtureV16 = fileURLToPath(
  new URL("../../fixtures/harbor-east-v16.ifc", import.meta.url),
);
const fixtureV17 = fileURLToPath(
  new URL("../../fixtures/harbor-east-v17.ifc", import.meta.url),
);
const original = readFileSync(fixture);
const digest = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");

async function workspace(request: APIRequestContext): Promise<Workspace> {
  const response = await request.get(`${project}/workspace`, { headers });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<Workspace>;
}

test("real IFC renders, matches analysis GUIDs, imports, and downloads unchanged", async ({
  request,
  page,
}) => {
  const errors: string[] = [];
  const remote: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      /^https?:$/.test(url.protocol) &&
      !["127.0.0.1", "localhost"].includes(url.hostname)
    )
      remote.push(url.href);
  });
  const reset = await request.post("/api/demo/reset", { headers });
  expect(reset.status()).toBe(202);
  const resetRun = await reset.json();
  await expect
    .poll(async () => {
      const state = await workspace(request);
      return (
        state.run?.id === resetRun.id &&
        state.run.status === "COMPLETED" &&
        !state.stale
      );
    })
    .toBe(true);
  /*
   * The viewer highlights the analysis's own impact set, and the reset state is
   * clean by construction, so this test needs a real judgement that reports
   * impacts. The event is posted through the API rather than through 记录变更,
   * because the product path for recording a change - the composer, its menus, and
   * the blocked workspace that follows - is coordination.spec.ts's subject. This
   * file's subject is what the viewer does with the judgement, so the judgement is
   * established with the narrowest deterministic setup and the browser is then
   * required to render it.
   */
  const change = await request.post(`${project}/events`, {
    headers,
    data: {
      id: randomUUID(),
      project_id: "harbor-east",
      work_package_id: "WP-200",
      kind: "design_revision",
      title: "IFC E2E design update",
      change: { revision: "V17" },
    },
  });
  expect(change.status()).toBe(202);
  let impacted: string[] = [];
  await expect
    .poll(async () => {
      const state = await workspace(request);
      impacted = state.analysis?.impact.element_ids ?? [];
      return !state.stale && impacted.length > 0;
    })
    .toBe(true);

  await page.addInitScript(() => {
    sessionStorage.setItem("cca-token", "local-demo-admin");
    localStorage.setItem("concord:last-project", "harbor-east");
  });
  await page.goto("/");
  await page.getByText("东翼风管安装", { exact: true }).first().click();
  /*
   * The work package reports the judgement beside its own title, so the browser is
   * demonstrably rendering the same analysis whose impacted GUIDs the viewer is
   * about to match - not a second, unrelated state assembled for the assertion.
   */
  await expect(page.locator(".coordination-state-tag")).toContainText("已阻塞");
  await page
    .getByRole("navigation", { name: "工作区视图" })
    .getByRole("button", { name: "BIM", exact: true })
    .click();
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/bim/import"))
      uploads.push(request.url());
  });
  await page
    .getByLabel("本地 IFC 文件", { exact: true })
    .setInputFiles(fixture);
  const viewer = page.getByLabel("IFC 模型查看器", { exact: true });
  await expect(viewer.locator("canvas")).toBeVisible();
  // Every GUID the analysis reports as impacted has to be found in the real model,
  // so the total is the analysis's own count and the matched count must be non-zero.
  await expect(viewer.getByRole("status")).toContainText(
    new RegExp(`[1-9]\\d*/${impacted.length} 个受影响构件 GUID`),
  );
  expect(uploads).toEqual([]); // Merely opening a local file must never upload it.
  await viewer.getByRole("button", { name: "聚焦", exact: true }).click();
  await expect(
    viewer.getByRole("button", { name: "隔离", exact: true }),
  ).toBeEnabled();
  await viewer.getByRole("button", { name: "隔离", exact: true }).click();
  await expect(
    viewer.getByRole("button", { name: "显示全部", exact: true }),
  ).toBeEnabled();
  await viewer.getByRole("button", { name: "显示全部", exact: true }).click();
  await expect(
    viewer.getByRole("button", { name: "聚焦", exact: true }),
  ).toBeEnabled();
  await expect(viewer.getByRole("alert")).toHaveCount(0);

  const upload = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/bim/import"),
  );
  await page.getByRole("button", { name: "导入项目", exact: true }).click();
  expect((await upload).status()).toBe(202);
  await expect(
    page
      .locator(".bim-workspace")
      .getByRole("status")
      .filter({ hasText: "导入 已完成。" }),
  ).toBeVisible();
  expect(uploads).toHaveLength(1);
  const source = await request.get(`${project}/bim/content`, { headers });
  expect(source.status()).toBe(200);
  expect(digest(await source.body())).toBe(digest(original));
  const elements = await request.get(`${project}/bim/elements`, { headers });
  expect(elements.ok()).toBeTruthy();
  expect((await elements.json()).length).toBe(3);
  await page.getByRole("button", { name: "结构化视图", exact: true }).click();
  await expect(page.locator(".bim-element")).toHaveCount(3);
  await expect(viewer).toHaveCount(0);
  await page.getByRole("button", { name: "打开项目 IFC", exact: true }).click();
  await expect(viewer.getByRole("status")).toContainText(
    /project-import\.ifc：已匹配 [1-9]\d*\/[1-9]\d* 个受影响构件 GUID/,
  );
  await expect(viewer.getByRole("alert")).toHaveCount(0);
  expect(remote).toEqual([]); // WASM and fragment worker must be bundled locally.
  expect(errors).toEqual([]);
});

test("real project survives restart through source, BIM mapping, baseline, revision impact, and investigation", async ({
  request,
  page,
}) => {
  const name = `Campus Lab ${randomUUID().slice(0, 8)}`;
  await page.addInitScript(() => {
    sessionStorage.setItem("cca-token", "local-demo-admin");
    localStorage.removeItem("concord:last-project");
    localStorage.removeItem("concord:recent-projects");
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "新建项目" })).toBeVisible();
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.getByLabel("项目名称").fill(name);
  await page.getByLabel("说明").fill("Issue 10 browser qualification");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "添加" }).click();
  const structure = page.locator(".structure-dialog");
  await structure.getByLabel("名称").first().fill("East wing");
  await structure.getByLabel("楼层").fill("L02");
  await structure.getByRole("button", { name: "保存区域" }).click();
  const areaOption = structure.getByRole("option", { name: /East wing/ });
  await expect(areaOption).toBeAttached();
  await structure
    .getByLabel("区域")
    .selectOption((await areaOption.getAttribute("value"))!);
  await structure.getByLabel("名称").nth(1).fill("Ventilation");
  await structure.getByLabel("专业").fill("MEP");
  await structure.getByLabel("负责人").fill("Team A");
  await structure.getByRole("button", { name: "保存工作包" }).click();
  await expect(
    page.getByText("Ventilation", { exact: true }).first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  const projects = await request.get("/api/projects", { headers });
  const created = (await projects.json()).find(
    (item: { name: string }) => item.name === name,
  );
  expect(created).toBeTruthy();
  const projectPath = `/api/projects/${created.id}`;

  await page
    .getByRole("navigation", { name: "工作区视图" })
    .getByRole("button", { name: "项目来源", exact: true })
    .click();
  await page.getByRole("button", { name: "新建来源" }).click();
  await page.getByLabel("来源名称").fill("MEP Model");
  await page.getByRole("button", { name: "创建来源" }).click();
  await expect(
    page.getByText("MEP Model", { exact: true }).first(),
  ).toBeVisible();

  const revisionInput = page.locator(".source-detail input[type=file]");
  await revisionInput.setInputFiles(fixtureV16);
  await expect(page.getByText(/R1 原始文件已保存/)).toBeVisible();
  await page
    .locator(".revision-row")
    .first()
    .getByRole("button", { name: "导入 / 查看运行" })
    .click();
  const sourceList = await request.get(`${projectPath}/sources`, { headers });
  const source = (await sourceList.json())[0];
  const revisionList = await request.get(
    `${projectPath}/sources/${source.source.id}/revisions`,
    { headers },
  );
  const [r1] = await revisionList.json();
  await expect
    .poll(async () =>
      (
        await request.get(
          `${projectPath}/sources/${source.source.id}/revisions/${r1.id}/bim-snapshot`,
          { headers },
        )
      ).status(),
    )
    .toBe(200);

  await page.getByText("Ventilation", { exact: true }).first().click();
  await page.getByRole("button", { name: "关联 BIM" }).click();
  await expect(page.getByText(/3 个候选构件/)).toBeVisible();
  await page.getByRole("button", { name: "选择全部" }).click();
  await expect(
    page.getByLabel("IFC 模型查看器").locator("canvas"),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认关联 3 个构件" }).click();
  await expect
    .poll(async () => {
      const response = await request.get(
        `${projectPath}/sources/${source.source.id}/bim-bindings?revision_id=${r1.id}`,
        { headers },
      );
      return (await response.json()).length;
    })
    .toBe(3);

  await page
    .getByRole("navigation", { name: "工作区视图" })
    .getByRole("button", { name: "项目来源", exact: true })
    .click();
  await page.getByRole("button", { name: "接受为 B1" }).click();
  await expect(page.getByText("B1", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Ventilation", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "工作区视图" })
    .getByRole("button", { name: "项目来源", exact: true })
    .click();
  await expect(
    page.getByText("MEP Model", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("B1", { exact: true })).toBeVisible();

  await revisionInput.setInputFiles(fixtureV17);
  await expect(page.getByText(/R2 原始文件已保存/)).toBeVisible();
  const rows = page.locator(".revision-row");
  await rows.last().getByRole("button", { name: "导入 / 查看运行" }).click();
  const revisionsAfter = await request.get(
    `${projectPath}/sources/${source.source.id}/revisions`,
    { headers },
  );
  const allRevisions = await revisionsAfter.json();
  const r2 = allRevisions.at(-1);
  await expect
    .poll(async () =>
      (
        await request.get(
          `${projectPath}/sources/${source.source.id}/revisions/${r2.id}/bim-snapshot`,
          { headers },
        )
      ).status(),
    )
    .toBe(200);
  await page.reload();
  await page
    .getByRole("navigation", { name: "工作区视图" })
    .getByRole("button", { name: "项目来源", exact: true })
    .click();
  await expect(page.getByText("最新 · 待接受")).toBeVisible();
  await page.getByRole("button", { name: "比较最近两个版本" }).click();
  await expect(page.locator(".impact-summary")).toContainText("新增");
  await expect(page.locator(".revision-impact")).toContainText(
    /受影响工作包|有构件变化/,
  );

  await rows.last().getByRole("button", { name: "调查版本" }).click();
  let investigationRun: { id: string; status: string } | undefined;
  await expect
    .poll(
      async () => {
        const runs = await request.get(`${projectPath}/runs`, { headers });
        investigationRun = (await runs.json())
          .filter(
            (run: { category: string }) => run.category === "investigation",
          )
          .at(-1);
        return investigationRun?.status;
      },
      { timeout: 30_000 },
    )
    .toMatch(/COMPLETED|WAITING_APPROVAL/);
  expect(investigationRun).toBeTruthy();
  const investigation = await request.get(
    `${projectPath}/agent/investigations/${investigationRun!.id}`,
    { headers },
  );
  expect(investigation.ok()).toBeTruthy();
  const report = await investigation.json();
  expect(report.scope).toMatchObject({
    source_id: source.source.id,
    from_revision_id: r1.id,
    to_revision_id: r2.id,
  });
  expect(report.persisted).toBe(true);
  expect(report.evidence.length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();

  const picker = page.getByRole("button", { name: "项目", exact: true });
  await picker.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "新建项目" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "打开项目…" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "项目设置" })).toBeVisible();
});
