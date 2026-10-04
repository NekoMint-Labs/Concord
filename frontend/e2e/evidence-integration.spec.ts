import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { DTO } from "../src/api/client";
import { openWorkPanel, toolRail } from "./donor-conformance";

// Run against a built A+B+C checkout, not B's isolated viewer harness:
// CCA_E2E_APP_ROOT=/tmp/concord-seam-pass/full pnpm exec playwright test \
//   --config playwright.engineering-real.config.ts evidence-integration.spec.ts
// Prerequisites: app dist, C's Golden sources and local PDF/CAD/IFC assets (including
// canonical-bim-v1). IFC prepare's archive mismatch is a build blocker, NOT a skip.
const root = resolve(process.env.CCA_E2E_APP_ROOT ?? "..");
const python =
  process.env.CCA_E2E_PYTHON ?? join(root, ".venv", "bin", "python");
const artifacts = join(root, ".verification-work", "evidence-integration");
const headers = { Authorization: "Bearer local-demo-admin" };
const viewers = ["drawing", "cad", "bim", "document"] as const;
type Viewer = (typeof viewers)[number];
type Seed = {
  project: string;
  finding: DTO<"Finding">;
  evidence: DTO<"Evidence">;
  invalid: DTO<"Evidence">;
  latest: string;
  chunk: string | null;
  document: string | null;
};
type ViewerTrace = { frame: string } & Record<string, unknown>;
type ObservedWindow = Window & { evidenceViewerTrace: ViewerTrace[] };

/** Trusted canonical publication of real source bytes, not a detector registration.
 * HTTP, source integrity, persisted document extraction, DBOS and human decisions
 * are real. No routes, parsers, viewers or engineering capabilities are mocked.
 * Independent cases keep the strict IFC failure from hiding the other viewers.
 */
