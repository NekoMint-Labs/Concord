import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import type { DTO } from "../src/api/client";

const headers = { Authorization: "Bearer local-demo-admin" };
const output = resolve(
  "..",
  ".verification-work/issue-16-substrate-replacement",
);
const viewports = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

/** Require the registered, upgraded Lit owner and inspect its live shadow tree. */
async function expectLitOwner(locator: Locator, name: string) {
  await expect(locator, `${name} must be present and visible`).toBeVisible();
  await expect
    .poll(
      () =>
        locator.evaluate(async (element) => {
          const donor = element as HTMLElement & {
            updateComplete?: Promise<unknown>;
          };
          await donor.updateComplete;
          const constructor = customElements.get(element.localName);
          return Boolean(
            constructor &&
            element instanceof constructor &&
            donor.updateComplete &&
            element.shadowRoot?.childElementCount,
          );
        }),
      {
        message: `${name} must be the live donor component, not a lookalike tag`,
      },
    )
    .toBe(true);
}

async function clickDonorLabel(scope: Locator, label: string) {
  const buttons = scope.locator("bim-button");
  const index = await buttons.evaluateAll(
    (elements, expected) =>
      elements.findIndex(
        (element) =>
          (element as HTMLElement & { label?: string }).label === expected ||
          element.getAttribute("label") === expected ||
          element.getAttribute("aria-label") === expected ||
          element.textContent?.trim() === expected,
      ),
    label,
  );
  expect(index, `Missing donor button labeled ${label}`).toBeGreaterThanOrEqual(
    0,
  );
  await buttons.nth(index).click();
}

