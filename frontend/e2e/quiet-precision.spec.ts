import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const screenshots = resolve(
  "..",
  ".verification-work",
  process.env.CONCORD_VISUAL_DIR ?? "desktop-workspace",
);

test("work list, transient Peek and project object lanes across four widths", async ({
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
  await page.goto("/");
  mkdirSync(screenshots, { recursive: true });
  const nav = page.getByRole("navigation", { name: "主要工作区" });
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1600, 900],
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
      ).toHaveAttribute("aria-current", "page");
      await page.screenshot({
        path: resolve(screenshots, `${name}-${width}x${height}.png`),
        animations: "disabled",
      });
      if (name === "work") {
        const list = page.getByRole("region", { name: "工作" });
        await expect(
          page.getByRole("complementary", { name: "所选工作事项" }),
        ).toHaveCount(0);
        const queue = await list.locator(".work-queue").boundingBox();
        expect(queue!.width).toBeGreaterThan(width - 160);
        const information = await list
          .locator(".work-row-content")
          .first()
          .boundingBox();
        expect(information!.width).toBeLessThanOrEqual(900);
        const rowTitle = await list
          .locator(".work-row-copy strong")
          .first()
          .evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          );
        expect(rowTitle).toBeGreaterThanOrEqual(14);
        const rows = list
          .getByRole("region", { name: "最近完成" })
          .getByRole("button");
        const first = rows.first();
        await first.click();
        const peek = page.getByRole("complementary", { name: "所选工作事项" });
        await expect(peek).toBeVisible();
        const peekBox = await peek.boundingBox();
        expect(peekBox!.width).toBeLessThanOrEqual(500);
        await page.screenshot({
          path: resolve(screenshots, `work-peek-${width}x${height}.png`),
          animations: "disabled",
        });
        const nextAction = peek.getByRole("button", {
          name: "查看详情",
          exact: true,
        });
        await expect(nextAction).toBeVisible();
        await expect(peek.getByRole("region", { name: "当前判断" })).toBeVisible();
        await expect(peek.getByRole("region", { name: "项目状态" })).toHaveCount(0);
        await expect(peek.getByRole("button")).toHaveCount(2);
        await peek.locator(".work-peek-scroll").evaluate((element) => {
          element.scrollTop = 0;
        });
        await first.focus();
        await page.keyboard.press("ArrowDown");
        const nextDecision = rows.nth(1);
        await expect(nextDecision).toHaveAttribute("aria-pressed", "true");
        await expect(peek).toContainText(
          (await nextDecision.getAttribute("data-work-key"))!,
        );
        await peek.getByRole("button", { name: "关闭详情" }).click();
        await expect(peek).toHaveCount(0);
        await expect(nextDecision).toBeFocused();
        await nextDecision.click();
        await page.keyboard.press("Escape");
        await expect(peek).toHaveCount(0);
      } else {
        const pane = await page
          .getByRole("complementary", { name: "项目上下文" })
          .boundingBox();
        expect(pane!.width).toBeGreaterThanOrEqual(280);
        expect(pane!.width).toBeLessThanOrEqual(340);
        const lane = await page
          .locator(".project-package-list li")
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
  }
  const project = page.getByRole("region", { name: "项目管理" });
  await expect(project.getByRole("region", { name: "模型与版本" })).toHaveCount(0);
  await expect(project.getByRole("region", { name: "版本记录" })).toHaveCount(0);
  await expect(project.getByRole("region", { name: "当前状态" })).toContainText(
    "3 / 3 工作包可施工",
  );
  await project
    .getByRole("region", { name: "工作包状态" })
    .getByRole("button", { name: /结构交接/ })
    .click();
  await expect(
    page.getByRole("navigation", { name: "当前位置" }),
  ).toContainText("结构交接");
  await nav.getByRole("button", { name: "工作", exact: true }).click();
  await page.locator(".work-row").first().click();
  const detail = page.getByRole("complementary", { name: "所选工作事项" });
  await expect(detail.getByRole("region", { name: "当前判断" })).toBeVisible();
  await expect(detail.getByRole("region", { name: "项目状态" })).toHaveCount(0);
  await detail.getByRole("button", { name: "关闭详情" }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await detail.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(false);
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "查看详情", exact: true }).focus();
  await page.keyboard.press("Tab");
  expect(
    await detail.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(false);
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "关闭详情" }).click();
  await page.locator(".work-row").first().click();
  const search = page.getByRole("searchbox", { name: "搜索工作事项" });
  await search.click();
  await expect(detail).toHaveCount(0);
  await expect(search).toBeFocused();
  await search.fill("东翼风管");
  await expect(page.locator(".work-row")).toHaveCount(1);
  await search.clear();
  await expect(detail).toHaveCount(0);
  const browse = page.getByRole("button", { name: "浏览", exact: true });
  await browse.click();
  await expect(browse).toHaveAttribute("aria-current", "page");
  const explorer = page.getByRole("region", { name: "Project Explorer" });
  await expect(explorer).toBeVisible();
  await explorer
    .getByRole("searchbox", { name: "搜索项目对象" })
    .fill("东翼风管");
  await explorer.getByRole("button", { name: /东翼风管安装/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "工作" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "当前位置" }),
  ).toContainText("东翼风管安装");
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
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "主要工作区" })
    .getByRole("button", { name: "模型", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "模型工作区" })).toBeVisible();
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
