import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test, expect } from "@playwright/test";
import type { DTO } from "../src/api/client";
import { openWorkPanel, toolRail } from "./donor-conformance";

const root = resolve("..");
const python =
  process.env.CCA_E2E_PYTHON ?? join(root, ".venv", "bin", "python");
const artifacts = join(root, ".verification-work", "issue-16-real");
const screenshots = join(
  root,
  ".verification-work",
  "issue-16-donor-conformance",
  process.env.CONCORD_DONOR_STAGE ?? "after",
);
const headers = { Authorization: "Bearer local-demo-admin" };

/** Real HTTP/persistence/DBOS. Engineering publications use deterministic trusted
 * test providers; this does NOT qualify #17's detectors/viewers.
 */
test("persisted Finding, rejected closure and explicit resolved closure/reopen survive reload", async ({
  page,
  request,
}) => {
  expect(existsSync(join(root, "frontend", "dist", "index.html"))).toBeTruthy();
  mkdirSync(artifacts, { recursive: true });
  mkdirSync(screenshots, { recursive: true });
  const folder = mkdtempSync(join(artifacts, "backend-"));
  const port = Number(process.env.CCA_E2E_PORT ?? "18316");
  const base = `http://127.0.0.1:${port}`;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("CCA_")),
  );
  Object.assign(env, {
    PYTHONPATH: `${join(root, "backend")}:${join(root, "backend", "tests")}`,
    CCA_DATA_DIR: folder,
    CCA_API_TOKEN: "local-demo-admin",
    CCA_PROFILE: "local",
    CCA_RUNTIME: "dbos",
    PYTHONUNBUFFERED: "1",
  });
  const seed = execFileSync(
    python,
    [
      "-c",
      `
import json
from pathlib import Path
from app.bootstrap import build_services
from app.settings import Settings
from app.domain.actions import Principal
from test_engineering_coordination import setup_finding
svc = build_services(Settings(data_dir=Path(${JSON.stringify(folder)}), diagnostic_runtime=True))
try:
    admin = Principal(id="browser-fixture", role="admin")
    project, source, revision, finding, publication, draft = setup_finding(svc, admin, confirm=False)
    print(json.dumps({"project": project.id, "source": source.id, "finding": finding.id, "evidence": finding.evidence_ids[0], "revision": revision.id}))
finally:
    svc.close()
`,
    ],
    { cwd: folder, env, encoding: "utf8" },
  );
  const identity = JSON.parse(seed.trim().split("\n").at(-1)!) as {
    project: string;
    source: string;
    finding: string;
    evidence: string;
    revision: string;
  };
  const server = spawn(
    python,
    ["-m", "app.cli", "serve", "--host", "127.0.0.1", "--port", String(port)],
    { cwd: folder, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const serverClosed = new Promise<void>((done) => {
    server.once("close", () => done());
  });
  let logs = "";
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  try {
    await expect
      .poll(
        async () => {
          try {
            return (
              await request.get(`${base}/health`, { timeout: 2000 })
            ).status();
          } catch {
            return 0;
          }
        },
        { timeout: 60000, message: "isolated real DBOS backend must start" },
      )
      .toBe(200);
    const url = `${base}/api/projects/${identity.project}/engineering/findings/${identity.finding}`;
    const persisted = await request.get(url, { headers });
    expect(persisted.ok(), logs).toBeTruthy();
    expect(((await persisted.json()) as DTO<"Finding">).state).toBe("PROPOSED");
    const evidence = await request.get(
      `${base}/api/projects/${identity.project}/engineering/evidence/${identity.evidence}`,
      { headers },
    );
    expect(
      ((await evidence.json()) as DTO<"Evidence">).source_revision_id,
    ).toBe(identity.revision);
    await page.addInitScript((project) => {
      sessionStorage.setItem("cca-token", "local-demo-admin");
      localStorage.setItem("concord:last-project", project);
    }, identity.project);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base);
    await toolRail(page)
      .getByRole("button", { name: "工作", exact: true })
      .click();
    await openWorkPanel(page);
    const findingRow = page
      .locator("div.workspace-list button.workspace-row")
      .filter({ hasText: "Clearance" });
    await expect(findingRow).toContainText("待人工判断");
    await findingRow.click();
    const panel = page.getByRole("complementary", {
      name: "工作与审核",
    });
    await expect(panel).toBeVisible();
    await expect(panel.locator(".workspace-list")).toBeVisible();
    await expect(findingRow).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-evidence-id]")).toHaveAttribute(
      "data-evidence-id",
      identity.evidence,
    );
    await expect(page.locator("[data-evidence-id]")).toHaveAttribute(
      "data-navigation-state",
      "navigation_failed",
    );
    await panel.getByRole("button", { name: "确认", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "提交人工判断" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(panel).toContainText("CONFIRMED");
    await panel.getByRole("button", { name: "协调 / 复核" }).click();
    const followup = page.getByRole("dialog");
    await expect(
      followup.getByRole("region", { name: "人工决策历史" }),
    ).toContainText("CONFIRMED");
    await followup.getByRole("button", { name: "请求当前版本复核" }).click();
    await expect(
      followup.getByRole("list", { name: "ReCheck 历史" }),
    ).toContainText("NEEDS_REVIEW");
    await expect(
      followup.getByRole("list", { name: "ReCheck 历史" }),
    ).toContainText("COMPLETED");
    await page.screenshot({
      path: join(screenshots, "real-needs-review.png"),
      animations: "disabled",
    });
    await followup.getByRole("button", { name: "返回证据" }).click();
    await panel.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(
      page.getByLabel("关闭依据 ReCheck", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByLabel("关闭依据 ReCheck", { exact: true }).locator("option"),
    ).toHaveCount(1);
    await page
      .getByLabel("判断说明", { exact: true })
      .fill("Attempt closure without verified resolved evidence");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "提交人工判断" })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    expect(
      ((await (await request.get(url, { headers })).json()) as DTO<"Finding">)
        .state,
    ).toBe("CONFIRMED");
    const history = await request.get(`${url}/coordination`, { headers });
    expect(
      ((await history.json()) as DTO<"Coordination">[]).map(
        (item) => item.decision,
      ),
    ).toEqual(["CONFIRMED"]);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "取消", exact: true })
      .click();
    // Same isolated DB, using the backend acceptance provider and real source/recheck
    // services. No public publication endpoint or browser transport interception.
    const resolved = JSON.parse(
      execFileSync(
        python,
        [
          "-c",
          `
from pathlib import Path
from app.bootstrap import build_services
from app.settings import Settings
from app.domain.actions import Principal
from test_engineering_coordination import CheckEngine
svc = build_services(Settings(data_dir=Path(${JSON.stringify(folder)}), diagnostic_runtime=True))
try:
    admin = Principal(id="browser-fixture", role="admin")
    engine = CheckEngine(svc)
    svc.rechecks.capabilities[engine.name] = engine
    revision = svc.sources.upload(${JSON.stringify(identity.project)}, ${JSON.stringify(identity.source)}, "r2.ifc", b"r2", admin).revision
    with svc.factory.open() as repo:
        check = next(c for c in repo.rechecks(${JSON.stringify(identity.project)}, ${JSON.stringify(identity.finding)}) if c.source_revision_id == revision.id)
        assert engine.calls == 1
        assert check.outcome == "RESOLVED" and check.evidence_ids
        assert repo.run(check.id).status == "COMPLETED"
        assert repo.finding(check.project_id, check.finding_id).state == "CONFIRMED"
        print(check.model_dump_json())
finally:
    svc.close()
`,
        ],
        { cwd: folder, env, encoding: "utf8" },
      )
        .trim()
        .split("\n")
        .at(-1)!,
    ) as DTO<"ReCheck">;
    const checks = await request.get(`${url}/rechecks`, { headers });
    expect(checks.ok(), logs).toBeTruthy();
    expect((await checks.json()) as DTO<"ReCheck">[]).toContainEqual(resolved);
    const resolvedEvidence = await request.get(
      `${base}/api/projects/${identity.project}/engineering/evidence/${resolved.evidence_ids[0]}`,
      { headers },
    );
    expect(resolvedEvidence.ok(), logs).toBeTruthy();
    expect((await resolvedEvidence.json()) as DTO<"Evidence">).toMatchObject({
      quality: "structured",
      provider: "fixture-clearance",
      source_revision_id: resolved.source_revision_id,
    });
    expect(resolved.source_revision_id).not.toBe(identity.revision);
    expect(
      ((await (await request.get(url, { headers })).json()) as DTO<"Finding">)
        .state,
    ).toBe("CONFIRMED");

    await page.reload();
    await toolRail(page)
      .getByRole("button", { name: "工作", exact: true })
      .click();
    await openWorkPanel(page);
    await expect(findingRow).toContainText("已确认");
    await findingRow.click();
    await panel.getByRole("button", { name: "关闭", exact: true }).click();
    const closureBasis = page.getByLabel("关闭依据 ReCheck", { exact: true });
    await expect(closureBasis).toHaveValue("");
    await expect(closureBasis.locator("option")).toHaveCount(2);
    await closureBasis.selectOption(resolved.id);
    await expect(closureBasis).toHaveValue(resolved.id);
    const previousViewport = page.viewportSize()!;
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [1280, 720],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(
        page.getByRole("dialog").getByRole("button", { name: "提交人工判断" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: join(screenshots, `real-close-basis-${width}x${height}.png`),
        animations: "disabled",
      });
    }
    await page.setViewportSize(previousViewport);
    const closureNote =
      "Human closes after reviewing current resolved clearance evidence";
    await page.getByLabel("判断说明", { exact: true }).fill(closureNote);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "提交人工判断" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(panel).toContainText("CLOSED");
    expect(
      ((await (await request.get(url, { headers })).json()) as DTO<"Finding">)
        .state,
    ).toBe("CLOSED");
    const closedHistory = (await (
      await request.get(`${url}/coordination`, { headers })
    ).json()) as DTO<"Coordination">[];
    expect(closedHistory).toHaveLength(2);
    expect(
      closedHistory.find((item) => item.decision === "CLOSED"),
    ).toMatchObject({
      finding_id: identity.finding,
      recheck_id: resolved.id,
      note: closureNote,
    });
    await page.reload();
    await toolRail(page)
      .getByRole("button", { name: "工作", exact: true })
      .click();
    await openWorkPanel(page);
    await expect(findingRow).toContainText("人工关闭");
    await findingRow.click();
    await expect(panel).toContainText("CLOSED");
    await page.screenshot({
      path: join(screenshots, "real-closed.png"),
      animations: "disabled",
    });
    await panel.getByRole("button", { name: "重新打开", exact: true }).click();
    await page
      .getByLabel("判断说明", { exact: true })
      .fill("Reopen closed Finding for reassessment");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "提交人工判断" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(panel).toContainText("PROPOSED");
    expect(
      ((await (await request.get(url, { headers })).json()) as DTO<"Finding">)
        .state,
    ).toBe("PROPOSED");
    const reopenedHistory = (await (
      await request.get(`${url}/coordination`, { headers })
    ).json()) as DTO<"Coordination">[];
    expect(reopenedHistory).toHaveLength(3);
    expect(
      reopenedHistory.find((item) => item.decision === "REOPENED"),
    ).toMatchObject({
      finding_id: identity.finding,
      note: "Reopen closed Finding for reassessment",
      recheck_id: null,
    });
    expect(reopenedHistory).toEqual(expect.arrayContaining(closedHistory));
    await panel.getByRole("button", { name: "忽略", exact: true }).click();
    await page
      .getByLabel("判断说明", { exact: true })
      .fill("Dismiss with human reasoning");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "提交人工判断" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await panel.getByRole("button", { name: "重新打开", exact: true }).click();
    await page
      .getByLabel("判断说明", { exact: true })
      .fill("Reopen for additional review");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "提交人工判断" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await toolRail(page)
      .getByRole("button", { name: "工作", exact: true })
      .click();
    await openWorkPanel(page);
    await expect(findingRow).toBeVisible();
    await expect(findingRow).toContainText("待人工判断");
    const finalHistory = await request.get(`${url}/coordination`, { headers });
    expect(
      ((await finalHistory.json()) as DTO<"Coordination">[])
        .map((item) => item.decision)
        .sort(),
    ).toEqual(
      ["CONFIRMED", "CLOSED", "DISMISSED", "REOPENED", "REOPENED"].sort(),
    );
    expect(
      ((await (await request.get(url, { headers })).json()) as DTO<"Finding">)
        .state,
    ).toBe("PROPOSED");
  } finally {
    // Only signal our child, and wait for actual termination before deleting its DB.
    const forceKill = setTimeout(() => server.kill("SIGKILL"), 15000);
    forceKill.unref();
    server.kill("SIGTERM");
    try {
      await serverClosed;
    } finally {
      clearTimeout(forceKill);
    }
    rmSync(folder, { recursive: true, force: true });
  }
});
