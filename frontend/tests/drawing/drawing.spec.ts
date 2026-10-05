import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { PdfCanonicalChange } from "../../src/viewers/drawing/pdfChangeMapping";
async function mappedChanges(page: Page): Promise<PdfCanonicalChange[]> {
  return page.evaluate(() =>
    (
      window as unknown as {
        mapPdfComparison: () => Promise<PdfCanonicalChange[]>;
      }
    ).mapPdfComparison(),
  );
}
const fixture = (revision: string, file = "structural-drawing.pdf") =>
  resolve("../fixtures/coordination-project", revision, file);
async function sources(page: Page, later = fixture("R2")) {
  await page.goto("/tests/engineering-viewers.html");
  await page
    .getByLabel("Earlier source", { exact: true })
    .setInputFiles(fixture("R1"));
  await page.getByLabel("Later source", { exact: true }).setInputFiles(later);
  await expect(page.getByTestId("source-state")).toHaveText("Ready");
}
async function compare(page: Page) {
  await page
    .getByRole("button", { name: "Compare revisions", exact: true })
    .click();
  await expect(
    page.locator('[data-testid="diff-result"], [role="alert"]'),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  return JSON.parse((await page.getByTestId("diff-result").textContent())!);
}
test("Golden PDF comparison runs off-thread, caches and releases workers", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const state = { active: 0, created: 0, ticks: 0 };
    Object.assign(window, { qualification: state });
    setInterval(() => state.ticks++, 10);
    window.Worker = class extends Original {
      ended = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.active++;
        state.created++;
      }
      terminate() {
        if (!this.ended) {
          this.ended = true;
          state.active--;
        }
        super.terminate();
      }
    };
  });
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:15173")
      remoteRequests.push(request.url());
  });
  await sources(page);
  const first = await compare(page);
  expect(first.changedPixels).toBeGreaterThan(0);
  expect(first.cacheHit).toBe(false);
  expect(first.pages[0].boxes).toBeGreaterThan(0);
  expect(first.pages[0].words).toBeGreaterThan(0);
  const changes = await mappedChanges(page);
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({
    kind: "changed",
    project_id: "qualification-project",
    source_id: "qualification-pdf",
    from_revision_id: "before:structural-drawing.pdf",
    to_revision_id: "after:structural-drawing.pdf",
    subject: {
      kind: "drawing",
      page: 1,
      source_revision_id: "after:structural-drawing.pdf",
    },
  });
  expect(
    changes[0].subject.kind === "drawing" && changes[0].subject.normalized_bbox,
  ).toHaveLength(4);
  writeFileSync(
    resolve("../.verification-work/pdf-golden-changes.json"),
    JSON.stringify(changes),
  );
  console.log(
    "PDF Golden comparison timings",
    JSON.stringify({
      elapsedMs: first.elapsedMs,
      changedPixels: first.changedPixels,
      target: changes[0].subject,
    }),
  );
  const state = await page.evaluate(
    () =>
      (
        window as unknown as {
          qualification: { active: number; created: number; ticks: number };
        }
      ).qualification,
  );
  expect(state.created).toBe(1);
  expect(state.active).toBe(0);
  expect(state.ticks).toBeGreaterThan(10);
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
  const second = await compare(page);
  expect(second.cacheHit).toBe(true);
  expect(second.changedPixels).toBe(first.changedPixels);
  expect(await mappedChanges(page)).toEqual(changes);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { qualification: { created: number } })
          .qualification.created,
    ),
  ).toBe(1);
  expect(remoteRequests).toEqual([]);
  await page.screenshot({
    path: "test-results/drawing/golden-pdf-diff.png",
    fullPage: true,
  });
  await page.evaluate(
    (target) =>
      (
        window as unknown as {
          reopenPdfChange: (target: PdfCanonicalChange["subject"]) => void;
        }
      ).reopenPdfChange(target),
    changes[0].subject,
  );
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByLabel("Requested source region")).toBeVisible();
  await expect(page.getByTestId("viewer-failure")).toHaveText("none");
  await page
    .getByRole("region", { name: "Drawing viewer", exact: true })
    .screenshot({ path: "test-results/drawing/mapped-pdf-change.png" });
});
test("unchanged source produces zero difference", async ({ page }) => {
  await sources(page, fixture("R1"));
  const result = await compare(page);
  expect(result.changedPixels).toBe(0);
  expect(result.added).toEqual([]);
  expect(result.deleted).toEqual([]);
  expect(await mappedChanges(page)).toEqual([]);
});
test("full-page mask suppresses pixel and word highlights", async ({
  page,
}) => {
  await sources(page);
  const dimensions = (await compare(page)).pages[0];
  await page.getByLabel("Diff options").fill(
    JSON.stringify({
      scale: 1,
      maxShift: 1,
      maskRegions: [
        {
          page: 1,
          x: 0,
          y: 0,
          width: dimensions.width,
          height: dimensions.height,
        },
      ],
    }),
  );
  const result = await compare(page);
  expect(result.changedPixels).toBe(0);
  expect(result.pages[0].words).toBe(0);
  expect(result.pages[0].boxes).toBe(0);
  expect(await mappedChanges(page)).toEqual([]);
});
test("crop and inserted pages are explicit", async ({ page }) => {
  await sources(page, fixture("R1", "specification.pdf"));
  const result = await compare(page);
  expect(result.added).toHaveLength(1);
  expect(
    (await mappedChanges(page)).filter((change) => change.kind === "added"),
  ).toHaveLength(1);
  await sources(page);
  await page.getByLabel("Diff options").fill(
    JSON.stringify({
      scale: 1,
      maxShift: 0,
      cropRegions: [{ page: 1, x: 0, y: 0, width: 200, height: 100 }],
    }),
  );
  const cropped = await compare(page);
  expect(cropped.pages[0].width).toBe(200);
  expect(cropped.pages[0].height).toBe(100);
});
test("drawing opens, measures and disposes on close", async ({ page }) => {
  await sources(page);
  await page.getByRole("button", { name: "Open drawing", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  const canvas = page.locator("canvas");
  expect(await canvas.evaluate((el) => el.width)).toBeGreaterThan(0);
  await page
    .getByRole("combobox", { name: /^Tool|Drawing tool/ })
    .selectOption("calibrate");
  const layer = page.getByLabel("Drawing markup layer");
  await layer.click({ position: { x: 100, y: 100 } });
  await layer.click({ position: { x: 200, y: 100 } });
  await page.getByLabel("Known length (m)").fill("5");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page.getByText("Calibrated in metres.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: /^Tool|Drawing tool/ })
    .selectOption("distance");
  await layer.click({ position: { x: 100, y: 100 } });
  await layer.click({ position: { x: 200, y: 100 } });
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByLabel("Drawing measurements")).toContainText("5.00 m");
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
  await expect(canvas).toHaveCount(0);
});
test("cancel and invalid parser results remain failures", async ({ page }) => {
  await sources(page);
  await page
    .getByRole("button", { name: "Cancel comparison", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText("AbortError");
  await page.getByLabel("Later source", { exact: true }).setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a PDF"),
  });
  await page
    .getByRole("button", { name: "Compare revisions", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "comparison unavailable" }),
  ).toBeVisible();
  await expect(page.getByTestId("diff-result")).toHaveCount(0);
});

async function annotations(page: Page) {
  return JSON.parse(
    (await page.getByTestId("drawing-annotations").textContent())!,
  );
}
async function dragAnnotation(
  page: Page,
  from: [number, number],
  to: [number, number],
) {
  const editor = page.getByLabel("Drawing annotation editor");
  await editor.dragTo(editor, {
    sourcePosition: { x: from[0], y: from[1] },
    targetPosition: { x: to[0], y: to[1] },
  });
}
test("donor annotations retain revision provenance and support move, delete, undo and redo", async ({
  page,
}) => {
  await sources(page);
  await page.getByRole("button", { name: "Open drawing", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await dragAnnotation(page, [250, 200], [400, 300]);
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  const first = (await annotations(page))[0];
  expect(first.sourceRevisionId).toBe("before:structural-drawing.pdf");
  expect(first.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(first.page).toBe(1);
  expect(first.kind).toBe("arrow");
  expect(first.geometry.start[0]).toBeGreaterThan(first.geometry.end[0]);
  await page
    .getByRole("button", { name: "Undo annotation", exact: true })
    .click();
  await expect.poll(async () => (await annotations(page)).length).toBe(0);
  await page
    .getByRole("button", { name: "Redo annotation", exact: true })
    .click();
  expect((await annotations(page))[0]).toEqual(first);
  await page
    .getByRole("combobox", { name: "Drawing tool" })
    .selectOption("navigate");
  await dragAnnotation(page, [320, 247], [350, 277]);
  await expect
    .poll(async () => (await annotations(page))[0].geometry.start[0])
    .not.toBe(first.geometry.start[0]);
  const moved = (await annotations(page))[0];
  expect(moved.id).toBe(first.id);
  const editor = page.getByLabel("Drawing annotation editor");
  await editor.focus();
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await annotations(page)).length).toBe(0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  expect((await annotations(page))[0]).toEqual(moved);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await annotations(page)).length).toBe(0);
  await page.screenshot({
    path: "test-results/drawing/donor-annotation-editor.png",
    fullPage: true,
  });
});
test("donor cloud notes edit, cancel and remain isolated by sheet", async ({
  page,
}) => {
  await sources(page, fixture("R1", "specification.pdf"));
  await page
    .getByLabel("Earlier source", { exact: true })
    .setInputFiles(fixture("R1", "specification.pdf"));
  await expect(page.getByTestId("source-state")).toHaveText("Ready");
  await page.getByRole("button", { name: "Open drawing", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Cloud + note", exact: true }).click();
  await dragAnnotation(page, [130, 210], [330, 310]);
  await page
    .getByLabel("Annotation note", { exact: true })
    .fill("Check beam depth against R2.");
  await page.getByRole("button", { name: "Apply note", exact: true }).click();
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  const first = (await annotations(page))[0];
  expect(first.kind).toBe("cloud");
  expect(first.text).toBe("Check beam depth against R2.");
  await page
    .getByRole("combobox", { name: "Drawing tool" })
    .selectOption("navigate");
  const editor = page.getByLabel("Drawing annotation editor");
  await editor.click({ position: { x: 200, y: 250 } });
  await page.getByRole("button", { name: "Edit note", exact: true }).click();
  await page
    .getByLabel("Annotation note", { exact: true })
    .fill("Verify clearance after R3.");
  await page.getByRole("button", { name: "Apply note", exact: true }).click();
  expect((await annotations(page))[0].text).toBe("Verify clearance after R3.");
  await page.getByRole("button", { name: "Next sheet", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(editor.locator("[data-annotation-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Cloud + note", exact: true }).click();
  await dragAnnotation(page, [130, 210], [330, 310]);
  await page
    .getByLabel("Annotation note", { exact: true })
    .fill("Discard this draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await annotations(page)).toHaveLength(1);
  await page
    .getByRole("button", { name: "Previous sheet", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(editor.locator("[data-annotation-id]")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/drawing/donor-cloud-note.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
  await expect(editor).toHaveCount(0);
});

test("native donor text highlighting remains aligned after zoom", async ({
  page,
}) => {
  await sources(page);
  await page.getByRole("button", { name: "Open drawing", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Highlighter", exact: true }).click();
  await page.getByRole("button", { name: "text", exact: true }).click();
  await dragAnnotation(page, [40, 28], [880, 70]);
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  const original = (await annotations(page))[0];
  expect(original.kind).toBe("highlight");
  expect(original.text).toContain("SYNTHETIC COORDINATION FIXTURE");
  expect(original.geometry.quads.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect((await annotations(page))[0]).toEqual(original);
  const editor = page.getByLabel("Drawing annotation editor");
  const bounds = await editor.boundingBox();
  expect(bounds!.width).toBe(1125);
  await expect(editor.locator("[data-annotation-id]")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/drawing/donor-native-text-highlight.png",
    fullPage: true,
  });
});
test("canonical drawing navigation is revision-bound and survives zoom, close and reopen", async ({
  page,
}) => {
  const path = fixture("R1", "specification.pdf");
  await sources(page, path);
  await page.getByLabel("Earlier source", { exact: true }).setInputFiles(path);
  await expect(page.getByTestId("source-state")).toHaveText("Ready");
  await page.getByRole("button", { name: "Open drawing", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  const target = {
    kind: "drawing",
    source_revision_id: "before:specification.pdf",
    page: 2,
    normalized_bbox: [0.05, 0.06, 0.47, 0.1],
  };
  await page
    .getByLabel("Drawing target", { exact: true })
    .fill(JSON.stringify(target));
  await page
    .getByRole("button", { name: "Navigate drawing", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Sheet", exact: true }),
  ).toHaveValue("2");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByLabel("Requested source region")).toBeVisible();
  const region = page.getByLabel("Requested source region");
  const coordinates = await region
    .locator("rect")
    .evaluate((rect) =>
      ["x", "y", "width", "height"].map((name) => rect.getAttribute(name)),
    );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(
    await region
      .locator("rect")
      .evaluate((rect) =>
        ["x", "y", "width", "height"].map((name) => rect.getAttribute(name)),
      ),
  ).toEqual(coordinates);
  await page
    .getByRole("region", { name: "Drawing viewer", exact: true })
    .screenshot({
      path: "test-results/drawing/canonical-drawing-target.png",
    });
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
  await page.getByRole("button", { name: "Open drawing", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(
    page.getByRole("spinbutton", { name: "Sheet", exact: true }),
  ).toHaveValue("2");
  await expect(page.getByLabel("Requested source region")).toBeVisible();
  await page
    .getByLabel("Drawing target", { exact: true })
    .fill(
      JSON.stringify({ ...target, source_revision_id: "missing-revision" }),
    );
  await page
    .getByRole("button", { name: "Navigate drawing", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Drawing target belongs to a different source revision or hash",
  );
  await expect(page.getByLabel("Requested source region")).toHaveCount(0);
});

test("a failed drawing parser disables editing and releases its worker", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    Object.assign(window, { drawingWorkers: { active: 0 } });
    window.Worker = class extends Original {
      ended = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { drawingWorkers: { active: number } })
          .drawingWorkers.active++;
      }
      terminate() {
        if (!this.ended) {
          this.ended = true;
          (window as unknown as { drawingWorkers: { active: number } })
            .drawingWorkers.active--;
        }
        super.terminate();
      }
    };
  });
  await sources(page);
  await page.getByLabel("Earlier source", { exact: true }).setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("invalid drawing bytes"),
  });
  await expect(page.getByTestId("source-state")).toHaveText("Ready");
  await page.getByRole("button", { name: "Open drawing", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid PDF structure");
  await expect(
    page.getByRole("button", { name: "Arrow", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { drawingWorkers: { active: number } })
            .drawingWorkers.active,
      ),
    )
    .toBe(0);
});

test("all prepared PDF sheets reopen and rebind without creating another parser worker", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const state = { active: 0, created: 0 };
    Object.assign(window, { drawingCacheWorkers: state });
    window.Worker = class extends Original {
      ended = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.created++;
        state.active++;
      }
      terminate() {
        if (!this.ended) {
          this.ended = true;
          state.active--;
        }
        super.terminate();
      }
    };
  });
  const path = fixture("R1", "specification.pdf");
  await sources(page, path);
  await page.getByLabel("Earlier source", { exact: true }).setInputFiles(path);
  await expect(page.getByTestId("source-state")).toHaveText("Ready");
  const started = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Open drawing", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  const viewer = page.getByRole("region", {
    name: "Drawing viewer",
    exact: true,
  });
  await expect(viewer).toHaveAttribute("data-cache-hit", "false");
  const workerState = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            drawingCacheWorkers: { active: number; created: number };
          }
        ).drawingCacheWorkers,
    );
  expect(await workerState()).toEqual({ active: 0, created: 1 });
  const coldMs = await page.evaluate(
    (value) => performance.now() - value,
    started,
  );
  await page.getByRole("button", { name: "Next sheet", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await workerState()).toEqual({ active: 0, created: 1 });
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  // A different source revision carries identical original bytes; the cache must not retain old revision IDs.
  await page.getByLabel("Earlier source", { exact: true }).setInputFiles({
    name: "same-content.pdf",
    mimeType: "application/pdf",
    buffer: readFileSync(path),
  });
  await expect(page.getByTestId("source-state")).toHaveText("Ready");
  const warmStarted = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Open drawing", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(viewer).toHaveAttribute("data-cache-hit", "true");
  expect(await workerState()).toEqual({ active: 0, created: 1 });
  const warmMs = await page.evaluate(
    (value) => performance.now() - value,
    warmStarted,
  );
  await page.getByRole("button", { name: "Next sheet", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Highlighter", exact: true }).click();
  await page.getByRole("button", { name: "text", exact: true }).click();
  await dragAnnotation(page, [40, 75], [330, 112]);
  await expect.poll(async () => (await annotations(page)).length).toBe(1);
  const selected = (await annotations(page))[0];
  expect(selected.sourceRevisionId).toBe("before:same-content.pdf");
  expect(selected.page).toBe(2);
  expect(selected.text).toContain("Review rules");
  expect(await workerState()).toEqual({ active: 0, created: 1 });
  console.log(
    JSON.stringify({ pdfSheets: 2, coldMs, warmMs, parserWorkersCreated: 1 }),
  );
  await viewer.screenshot({
    path: "test-results/drawing/cached-native-text-page-2.png",
  });
  await page.getByRole("button", { name: "Close viewer", exact: true }).click();
  expect(await workerState()).toEqual({ active: 0, created: 1 });
});
