import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  expectDonor,
  expectDonorTable,
  openWorkPanel,
  selectDonorTab,
  toolRail,
  workPanel,
} from "./donor-conformance";

const screenshots = resolve(
  "..",
  ".verification-work",
  process.env.CONCORD_VISUAL_DIR ?? "desktop-workspace",
);

test("composed Work queue, persistent selection and project lanes across donor widths", async ({
  page,
  request,
}) => {
  const reset = await request.post("/api/demo/reset", {
    headers: { Authorization: "Bearer local-demo-admin" },
  });
  expect(reset.status()).toBe(202);
  const run = await reset.json();
  await expect
    .poll(async () => {
      const response = await request.get(
        "/api/projects/harbor-east/workspace",
        {
          headers: { Authorization: "Bearer local-demo-admin" },
        },
      );
      const workspace = await response.json();
      return (
        workspace.run?.id === run.id && workspace.run?.status === "COMPLETED"
      );
    })
    .toBe(true);
  await page.addInitScript(() => {
    sessionStorage.setItem("cca-token", "local-demo-admin");
    localStorage.setItem("concord:last-project", "harbor-east");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  mkdirSync(screenshots, { recursive: true });
  const nav = toolRail(page);
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [name, label] of [
      ["work", "工作"],
      ["project", "项目"],
    ] as const) {
      await nav.getByRole("button", { name: label, exact: true }).click();
      await expect(
        nav.getByRole("button", { name: label, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.screenshot({
        path: resolve(screenshots, `${name}-${width}x${height}.png`),
        animations: "disabled",
      });
      if (name === "work") {
        await openWorkPanel(page);
        const list = workPanel(page);
        const detail = list.getByRole("region", { name: "所选工作事项" });
        await expect(detail).toHaveCount(0);
        // The docked panel is now the only Work surface; it stays docked at the
        // configured layout width instead of the removed full-width centre queue.
        const panel = await list.boundingBox();
        expect(panel!.width).toBeGreaterThanOrEqual(280);
        expect(panel!.width).toBeLessThanOrEqual(480);
        expect(panel!.x + panel!.width).toBeLessThanOrEqual(width);
        await selectDonorTab(list, "已处理");
        const rows = list.locator("button.workspace-row");
        const first = rows.first();
        // Row titles are the panel's body-size card titles, not a donor label.
        const rowTitle = await first
          .locator(".workspace-row-top strong")
          .evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          );
        expect(rowTitle).toBeGreaterThanOrEqual(13);
        await first.focus();
        await page.keyboard.press("Enter");
        await expect(first).toHaveAttribute("aria-pressed", "true");
        await expect(detail).toBeVisible();
        // The receipt is readable: it never overflows the docked panel.
        expect((await detail.boundingBox())!.width).toBeLessThanOrEqual(
          panel!.width,
        );
        await page.screenshot({
          path: resolve(screenshots, `work-selection-${width}x${height}.png`),
          animations: "disabled",
        });
        // The authoritative action is data-driven (1 or 2 actions, not a count).
        await expect(
          detail
            .locator(".workspace-inspector-actions")
            .getByRole("button")
            .first(),
        ).toBeVisible();
        // 当前判断 is a receipt field now, not a separate region.
        await expect(detail).toContainText("当前判断");
        await expect(
          detail.getByRole("region", { name: "项目状态" }),
        ).toHaveCount(0);
        await first.focus();
        await page.keyboard.press("Tab");
        const nextDecision = rows.nth(1);
        await expect(nextDecision).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(nextDecision).toHaveAttribute("aria-pressed", "true");
        await expect(first).toHaveAttribute("aria-pressed", "false");
        // The receipt title is the third-level heading in the docked receipt.
        await expect(detail.getByRole("heading", { level: 3 })).toHaveText(
          (
            await nextDecision.locator(".workspace-row-top strong").innerText()
          ).trim(),
        );
        // Selection is persistent, not a dismissible overlay; Escape must not trap focus.
        await page.keyboard.press("Escape");
        await expect(detail).toBeVisible();
        await expect(nextDecision).toBeFocused();
      } else {
        const pane = await page
          .getByRole("complementary", { name: "项目上下文" })
          .boundingBox();
        expect(pane!.width).toBeGreaterThanOrEqual(280);
        expect(pane!.width).toBeLessThanOrEqual(340);
        const packages = page.locator("bim-table.project-package-table");
        await expectDonorTable(packages);
        const lane = await packages
          .locator("bim-table-row:not([is-header])")
          .first()
          .boundingBox();
        expect(lane!.height).toBeGreaterThanOrEqual(56);
        expect(lane!.height).toBeLessThanOrEqual(62);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      expect(overflow, `${label} must not overflow at ${width}`).toBe(false);
    }
    await nav.getByRole("button", { name: "浏览", exact: true }).click();
    const explorer = page.getByRole("region", { name: "Project Explorer" });
    await expect(
      explorer.getByRole("button", { name: "打开 东翼风管安装", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(screenshots, `browse-${width}x${height}.png`),
      animations: "disabled",
    });
    await explorer
      .getByRole("searchbox", { name: "搜索项目对象" })
      .fill("东翼风管");
    await page.screenshot({
      path: resolve(screenshots, `browse-search-${width}x${height}.png`),
      animations: "disabled",
    });
    await explorer.getByRole("searchbox", { name: "搜索项目对象" }).clear();
    await nav.getByRole("button", { name: "项目", exact: true }).click();
  }
  const project = page.getByRole("region", { name: "项目管理" });
  await expect(project.getByRole("region", { name: "模型与版本" })).toHaveCount(
    0,
  );
  await expect(project.getByRole("region", { name: "版本记录" })).toHaveCount(
    0,
  );
  await expect(project.getByRole("region", { name: "当前状态" })).toContainText(
    "3 / 3 工作包可施工",
  );
  await project
    .getByRole("region", { name: "工作包状态" })
    .getByRole("button", { name: /结构交接/ })
    .click();
  await expect(
    page.locator('.calm-sheet-list button[aria-current="page"]'),
  ).toContainText("结构交接");
  await nav.getByRole("button", { name: "工作", exact: true }).click();
  await openWorkPanel(page);
  const list = workPanel(page);
  const selected = list.locator("button.workspace-row").first();
  await selected.click();
  const detail = list.getByRole("region", { name: "所选工作事项" });
  await expect(detail).toContainText("当前判断");
  await expect(detail.getByRole("region", { name: "项目状态" })).toHaveCount(0);
  // Focus the last receipt action so Tab leaves the receipt (1 or 2 actions).
  await detail
    .locator(".workspace-inspector-actions")
    .getByRole("button")
    .last()
    .focus();
  await page.keyboard.press("Tab");
  expect(
    await detail.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(false);
  await expect(detail).toBeVisible();
  const search = list.getByRole("textbox", { name: "搜索工作", exact: true });
  await search.click();
  await expect(detail).toBeVisible();
  await expect(search).toBeFocused();
  await search.fill("东翼风管");
  await expect(list.locator(".workspace-row")).toHaveCount(1);
  await search.clear();
  await expect(detail).toBeVisible();
  const browse = page.getByRole("button", { name: "浏览", exact: true });
  await browse.click();
  await expect(browse).toHaveAttribute("aria-pressed", "true");
  const explorer = page.getByRole("region", { name: "Project Explorer" });
  await expect(explorer).toBeVisible();
  await explorer
    .getByRole("searchbox", { name: "搜索项目对象" })
    .fill("东翼风管");
  await page.screenshot({
    path: resolve(screenshots, "browse-search-1920x1080.png"),
    animations: "disabled",
  });
  await explorer
    .getByRole("button", { name: "打开 东翼风管安装", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  // Opening a package from Browse lands on its coordination overview, not on
  // the tab-scoped Work panel: assert the surface that is actually shown.
  await expect(page.getByRole("region", { name: "工作包概览" })).toBeVisible();
  await expect(
    page.locator('.calm-sheet-list button[aria-current="page"]'),
  ).toContainText("东翼风管安装");
  await browse.click();
  await explorer
    .getByRole("searchbox", { name: "搜索项目对象" })
    .fill("东翼风管");
  await expectDonorTable(
    explorer.locator('bim-table[aria-label="工作包对象"]'),
  );
});

// Use the repository's real IFC fixture for the canvas QA; the default demo has no uploaded model.
test("real IFC fills the model canvas without changing project state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    sessionStorage.setItem("cca-token", "local-demo-admin");
    localStorage.setItem("concord:last-project", "harbor-east");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("toolbar", { name: "工作区" })
    .getByRole("button", { name: "模型", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "模型工作区" })).toBeVisible();
  await expectDonor(page.locator("bim-viewport.model-workspace-viewport"));
  await expect(
    page.getByRole("button", { name: "打开本地 IFC", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("当前项目还没有模型", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(screenshots, "model-1440x900.png"),
    animations: "disabled",
  });
  await page
    .getByLabel("本地 IFC 文件", { exact: true })
    .setInputFiles(resolve("..", "fixtures", "harbor-east.ifc"));
  const viewer = page.getByLabel("IFC 模型查看器", { exact: true });
  await expect(viewer.locator("canvas")).toBeVisible();
  await expect(viewer.getByRole("status")).toContainText("构件", {
    timeout: 45_000,
  });
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    const canvasBounds = await viewer.locator("canvas").boundingBox();
    expect(
      canvasBounds!.height,
      "the donor host must fill the model work plane",
    ).toBeGreaterThan(height * 0.7);
    await page.screenshot({
      path: resolve(screenshots, `model-ifc-${width}x${height}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByText("本地 IFC 文件属性 · 未关联项目")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "展开上下文列表" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("本地预览仅显示文件属性，不关联项目变更、问题或工作包。"),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(screenshots, "model-ifc-dock-1440x900.png"),
    animations: "disabled",
  });
});
