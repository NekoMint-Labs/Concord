import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type {
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
    const target = {
      sourceRevisionId: source.sourceRevisionId,
      sourceHash: source.sourceHash,
      chunkId: chunk.id,
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
    await expect(page.getByTestId("document-selection")).toHaveText(
      JSON.stringify(target),
    );
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
        sourceRevisionId: source.sourceRevisionId,
        sourceHash: source.sourceHash,
        chunkId: instruction.id,
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
        ).documentSession.navigate({ ...target, sourceHash: "0".repeat(64) });
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    }, target);
    expect(stale).toContain("hash changed");
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
    expect(await navigate()).toEqual(target);
    await expect(page.locator('tr[data-selected="true"]')).toContainText(text);
    await page.screenshot({
      path: `test-results/drawing/golden-document-${format}.png`,
      fullPage: true,
    });
  });
}
