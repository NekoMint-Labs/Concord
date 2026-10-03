import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const headers = { Authorization: "Bearer local-demo-admin" };
for (const viewport of [
  { width: 1600, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`product navigation and empty states at ${viewport.width}×${viewport.height}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await request.post("/api/projects", {
      headers,
      data: { name: `Acceptance ${randomUUID()}` },
    });
    expect(response.ok()).toBeTruthy();
    const project = await response.json();
    await page.addInitScript((id) => {
      sessionStorage.setItem("cca-token", "local-demo-admin");
      localStorage.setItem("concord:last-project", id);
    }, project.id);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主要工作区" });
    await nav.getByRole("button", { name: "工作", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "还没有工作事项" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "打开项目 →", exact: true }).click();
    await expect(page.getByRole("region", { name: "项目管理" })).toBeVisible();
    await nav.getByRole("button", { name: "模型", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "模型上下文" }),
    ).toBeVisible();
    await expect(
      page.getByText("当前项目还没有模型", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".spatial-context")).toHaveCount(0);
    await page
      .getByRole("button", { name: "添加项目模型 →", exact: true })
      .click();
    await page.getByRole("button", { name: "资料操作", exact: true }).click();
    await page.getByRole("menuitem", { name: "添加资料", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "浏览", exact: true }).click();
    const explorer = page.getByRole("region", { name: "Project Explorer" });
    await expect(
      page.getByRole("button", { name: "浏览", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(explorer.getByRole("searchbox")).toBeVisible();
    await expect(explorer.getByRole("list")).toHaveCount(0);
    await expect(explorer.getByRole("navigation")).toHaveCount(0);
    await explorer.getByRole("searchbox").fill("不存在的工程对象");
    await expect(
      explorer.getByRole("heading", { name: "没有匹配的项目对象" }),
    ).toBeVisible();
    await explorer.getByRole("button", { name: "清除搜索与筛选" }).click();
    await expect(explorer.getByRole("searchbox")).toHaveValue("");
    await nav.getByRole("button", { name: "项目", exact: true }).click();
    await page.getByRole("navigation", { name: "项目内容" }).getByRole("button", { name: /^文档/ }).click();
    await expect(
      page.getByRole("heading", { name: "尚未导入文档", exact: true }),
    ).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "导入文档", exact: true }).click();
    expect((await chooser).isMultiple()).toBe(false);
    await page
      .getByRole("navigation", { name: "当前位置" })
      .getByRole("button", { name: project.name, exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "项目内容" })
      .getByRole("button", { name: /^历史/ })
      .click();
    await expect(page.getByText(/尚未确认项目基线/)).toBeVisible();
    await page.getByRole("button", { name: "打开项目 →", exact: true }).click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "高级", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("menuitem", { name: /模拟模型版本更新/ }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  });
}
