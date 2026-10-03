import { expect, test } from "@playwright/test";
import type { CadController } from "../../src/viewers/cad/cadTypes";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
const fixture = (revision: string) =>
  resolve(
    "../fixtures/coordination-project",
    revision,
    "structural-drawing.dxf",
  );
test("Golden DXF opens and compares with the mature donor", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, { cadTimings: [] });
    window.addEventListener("concord-cad-timing", (event) => {
      (window as unknown as { cadTimings: unknown[] }).cadTimings.push(
        (event as CustomEvent).detail,
      );
    });
  });
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
    layer: changed.layer,
    viewBounds: changed.location,
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
  const wrongLayer = await page.evaluate(async (target) => {
    try {
      await (
        window as unknown as { cadSession: CadController }
      ).cadSession.navigate({ ...target, layer: "__missing_layer__" });
      return "unexpected success";
    } catch (error) {
      return String(error);
    }
  }, target);
  expect(wrongLayer).toContain("layer");
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

  const wrongRevision = await page.evaluate(async (target) => {
    try {
      await (
        window as unknown as { cadSession: CadController }
      ).cadSession.navigate({
        ...target,
        sourceRevisionId: "unloaded-revision-with-same-bytes",
      });
      return "unexpected success";
    } catch (error) {
      return String(error);
    }
  }, target);
  expect(wrongRevision).toContain("revision is not loaded");
  const withoutLayer = await page.evaluate(async (target) => {
    const { layer: _layer, ...optionalLayerTarget } = target;
    return (
      window as unknown as { cadSession: CadController }
    ).cadSession.navigate(optionalLayerTarget);
  }, target);
  expect(withoutLayer).toEqual(target);
  const nullHints = await page.evaluate(
    async (target) =>
      (window as unknown as { cadSession: CadController }).cadSession.navigate({
        ...target,
        layer: null,
        viewBounds: null,
      }),
    target,
  );
  expect(nullHints).toEqual(target);
  const unrelatedBounds = await page.evaluate(
    async (target) =>
      (window as unknown as { cadSession: CadController }).cadSession.navigate({
        ...target,
        viewBounds: { minX: -100, minY: -100, maxX: -90, maxY: -90 },
      }),
    target,
  );
  expect(unrelatedBounds).toEqual(target);

  expect(external).toEqual([]);
  expect(
    Array.from(workers).some((worker) =>
      worker.url().includes("cadCompare.worker"),
    ),
  ).toBe(true);
  const donor = page.frameLocator('iframe[title="Concord DXF viewer"]');
  await expect(donor.locator("canvas").first()).toBeVisible();
  const frame = page
    .frames()
    .find((frame) => frame.url().includes("/viewer/cad/"))!;
  const timing = await frame.evaluate(
    () => (window as unknown as { cadTimings: object[] }).cadTimings[0],
  );
  expect(timing).toMatchObject({
    comparisonSourceParses: 0,
    cacheHit: false,
    snapshotEntities: 4,
  });
  await donor.getByRole("button", { name: "Settings", exact: true }).click();
  await donor.getByRole("tab", { name: "Geometry", exact: true }).click();
  await donor.getByRole("slider", { name: "Margin", exact: true }).fill("6");
  await expect
    .poll(async () =>
      frame.evaluate(
        () => (window as unknown as { cadTimings: object[] }).cadTimings.length,
      ),
    )
    .toBeGreaterThan(1);
  const warm = await frame.evaluate(() =>
    (window as unknown as { cadTimings: object[] }).cadTimings.at(-1),
  );
  expect(warm).toMatchObject({
    comparisonSourceParses: 0,
    cacheHit: true,
    preparationYields: 0,
  });
  await donor.getByRole("button", { name: "OK", exact: true }).click();
  console.log(
    "CAD Golden snapshot timings",
    JSON.stringify({ cold: timing, warm }),
  );
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