for (const kind of viewers) {
  test(`${kind}: selected Work Finding opens exact evidence, recovers navigation and persists human coordination/ReCheck`, async ({
    page,
    request,
  }, testInfo) => {
    expect(existsSync(join(root, "frontend", "dist", "index.html"))).toBe(true);
    mkdirSync(artifacts, { recursive: true });
    const folder = mkdtempSync(join(artifacts, `${kind}-`));
    const port = Number(process.env.CCA_E2E_PORT ?? "18317");
    const base = `http://127.0.0.1:${port}`;
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("CCA_")),
    );
    Object.assign(env, {
      PYTHONPATH: join(root, "backend"),
      CCA_DATA_DIR: folder,
      CCA_API_TOKEN: "local-demo-admin",
      CCA_PROFILE: "local",
      CCA_RUNTIME: "dbos",
      CCA_SEED_DEMO: "false",
      PYTHONUNBUFFERED: "1",
    });
    let server: ReturnType<typeof spawn> | undefined;
    let serverClosed: Promise<void> | undefined;
    let logs = "";
    try {
      const seed = JSON.parse(
        execFileSync(
          python,
          [
            "-c",
            `
import hashlib, json
from pathlib import Path
from app.bootstrap import build_services
from app.settings import Settings
from app.domain.actions import Principal
from app.domain.engineering import Change, EngineeringPublication, FindingDraft
from app.domain.engineering_refs import DrawingTarget, CadTarget, BimTarget, DocumentTarget, FindingDependency
from app.domain.models import Evidence, Impact, ProjectSnapshot, utcnow
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import CreateProjectSource
kind = ${JSON.stringify(kind)}
golden = Path(${JSON.stringify(join(root, "fixtures", "coordination-project"))})
manifest = json.loads((golden / "manifest.json").read_text())
def original(name):
    content = (golden / name).read_bytes()
    assert hashlib.sha256(content).hexdigest() == manifest["sha256"][name]
    return content
svc = build_services(Settings(data_dir=Path(${JSON.stringify(folder)}), diagnostic_runtime=True, seed_demo=False))
try:
    admin = Principal(id="trusted-evidence-fixture", role="admin")
    project = svc.projects.create(CreateProject(name="Integrated " + kind + " evidence"), admin)
    source = svc.sources.create(project.id, CreateProjectSource(name="Golden " + kind, kind={"drawing":"DRAWING", "cad":"DRAWING", "bim":"BIM", "document":"DOCUMENT"}[kind]), admin)
    files = {"drawing":("R1/specification.pdf", "R2/structural-drawing.pdf"), "cad":("R1/structural-drawing.dxf", "R2/structural-drawing.dxf"), "bim":("R1/structure.ifc", "R2/structure.ifc")}
    metadata, chunk = None, None
    if kind == "document":
        filename = "coordination-note.txt"
        content = b"Synthetic coordination source / page 1\\fReview BEAM-01 and reroute DUCT-01 before installation."
        # Real import persists metadata and chunks; target selectors come from its output.
        metadata = svc.documents.import_file(project.id, filename, content)
        chunks = svc.documents.chunks(metadata["id"])
        assert metadata["content_hash"] == hashlib.sha256(content).hexdigest()
        assert all(c.source_hash == metadata["content_hash"] for c in chunks)
        chunk = next(c for c in chunks if c.page == 2)
        later_filename, later_content = filename, content + b" Current revision requires human review."
    else:
        first, later = files[kind]
        filename, content = Path(first).name, original(first)
        later_filename, later_content = Path(later).name, original(later)
    revision = svc.sources.upload(project.id, source.id, filename, content, admin).revision
    assert revision.sha256 == hashlib.sha256(content).hexdigest()
    if kind == "drawing":
        target = DrawingTarget(source_revision_id=revision.id, page=2, normalized_bbox=(0.05, 0.06, 0.47, 0.1))
        invalid_target = DrawingTarget(source_revision_id=revision.id, page=999)
    elif kind == "cad":
        # Committed R1 DXF ENTITIES: LINE handle 31, STRUCTURE, (0,0)-(4,0.3).
        target = CadTarget(source_revision_id=revision.id, entity_id="31", layer="STRUCTURE", view_bounds=(0, 0, 4, 0.3))
        invalid_target = CadTarget(source_revision_id=revision.id, entity_id="FFFF", layer="STRUCTURE")
    elif kind == "bim":
        target = BimTarget(source_revision_id=revision.id, global_ids=(manifest["global_ids"]["beam"],))
        invalid_target = BimTarget(source_revision_id=revision.id, global_ids=("0M0KwyPFrBT9KwklhqZa8W",))
    else:
        target = DocumentTarget(source_revision_id=revision.id, page=chunk.page, structural_path=(chunk.location.split("; ")[0],), location=chunk.location)
        invalid_target = DocumentTarget(source_revision_id=revision.id, page=2, location="absent source location")
    with svc.factory.open(project.id, write=True) as repo:
        state = repo.state(project.id)
        snapshot = ProjectSnapshot(project_id=project.id, version=state.version, sources=state.sources)
        repo.save_snapshot(snapshot)
    def evidence(fact, location):
        return Evidence(snapshot_id=snapshot.id, provider="trusted-browser-fixture", source_id=source.id, source_revision_id=revision.id, source_revision=revision.sha256, observed_at=utcnow(), fact=fact, quality="extracted" if kind == "document" else "structured", viewer_target=location)
    valid = evidence("Exact " + kind + " source location", target)
    invalid = evidence("Unavailable " + kind + " source location", invalid_target)
    change = Change(project_id=project.id, source_id=source.id, to_revision_id=revision.id, subject=target, kind="fixture-review", detector="trusted-browser-fixture")
    svc.engineering.publish(project.id, EngineeringPublication(operation_id="integrated-evidence-seed", changes=(change,), evidence=(valid, invalid)))
    finding = svc.findings.create(project.id, FindingDraft(title="Review " + kind + " evidence", what_changed="Trusted fixture review, not detector output", why_it_matters="Verify precise navigation before human coordination", evidence_ids=(valid.id, invalid.id), change_ids=(change.id,), dependencies=(FindingDependency(source_id=source.id, source_revision_id=revision.id, capability="unregistered-viewer-qualification", expected_condition="Human review of current source required", target=target),), impact=Impact(work_package_ids=(), area_ids=(), element_ids=(), disciplines=())), admin)
    # Newer real bytes exist: evidence MUST still open R1, never silently use latest.
    latest = svc.sources.upload(project.id, source.id, later_filename, later_content, admin).revision
    assert latest.id != revision.id
    assert not svc.rechecks.capabilities  # C providers are not wired into bootstrap.
    print(json.dumps({"project":project.id, "finding":finding.model_dump(mode="json"), "evidence":valid.model_dump(mode="json"), "invalid":invalid.model_dump(mode="json"), "latest":latest.id, "chunk":chunk.id if chunk else None, "document":metadata["id"] if metadata else None}))
finally:
    svc.close()
`,
          ],
          { cwd: folder, env, encoding: "utf8" },
        )
          .trim()
          .split("\n")
          .at(-1)!,
      ) as Seed;
      server = spawn(
        python,
        [
          "-m",
          "app.cli",
          "serve",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
        ],
        {
          cwd: folder,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      serverClosed = new Promise<void>((done) => {
        server!.once("close", () => done());
      });
      server.stdout!.on("data", (chunk) => {
        logs += chunk;
      });
      server.stderr!.on("data", (chunk) => {
        logs += chunk;
      });
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
          {
            timeout: 60000,
            message: "isolated integrated DBOS backend must start",
          },
        )
        .toBe(200);
      const engineering = `/api/projects/${seed.project}/engineering`;
      const findingPath = `${engineering}/findings/${seed.finding.id}`;
      async function get<T>(path: string): Promise<T> {
        const response = await request.get(`${base}${path}`, { headers });
        expect(response.ok(), logs).toBe(true);
        return (await response.json()) as T;
      }
      const readFinding = () => get<DTO<"Finding">>(findingPath);
      const readHistory = () =>
        get<DTO<"Coordination">[]>(`${findingPath}/coordination`);
      const readChecks = () => get<DTO<"ReCheck">[]>(`${findingPath}/rechecks`);
      expect(await readFinding()).toEqual(seed.finding);
      expect(await readHistory()).toEqual([]);
      expect(await readChecks()).toEqual([]);
      expect(await get(`${engineering}/evidence/${seed.evidence.id}`)).toEqual(
        seed.evidence,
      );
      if (kind === "document") {
        const metadata = await get<DTO<"DocumentMetadata">[]>(
          `/api/projects/${seed.project}/documents`,
        );
        expect(
          metadata.find((item) => item.id === seed.document)?.content_hash,
        ).toBe(seed.evidence.source_revision);
        const chunks = await get<DTO<"DocumentChunk">[]>(
          `/api/documents/${seed.document}/chunks`,
        );
        expect(chunks.find((item) => item.id === seed.chunk)).toMatchObject({
          source_hash: seed.evidence.source_revision,
          page: 2,
          location:
            seed.evidence.viewer_target!.kind === "document"
              ? seed.evidence.viewer_target!.location
              : null,
          parser: "lightweight/1",
        });
      }
      await page.addInitScript((project) => {
        sessionStorage.setItem("cca-token", "local-demo-admin");
        localStorage.setItem("concord:last-project", project);
      }, seed.project);
      // Passive same-origin receipts only. Never issue a navigation command, replace
      // postMessage, or expose a fake session: the product host must invoke C itself.
      await page.addInitScript(() => {
        if (window === window.top)
          (window as ObservedWindow).evidenceViewerTrace = [];
        window.addEventListener("message", (event) => {
          if (event.origin !== location.origin || !event.data) return;
          const message = event.data;
          if (
            ![
              "navigated",
              "ifcviewer:get-ids-by-guids",
              "ifcviewer:get-element",
              "ifcviewer:navigate-elements",
              "result",
            ].includes(message.type)
          )
            return;
          if (window === window.top) {
            const frames = Array.from(document.querySelectorAll("iframe"));
            if (!frames.some((frame) => frame.contentWindow === event.source))
              return;
          } else if (event.source !== window.parent) return;
          (window.top as ObservedWindow).evidenceViewerTrace.push({
            frame: location.pathname,
            type: message.type,
            requestId: message.requestId,
            target: message.target,
            guids: message.guids,
            ids: message.ids,
            modelId: message.modelId,
            ok: message.ok,
            data: message.data,
            error: message.error,
          });
        });
      });
      const trace = () =>
        page.evaluate(() => (window as ObservedWindow).evidenceViewerTrace);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(base);
      await toolRail(page)
        .getByRole("button", { name: "工作", exact: true })
        .click();
      await openWorkPanel(page);
      const panel = page.getByRole("complementary", { name: "工作与审核" });
      const row = panel
        .locator("div.workspace-list button.workspace-row")
        .filter({ hasText: seed.finding.title });
      await expect(row).toContainText("待人工判断");
      await row.click();
      await expect(row).toHaveAttribute("aria-pressed", "true");
      const host = page.locator("[data-evidence-id]");
      const validLink = panel
        .getByRole("button")
        .filter({ hasText: seed.evidence.fact });
      const invalidLink = panel
        .getByRole("button")
        .filter({ hasText: seed.invalid.fact });
      async function exactHost(evidence: DTO<"Evidence">) {
        await expect(host).toHaveAttribute("data-evidence-id", evidence.id);
        await expect(host).toHaveAttribute(
          "data-source-revision-id",
          evidence.source_revision_id!,
        );
        await expect(host).toHaveAttribute("data-viewer-target-kind", kind);
        await expect(
          host.getByRole("heading", { name: evidence.fact, exact: true }),
        ).toBeVisible();
        await host.getByText("来源与技术详情", { exact: true }).click();
        expect(
          JSON.parse(
            (await host.getByLabel("Exact viewer target").textContent())!,
          ),
        ).toEqual(evidence.viewer_target);
        await host.getByText("来源与技术详情", { exact: true }).click();
      }
      async function located(viewer: Viewer) {
        await expect(validLink).toHaveAttribute("aria-pressed", "true");
        if (viewer === "drawing") {
          const drawing = host.getByRole("region", {
            name: "Drawing viewer",
            exact: true,
          });
          await expect(
            drawing.getByRole("spinbutton", { name: "Sheet", exact: true }),
          ).toHaveValue("2");
          await expect(drawing.getByLabel("Drawing sheet 2")).toBeVisible();
          const region = drawing.getByLabel("Requested source region");
          await expect(region).toBeVisible();
          const box = await region.evaluate((svg) =>
            svg.getAttribute("viewBox")!.split(" ").map(Number),
          );
          const rect = region.locator("rect");
          for (const [attribute, value] of Object.entries({
            x: 0.05 * box[2],
            y: 0.06 * box[3],
            width: 0.42 * box[2],
            height: 0.04 * box[3],
          })) {
            expect(Number(await rect.getAttribute(attribute))).toBeCloseTo(
              value,
              4,
            );
          }
          await expect(drawing.getByRole("status")).toHaveCount(0);
          await expect(drawing.getByRole("alert")).toHaveCount(0);
        } else if (viewer === "cad") {
          await expect(
            host
              .getByRole("region", { name: "CAD viewer", exact: true })
              .getByRole("status"),
          ).toContainText("DXF opened: 2 entities");
          await expect(
            page
              .frameLocator('iframe[title="Concord DXF viewer"]')
              .locator("canvas")
              .first(),
          ).toBeVisible();
          await expect
            .poll(
              async () =>
                (await trace())
                  .filter((entry) => entry.type === "navigated")
                  .at(-1)?.target,
            )
            .toMatchObject({
              sourceRevisionId: seed.evidence.source_revision_id,
              sourceHash: seed.evidence.source_revision,
              entityId: "31",
              layer: "STRUCTURE",
              viewBounds: { minX: 0, minY: 0, maxX: 4, maxY: 0.3 },
            });
          await expect(host.locator(".evidence-primary-facts")).toContainText(
            "31",
          );
          await expect(host.locator(".evidence-primary-facts")).toContainText(
            "STRUCTURE",
          );
        } else if (viewer === "bim") {
          // Strict real success even when IFC preparation is currently blocked.
          await expect(
            host
              .getByRole("region", { name: "IFC viewer", exact: true })
              .getByRole("status"),
          ).toContainText(/IFC opened: [1-9]\d* elements in 1 model\(s\)\./);
          const donor = page.frameLocator('iframe[title="Concord IFC viewer"]');
          await expect(donor.locator("canvas").first()).toBeVisible();
          await expect
            .poll(
              async () => {
                const entries = await trace();
                const lookup = entries.find(
                  (entry) =>
                    entry.type === "ifcviewer:get-ids-by-guids" &&
                    JSON.stringify(entry.guids) ===
                      JSON.stringify(["3M0KwyPFrBT9KwklhqZa8W"]),
                );
                const resolved = entries.find(
                  (entry) =>
                    entry.type === "result" &&
                    entry.requestId === lookup?.requestId &&
                    entry.ok === true,
                );
                const navigation = entries.find(
                  (entry) =>
                    entry.type === "ifcviewer:navigate-elements" &&
                    entry.modelId === lookup?.modelId &&
                    JSON.stringify(entry.ids) ===
                      JSON.stringify(resolved?.data),
                );
                return (
                  !!navigation &&
                  entries.some(
                    (entry) =>
                      entry.type === "result" &&
                      entry.requestId === navigation.requestId &&
                      entry.ok === true,
                  )
                );
              },
              {
                message:
                  "product-requested IFC GlobalId must be selected/framed and acknowledged by the real donor",
              },
            )
            .toBe(true);
          await donor.getByPlaceholder("Search elements…").fill("BEAM-01");
          await expect(
            donor.getByText("BEAM-01", { exact: true }),
          ).toBeVisible();
          await expect(host.locator(".evidence-primary-facts")).toContainText(
            "3M0KwyPFrBT9KwklhqZa8W",
          );
        } else {
          const excerpt = host.getByRole("article", {
            name: `Excerpt ${seed.chunk}`,
            exact: true,
          });
          await expect(excerpt).toHaveAttribute("data-selected", "true");
          await expect(excerpt).toBeVisible();
          await expect(excerpt).toBeFocused();
          await expect(excerpt).toContainText(
            "Review BEAM-01 and reroute DUCT-01 before installation.",
          );
          await expect(excerpt).toContainText("Page 2");
          await expect(excerpt).toContainText(
            seed.evidence.viewer_target!.kind === "document"
              ? seed.evidence.viewer_target!.location!
              : "",
          );
        }
        await expect(host).toHaveAttribute(
          "data-navigation-state",
          "viewer_active",
        );
        await expect(host.getByRole("alert")).toHaveCount(0);
        await exactHost(seed.evidence);
      }
      await located(kind);
      await invalidLink.click();
      await expect(invalidLink).toHaveAttribute("aria-pressed", "true");
      await exactHost(seed.invalid);
      await expect(host).toHaveAttribute(
        "data-navigation-state",
        "navigation_failed",
      );
      const failure = {
        // C rejects page 999 during target validation, before looking up a PDF page.
        drawing: "Invalid drawing target page",
        cad: "CAD entity is absent",
        bim: "IFC GlobalId is absent",
        document: "Document target location is absent",
      }[kind];
      await expect(
        host
          .getByRole("region", {
            name: {
              drawing: "Drawing viewer",
              cad: "CAD viewer",
              bim: "IFC viewer",
              document: "Document viewer",
            }[kind],
            exact: true,
          })
          .getByRole("alert"),
      ).toContainText(failure);
      expect(await readFinding()).toEqual(seed.finding);
      expect(await readHistory()).toEqual([]);
      expect(await readChecks()).toEqual([]);
      await page.evaluate(() => {
        (window as ObservedWindow).evidenceViewerTrace = [];
      });
      await validLink.click();
      await located(kind);
      // Exercise real re-opening, not a cleared error banner with no viewer work.
      await page.evaluate(() => {
        (window as ObservedWindow).evidenceViewerTrace = [];
      });
      const reopenedSource = page.waitForResponse(
        (response) =>
          response.url() ===
            `${base}/api/projects/${seed.project}/sources/${seed.evidence.source_id}/revisions/${seed.evidence.source_revision_id}/content` &&
          response.request().method() === "GET",
      );
      await host
        .getByRole("button", { name: "重新打开工程查看器", exact: true })
        .click();
      expect((await reopenedSource).ok()).toBe(true);
      await located(kind);
      expect(await readFinding()).toEqual(seed.finding);
      await page.screenshot({
        path: testInfo.outputPath(`${kind}-exact-location.png`),
        animations: "disabled",
      });

      async function decide(action: string, note: string, edit = false) {
        await panel.getByRole("button", { name: action, exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("判断说明", { exact: true }).fill(note);
        if (edit) {
          await dialog
            .getByLabel("Finding 标题", { exact: true })
            .fill(`Human edited ${kind} review`);
          await dialog
            .getByLabel("建议行动", { exact: true })
            .fill(
              "Check original engineering source with the responsible discipline",
            );
        }
        const response = page.waitForResponse(
          (response) =>
            response.url() === `${base}${findingPath}/decisions` &&
            response.request().method() === "POST",
        );
        await dialog
          .getByRole("button", { name: "提交人工判断", exact: true })
          .click();
        expect((await response).ok()).toBe(true);
        await expect(dialog).toHaveCount(0);
      }
      await decide(
        "确认",
        "Human reviewed the exact persisted source location",
      );
      await expect(row).toContainText("已确认");
      expect((await readFinding()).state).toBe("CONFIRMED");
      await expect
        .poll(async () =>
          (await readChecks()).some(
            (check) =>
              check.outcome === "NEEDS_REVIEW" && check.completed_at !== null,
          ),
        )
        .toBe(true);
      await decide(
        "编辑",
        "Human clarified the finding without changing its engineering evidence",
        true,
      );
      const edited = await readFinding();
      expect(edited).toMatchObject({
        state: "CONFIRMED",
        title: `Human edited ${kind} review`,
        suggested_action:
          "Check original engineering source with the responsible discipline",
        evidence_ids: seed.finding.evidence_ids,
        dependencies: seed.finding.dependencies,
      });
      const humanHistory = await readHistory();
      expect(humanHistory).toHaveLength(2);
      expect(humanHistory.map((item) => item.decision).sort()).toEqual([
        "CONFIRMED",
        "EDITED",
      ]);
      for (const item of humanHistory) {
        expect(item).toMatchObject({
          project_id: seed.project,
          finding_id: seed.finding.id,
          recheck_id: null,
        });
        expect(item.actor).toBeTruthy();
        expect(item.note).toBe(
          item.decision === "CONFIRMED"
            ? "Human reviewed the exact persisted source location"
            : "Human clarified the finding without changing its engineering evidence",
        );
      }
      await panel
        .getByRole("button", { name: "协调 / 复核", exact: true })
        .click();
      const followup = page.getByRole("dialog");
      await expect(
        followup.getByRole("region", { name: "人工决策历史" }),
      ).toContainText("Human clarified the finding");
      await followup
        .getByRole("button", { name: "请求当前版本复核", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await readChecks()).filter(
              (check) =>
                check.finding_updated_at === edited.updated_at &&
                check.completed_at !== null,
            ).length,
        )
        .toBe(1);
      await expect
        .poll(async () =>
          (await readChecks()).every((check) => check.completed_at !== null),
        )
        .toBe(true);
      const checks = await readChecks();
      expect(checks).toHaveLength(2); // Confirm catch-up, then explicit post-edit request.
      const laterCheck = checks.find(
        (check) => check.finding_updated_at === edited.updated_at,
      )!;
      expect(laterCheck).toMatchObject({
        project_id: seed.project,
        finding_id: seed.finding.id,
        source_id: seed.evidence.source_id,
        source_revision_id: seed.latest,
        dependencies: edited.dependencies,
        outcome: "NEEDS_REVIEW",
        evidence_ids: [],
      });
      expect(laterCheck.request_id).toMatch(/^manual:/);
      expect(laterCheck.explanation).toContain(
        "unregistered-viewer-qualification",
      );
      await expect
        .poll(
          async () =>
            (await get<DTO<"AgentRun">>(`/api/runs/${laterCheck.id}`)).status,
        )
        .toBe("COMPLETED");
      expect(await readFinding()).toEqual(edited);
      expect(await readHistory()).toEqual(humanHistory);
      await expect(
        followup.getByRole("list", { name: "ReCheck 历史" }),
      ).toContainText("需要人工复核 · 非执行失败");
      await expect(
        followup.getByRole("list", { name: "ReCheck 历史" }),
      ).toContainText("当前版本绑定");
      await followup
        .getByRole("button", { name: "返回证据", exact: true })
        .click();
      await decide(
        "忽略",
        "Human dismisses after reviewing source and incomplete automated capability",
      );
      const dismissed = await readFinding();
      expect(dismissed).toMatchObject({
        state: "DISMISSED",
        title: edited.title,
        evidence_ids: edited.evidence_ids,
        dependencies: edited.dependencies,
      });
      const history = await readHistory();
      expect(history).toHaveLength(3);
      expect(history).toEqual(expect.arrayContaining(humanHistory));
      expect(
        history.find((item) => item.decision === "DISMISSED"),
      ).toMatchObject({
        finding_id: seed.finding.id,
        recheck_id: null,
        note: "Human dismisses after reviewing source and incomplete automated capability",
      });
      expect(await get(`${engineering}/evidence/${seed.evidence.id}`)).toEqual(
        seed.evidence,
      );
      expect(await readChecks()).toEqual(checks);
      await page.reload();
      await toolRail(page)
        .getByRole("button", { name: "工作", exact: true })
        .click();
      await openWorkPanel(page);
      const persistedRow = panel
        .locator("div.workspace-list button.workspace-row")
        .filter({ hasText: edited.title });
      await expect(persistedRow).toContainText("已忽略");
      await persistedRow.click();
      await expect(persistedRow).toHaveAttribute("aria-pressed", "true");
      await located(kind);
      expect(await readFinding()).toEqual(dismissed);
      expect(await readHistory()).toEqual(history);
      expect(await readChecks()).toEqual(checks);
    } finally {
      await testInfo.attach("isolated-backend.log", {
        body: logs,
        contentType: "text/plain",
      });
      if (server && serverClosed) {
        const forceKill = setTimeout(() => server!.kill("SIGKILL"), 15000);
        forceKill.unref();
        server.kill("SIGTERM");
        try {
          await serverClosed;
        } finally {
          clearTimeout(forceKill);
        }
      }
      rmSync(folder, { recursive: true, force: true });
    }
  });
}
