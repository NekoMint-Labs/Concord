import { expect, test } from "@playwright/test";
import type { Page, Worker } from "@playwright/test";
import type { IfcModelAdapter } from "../../src/viewers/ifc/IfcModelAdapter";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const fixture = (name = "structure.ifc") =>
  resolve("../fixtures/coordination-project/R1", name);
async function open(page: Page) {
  await page.getByRole("button", { name: "Open IFC", exact: true }).click();
  await expect(
    page.locator(
      '[data-testid="ifc-result"], section[aria-label="IFC viewer"] > [role="alert"]',
    ),
  ).toBeVisible();
  await expect(
    page.locator('section[aria-label="IFC viewer"] > [role="alert"]'),
  ).toHaveCount(0);
  return JSON.parse((await page.getByTestId("ifc-result").textContent())!);
}
async function diagnostics(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as { ifcSession: IfcModelAdapter }
    ).ifcSession.diagnostics(),
  );
}
test("real IFC loads, navigates GlobalIds, reuses fragments/tree and releases workers", async ({
  page,
}) => {
  test.setTimeout(240000);
  const external: string[] = [];
  const workers = new Set<Worker>();
  const parserWorkers: string[] = [];
  page.on("worker", (worker) => {
    workers.add(worker);
    if (worker.url().includes("validator")) parserWorkers.push(worker.url());
    worker.on("close", () => workers.delete(worker));
  });
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== "http://127.0.0.1:15173"
    )
      external.push(request.url());
  });
  await page.goto("/tests/engineering-viewers.html");
  await page
    .getByLabel("Earlier source", { exact: true })
    .setInputFiles(fixture());
  const first = await open(page);
  expect(first).toHaveLength(1);
  expect(first[0].elementCount).toBeGreaterThan(0);
  expect(first[0].fromCache).toBe(false);
  await expect
    .poll(async () => (await diagnostics(page)).writes, { timeout: 120000 })
    .toBe(1);
  expect((await diagnostics(page)).builds).toBe(1);
  expect(parserWorkers).toEqual([]);
  const donor = page.frameLocator('iframe[title="Concord IFC viewer"]');
  await expect(donor.getByPlaceholder("Search elements…")).toBeVisible();
  await donor.getByPlaceholder("Search elements…").fill("BEAM-01");
  await expect(donor.getByText("BEAM-01", { exact: true })).toBeVisible();
  await donor.getByPlaceholder("Search elements…").fill("");
  const target = {
    sourceRevisionId: first[0].sourceRevisionId,
    sourceHash: first[0].sourceHash,
    globalId: "3M0KwyPFrBT9KwklhqZa8W",
  };
  const navigation = await page.evaluate(
    async (target) =>
      (
        window as unknown as { ifcSession: IfcModelAdapter }
      ).ifcSession.navigate(target),
    target,
  );
  expect(navigation).toEqual(target);
  await expect(page.getByTestId("ifc-selection")).toContainText(
    target.globalId,
  );
  const panels = await page.evaluate(() =>
    (window as unknown as { ifcSession: IfcModelAdapter }).ifcSession.panels(),
  );
  expect(panels).toEqual(
    expect.arrayContaining(["scene", "properties", "section", "measurement"]),
  );
  const section = await page.evaluate(async () => {
    const session = (window as unknown as { ifcSession: IfcModelAdapter })
      .ifcSession;
    const state = await session.section(true);
    await session.section(false);
    await session.measure(true);
    await session.measure(false);
    return {
      state,
      camera: await session.camera(),
      snapshot: (await session.screenshot()).slice(0, 22),
    };
  });
  expect(section.state.count).toBeGreaterThan(0);
  expect(section.camera.fieldOfView).toBeGreaterThan(0);
  expect(section.snapshot).toBe("data:image/png;base64,");
  const missing = await page.evaluate(async (target) => {
    try {
      await (
        window as unknown as { ifcSession: IfcModelAdapter }
      ).ifcSession.navigate({ ...target, globalId: "0M0KwyPFrBT9KwklhqZa8W" });
      return "unexpected success";
    } catch (error) {
      return String(error);
    }
  }, target);
  expect(missing).toContain("absent");
  await page.screenshot({
    path: "test-results/drawing/golden-ifc-viewer.png",
    fullPage: true,
  });
  expect(workers.size).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
  await expect(page.locator('iframe[title="Concord IFC viewer"]')).toHaveCount(
    0,
  );
  await expect.poll(() => workers.size).toBe(0);
  const warm = await open(page);
  expect(warm[0].fromCache).toBe(true);
  await expect.poll(async () => (await diagnostics(page)).hits).toBe(1);
  expect((await diagnostics(page)).builds).toBe(0);
  expect(parserWorkers).toEqual([]);
  expect(external).toEqual([]);
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
  await expect.poll(() => workers.size).toBe(0);
  console.log(
    JSON.stringify({
      coldMs: first[0].elapsedMs,
      warmMs: warm[0].elapsedMs,
      elementCount: first[0].elementCount,
    }),
  );
});
test("native and corrupt IFC fail explicitly", async ({ page }) => {
  await page.goto("/tests/engineering-viewers.html");
  await page.getByLabel("Earlier source", { exact: true }).setInputFiles({
    name: "model.rvt",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("native"),
  });
  await page.getByRole("button", { name: "Open IFC", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Only exported IFC");
  await expect(page.locator('iframe[title="Concord IFC viewer"]')).toHaveCount(
    0,
  );
  await page.getByLabel("Earlier source", { exact: true }).setInputFiles({
    name: "broken.ifc",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not an IFC file"),
  });
  await page.getByRole("button", { name: "Open IFC", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("ifc-result")).toHaveCount(0);
});

test("two models keep selection bound to the requested revision", async ({
  page,
}) => {
  await page.goto("/tests/engineering-viewers.html");
  await page
    .getByLabel("Earlier source", { exact: true })
    .setInputFiles(fixture());
  await page
    .getByLabel("Later source", { exact: true })
    .setInputFiles(fixture("mep.ifc"));
  await expect(page.getByTestId("source-state")).toHaveText("Ready");
  const models = await open(page);
  expect(models).toHaveLength(2);
  const duct = {
    sourceRevisionId: models[1].sourceRevisionId,
    sourceHash: models[1].sourceHash,
    globalId: "0wJm_7P3jD4uBWYGw9xyVx",
  };
  await page.evaluate(
    async (target) =>
      (
        window as unknown as { ifcSession: IfcModelAdapter }
      ).ifcSession.navigate(target),
    duct,
  );
  await expect(page.getByTestId("ifc-selection")).toHaveText(
    JSON.stringify(duct),
  );
  const wrong = await page.evaluate(
    async (target) => {
      try {
        await (
          window as unknown as { ifcSession: IfcModelAdapter }
        ).ifcSession.navigate(target);
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    },
    {
      ...duct,
      sourceRevisionId: models[0].sourceRevisionId,
      sourceHash: models[0].sourceHash,
    },
  );
  expect(wrong).toContain("absent");
  const stale = await page.evaluate(
    async (target) => {
      try {
        await (
          window as unknown as { ifcSession: IfcModelAdapter }
        ).ifcSession.navigate(target);
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    },
    { ...duct, sourceHash: "0".repeat(64) },
  );
  expect(stale).toContain("hash changed");
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
});

for (const cameraKind of ["perspective", "orthogonal"] as const) {
  test(`BCF ${cameraKind} restores optics, rolled up vector, two-model selection and survives close/reopen`, async ({
    page,
  }) => {
    await page.goto("/tests/engineering-viewers.html");
    await page
      .getByLabel("Earlier source", { exact: true })
      .setInputFiles(fixture());
    await page
      .getByLabel("Later source", { exact: true })
      .setInputFiles(fixture("mep.ifc"));
    await expect(page.getByTestId("source-state")).toHaveText("Ready");
    const models = await open(page);
    const bytes = [
      ...readFileSync(
        resolve(
          "../fixtures/coordination-project/viewpoints",
          `${cameraKind}.bcfzip`,
        ),
      ),
    ];
    const initial = await page.evaluate(
      async ({ bytes, models }) => {
        const session = (window as unknown as { ifcSession: IfcModelAdapter })
          .ifcSession;
        const result = await session.openBcf(
          new Uint8Array(bytes).buffer,
          models,
        );
        Object.assign(window, {
          savedBcf: await session.saveBcf(
            "Golden saved viewpoint",
            "reviewer@example.test",
          ),
        });
        return { result, camera: await session.camera() };
      },
      { bytes, models },
    );
    expect(initial.result.selected).toEqual(
      expect.arrayContaining([
        {
          sourceRevisionId: models[0].sourceRevisionId,
          sourceHash: models[0].sourceHash,
          globalId: "3M0KwyPFrBT9KwklhqZa8W",
        },
        {
          sourceRevisionId: models[1].sourceRevisionId,
          sourceHash: models[1].sourceHash,
          globalId: "0wJm_7P3jD4uBWYGw9xyVx",
        },
      ]),
    );
    expect(initial.result.commentCount).toBe(1);
    expect(initial.camera.cameraKind).toBe(cameraKind);
    expect(initial.camera.position).toMatchObject({ x: 3, y: 2, z: 6 });
    expect(initial.camera.direction.x).toBeCloseTo(0, 5);
    expect(initial.camera.direction.y).toBeCloseTo(0, 5);
    expect(initial.camera.direction.z).toBeCloseTo(-1, 5);
    expect(initial.camera.up!.x).toBeCloseTo(0.6, 5);
    expect(initial.camera.up!.y).toBeCloseTo(0.8, 5);
    if (cameraKind === "perspective")
      expect(initial.camera.fieldOfView).toBeCloseTo(48, 5);
    else expect(initial.camera.viewToWorldScale).toBeCloseTo(7.5, 5);
    await page
      .getByRole("button", { name: "Close viewer", exact: true })
      .click();
    await open(page);
    const reopened = await page.evaluate(async () => {
      const session = (window as unknown as { ifcSession: IfcModelAdapter })
        .ifcSession;
      const saved = (
        window as unknown as {
          savedBcf: Awaited<ReturnType<IfcModelAdapter["saveBcf"]>>;
        }
      ).savedBcf;
      const result = await session.openBcf(
        saved.data,
        saved.scope,
        saved.topicGuid,
        saved.viewpointGuid,
      );
      const exported = await session.saveBcf(
        "Reopened viewpoint",
        "reviewer@example.test",
      );
      return {
        result,
        camera: await session.camera(),
        format: exported.format,
        bytes: exported.data.byteLength,
        content: Array.from(new Uint8Array(exported.data)),
      };
    });
    expect(reopened.result.selected).toEqual(initial.result.selected);
    expect(reopened.camera.cameraKind).toBe(cameraKind);
    for (const axis of ["x", "y", "z"] as const) {
      expect(reopened.camera.position[axis]).toBeCloseTo(
        initial.camera.position[axis],
        5,
      );
      expect(reopened.camera.direction[axis]).toBeCloseTo(
        initial.camera.direction[axis],
        5,
      );
      expect(reopened.camera.up![axis]).toBeCloseTo(
        initial.camera.up![axis],
        5,
      );
    }
    if (cameraKind === "perspective")
      expect(reopened.camera.fieldOfView).toBeCloseTo(
        initial.camera.fieldOfView,
        5,
      );
    else
      expect(reopened.camera.viewToWorldScale).toBeCloseTo(
        initial.camera.viewToWorldScale!,
        5,
      );
    expect(reopened.format).toBe("bcf3.0");
    expect(reopened.bytes).toBeGreaterThan(1000);
    const evidenceDir = resolve("../.verification-work/browser-bcf");
    mkdirSync(evidenceDir, { recursive: true });
    const archive = resolve(evidenceDir, `${cameraKind}.bcfzip`);
    writeFileSync(archive, Buffer.from(reopened.content));
    const python = resolve(
      process.platform === "win32"
        ? "../.venv/Scripts/python.exe"
        : "../.venv/bin/python",
    );
    expect(
      execFileSync(
        python,
        [resolve("../scripts/assert_browser_bcf.py"), archive, cameraKind],
        { encoding: "utf8" },
      ),
    ).toContain("interoperability passed");
    const stale = await page.evaluate(async () => {
      const session = (window as unknown as { ifcSession: IfcModelAdapter })
        .ifcSession;
      const saved = (
        window as unknown as {
          savedBcf: Awaited<ReturnType<IfcModelAdapter["saveBcf"]>>;
        }
      ).savedBcf;
      try {
        await session.openBcf(
          saved.data,
          saved.scope.map((s) => ({ ...s, sourceHash: "0".repeat(64) })),
        );
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    });
    expect(stale).toContain("hash changed");
    await page
      .getByRole("button", { name: "Close viewer", exact: true })
      .click();
  });
}

test("native fragment ModelTree retains assembly children and uncontained non-geometric elements", async ({
  page,
}) => {
  const output = resolve("../.verification-work/fragment-hierarchy.ifc");
  mkdirSync(resolve("../.verification-work"), { recursive: true });
  execFileSync(
    resolve(
      process.platform === "win32"
        ? "../.venv/Scripts/python.exe"
        : "../.venv/bin/python",
    ),
    [
      "-c",
      `
import sys
import ifcopenshell
from ifcopenshell.util.element import copy
model=ifcopenshell.open(sys.argv[1])
beam=model.by_type("IfcBeam")[0]
child=copy(model,beam)
child.GlobalId="1M0KwyPFrBT9KwklhqZa8W"
child.Name="ASSEMBLY-CHILD"
assembly=model.create_entity("IfcElementAssembly",GlobalId="2M0KwyPFrBT9KwklhqZa8W",Name="ASSEMBLY-01",ObjectPlacement=beam.ObjectPlacement,PredefinedType="USERDEFINED")
model.create_entity("IfcRelAggregates",GlobalId="0M0KwyPFrBT9KwklhqZa8W",RelatingObject=assembly,RelatedObjects=[child])
container=model.by_type("IfcRelContainedInSpatialStructure")[0]
container.RelatedElements=tuple(container.RelatedElements)+(assembly,)
model.create_entity("IfcDuctSegment",GlobalId="3wJm_7P3jD4uBWYGw9xyVx",Name="UNCONTAINED-NO-GEOMETRY",PredefinedType="RIGIDSEGMENT")
model.write(sys.argv[2])
`,
      fixture(),
      output,
    ],
  );
  const parserWorkers: string[] = [];
  page.on("worker", (worker) => {
    if (worker.url().includes("validator")) parserWorkers.push(worker.url());
  });
  await page.goto("/tests/engineering-viewers.html");
  await page
    .getByLabel("Earlier source", { exact: true })
    .setInputFiles(output);
  const models = await open(page);
  await expect.poll(async () => (await diagnostics(page)).writes).toBe(1);
  const donor = page.frameLocator('iframe[title="Concord IFC viewer"]');
  const search = donor.getByPlaceholder("Search elements…");
  await search.fill("UNCONTAINED-NO-GEOMETRY");
  await expect(
    donor.getByText("Uncontained elements", { exact: true }),
  ).toBeVisible();
  await expect(
    donor.getByText("UNCONTAINED-NO-GEOMETRY", { exact: true }),
  ).toBeVisible();
  await search.fill("ASSEMBLY-01");
  await expect(donor.getByText("ASSEMBLY-01", { exact: true })).toBeVisible();
  const target = {
    sourceRevisionId: models[0].sourceRevisionId,
    sourceHash: models[0].sourceHash,
    globalId: "1M0KwyPFrBT9KwklhqZa8W",
  };
  await page.evaluate(
    async (target) =>
      (
        window as unknown as { ifcSession: IfcModelAdapter }
      ).ifcSession.navigate(target),
    target,
  );
  await expect(page.getByTestId("ifc-selection")).toHaveText(
    JSON.stringify(target),
  );
  expect(parserWorkers).toEqual([]);
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
});
