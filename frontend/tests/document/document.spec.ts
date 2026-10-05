import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type {
  DocumentTarget,
  DocumentController,
  ExtractedDocument,
} from "../../src/viewers/document/documentTypes";
const output = resolve("../.verification-work/document-viewer");
const python = resolve(
  process.platform === "win32"
    ? "../.venv/Scripts/python.exe"
    : "../.venv/bin/python",
);
test.beforeAll(() => {
  expect(
    execFileSync(
      python,
      [resolve("../scripts/qualify_document_viewer.py"), "--output", output],
      {
        encoding: "utf8",
        env: { ...process.env, PYTHONPATH: resolve("../backend") },
        timeout: 120000,
      },
    ),
  ).toContain("Real Docling");
});
for (const format of ["xlsx", "docx"] as const) {
  test(`real Docling ${format} evidence reopens exact cells with source provenance`, async ({
    page,
  }) => {
    const source = JSON.parse(
      readFileSync(resolve(output, format + ".json"), "utf8"),
    ) as ExtractedDocument;
    const text =
      format === "xlsx"
        ? "Route moved; verify clearance"
        : "Reroute then verify";
    const chunk = source.chunks.find((item) => item.text === text)!;
    expect(chunk).toBeTruthy();
    expect(chunk.location).toContain(
      format === "xlsx" ? "Coordination/row:4/cell:C4" : "cell:C3",
    );
    await page.goto("/tests/engineering-viewers.html");
    await page
      .getByLabel("Qualified extraction", { exact: true })
      .setInputFiles(resolve(output, format + ".json"));
    await page
      .getByRole("button", { name: "Open document", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: source.filename, exact: true }),
    ).toBeVisible();
    const path =
      format === "xlsx"
        ? ["Coordination", "row:4", "cell:C4"]
        : ["header-0", "row:3", "cell:C3"];
    const target: DocumentTarget = {
      kind: "document",
      source_revision_id: source.sourceRevisionId,
      structural_path: path,
      page: chunk.page,
      location: chunk.location,
    };
    const navigate = async () =>
      page.evaluate(
        async (target) =>
          (
            window as unknown as { documentSession: DocumentController }
          ).documentSession.navigate(target),
        target,
      );
    expect(await navigate()).toEqual(target);
    await expect(page.locator('tr[data-selected="true"]')).toContainText(text);
    await expect
      .poll(async () =>
        JSON.parse(
          (await page.getByTestId("document-selection").textContent())!,
        ),
      )
      .toEqual(target);
    if (format === "xlsx") {
      await expect(page.locator("table")).toHaveCount(2);
      await expect(page.locator("tbody tr")).toHaveCount(22);
    }
    if (format === "docx") {
      const instruction = source.chunks.find((item) =>
        item.text.includes("Increase BEAM-01 depth from 300 mm to 900 mm"),
      )!;
      expect(instruction).toBeTruthy();
      const paragraph = {
        kind: "document" as const,
        source_revision_id: source.sourceRevisionId,
        structural_path: [instruction.location!.split("; ")[0]],
        page: instruction.page,
        location: instruction.location,
      };
      await page.evaluate(
        async (target) =>
          (
            window as unknown as { documentSession: DocumentController }
          ).documentSession.navigate(target),
        paragraph,
      );
      await expect(page.locator('article[data-selected="true"]')).toContainText(
        "Increase BEAM-01 depth",
      );
    }
    const stale = await page.evaluate(async (target) => {
      try {
        await (
          window as unknown as { documentSession: DocumentController }
        ).documentSession.navigate({
          ...target,
          source_revision_id: "missing-revision",
        });
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    }, target);
    expect(stale).toContain("source revision is not loaded");
    await expect(page.getByRole("alert")).toContainText(
      "source revision is not loaded",
    );
    await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
    // Resolve the contract's structural path without C's chunk identity/location.
    const structural = await page.evaluate(
      async (target) =>
        (
          window as unknown as { documentSession: DocumentController }
        ).documentSession.navigate({
          source_revision_id: target.source_revision_id,
          structural_path: target.structural_path,
        }),
      target,
    );
    expect(structural).toEqual(target);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Close viewer", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Document viewer" }),
    ).toHaveCount(0);
    const closed = await page.evaluate(async (target) => {
      try {
        await (
          window as unknown as { documentSession: DocumentController }
        ).documentSession.navigate(target);
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    }, target);
    expect(closed).toContain("closed");
    await page
      .getByRole("button", { name: "Open document", exact: true })
      .click();
    // Docling chunk IDs are not a public navigation identity and can regenerate.
    const regenerated = {
      ...source,
      chunks: source.chunks.map((item, index) => ({
        ...item,
        id: `new-${index}`,
      })),
    };
    await page
      .getByLabel("Qualified extraction", { exact: true })
      .setInputFiles({
        name: `${format}-regenerated.json`,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(regenerated)),
      });
    await page
      .getByRole("button", { name: "Open document", exact: true })
      .click();
    expect(await navigate()).toEqual(target);
    await expect(page.locator('tr[data-selected="true"]')).toContainText(text);
    await page.screenshot({
      path: `test-results/drawing/golden-document-${format}.png`,
      fullPage: true,
    });
  });
}
