import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { expectDonor, toolRail } from "./donor-conformance";

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`donor menu-modal focus return ${viewport.width}×${viewport.height}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const response = await request.post("/api/projects", {
      headers: { Authorization: "Bearer local-demo-admin" },
      data: { name: `Donor focus ${randomUUID()}` },
    });
    expect(response.ok()).toBe(true);
    const project = await response.json();
    await page.addInitScript((id) => {
      sessionStorage.setItem("cca-token", "local-demo-admin");
      localStorage.setItem("concord:last-project", id);
    }, project.id);
    await page.goto("/");
    await toolRail(page)
      .getByRole("button", { name: "项目", exact: true })
      .click();
    const actions = page.getByRole("button", { name: "资料操作", exact: true });
    await actions.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "添加资料", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
    await expect(dialog).toBeVisible();
    await expectDonor(dialog.locator("bim-toolbar.dialog-header"));
    const screenshots = resolve(
      "..",
      ".verification-work/issue-16-substrate-replacement/focus-surfaces",
    );
    mkdirSync(screenshots, { recursive: true });
    await page.screenshot({
      path: resolve(
        screenshots,
        `source-add-dialog-${viewport.width}x${viewport.height}.png`,
      ),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(actions).toBeFocused();
    await actions.click();
    await page.getByRole("menuitem", { name: "添加资料", exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(actions).toBeFocused();
    const search = page.getByRole("button", {
      name: "查找对象或操作",
    });
    await search.click();
    const command = page.getByRole("dialog", {
      name: "查找对象或操作",
      exact: true,
    });
    await expect(command).toBeVisible();
    await page.screenshot({
      path: resolve(
        screenshots,
        `command-search-${viewport.width}x${viewport.height}.png`,
      ),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(command).toHaveCount(0);
    await expect(search).toBeFocused();
  });
}
