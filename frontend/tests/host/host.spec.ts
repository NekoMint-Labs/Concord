import { expect, test, type Page, type Worker } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  hostFixture,
  hostTransport,
  selectEvidence,
  type Kind,
} from "./hostFixtures";

import {
  observeNativeNavigation,
  nativeNavigationAcknowledged,
} from "./nativeNavigation";

const host = (page: Page) => page.locator("[data-evidence-id]");
const kinds: Kind[] = ["drawing", "cad", "bim", "document"];

test.beforeAll(() => {
  const python =
    process.env.CCA_QUALIFICATION_PYTHON ??
    resolve(
      process.platform === "win32"
        ? "../.venv/Scripts/python.exe"
        : "../.venv/bin/python",
    );
  expect(
    execFileSync(
      python,
      [
        resolve("../scripts/qualify_document_viewer.py"),
        "--output",
        resolve("../.verification-work/document-viewer"),
      ],
      {
        env: { ...process.env, PYTHONPATH: resolve("../backend") },
        encoding: "utf8",
        timeout: 120000,
      },
    ),
  ).toContain("Real Docling");
});

async function ready(page: Page, kind: Kind) {
  await expect(host(page)).toHaveAttribute(
    "data-navigation-state",
    "viewer_active",
  );
  if (kind === "drawing") {
    await expect(page.getByLabel("Requested source region")).toBeVisible();
    await expect(page.getByLabel("Sheet", { exact: true })).toHaveValue("1");
    await expect
      .poll(() =>
        page
          .getByLabel("Drawing sheet 1")
          .evaluate((node: HTMLCanvasElement) => node.width),
      )
      .toBeGreaterThan(0);
  } else if (kind === "cad") {
    await expect(
      page.getByRole("status").filter({ hasText: "DXF opened: 2 entities" }),
    ).toBeVisible();
  } else if (kind === "bim") {
    await expect(
      page.getByRole("status").filter({ hasText: "IFC opened:" }),
    ).toBeVisible();
    await expect(
      page
        .frameLocator('iframe[title="Concord IFC viewer"]')
        .getByPlaceholder("Search elements…"),
    ).toBeVisible();
  } else {
    await expect(page.locator('tr[data-selected="true"]')).toContainText(
      "Route moved; verify clearance",
    );
  }
  if (kind === "cad" || kind === "bim")
    await expect
      .poll(() =>
        nativeNavigationAcknowledged(
          page,
          kind,
          kind === "cad" ? "31" : undefined,
        ),
      )
      .toBe(true);
  await expect(host(page)).not.toHaveAttribute(
    "data-navigation-state",
    "navigation_failed",
  );
}

for (const kind of kinds) {
  test(`real ${kind} opens and reopens through B's host, preserving exact revision and releasing resources`, async ({
    page,
  }, info) => {
    await observeNativeNavigation(page);
    const fixture = hostFixture(kind);
    const paths = await hostTransport(page, fixture);
    const workers = new Set<Worker>();
    const remote: string[] = [];
    page.on("worker", (worker) => {
      workers.add(worker);
      worker.on("close", () => workers.delete(worker));
    });
    page.on("request", (request) => {
      if (
        /^https?:/.test(request.url()) &&
        new URL(request.url()).origin !== "http://127.0.0.1:15173"
      )
        remote.push(request.url());
    });
    await page.goto("/tests/host/evidence-host.html");
    await expect(page.locator("iframe, canvas")).toHaveCount(0);
    expect(workers.size).toBe(0);
    await selectEvidence(page, fixture);
    await ready(page, kind);
    await expect(host(page)).toHaveAttribute(
      "data-source-revision-id",
      fixture.revision.id,
    );
    await expect(page.getByLabel("Exact viewer target")).toHaveText(
      JSON.stringify(fixture.input.evidence.viewer_target, null, 2),
    );
    if (kind === "drawing")
      await expect(
        page.getByRole("region", { name: "Drawing viewer" }),
      ).toHaveAttribute("data-cache-hit", "false");
    await page.screenshot({
      path: info.outputPath(`${kind}-host.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Close Evidence", exact: true })
      .click();
    await expect(host(page)).toHaveCount(0);
    await expect(page.locator("iframe, canvas")).toHaveCount(0);
    await expect.poll(() => workers.size).toBe(0);
    await selectEvidence(page, fixture);
    await ready(page, kind);
    if (kind === "drawing")
      await expect(
        page.getByRole("region", { name: "Drawing viewer" }),
      ).toHaveAttribute("data-cache-hit", "true");
    expect(paths.filter((path) => path.endsWith("/content"))).toEqual(
      Array(2).fill(
        `/api/projects/${fixture.input.project}/sources/${fixture.revision.source_id}/revisions/${fixture.revision.id}/content`,
      ),
    );
    expect(remote).toEqual([]);
    await page
      .getByRole("button", { name: "Close Evidence", exact: true })
      .click();
    await expect.poll(() => workers.size).toBe(0);
  });

  test(`real ${kind} navigation failure stays on the current Evidence`, async ({
    page,
  }) => {
    await observeNativeNavigation(page);
    const fixture = hostFixture(kind);
    const target = fixture.input.evidence.viewer_target!;
    if (target.kind === "drawing") target.page = 100;
    if (target.kind === "cad") target.entity_id = "FFFF";
    if (target.kind === "bim") target.global_ids = ["0M0KwyPFrBT9KwklhqZa8W"];
    if (target.kind === "document") {
      target.structural_path = ["Missing", "row:1", "cell:A1"];
      target.location = null;
    }
    await hostTransport(page, fixture);
    await page.goto("/tests/host/evidence-host.html");
    await selectEvidence(page, fixture);
    await expect(host(page)).toHaveAttribute(
      "data-navigation-state",
      "navigation_failed",
    );
    await expect(host(page)).toHaveAttribute(
      "data-evidence-id",
      fixture.input.evidence.id,
    );
    await expect(page.getByLabel("Exact viewer target")).toHaveText(
      JSON.stringify(target, null, 2),
    );
    await expect(page.getByRole("alert").first()).toBeVisible();
  });
}

test("modified original bytes fail host hash verification before a renderer mounts", async ({
  page,
}) => {
  const fixture = hostFixture("cad");
  await hostTransport(page, fixture, true);
  await page.goto("/tests/host/evidence-host.html");
  await selectEvidence(page, fixture);
  await expect(host(page)).toHaveAttribute(
    "data-navigation-state",
    "navigation_failed",
  );
  await expect(host(page)).toContainText("来源原文件完整性验证失败");
  await expect(page.locator("iframe, canvas")).toHaveCount(0);
});

test("reserved BIM viewpoint fails visibly through the actual host", async ({
  page,
}) => {
  const fixture = hostFixture("bim");
  if (fixture.input.evidence.viewer_target?.kind === "bim")
    fixture.input.evidence.viewer_target.viewpoint = [1, 2, 3, 4, 5, 6];
  await hostTransport(page, fixture);
  await page.goto("/tests/host/evidence-host.html");
  await selectEvidence(page, fixture);
  await expect(host(page)).toHaveAttribute(
    "data-navigation-state",
    "navigation_failed",
  );
  await expect(host(page)).toContainText("BIM viewpoint is reserved");
});