async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true });
  const { width, height } = page.viewportSize()!;
  await page.screenshot({
    path: resolve(output, `${name}-${width}x${height}.png`),
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${name} must not introduce horizontal overflow`,
  ).toBe(true);
}

const python = resolve(
  process.cwd(),
  process.env.CCA_E2E_PYTHON ?? "../.venv/bin/python",
);

async function createProject(request: APIRequestContext) {
  const response = await request.post("/api/projects", {
    headers,
    data: {
      name: `Issue 16 substrate ${randomUUID().slice(0, 8)}`,
    } satisfies DTO<"CreateProject">,
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as DTO<"Project">;
}

/** Publish the existing test-provider records into the isolated e2e database.
 * These records qualify the workflow surface only; they are not engineering geometry.
 */
function publishSyntheticEvidence(
  project: string,
  revisions: DTO<"ProjectSourceRevision">[],
) {
  const output = execFileSync(
    python,
    [
      "-c",
      `
import json, sys
from pathlib import Path
from app.adapters.persistence.database import SQLRepositoryFactory, make_engine
from app.application.engineering_publication import EngineeringPublisher
from app.domain.engineering import EngineeringPublication
from app.domain.models import Evidence, ProjectSnapshot, utcnow
from app.domain.errors import NotFound
project, revisions = json.loads(sys.argv[1])
root = Path(sys.argv[2]).resolve()
for folder in root.glob("playwright-*"):
    database = folder / "app.db"
    if not database.is_file():
        continue
    engine = make_engine("sqlite:///" + str(database))
    factory = SQLRepositoryFactory(engine)
    try:
        with factory.open() as repo:
            repo.state(project)
    except NotFound:
        engine.dispose()
        continue
    break
else:
    raise RuntimeError("Issue 16 project was not found in isolated Playwright storage")
with factory.open(project, write=True) as repo:
    state = repo.state(project)
    snapshot = ProjectSnapshot(project_id=project, version=state.version, sources=state.sources)
    repo.save_snapshot(snapshot)
specs = [
    (0, "图纸区域变更", "structured", {"kind":"drawing", "source_revision_id":revisions[0]["id"], "page":5, "normalized_bbox":[0.32,0.28,0.62,0.52]}),
    (1, "模型净高复核", "structured", {"kind":"bim", "source_revision_id":revisions[1]["id"], "global_ids":["E2E-GlobalId-A"], "viewpoint":[1,2,3,4,5,6]}),
    (2, "文档提取条款", "extracted", {"kind":"document", "source_revision_id":revisions[2]["id"], "page":2, "location":"原始文档位置"}),
]
evidence = tuple(Evidence(snapshot_id=snapshot.id, provider="issue-16-synthetic-provider", source_id=revisions[i]["source_id"], source_revision_id=revisions[i]["id"], source_revision=revisions[i]["sha256"], observed_at=utcnow(), fact=fact, quality=quality, viewer_target=target, page=9, location="测试 provider 记录", element_ids=("E2E-element-A",)) for i, fact, quality, target in specs)
EngineeringPublisher(factory).publish(project, EngineeringPublication(operation_id="issue-16:"+project, evidence=evidence))
print(json.dumps([item.model_dump(mode="json") for item in evidence]))
engine.dispose()
`,
      JSON.stringify([project, revisions]),
      resolve("..", ".verification-work"),
    ],
    {
      cwd: resolve(".."),
      env: { ...process.env, PYTHONPATH: resolve("..", "backend") },
      encoding: "utf8",
    },
  );
  return JSON.parse(output) as DTO<"Evidence">[];
}

async function proposeSyntheticFinding(request: APIRequestContext) {
  const project = await createProject(request);
  const revisions: DTO<"ProjectSourceRevision">[] = [];
  for (const [kind, name] of [
    ["DRAWING", "图纸"],
    ["BIM", "模型"],
    ["DOCUMENT", "变更文档"],
  ] as const) {
    const sourceResponse = await request.post(
      `/api/projects/${project.id}/sources`,
      {
        headers,
        data: { kind, name } satisfies DTO<"CreateProjectSource">,
      },
    );
    expect(sourceResponse.status()).toBe(201);
    const source = (await sourceResponse.json()) as DTO<"ProjectSource">;
    const upload = await request.post(
      `/api/projects/${project.id}/sources/${source.id}/revisions`,
      {
        headers,
        multipart: {
          file: {
            name: `issue-16-${kind.toLowerCase()}.txt`,
            mimeType: "text/plain",
            buffer: Buffer.from(
              `Issue 16 synthetic ${kind}; not engineering geometry`,
            ),
          },
        },
      },
    );
    expect(upload.ok()).toBe(true);
    revisions.push(
      ((await upload.json()) as DTO<"RevisionUploadResult">).revision,
    );
  }
  const evidence = publishSyntheticEvidence(project.id, revisions);
  const draft = {
    title: "Issue 16 substrate replacement requires human review",
    what_changed:
      "Synthetic provider records exercise the selected Finding and Evidence surfaces.",
    why_it_matters:
      "The workflow must preserve the boundary between extracted records and verified engineering facts.",
    evidence_ids: evidence.map((item) => item.id),
    dependencies: [
      {
        source_id: evidence[0].source_id,
        source_revision_id: evidence[0].source_revision_id!,
        capability: "issue-16-synthetic-check",
        expected_condition: "工程师需复核测试记录",
        target: evidence[0].viewer_target!,
      },
    ],
    impact: {
      work_package_ids: [],
      area_ids: [],
      element_ids: ["E2E-element-A"],
      disciplines: ["MEP"],
    },
    suggested_discipline: "机电",
    suggested_action: "复核测试记录，不将其视为已验证几何。",
    confidence: 0.5,
    limitations: ["合成 provider 数据；不代表真实测量或施工依据"],
  } satisfies DTO<"FindingDraft">;
  const findingResponse = await request.post(
    `/api/projects/${project.id}/engineering/findings`,
    { headers, data: draft },
  );
  expect(findingResponse.status()).toBe(201);
  return {
    project,
    finding: (await findingResponse.json()) as DTO<"Finding">,
    evidence,
  };
}

async function openProject(page: Page, projectId: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((id) => {
    sessionStorage.setItem("cca-token", "local-demo-admin");
    localStorage.setItem("concord:last-project", id);
  }, projectId);
  await page.goto("/");
}

for (const viewport of viewports) {
  test(`Issue 16 substrate visual matrix ${viewport.width}×${viewport.height}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const seeded = await proposeSyntheticFinding(request);
    await openProject(page, seeded.project.id);
    await expect(
      page.getByRole("navigation", { name: "主要工作区" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "工作", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "工作", exact: true }),
    ).toBeVisible();
    const findingButton = page.getByRole("button", {
      name: seeded.finding.title,
      exact: true,
    });
    await expect(findingButton).toBeVisible();
    await findingButton.click();
    await expect(
      page.getByRole("complementary", { name: "Finding 工作与审核" }),
    ).toBeVisible();
    const selectedEvidence = page.locator(
      `[data-evidence-id="${seeded.evidence[0].id}"]`,
    );
    await expect(selectedEvidence).toBeVisible();
    await expect(selectedEvidence).toHaveAttribute(
      "data-evidence-id",
      seeded.evidence[0].id,
    );
    await expect(selectedEvidence).toHaveAttribute(
      "data-source-revision-id",
      seeded.evidence[0].source_revision_id!,
    );
    await expectLitOwner(
      page.locator("bim-toolbar.finding-workbench-toolbar"),
      "Work toolbar",
    );
    await expectLitOwner(
      page.locator("bim-tabs.workspace-tabs"),
      "Work filter tabs",
    );
    await expectLitOwner(
      page.locator("bim-text-input").first(),
      "Work search input",
    );
    await expectLitOwner(page.locator("bim-button").first(), "Work action");
    await capture(page, "work-selected-finding-evidence");

    // The decision dialog is captured from the same selected server-owned Finding.
    const review = page.getByRole("complementary", {
      name: "Finding 工作与审核",
    });
    await clickDonorLabel(review, "确认");
    const decision = page
      .locator(".dialog-surface")
      .filter({ hasText: "确认 Finding" });
    await expect(decision).toBeVisible();
    await expectLitOwner(
      decision.locator("bim-toolbar.dialog-header"),
      "Human decision dialog toolbar",
    );
    await capture(page, "human-decision-dialog");
    await clickDonorLabel(decision, "取消");

    // Project panels and Browse's authoritative donor table are captured as separate
    // surfaces; no rows or engineering facts are manufactured by this suite.
    await page.getByRole("button", { name: "项目", exact: true }).click();
    await expectLitOwner(
      page.locator("bim-panel.project-context-surface"),
      "Project context panel",
    );
    await capture(page, "project");

    await page.getByRole("button", { name: "浏览", exact: true }).click();
    await expect(
      page.getByRole("searchbox", { name: "搜索项目对象" }),
    ).toBeVisible();
    await expectLitOwner(
      page.locator('bim-table[aria-label="资料对象"]').first(),
      "Browse source table",
    );
    await capture(page, "browse-search");

    // The real checked-in Harbor East IFC is used locally; it is not uploaded or
    // presented as a project revision by this visual-only test.
    await page.getByRole("button", { name: "模型", exact: true }).click();
    const ifc = resolve("..", "fixtures", "harbor-east.ifc");
    await page.getByLabel("本地 IFC 文件", { exact: true }).setInputFiles(ifc);
    await expect(
      page.getByLabel("IFC 模型查看器", { exact: true }).locator("canvas"),
    ).toBeVisible();
    await expectLitOwner(page.locator("bim-viewport"), "Model viewport");
    const viewer = page.getByLabel("IFC 模型查看器", { exact: true });
    // The fixture is the real checked-in input even when a headless browser cannot
    // initialize native WebGL; the actual geometry/rendering claim is owned by the
    // separate IFC lane below. Keep this substrate capture truthful about the
    // resulting local-preview surface rather than treating an SDK error as geometry.
    await expect(viewer).toBeVisible();
    await capture(page, "model-real-ifc-local-preview");

    // Command menu and layout dialog use real application state and controls.
    await clickDonorLabel(
      page.locator("bim-toolbar.calm-header-actions"),
      "查找对象或操作",
    );
    const commands = page.getByRole("dialog", {
      name: "查找对象或操作",
      exact: true,
    });
    await expect(commands).toBeVisible();
    await expectLitOwner(
      commands.locator("bim-toolbar.dialog-header"),
      "Command dialog toolbar",
    );
    await expect(
      commands.getByRole("combobox", { name: "搜索对象或操作" }),
    ).toBeVisible();
    await capture(page, "commands-menu");
    await page.keyboard.press("Escape");

    await clickDonorLabel(
      page.locator("bim-toolbar.calm-header-actions"),
      "布局",
    );
    const layout = page.getByRole("dialog", {
      name: "你的工作区",
      exact: true,
    });
    await expect(layout).toBeVisible();
    await expectLitOwner(
      layout.locator("bim-toolbar.dialog-header"),
      "Layout dialog toolbar",
    );
    await capture(page, "layout-dialog");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "项目", exact: true }).click();
    const sourceMenu = page.locator(".sources-object-lane");
    await clickDonorLabel(sourceMenu, "资料操作");
    // Radix retains dismissal/typeahead/focus; a real donor panel owns the menu surface.
    await expectLitOwner(
      page.getByRole("menu").locator("bim-panel"),
      "Application menu donor panel",
    );
    await page.locator('bim-button[aria-label="添加资料"]').click();
    const source = page.getByRole("dialog", { name: "添加资料", exact: true });
    await expect(source).toBeVisible();
    await expectLitOwner(
      source.locator("bim-toolbar.dialog-header"),
      "Source dialog toolbar",
    );
    await capture(page, "source-dialog");
    await page.keyboard.press("Escape");

    // The final gates distinguish registered live donors from lookalike tags.
    await expectLitOwner(page.locator("bim-button").first(), "bim-button");
    // Inputs and tabs were qualified on Work; routed Project does not mount them.
    // bim-context-menu is not substituted for Radix application-menu semantics.
  });
}
