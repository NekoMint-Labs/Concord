import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
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

/** Open the project sheet's source register, optionally selecting a source. */
async function openSources(page: Page, sourceName?: string) {
  await page
    .getByRole("navigation", { name: "主要工作区" })
    .getByRole("button", { name: "项目", exact: true })
    .click();
  const register = page.getByRole("region", {
    name: "项目资料",
    exact: true,
  });
  await expect(register).toBeVisible();
  if (sourceName) {
    await register
      .getByRole("button", { name: new RegExp(sourceName) })
      .click();
    await expect(
      page.getByRole("complementary", { name: "资料上下文" }),
    ).toBeVisible();
  }
  return register;
}

async function openPackage(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "主要工作区" })
    .getByRole("button", { name: "项目", exact: true })
    .click();
  await page
    .getByRole("region", { name: "工作包状态" })
    .getByRole("button", { name: "查看全部 →" })
    .click();
  await page
    .getByRole("region", { name: "项目工作包" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
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
  await openPackage(page, "东翼风管安装");
  /*
   * The work package reports the judgement beside its own title, so the browser is
   * demonstrably rendering the same analysis whose impacted GUIDs the viewer is
   * about to match - not a second, unrelated state assembled for the assertion.
   */
  await expect(
    page
      .getByRole("region", { name: "工作包概览" })
      .getByRole("heading", { level: 2, name: /已阻塞|待批准/ }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "主要工作区" })
    .getByRole("button", { name: "模型", exact: true })
    .click();
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/revisions") &&
      !request.url().includes("/import")
    )
      uploads.push(request.url());
  });
  await page
    .getByLabel("本地 IFC 文件", { exact: true })
    .setInputFiles(fixture);
  const viewer = page.getByLabel("IFC 模型查看器", { exact: true });
  await expect(viewer.locator("canvas")).toBeVisible();
  // Local files must not inherit project impact or package attribution. The
  // imported project model is still required to match analysis GUIDs below.
  await expect(viewer.getByRole("status")).toContainText(
    "0/0 个受影响构件 GUID",
  );
  expect(uploads).toEqual([]); // Merely opening a local file must never upload it.

  // Native model actions dismiss on Escape and outside pointer interaction.
  const modelMenu = page.locator(".spatial-source-actions");
  await modelMenu.locator("summary").click();
  await page.keyboard.press("Escape");
  await expect(modelMenu).toHaveJSProperty("open", false);
  await expect(modelMenu.locator("summary")).toBeFocused();
  await modelMenu.locator("summary").click();
  await viewer.click();
  await expect(modelMenu).toHaveJSProperty("open", false);
  // A loaded model keeps source actions behind its native Model disclosure.
  await page
    .getByRole("region", { name: "模型工作区" })
    .locator("summary")
    .click();
  const upload = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/revisions") &&
      !response.url().includes("/import"),
  );
  await page.getByRole("button", { name: "添加到项目", exact: true }).click();
  expect((await upload).status()).toBe(201);
  await expect(
    page
      .locator(".bim-workspace")
      .getByRole("status")
      .filter({ hasText: "处理完成" }),
  ).toBeVisible();
  expect(uploads).toHaveLength(1);
  const catalog = await request.get(`${project}/sources`, { headers });
  const importedModel = (await catalog.json()).find(
    (item: { source: { kind: string } }) => item.source.kind === "BIM",
  );
  const content = await request.get(
    `${project}/sources/${importedModel.source.id}/revisions/${importedModel.latest_revision_id}/content`,
    { headers },
  );
  expect(content.status()).toBe(200);
  expect(digest(await content.body())).toBe(digest(original));
  const snapshot = await request.get(
    `${project}/sources/${importedModel.source.id}/revisions/${importedModel.latest_revision_id}/bim-snapshot`,
    { headers },
  );
  expect(snapshot.ok()).toBeTruthy();
  expect((await snapshot.json()).elements.length).toBe(3);
  // Inspector project tabs, menus and focus handoff belong to the imported model.
  const spatial = page.getByRole("region", { name: "模型工作区" });
  const pane = spatial.locator("#spatial-inspector-pane");
  const divider = spatial.getByRole("separator", { name: "调整构件详情宽度" });
  const originalWidth = (await pane.boundingBox())!.width;
  expect(originalWidth).toBeGreaterThanOrEqual(270);
  expect(originalWidth).toBeLessThanOrEqual(460);
  const grip = (await divider.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 60, grip.y + grip.height / 2, { steps: 8 });
  await page.mouse.up();
  const resizedWidth = (await pane.boundingBox())!.width;
  expect(resizedWidth).toBeGreaterThan(originalWidth + 35);
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await pane.boundingBox())!.width)
    .toBeLessThan(resizedWidth);
  const keyboardWidth = (await pane.boundingBox())!.width;
  expect(
    await page.evaluate(() =>
      localStorage.getItem("react-resizable-panels:spatial-inspector"),
    ),
  ).toContain("spatial-inspector-pane");
  await page.setViewportSize({ width: 1050, height: 720 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect
    .poll(async () => (await pane.boundingBox())!.width)
    .toBeGreaterThan(keyboardWidth - 5);
  await page.reload();
  await page
    .getByRole("navigation", { name: "主要工作区" })
    .getByRole("button", { name: "模型", exact: true })
    .click();
  await expect
    .poll(async () => (await pane.boundingBox())!.width)
    .toBeGreaterThan(keyboardWidth - 5);
  await expect(viewer.getByRole("status")).toContainText("受影响构件 GUID");

  const options = spatial.getByRole("button", { name: "检查器选项" });
  await options.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "重置面板宽度" }).click();
  await expect
    .poll(async () => (await pane.boundingBox())!.width)
    .toBeGreaterThanOrEqual(310);
  await options.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "收起检查器" }).click();
  await expect(
    spatial.getByRole("button", { name: "展开检查器" }),
  ).toBeVisible();
  await spatial.getByRole("button", { name: "展开检查器" }).click();
  await expect(options).toBeVisible();

  const tabs = spatial.getByRole("tablist", { name: "构件上下文" });
  await tabs.getByRole("tab", { name: /变更/ }).click();
  await expect(tabs.getByRole("tab", { name: /变更/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await tabs.getByRole("tab", { name: /问题/ }).click();
  await expect(tabs.getByRole("tab", { name: /问题/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await tabs.getByRole("tab", { name: "概览" }).click();
  const projection = viewer.getByLabel("投影视图");
  await projection.getByRole("button", { name: "2D" }).click();
  await expect(viewer).toHaveAttribute("data-view-mode", "2d");
  await projection.getByRole("button", { name: "3D" }).click();
  await expect(viewer).toHaveAttribute("data-view-mode", "3d");
  const modelTools = viewer.getByLabel("模型工具");
  await expect(
    modelTools.getByRole("button", { name: "聚焦", exact: true }),
  ).toBeEnabled();
  await modelTools.getByRole("button", { name: "聚焦", exact: true }).click();
  await expect(
    modelTools.getByRole("button", { name: "隔离", exact: true }),
  ).toBeEnabled();
  await modelTools.getByRole("button", { name: "隔离", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-isolated", "true");
  await modelTools.getByRole("button", { name: "选择", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-isolated", "false");
  await modelTools.getByRole("button", { name: "隔离", exact: true }).click();
  await expect(
    modelTools.getByRole("button", { name: "显示全部", exact: true }),
  ).toBeEnabled();
  await modelTools
    .getByRole("button", { name: "显示全部", exact: true })
    .click();
  await expect(viewer).toHaveAttribute("data-isolated", "false");
  await expect(
    modelTools.getByRole("button", { name: "聚焦", exact: true }),
  ).toBeEnabled();
  await expect(viewer.getByRole("alert")).toHaveCount(0);

  // The current model keeps structured impacted elements in 模型上下文
  // alongside the viewer rather than switching to a separate list view.
  const context = page.getByRole("region", { name: "模型上下文" });
  await context.getByRole("button", { name: "展开上下文列表" }).click();
  await expect(context.getByRole("row")).toHaveCount(impacted.length + 1);
  await expect(page.getByText(/项目模型 · R1/).first()).toBeVisible();
  await expect(viewer.getByRole("status")).toContainText(
    new RegExp(
      `project-model\\.ifc：已匹配 [1-9]\\d*/${impacted.length} 个受影响构件 GUID`,
    ),
  );
  await expect(
    spatial.getByRole("status").filter({ hasText: "本地预览" }),
  ).toHaveCount(0);
  await expect(viewer.getByRole("alert")).toHaveCount(0);
  const selectedRow = context.getByRole("row").nth(1);
  const selectedTitle = (await selectedRow
    .getByRole("button")
    .textContent())!.trim();
  await selectedRow.getByRole("button").click();
  await expect(
    spatial.getByRole("complementary", { name: "构件详情" }),
  ).toContainText(selectedTitle);
  await options.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "技术详情" }).click();
  await expect(
    spatial.getByRole("button", { name: "技术详情" }),
  ).toHaveAttribute("aria-expanded", "true");
  const globalId = spatial
    .locator(".disclosure-inner > .element-facts")
    .getByText("GlobalId", { exact: true })
    .locator("..")
    .locator("dd");
  const identifierStyle = await globalId.evaluate((element) => ({
    size: parseFloat(getComputedStyle(element).fontSize),
    wrap: getComputedStyle(element).whiteSpace,
  }));
  expect(identifierStyle.size).toBeGreaterThanOrEqual(12);
  expect(identifierStyle.wrap).toBe("normal");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await options.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "复制构件信息" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    selectedTitle,
  );
  await openPackage(page, "东翼风管安装");
  await expect(page.getByRole("region", { name: "工作包概览" })).toBeVisible({
    timeout: 10_000,
  });
  await page
    .getByRole("navigation", { name: "工作包栏目" })
    .getByRole("button", { name: /问题/ })
    .click();
  await page.getByRole("button", { name: "在模型中查看 →" }).click();
  await expect(page.getByRole("region", { name: "空间问题" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "主要工作区" })
    .getByRole("button", { name: "模型", exact: true })
    .click();
  await expect(
    spatial.getByRole("complementary", { name: "构件详情" }),
  ).toContainText("送风管 E-01");
  await page.reload();
  await page
    .getByRole("navigation", { name: "主要工作区" })
    .getByRole("button", { name: "模型", exact: true })
    .click();
  await expect(viewer.getByRole("status")).toContainText("project-model.ifc");
  await expect
    .poll(
      async () =>
        (await page.locator("#spatial-inspector-pane").boundingBox())!.width,
    )
    .toBeGreaterThanOrEqual(310);
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
  const createProject = page.getByRole("button", { name: "新建项目" });
  const projectPicker = page.getByRole("button", {
    name: "切换项目",
    exact: true,
  });
  await expect(createProject.or(projectPicker).first()).toBeVisible();
  if (await projectPicker.isVisible()) {
    await projectPicker.click();
    await page.getByRole("menuitem", { name: "新建项目" }).click();
  } else {
    await createProject.click();
  }
  await page.getByLabel("项目名称").fill(name);
  await page.getByLabel("说明").fill("Issue 10 browser qualification");
  await page
    .getByRole("dialog", { name: "新建项目" })
    .getByRole("button", { name: "创建项目" })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "当前位置" })
      .getByText(name, { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "主要工作区" })
    .getByRole("button", { name: "项目", exact: true })
    .click();
  await page
    .getByRole("region", { name: "当前状态" })
    .getByRole("button", { name: "添加工作包 →", exact: true })
    .click();
  const structure = page.getByRole("dialog", { name: "新建工作包" });
  await structure
    .getByRole("region", { name: "新建区域" })
    .getByLabel("区域名称")
    .fill("East wing");
  await structure.getByLabel("楼层").fill("L02");
  await structure.getByRole("button", { name: "保存并使用此区域" }).click();
  const area = structure.getByRole("combobox", { name: "所属区域" });
  await expect(area).toContainText("East wing");
  await area.click();
  await page.getByRole("option", { name: "East wing" }).click();
  await structure.getByLabel("工作包名称").fill("Ventilation");
  await structure.getByLabel("专业").fill("MEP");
  await structure.getByLabel("负责人").fill("Team A");
  await structure.getByRole("button", { name: "创建工作包" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Ventilation" }),
  ).toBeVisible();

  const projects = await request.get("/api/projects", { headers });
  const created = (await projects.json()).find(
    (item: { name: string }) => item.name === name,
  );
  expect(created).toBeTruthy();
  const projectPath = `/api/projects/${created.id}`;

  // New projects add a logical source and its first revision in one dialog.
  const register = await openSources(page);
  await register.getByRole("button", { name: "资料操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "添加资料", exact: true }).click();
  const addDialog = page.getByRole("dialog", { name: "添加资料", exact: true });
  await addDialog.getByLabel("选择文件（可多选）").setInputFiles(fixtureV16);
  await addDialog
    .getByLabel(/新资料名称 · harbor-east-v16\.ifc/)
    .fill("MEP Model");
  const firstUpload = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/revisions"),
  );
  await addDialog.getByRole("button", { name: "上传并处理" }).click();
  expect((await firstUpload).status()).toBe(201);
  await expect(addDialog.getByRole("status")).toContainText("R1");
  await addDialog.getByRole("button", { name: "完成", exact: true }).click();

  const sourceList = await request.get(`${projectPath}/sources`, { headers });
  const source = (await sourceList.json()).find(
    (item: { source: { name: string } }) => item.source.name === "MEP Model",
  );
  expect(source).toBeTruthy();
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

  await openPackage(page, "Ventilation");
  await page
    .getByRole("navigation", { name: "主要工作区" })
    .getByRole("button", { name: "模型", exact: true })
    .click();
  await page.getByRole("button", { name: "关联 BIM" }).click();
  const mapping = page.locator(".bim-workspace.is-mapping");
  await expect(mapping).toBeVisible();
  const candidates = mapping.getByRole("region", { name: "关联候选构件" });
  await expect(candidates).toContainText(/3 个候选构件/);
  await candidates.getByRole("button", { name: "选择全部" }).click();
  await expect(
    page.getByLabel("IFC 模型查看器").locator("canvas"),
  ).toBeVisible();
  await mapping.getByRole("button", { name: "确认关联 3 个构件" }).click();
  await expect
    .poll(async () => {
      const response = await request.get(
        `${projectPath}/sources/${source.source.id}/bim-bindings?revision_id=${r1.id}`,
        { headers },
      );
      return (await response.json()).length;
    })
    .toBe(3);

  const baselineRegister = await openSources(page, "MEP Model");
  await baselineRegister
    .getByRole("button", { name: "基线记录与操作", exact: true })
    .click();
  await baselineRegister.getByRole("button", { name: "确认新基线" }).click();
  const baselineDialog = page.getByRole("dialog", { name: "确认基线 B1" });
  await expect(baselineDialog).toContainText("MEP Model");
  await expect(baselineDialog).toContainText("R1");
  await baselineDialog
    .getByRole("button", { name: "确认 B1", exact: true })
    .click();
  await expect(baselineDialog).not.toBeVisible();
  await expect(baselineRegister.locator(".baseline-entry")).toHaveCount(1);
  await expect(
    baselineRegister.getByRole("button", { name: /^B1 · 1 个资料版本/ }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByRole("navigation", { name: "当前位置" })
      .getByText(name, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "等待中" })).toContainText(
    "Ventilation",
  );
  const reloadedRegister = await openSources(page, "MEP Model");
  await reloadedRegister
    .getByRole("button", { name: "基线记录与操作", exact: true })
    .click();
  await expect(reloadedRegister.locator(".baseline-entry")).toHaveCount(1);
  await expect(
    reloadedRegister.getByRole("button", { name: /^B1 · 1 个资料版本/ }),
  ).toBeVisible();

  await reloadedRegister
    .getByRole("button", { name: "资料操作", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "添加资料", exact: true }).click();
  const secondDialog = page.getByRole("dialog", {
    name: "添加资料",
    exact: true,
  });
  await secondDialog.getByLabel("选择文件（可多选）").setInputFiles(fixtureV17);
  await secondDialog.getByRole("combobox").click();
  await page
    .getByRole("option", { name: "MEP Model · 添加版本", exact: true })
    .click();
  const secondUpload = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/revisions"),
  );
  await secondDialog.getByRole("button", { name: "上传并处理" }).click();
  expect((await secondUpload).status()).toBe(201);
  await expect(secondDialog.getByRole("status")).toContainText("R2");
  await secondDialog.getByRole("button", { name: "完成", exact: true }).click();
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
  await openSources(page, "MEP Model");
  const impact = page.getByRole("region", {
    name: "基线与最新版本比较",
    exact: true,
  });
  await impact
    .getByRole("button", { name: "比较详情与操作", exact: true })
    .click();
  await expect(impact).toContainText("新版本待审核");
  await impact
    .locator(".impact-empty")
    .getByRole("button", { name: "查看变化" })
    .click();
  await expect(page.locator(".impact-summary")).toContainText("新增");
  await expect(page.locator(".revision-impact")).toContainText(
    /受影响工作包|有构件变化/,
  );

  const revisionHistory = page
    .getByRole("complementary", { name: "资料上下文" })
    .getByRole("button", { name: "版本历史与操作", exact: true });
  if ((await revisionHistory.getAttribute("aria-expanded")) === "false") {
    await revisionHistory.click();
  }
  await page
    .locator(".sources-context-revision")
    .filter({ hasText: "R2" })
    .getByRole("button", { name: "调查此版本", exact: true })
    .click();
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
  await expect(
    page
      .getByRole("navigation", { name: "当前位置" })
      .getByText(name, { exact: true }),
  ).toBeVisible();
  const completed = page.getByRole("region", { name: "最近完成" });
  await expect(completed).toContainText("Concord 已完成调查");
  await completed.getByRole("button", { name: "Concord 已完成调查" }).click();
  await page
    .getByRole("complementary", { name: "所选工作事项" })
    .getByRole("button", { name: "查看调查依据" })
    .click();
  await expect(
    page.getByRole("complementary", { name: "工程调查详情" }),
  ).toContainText("判断依据");

  const picker = page.getByRole("button", { name: "切换项目", exact: true });
  await picker.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "新建项目" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "打开项目…" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "项目设置" })).toBeVisible();
});
