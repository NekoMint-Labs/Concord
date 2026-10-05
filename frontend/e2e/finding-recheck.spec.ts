import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DTO } from "../src/api/client";
import { openWorkPanel, toolRail } from "./donor-conformance";

const headers = { Authorization: "Bearer local-demo-admin" };
const screenshots = resolve(
  "..",
  ".verification-work",
  "issue-16-donor-conformance",
  process.env.CONCORD_DONOR_STAGE ?? "after",
);
const now = "2026-03-22T10:15:00Z";
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];
async function capture(page: Page, name: string) {
  mkdirSync(screenshots, { recursive: true });
  const viewport = page.viewportSize()!;
  await page.screenshot({
    path: resolve(
      screenshots,
      `${name}-${viewport.width}x${viewport.height}.png`,
    ),
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
}

for (const viewport of viewports) {
  test(`transport-mocked generated ReCheck DTOs / all outcomes / stale / retry ${viewport.width}×${viewport.height}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Project, authentication, source catalog and revision upload use actual HTTP.
    // ONLY engineering DTO transport + corresponding AgentRun GETs are mocked.
    const created = await request.post("/api/projects", {
      headers,
      data: {
        name: `ReCheck DTO 验证 ${randomUUID().slice(0, 8)}`,
      } satisfies DTO<"CreateProject">,
    });
    expect(created.status()).toBe(201);
    const project = (await created.json()) as DTO<"Project">;
    const sourceResponse = await request.post(
      `/api/projects/${project.id}/sources`,
      {
        headers,
        data: {
          name: "复核来源",
          kind: "BIM",
        } satisfies DTO<"CreateProjectSource">,
      },
    );
    expect(sourceResponse.status()).toBe(201);
    const source = (await sourceResponse.json()) as DTO<"ProjectSource">;
    const uploaded = await request.post(
      `/api/projects/${project.id}/sources/${source.id}/revisions`,
      {
        headers,
        multipart: {
          file: {
            name: "transport-mock-input.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("Synthetic source; no geometry validation"),
          },
        },
      },
    );
    expect(uploaded.ok()).toBe(true);
    const revision = ((await uploaded.json()) as DTO<"RevisionUploadResult">)
      .revision;
    const target = {
      kind: "cad",
      source_revision_id: revision.id,
      entity_id: "A17",
      view_bounds: null,
    } satisfies NonNullable<DTO<"Evidence">["viewer_target"]>;
    const evidence = {
      id: "opaque-recheck-evidence",
      snapshot_id: "snapshot-19",
      provider: "transport-mocked-provider",
      source_id: source.id,
      source_revision_id: revision.id,
      source_revision: revision.sha256,
      observed_at: now,
      work_package_id: null,
      element_ids: [],
      page: 9,
      location: "旧版位置不得推断 CAD 图层",
      fact: "复核 provider 返回的来源依据",
      quality: "structured",
      viewer_target: target,
    } satisfies DTO<"Evidence">;
    const staleEvidence = {
      ...evidence,
      id: "opaque-stale-evidence",
      source_revision_id: "old-source-revision",
      viewer_target: { ...target, source_revision_id: "old-source-revision" },
      fact: "历史复核依据不得用于当前人工判断",
    } satisfies DTO<"Evidence">;
    const dependency = {
      source_id: source.id,
      source_revision_id: revision.id,
      capability: "transport-mocked-clearance",
      expected_condition: "净高满足设计条件",
      target,
    } satisfies DTO<"FindingDependency">;
    const finding = {
      id: "opaque-confirmed-finding",
      project_id: project.id,
      snapshot_id: "snapshot-19",
      work_package_id: "",
      title: "工程复核与人工历史分开呈现",
      what_changed: "来源 R2 到达",
      why_it_matters: "工程师判断净高",
      conclusion: "工程师判断净高",
      reasoning_summary: "来源 R2 到达",
      confidence: 0.7,
      limitations: ["Transport-mocked DTO，非实际工程结论"],
      created_at: now,
      updated_at: now,
      evidence_ids: [evidence.id],
      change_ids: [],
      dependencies: [dependency],
      impact: {
        work_package_ids: [],
        area_ids: [],
        element_ids: [],
        disciplines: ["MEP"],
      },
      suggested_action: "工程复核",
      suggested_discipline: "机电",
      state: "CONFIRMED",
    } satisfies DTO<"Finding">;
    const history = [
      {
        id: "coord-confirm",
        project_id: project.id,
        finding_id: finding.id,
        actor: "human-engineer",
        decision: "CONFIRMED",
        note: "人工确认候选事项",
        recheck_id: null,
        created_at: now,
      },
      {
        id: "coord-edit",
        project_id: project.id,
        finding_id: finding.id,
        actor: "human-engineer",
        decision: "EDITED",
        note: "人工调整建议；不是 AI 决策",
        recheck_id: null,
        created_at: now,
      },
    ] satisfies DTO<"Coordination">[];
    const checks = [
      ...(["RESOLVED", "STILL_OPEN", "CHANGED", "NEEDS_REVIEW"] as const).map(
        (outcome) =>
          ({
            id: `opaque-check-${outcome}`,
            project_id: project.id,
            finding_id: finding.id,
            source_id: source.id,
            source_revision_id: revision.id,
            dependencies: [dependency],
            finding_updated_at: finding.updated_at,
            request_id: `request-${outcome}`,
            outcome,
            evidence_ids: [evidence.id],
            explanation: `工程结论 ${outcome}；执行完成不会自动关闭 Finding`,
            created_at: now,
            completed_at: now,
          }) satisfies DTO<"ReCheck">,
      ),
      {
        id: "opaque-check-stale-finding",
        project_id: project.id,
        finding_id: finding.id,
        source_id: source.id,
        source_revision_id: revision.id,
        dependencies: [dependency],
        finding_updated_at: "2026-03-21T10:15:00Z",
        request_id: "request-stale-finding",
        outcome: "RESOLVED",
        evidence_ids: [evidence.id],
        explanation: "旧人工判断版本的结果不能证明当前已解决",
        created_at: now,
        completed_at: now,
      },
      {
        id: "opaque-check-stale-source",
        project_id: project.id,
        finding_id: finding.id,
        source_id: source.id,
        source_revision_id: "old-source-revision",
        dependencies: [dependency],
        finding_updated_at: finding.updated_at,
        request_id: "request-stale-source",
        outcome: "RESOLVED",
        evidence_ids: [staleEvidence.id],
        explanation: "来源版本已被新版替换",
        created_at: now,
        completed_at: now,
      },
      {
        id: "opaque-check-unavailable-source",
        project_id: project.id,
        finding_id: finding.id,
        source_id: "unavailable-source",
        source_revision_id: "unavailable-revision",
        dependencies: [],
        finding_updated_at: finding.updated_at,
        request_id: "request-unavailable-source",
        outcome: "RESOLVED",
        evidence_ids: [],
        explanation: "当前来源版本不可读，时效未知",
        created_at: now,
        completed_at: now,
      },
      {
        id: "opaque-check-failed-run",
        project_id: project.id,
        finding_id: finding.id,
        source_id: source.id,
        source_revision_id: revision.id,
        dependencies: [dependency],
        finding_updated_at: finding.updated_at,
        request_id: "request-failed-run",
        outcome: null,
        evidence_ids: [],
        explanation: "执行失败不等于 NEEDS_REVIEW，也不等于已解决",
        created_at: now,
        completed_at: null,
      },
    ] satisfies DTO<"ReCheck">[];
    const runs = checks.map(
      (check) =>
        ({
          id: check.id,
          project_id: project.id,
          event_id: null,
          status: check.outcome ? "COMPLETED" : "FAILED",
          runtime: "dbos",
          runtime_execution_id: `execution-${check.id}`,
          generation: 0,
          runtime_generation: 0,
          category: "engineering_recheck",
          analysis_id: null,
          error: check.outcome ? null : "provider transport failure",
          created_at: now,
          updated_at: now,
        }) satisfies DTO<"AgentRun">,
    );
    let mode: "full" | "empty" | "errors" = "full";
    let postCount = 0;
    const operations: string[] = [];
    const decisions: DTO<"FindingDecision">[] = [];
    const base = `/api/projects/${project.id}/engineering`;
    await page.route(`**${base}/**`, async (route) => {
      const req = route.request();
      expect(req.headers().authorization).toBe(headers.Authorization);
      const path = new URL(req.url()).pathname;
      if (req.method() === "POST" && path.endsWith("/rechecks")) {
        const body = req.postDataJSON() as DTO<"ReCheckRequest">;
        expect(Object.keys(body)).toEqual(["operation_id"]);
        expect(body.operation_id).toMatch(/^[\da-f-]{36}$/);
        operations.push(body.operation_id);
        postCount++;
        if (postCount === 1)
          await route.fulfill({
            status: 503,
            json: { detail: "复核请求暂不可用，请重试" },
          });
        else await route.fulfill({ status: 202, json: checks });
        return;
      }
      if (req.method() === "POST" && path.endsWith("/decisions")) {
        decisions.push(req.postDataJSON() as DTO<"FindingDecision">);
        await route.fulfill({
          status: 409,
          json: {
            detail:
              "Every dependency source requires current resolved evidence",
          },
        });
        return;
      }
      if (
        mode === "errors" &&
        (path.endsWith("/coordination") || path.endsWith("/rechecks"))
      ) {
        await route.fulfill({
          status: 503,
          json: { detail: "历史记录服务暂不可用" },
        });
        return;
      }
      let body: unknown;
      if (path === `${base}/findings`) body = [finding];
      else if (path === `${base}/findings/${finding.id}`) body = finding;
      else if (path === `${base}/evidence/${evidence.id}`) body = evidence;
      else if (path === `${base}/evidence/${staleEvidence.id}`)
        body = staleEvidence;
      else if (path.endsWith("/coordination"))
        body = mode === "empty" ? [] : history;
      else if (path.endsWith("/rechecks"))
        body = mode === "empty" ? [] : checks;
      else
        throw new Error(
          `Unspecified mocked engineering route: ${req.method()} ${path}`,
        );
      await route.fulfill({ json: body });
    });
    await page.route("**/api/runs/opaque-check-*", async (route) => {
      const run = runs.find((item) =>
        route.request().url().endsWith(`/${item.id}`),
      );
      expect(run).toBeDefined();
      await route.fulfill({ json: run });
    });
    await page.addInitScript((id) => {
      sessionStorage.setItem("cca-token", "local-demo-admin");
      localStorage.setItem("concord:last-project", id);
    }, project.id);
    const panel = page.getByRole("complementary", {
      name: "工作与审核",
    });
    const dialog = page.getByRole("dialog", {
      name: "协调 / ReCheck",
      exact: true,
    });
    async function openReview() {
      await page.goto("/");
      await toolRail(page)
        .getByRole("button", { name: "工作", exact: true })
        .click();
      await openWorkPanel(page);
      await page
        .getByRole("button", { name: new RegExp(finding.title) })
        .click();
      await expect(
        page.getByRole("complementary", { name: "工作与审核" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: new RegExp(finding.title) }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(panel.locator(".workspace-list")).toBeVisible();
      await panel
        .getByRole("button", { name: "协调 / 复核", exact: true })
        .click();
      await expect(dialog).toBeVisible();
    }
    await openReview();
    const checkList = dialog.getByRole("list", { name: "ReCheck 历史" });
    for (const outcome of [
      "RESOLVED",
      "STILL_OPEN",
      "CHANGED",
      "NEEDS_REVIEW",
    ] as const) {
      const row = checkList.getByRole("listitem").filter({
        has: page.locator("code", { hasText: `opaque-check-${outcome}` }),
      });
      await expect(row).toContainText(outcome);
      await expect(row).toContainText("执行：COMPLETED");
      await expect(row).toContainText("当前版本绑定 · 关闭仍由服务器验证");
      await row.scrollIntoViewIfNeeded();
      await capture(page, `transport-mocked-recheck-${outcome.toLowerCase()}`);
    }
    for (const [id, expected] of [
      ["stale-finding", "已过期 · Finding 已更新"],
      ["stale-source", "已过期 · 源版本已更新"],
      ["unavailable-source", "版本时效未验证 · 当前源版本不可用"],
      ["failed-run", "执行：FAILED"],
    ]) {
      const row = checkList.getByRole("listitem").filter({
        has: page.locator("code", { hasText: `opaque-check-${id}` }),
      });
      await expect(row).toContainText(expected);
      if (id === "failed-run") {
        await expect(row).toContainText("PENDING · 工程结论待定");
        await expect(row.getByRole("alert")).toContainText("复核执行失败");
        await expect(row.getByRole("alert").locator("details")).toContainText(
          "provider transport failure",
        );
      }
      await row.scrollIntoViewIfNeeded();
      await capture(page, `transport-mocked-recheck-${id}`);
    }
    const historyRegion = dialog.getByRole("region", { name: "人工决策历史" });
    await expect(historyRegion).toContainText("human-engineer");
    await expect(historyRegion).toContainText("CONFIRMED");
    await expect(historyRegion).toContainText("EDITED");
    await historyRegion.scrollIntoViewIfNeeded();
    await capture(page, "transport-mocked-recheck-human-history");
    await dialog
      .getByRole("button", { name: "请求当前版本复核", exact: true })
      .click();
    await expect(
      dialog.getByRole("alert").filter({ hasText: "复核请求未提交" }),
    ).toBeVisible();
    await capture(page, "transport-mocked-recheck-request-error");
    await dialog
      .getByRole("button", { name: "重试复核请求", exact: true })
      .click();
    await expect.poll(() => postCount).toBe(2);
    await expect(
      dialog.getByRole("button", { name: "请求当前版本复核", exact: true }),
    ).toBeEnabled();
    expect(operations[0]).toBe(operations[1]);
    await page.keyboard.press("Escape");
    await expect(
      panel.getByRole("button", { name: "协调 / 复核", exact: true }),
    ).toBeFocused();
    await expect(
      panel.getByRole("status").filter({ hasText: "已确认" }),
    ).toBeVisible();
    // A resolved row does NOT auto-close; all dependency validation remains server-owned.
    await panel.getByRole("button", { name: "关闭", exact: true }).click();
    const close = page.getByRole("dialog", {
      name: "关闭 Finding",
      exact: true,
    });
    await expect(
      close.getByRole("button", { name: "提交人工判断" }),
    ).toBeDisabled();
    await close
      .getByRole("textbox", { name: "判断说明" })
      .fill("人工请求关闭，服务器必须验证全部依赖");
    await close.getByRole("button", { name: "提交人工判断" }).click();
    await expect(close.getByRole("alert")).toContainText(
      "Every dependency source requires current resolved evidence",
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0].decision).toBe("CLOSED");
    await capture(page, "transport-mocked-recheck-close-rejected");
    await page.keyboard.press("Escape");
    await panel
      .getByRole("button", { name: "协调 / 复核", exact: true })
      .click();
    // ReCheck evidence links retain exact canonical target, including absent CAD layer.
    await checkList
      .getByRole("listitem")
      .first()
      .getByRole("button", { name: `查看复核 Evidence · ${evidence.id}` })
      .click();
    const host = page.locator(`[data-evidence-id="${evidence.id}"]`);
    await expect(host).toHaveAttribute(
      "data-navigation-state",
      "navigation_failed",
    );
    const receipt = JSON.parse(
      (await host.getByLabel("Exact viewer target").textContent())!,
    );
    expect(receipt).toEqual(target);
    expect(Object.hasOwn(receipt, "layer")).toBe(false);
    await capture(page, "transport-mocked-recheck-cad-optional-layer");
    await panel
      .getByRole("button", { name: "协调 / 复核", exact: true })
      .click();
    await checkList
      .getByRole("listitem")
      .filter({
        has: page.locator("code", { hasText: "opaque-check-stale-source" }),
      })
      .getByRole("button", { name: `查看复核 Evidence · ${staleEvidence.id}` })
      .click();
    const staleHost = page.locator(`[data-evidence-id="${staleEvidence.id}"]`);
    await expect(staleHost).toHaveAttribute("data-evidence-stale", "true");
    await expect(staleHost).toHaveAttribute(
      "data-source-revision-id",
      "old-source-revision",
    );
    await expect(staleHost).toContainText("历史证据 · 已过期或被替换");
    await capture(page, "transport-mocked-recheck-stale-evidence");
    for (const next of ["empty", "errors"] as const) {
      mode = next;
      await openReview();
      if (next === "empty") {
        await expect(dialog).toContainText(
          "尚无 ReCheck，不能据此声称问题已解决。",
        );
        await expect(dialog).toContainText("尚无人工决策记录。");
      } else {
        await expect(
          dialog.getByRole("alert").filter({ hasText: "复核记录读取失败" }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("alert").filter({ hasText: "人工决策历史读取失败" }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "重试读取复核" }),
        ).toBeEnabled();
        await expect(
          dialog.getByRole("button", { name: "重试读取历史" }),
        ).toBeEnabled();
      }
      await capture(page, `transport-mocked-recheck-${next}`);
      await page.keyboard.press("Escape");
    }
    expect(errors).toEqual([]);
  });
}