test("native DXF snapshots yield between batches and preserve actual entity changes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, { cadTimings: [] });
    window.addEventListener("concord-cad-timing", (event) => {
      (window as unknown as { cadTimings: unknown[] }).cadTimings.push(
        (event as CustomEvent).detail,
      );
    });
  });
  const template = (await readFile(fixture("R1"), "utf8")).replace(
    /\r\n/g,
    "\n",
  );
  const generate = (changed: boolean) => {
    const entities = Array.from({ length: 512 }, (_, index) => {
      const handle = (4096 + index).toString(16).toUpperCase();
      const y = Math.floor(index / 32),
        x = index % 32;
      const end = index === 510 ? x : x + (changed && index === 511 ? 2 : 1);
      const endY = index === 510 ? y + 1 : y;
      return (
        [
          "  0",
          "LINE",
          "  5",
          handle,
          "330",
          "17",
          "100",
          "AcDbEntity",
          "  8",
          "STRUCTURE",
          "100",
          "AcDbLine",
          " 10",
          x,
          " 20",
          y,
          " 30",
          0,
          " 11",
          end,
          " 21",
          endY,
          " 31",
          0,
        ].join("\n") + "\n"
      );
    }).join("");
    return Buffer.from(
      template.replace("  2\nENTITIES\n", "  2\nENTITIES\n" + entities),
    );
  };
  await page.goto("/tests/engineering-viewers.html");
  await page.getByLabel("Earlier source", { exact: true }).setInputFiles({
    name: "pressure-r1.dxf",
    mimeType: "application/dxf",
    buffer: generate(false),
  });
  await page.getByLabel("Later source", { exact: true }).setInputFiles({
    name: "pressure-r2.dxf",
    mimeType: "application/dxf",
    buffer: generate(true),
  });
  await expect(page.getByTestId("source-state")).toHaveText("Ready");
  await page.getByRole("button", { name: "Open CAD", exact: true }).click();
  await expect(page.getByTestId("cad-result")).toBeVisible();
  const result = JSON.parse(
    (await page.getByTestId("cad-result").textContent())!,
  );
  expect(result.changes).toHaveLength(2);
  expect(
    result.changes.every(
      (change: { entityId: string; kind: string }) =>
        change.entityId === "11FF" && change.kind === "modified",
    ),
  ).toBe(true);
  const revision = result.changes.find((change: { sourceRevisionId: string }) =>
    change.sourceRevisionId.startsWith("before:"),
  );
  for (const [entityId, viewBounds] of [
    ["1000", { minX: 0, minY: 0, maxX: 1, maxY: 0 }],
    ["11FE", { minX: 30, minY: 15, maxX: 30, maxY: 16 }],
    ["11FF", { minX: 31, minY: 15, maxX: 32, maxY: 15 }],
  ] as const) {
    const target = {
      sourceRevisionId: revision.sourceRevisionId,
      sourceHash: revision.sourceHash,
      entityId,
      layer: "STRUCTURE",
      viewBounds,
    };
    const reopened = await page.evaluate(async (target) => {
      const session = (window as unknown as { cadSession: CadController })
        .cadSession;
      const selected = await session.navigate(target);
      return session.navigate(selected);
    }, target);
    expect(reopened).toEqual(target);
    await expect(page.getByTestId("cad-selection")).toHaveText(
      JSON.stringify(target),
    );
  }
  const frame = page
    .frames()
    .find((frame) => frame.url().includes("/viewer/cad/"))!;
  const timing = await frame.evaluate(
    () =>
      (window as unknown as { cadTimings: { preparationYields: number }[] })
        .cadTimings[0],
  );
  expect(timing).toMatchObject({
    snapshotEntities: 1028,
    comparisonSourceParses: 0,
    cacheHit: false,
  });
  expect(timing.preparationYields).toBeGreaterThanOrEqual(8);
  console.log(
    "CAD native 514-entity-per-source timing",
    JSON.stringify(timing),
  );
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
  await expect(page.locator('iframe[title="Concord DXF viewer"]')).toHaveCount(
    0,
  );
});

test("a failed live comparison reports failure and releases the viewer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private readonly comparison: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.comparison = String(url).includes("cadCompare.worker");
      }
      postMessage(
        message: unknown,
        transferOrOptions?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (
          this.comparison &&
          (window as unknown as { failCadDispatch?: boolean }).failCadDispatch
        )
          throw new Error("CAD comparison worker became unavailable");
        if (Array.isArray(transferOrOptions))
          super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
    };
  });
  const workers = new Set<import("@playwright/test").Worker>();
  page.on("worker", (worker) => {
    workers.add(worker);
    worker.on("close", () => workers.delete(worker));
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
  await expect(page.getByTestId("cad-result")).toBeVisible();
  const frame = page
    .frames()
    .find((frame) => frame.url().includes("/viewer/cad/"))!;
  await frame.evaluate(() => Object.assign(window, { failCadDispatch: true }));
  const donor = page.frameLocator('iframe[title="Concord DXF viewer"]');
  await donor.getByRole("button", { name: "Settings", exact: true }).click();
  await donor.getByRole("tab", { name: "Geometry", exact: true }).click();
  await donor.getByRole("slider", { name: "Margin", exact: true }).fill("6");
  await expect(
    page.locator('section[aria-label="CAD viewer"] > [role="alert"]'),
  ).toContainText("worker became unavailable");
  await expect.poll(() => workers.size).toBe(0);
});
