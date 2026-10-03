import { expect, test } from "@playwright/test";
import type { CadController } from "../../src/viewers/cad/cadTypes";
import { resolve } from "node:path";
const fixture = (revision: string) =>
  resolve(
    "../fixtures/coordination-project",
    revision,
    "structural-drawing.dxf",
  );
test("Golden DXF opens and compares with the mature donor", async ({
  page,
}) => {
  const external: string[] = [];
  const workers = new Set<import("@playwright/test").Worker>();
  page.on("worker", (worker) => {
    workers.add(worker);
    worker.on("close", () => workers.delete(worker));
  });
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:15173")
      external.push(request.url());
  });
  await page.goto("/tests/engineering-viewers.html");
  await page
    .getByLabel("Earlier source", { exact: true })
    .setInputFiles(fixture("R1"));
  await page
    .getByLabel("Later source", { exact: true })
    .setInputFiles(fixture("R2"));
  await expect(page.getByTestId("source-state")).toHaveText("Ready");
  await page.getByRole("button", { name: "Open CAD", exact: true }).click();
  await expect(
    page.locator(
      '[data-testid="cad-result"], section[aria-label="CAD viewer"] > [role="alert"]',
    ),
  ).toBeVisible();
  await expect(
    page.locator('section[aria-label="CAD viewer"] > [role="alert"]'),
  ).toHaveCount(0);
  const result = JSON.parse(
    (await page.getByTestId("cad-result").textContent())!,
  );
  expect(result.engine).toContain("mlightcad@");
  expect(
    result.changes.some(
      (change: { kind: string }) => change.kind === "modified",
    ),
  ).toBe(true);
  expect(
    result.changes.every(
      (change: { sourceRevisionId: string; sourceHash: string }) =>
        change.sourceRevisionId && change.sourceHash.length === 64,
    ),
  ).toBe(true);
  const changed = result.changes.find(
    (change: { kind: string; sourceRevisionId: string }) =>
      change.kind === "modified" &&
      change.sourceRevisionId.startsWith("before:"),
  );
  const target = {
    sourceRevisionId: changed.sourceRevisionId,
    sourceHash: changed.sourceHash,
    entityId: changed.entityId,
  };
  const navigated = await page.evaluate(
    async (target) =>
      (window as unknown as { cadSession: CadController }).cadSession.navigate(
        target,
      ),
    target,
  );
  expect(navigated).toEqual(target);
  await expect(page.getByTestId("cad-selection")).toHaveText(
    JSON.stringify(target),
  );
  const invalid = await page.evaluate(async (target) => {
    try {
      await (
        window as unknown as { cadSession: CadController }
      ).cadSession.navigate({ ...target, entityId: "FFFF" });
      return "unexpected success";
    } catch (error) {
      return String(error);
    }
  }, target);
  expect(invalid).toContain("absent");
  const stale = await page.evaluate(async (target) => {
    try {
      await (
        window as unknown as { cadSession: CadController }
      ).cadSession.navigate({ ...target, sourceHash: "0".repeat(64) });
      return "unexpected success";
    } catch (error) {
      return String(error);
    }
  }, target);
  expect(stale).toContain("hash changed");
  expect(external).toEqual([]);
  expect(
    Array.from(workers).some((worker) =>
      worker.url().includes("cadCompare.worker"),
    ),
  ).toBe(true);
  const donor = page.frameLocator('iframe[title="Concord DXF viewer"]');
  await expect(donor.locator("canvas").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/drawing/golden-cad-diff.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
  await expect(page.locator('iframe[title="Concord DXF viewer"]')).toHaveCount(
    0,
  );
  await expect.poll(() => workers.size).toBe(0);
});
test("DWG is rejected before initialization", async ({ page }) => {
  await page.goto("/tests/engineering-viewers.html");
  await page.getByLabel("Earlier source", { exact: true }).setInputFiles({
    name: "native.dwg",
    mimeType: "application/acad",
    buffer: Buffer.from("not allowed"),
  });
  await page.getByRole("button", { name: "Open CAD", exact: true }).click();
  await expect(
    page.locator('section[aria-label="CAD viewer"] > [role="alert"]'),
  ).toContainText("Only DXF");
  await expect(
    page.frameLocator('iframe[title="Concord DXF viewer"]').locator("canvas"),
  ).toHaveCount(0);
});
