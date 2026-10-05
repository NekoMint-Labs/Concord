import { expect, test } from "@playwright/test";
import type { Worker } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IfcModelAdapter } from "../../src/viewers/ifc/IfcModelAdapter";

test("real pressure IFC navigates distant elements, reuses artifacts and releases each session", async ({
  page,
}) => {
  test.setTimeout(360000);
  const count = Number(process.env.CCA_IFC_PRESSURE_ELEMENTS ?? "10000");
  if (!Number.isSafeInteger(count) || count < 1000 || count > 100000)
    throw new Error(
      "CCA_IFC_PRESSURE_ELEMENTS must be an integer from 1000 to 100000",
    );
  const geometry = process.env.CCA_IFC_PRESSURE_GEOMETRY ?? "grid";
  if (geometry !== "grid" && geometry !== "mixed")
    throw new Error("CCA_IFC_PRESSURE_GEOMETRY must be grid or mixed");
  const output = resolve(
    "../.verification-work/ifc-pressure",
    geometry === "grid" ? String(count) : `${count}-mixed`,
    "pressure.ifc",
  );
  execFileSync(
    process.env.CCA_QUALIFICATION_PYTHON ??
      resolve(
        process.platform === "win32"
          ? "../.venv/Scripts/python.exe"
          : "../.venv/bin/python",
      ),
    [
      "../scripts/generate_ifc_pressure_fixture.py",
      "--output",
      output,
      "--elements",
      String(count),
      "--geometry",
      geometry,
    ],
    { timeout: 120000 },
  );
  const fixture = JSON.parse(
    readFileSync(output.replace(/\.ifc$/, ".json"), "utf8"),
  );
  expect(fixture.elementCount).toBe(count);
  expect(fixture.synthetic).toBe(true);
  expect(fixture.sourceBytes).toBeLessThan(128 * 1024 * 1024);
  const workers = new Set<Worker>();
  const parsers: string[] = [];
  const external: string[] = [];
  page.on("worker", (worker) => {
    workers.add(worker);
    if (worker.url().includes("validator")) parsers.push(worker.url());
    worker.on("close", () => workers.delete(worker));
  });
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== "http://127.0.0.1:15173"
    )
      external.push(request.url());
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto("/tests/engineering-viewers.html");
  await expect(page.locator("iframe, canvas")).toHaveCount(0);
  expect(workers.size).toBe(0);
  await page
    .getByLabel("Earlier source", { exact: true })
    .setInputFiles(output);
  const measurements: unknown[] = [];
  for (let iteration = 0; iteration < 3; iteration++) {
    await page.getByRole("button", { name: "Open IFC", exact: true }).click();
    await expect(page.getByTestId("ifc-result")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    const models = JSON.parse(
      (await page.getByTestId("ifc-result").textContent())!,
    );
    expect(models).toHaveLength(1);
    expect(models[0].elementCount).toBeGreaterThanOrEqual(count);
    expect(models[0].sourceHash).toBe(fixture.sha256);
    expect(models[0].sourceRevisionId).toBe("before:pressure.ifc");
    expect(models[0].fromCache).toBe(iteration > 0);
    const diagnostics = () =>
      page.evaluate(() =>
        (
          window as unknown as { ifcSession: IfcModelAdapter }
        ).ifcSession.diagnostics(),
      );
    await expect
      .poll(async () => (await diagnostics())[iteration ? "hits" : "writes"], {
        timeout: 120000,
      })
      .toBe(1);
    expect((await diagnostics()).builds).toBe(iteration ? 0 : 1);
    expect((await diagnostics()).failures).toBe(0);
    const target = {
      kind: "bim" as const,
      source_revision_id: models[0].sourceRevisionId,
      global_ids: fixture.targetGlobalIds as string[],
    };
    const navigation = await page.evaluate(async (target) => {
      const session = (window as unknown as { ifcSession: IfcModelAdapter })
        .ifcSession;
      const start = performance.now();
      const navigated = await session.navigate(target);
      const navigationMs = performance.now() - start;
      const bcfStart = performance.now();
      const saved = await session.saveBcf(
        "Pressure distant targets",
        "reviewer@example.test",
      );
      return {
        navigated,
        selected: saved.selected,
        scope: saved.scope,
        navigationMs,
        bcfMs: performance.now() - bcfStart,
      };
    }, target);
    expect(navigation.navigated).toEqual(target);
    expect(navigation.selected.map((item) => item.globalId)).toEqual(
      target.global_ids,
    );
    expect(navigation.scope).toEqual([
      {
        sourceRevisionId: target.source_revision_id,
        sourceHash: fixture.sha256,
      },
    ]);
    expect(
      navigation.selected.every(
        (item) =>
          item.sourceRevisionId === target.source_revision_id &&
          item.sourceHash === fixture.sha256,
      ),
    ).toBe(true);
    await expect(page.getByTestId("ifc-selection")).toHaveText(
      JSON.stringify(target),
    );
    expect((await diagnostics()).builds).toBe(iteration ? 0 : 1);
    const donor = page.frameLocator('iframe[title="Concord IFC viewer"]');
    await expect(donor.locator("canvas").first()).toBeVisible();
    await expect(
      page.locator('iframe[title="Concord IFC viewer"]'),
    ).toHaveCount(1);
    expect(workers.size).toBeGreaterThan(0);
    await page.screenshot({
      path: `test-results/ifc-pressure/iteration-${iteration}.png`,
      fullPage: true,
    });
    const active = await cdp.send("Performance.getMetrics");
    const activeWorkers = workers.size;
    const cleanupStart = Date.now();
    await page
      .getByRole("button", { name: "Close viewer", exact: true })
      .click();
    await expect(page.locator("iframe, canvas")).toHaveCount(0);
    await expect.poll(() => workers.size).toBe(0);
    const cleanupMs = Date.now() - cleanupStart;
    const closedMetrics = (await cdp.send("Performance.getMetrics")).metrics;
    // Drop the diagnostic harness reference to the already-disposed session.
    await page.evaluate(() => {
      delete (window as unknown as { ifcSession?: IfcModelAdapter }).ifcSession;
    });
    await cdp.send("HeapProfiler.collectGarbage");
    const collectedMetrics = (await cdp.send("Performance.getMetrics")).metrics;
    measurements.push({
      iteration,
      model: models[0],
      navigationMs: navigation.navigationMs,
      bcfMs: navigation.bcfMs,
      activeWorkers,
      cleanupMs,
      activeMetrics: active.metrics,
      closedMetrics,
      collectedMetrics,
    });
  }
  expect(parsers).toEqual([]);
  expect(external).toEqual([]);
  const report = {
    fixture,
    browser: page.context().browser()?.version(),
    measurements,
    external,
    extraParserWorkers: parsers,
  };
  await test.info().attach("ifc-pressure-measurements", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  writeFileSync(
    output.replace(/\.ifc$/, "-measurements.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      fixture,
      measurements: measurements.map((sample) => {
        const item = sample as {
          iteration: number;
          model: { elapsedMs: number };
          navigationMs: number;
          bcfMs: number;
          cleanupMs: number;
        };
        return {
          iteration: item.iteration,
          loadMs: item.model.elapsedMs,
          navigationMs: item.navigationMs,
          bcfMs: item.bcfMs,
          cleanupMs: item.cleanupMs,
        };
      }),
    }),
  );
  await cdp.detach();
});
