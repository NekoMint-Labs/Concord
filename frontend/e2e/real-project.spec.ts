import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  test as base,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import type {
  AgentRun,
  Baseline,
  DTO,
  InvestigationReport,
  Project,
  ProjectSourceRevision,
  ProjectSourceStatus,
  Workspace,
} from "../src/api/client";

/** Run ONLY with playwright.real-project.config.ts after building the real UI.
 * No mocks, reset, seed, fixed GUIDs, paid model calls or diagnostic runtime.
 * IFC imports/comparisons are real; action execution is explicitly simulated.
 */
const root = fileURLToPath(new URL("../../", import.meta.url));
const localPython = join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const python =
  process.env.CCA_E2E_PYTHON ??
  (existsSync(localPython) ? localPython : "python");
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
type Element = { global_id: string; name: string; ifc_class: string };
type Fixture = {
  project_name: string;
  work_package_name: string;
  source_name: string;
  r1: string;
  r2: string;
  invalid: string;
  elements: Record<string, Element>;
  added: Element;
  changed_name_r2: string;
  mapped_roles: string[];
};
type Backend = {
  url: string;
  token: string;
  api: APIRequestContext;
  fixture: Fixture;
  restart: () => Promise<void>;
};

const test = base.extend<{ backend: Backend }>({
  backend: async ({ playwright }, use, info) => {
    if (!existsSync(join(root, "frontend/dist/index.html")))
      throw new Error("Build the actual UI first: pnpm --dir frontend build");
    const folder = info.outputPath("persistent-backend");
    const fixtureDir = info.outputPath("ifc-originals");
    await mkdir(folder, { recursive: true });
    // Generation fails loudly if the real SDK is absent, never skips to structured BIM.
    execFileSync(
      python,
      [
        join(root, "scripts/generate_real_project_fixture.py"),
        "--output",
        fixtureDir,
      ],
      {
        cwd: folder,
        timeout: 60_000,
      },
    );
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, "manifest.json"), "utf8"),
    ) as Fixture;
    const token = randomUUID();
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("CCA_")),
    );
    Object.assign(environment, {
      PYTHONPATH: join(root, "backend"),
      PYTHONUNBUFFERED: "1",
      CCA_DATA_DIR: folder,
      CCA_API_TOKEN: token,
      CCA_PROFILE: "local",
      CCA_RUNTIME: "dbos",
      CCA_DIAGNOSTIC_RUNTIME: "false",
      CCA_SEED_DEMO: "false",
      CCA_BIM: "ifcopenshell",
      CCA_REASONING: "offline",
      CCA_DOCUMENT_PARSER: "lightweight",
    });
    const logPath = info.outputPath("backend.log");
    const log = createWriteStream(logPath, { flags: "a" });
    let processHandle: ChildProcess | undefined;
    let endpoint = "";
    let tail = "";
    let api: APIRequestContext | undefined;

    async function stop(crash = false) {
      const child = processHandle;
      if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
        return;
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      const kill = setTimeout(() => child.kill("SIGKILL"), 15_000);
      kill.unref();
      try {
        child.kill(crash ? "SIGKILL" : "SIGTERM");
        await exited;
      } finally {
        clearTimeout(kill);
      }
    }

    async function start() {
      const port = endpoint ? new URL(endpoint).port : "0";
      const child = spawn(
        python,
        ["-m", "app.cli", "serve", "--host", "127.0.0.1", "--port", port],
        {
          cwd: folder,
          env: environment,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      processHandle = child;
      const announced = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Backend startup timed out:\n${tail}`)),
          60_000,
        );
        let output = "";
        child.stdout!.on("data", (chunk: Buffer) => {
          log.write(chunk);
          tail = (tail + chunk.toString()).slice(-32_000);
          output = (output + chunk.toString()).slice(-4096);
          const match = output.match(
            /CCA_ENDPOINT=(http:\/\/127\.0\.0\.1:\d+)/,
          );
          if (match) {
            clearTimeout(timeout);
            resolve(match[1]);
          }
        });
        child.stderr!.on("data", (chunk: Buffer) => {
          log.write(chunk);
          tail = (tail + chunk.toString()).slice(-32_000);
        });
        child.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once("exit", (code, signal) => {
          clearTimeout(timeout);
          reject(new Error(`Backend exited (${code}/${signal}):\n${tail}`));
        });
      });
      const url = await announced;
      if (endpoint) expect(url).toBe(endpoint);
      endpoint = url;
      api ??= await playwright.request.newContext({
        baseURL: endpoint,
        extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      });
      await expect
        .poll(
          async () => {
            if (child.exitCode !== null || child.signalCode !== null)
              throw new Error(`Backend exited:\n${tail}`);
            try {
              return (await api!.get("/health", { timeout: 2_000 })).status();
            } catch {
              return 0;
            }
          },
          {
            timeout: 60_000,
            message: "Own real DBOS sidecar must become healthy",
          },
        )
        .toBe(200);
      expect(await get(api, "/health")).toMatchObject({
        runtime: "dbos",
        profile: "local",
      });
    }

    try {
      await start();
      await use({
        url: endpoint,
        token,
        api: api!,
        fixture,
        restart: async () => {
          const previousPid = processHandle!.pid;
          await stop(true); // An actual process death, not page.reload or an API reset.
          await start();
          expect(processHandle!.pid).not.toBe(previousPid);
          expect(existsSync(join(folder, "app.db"))).toBe(true);
          expect(existsSync(join(folder, "runtime.db"))).toBe(true);
        },
      });
    } finally {
      await stop();
      await api?.dispose();
      await new Promise<void>((resolve) => log.end(resolve));
      await info.attach("real-backend-log", {
        path: logPath,
        contentType: "text/plain",
      });
      await info.attach("dynamic-ifc-manifest", {
        path: join(fixtureDir, "manifest.json"),
        contentType: "application/json",
      });
    }
  },
});

async function get<T = unknown>(
  api: APIRequestContext,
  path: string,
): Promise<T> {
  const response = await api.get(path);
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
  return response.json() as Promise<T>;
}

async function waitRun(
  api: APIRequestContext,
  id: string,
  status: AgentRun["status"],
) {
  await expect
    .poll(async () => (await get<AgentRun>(api, `/api/runs/${id}`)).status, {
      timeout: 60_000,
    })
    .toBe(status);
  const run = await get<AgentRun>(api, `/api/runs/${id}`);
  expect(run.runtime).toBe("dbos");
  return run;
}

async function startPage(page: Page, backend: Backend) {
  await page.addInitScript(
    (token) => sessionStorage.setItem("cca-token", token),
    backend.token,
  );
  await page.goto(backend.url);
}

async function nav(page: Page, name: "项目" | "模型" | "工作") {
  await page
    .getByRole("navigation", { name: "主要工作区" })
    .getByRole("button", { name, exact: true })
    .click();
}

async function createProject(
  page: Page,
  backend: Backend,
  name = backend.fixture.project_name,
) {
  const picker = page.getByRole("button", { name: "切换项目", exact: true });
  const create = page.getByRole("button", { name: "新建项目", exact: true });
  await expect(create.or(picker).first()).toBeVisible();
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("menuitem", { name: "新建项目" }).click();
  } else await create.click();
  const dialog = page.getByRole("dialog", { name: "新建项目" });
  await dialog.getByLabel("项目名称").fill(name);
  await dialog
    .getByLabel("说明")
    .fill("Real IFC qualification, simulated execution only");
  const created = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/projects",
  );
  await dialog.getByRole("button", { name: "创建项目" }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const project = (await response.json()) as Project;
  expect(project.id).not.toBe("harbor-east");
  await expect(
    page.getByRole("navigation", { name: "当前位置" }),
  ).toContainText(name);
  return project;
}

async function createPackage(
  page: Page,
  name: string,
  areaName: string,
  floor: string,
) {
  await nav(page, "项目");
  await page.getByRole("button", { name: "+ 添加工作包", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建工作包" });
  await dialog
    .getByRole("region", { name: "新建区域" })
    .getByLabel("区域名称")
    .fill(areaName);
  await dialog.getByLabel("楼层").fill(floor);
  await dialog.getByRole("button", { name: "保存并使用此区域" }).click();
  await selectOption(
    page,
    dialog.getByRole("combobox", { name: "所属区域" }),
    areaName,
  );
  await dialog.getByLabel("工作包名称").fill(name);
  await dialog.getByLabel("专业").fill("Architecture");
  await dialog.getByLabel("负责人").fill("Review team");
  const created = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname.endsWith("/work-packages"),
  );
  await dialog.getByRole("button", { name: "创建工作包" }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const wp = (await response.json()) as DTO<"WorkPackage">;
  expect(wp.element_ids).toEqual([]);
  await expect(
    page.getByRole("heading", { name, exact: true, level: 1 }),
  ).toBeVisible();
  return wp;
}

async function selectOption(page: Page, control: Locator, label: string) {
  await control.click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function openPackage(page: Page, name: string) {
  await nav(page, "项目");
  await page
    .getByRole("region", { name: "工作包状态" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
  await expect(
    page.getByRole("heading", { name, exact: true, level: 1 }),
  ).toBeVisible();
}

async function sourceRegister(page: Page, name?: string) {
  await nav(page, "项目");
  const register = page.getByRole("region", { name: "项目资料", exact: true });
  await expect(register).toBeVisible();
  if (name)
    await register.getByRole("button", { name: new RegExp(name) }).click();
  return register;
}

async function upload(
  page: Page,
  backend: Backend,
  project: Project,
  file: string,
  sourceName: string,
  existing = false,
) {
  const register = await sourceRegister(page);
  await register
    .getByRole("button", { name: "+ 添加资料", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
  await dialog.getByLabel("选择文件（可多选）").setInputFiles(file);
  await expect(
    dialog.getByRole("group", { name: basename(file), exact: true }),
  ).toBeVisible();
  if (existing) {
    await selectOption(
      page,
      dialog.getByRole("combobox", { name: `资料归属 · ${basename(file)}` }),
      `${sourceName} · 添加版本`,
    );
    await expect(
      dialog.getByLabel(`新资料名称 · ${basename(file)}`),
    ).toHaveCount(0);
  } else {
    await expect(
      dialog.getByRole("combobox", { name: `资料归属 · ${basename(file)}` }),
    ).toContainText("新建逻辑资料");
    await dialog.getByLabel(`新资料名称 · ${basename(file)}`).fill(sourceName);
  }
  const uploaded = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname.endsWith("/revisions"),
  );
  await dialog.getByRole("button", { name: "上传并处理", exact: true }).click();
  const response = await uploaded;
  expect(response.status()).toBe(201);
  const result = (await response.json()) as DTO<"RevisionUploadResult">;
  expect(result.duplicate).toBe(false);
  await expect(dialog.getByRole("status")).toContainText(
    `R${result.revision.sequence}`,
  );
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  const statuses = await get<ProjectSourceStatus[]>(
    backend.api,
    `/api/projects/${project.id}/sources`,
  );
  const source = statuses.find(
    (s) => s.source.id === result.revision.source_id,
  )!;
  expect(source.source.name).toBe(sourceName);
  expect(source.has_pending_revision).toBe(true);
  return { source: source.source, revision: result.revision };
}

async function imported(
  backend: Backend,
  sourcePath: string,
  revision: ProjectSourceRevision,
) {
  let run: AgentRun | null = null;
  await expect
    .poll(
      async () => {
        run = await get<AgentRun | null>(
          backend.api,
          `${sourcePath}/revisions/${revision.id}/import`,
        );
        return run?.id;
      },
      { message: "UI upload must automatically enqueue a real import" },
    )
    .toBeTruthy();
  await waitRun(backend.api, run!.id, "COMPLETED");
  return get<DTO<"BimRevisionSnapshot">>(
    backend.api,
    `${sourcePath}/revisions/${revision.id}/bim-snapshot`,
  );
}

async function verifyOriginal(
  backend: Backend,
  sourcePath: string,
  revision: ProjectSourceRevision,
  file: string,
) {
  const response = await backend.api.get(
    `${sourcePath}/revisions/${revision.id}/content`,
  );
  expect(response.status()).toBe(200);
  const bytes = readFileSync(file);
  expect(await response.body()).toEqual(bytes);
  expect(revision.sha256).toBe(sha256(bytes));
}

async function acceptBaseline(
  page: Page,
  backend: Backend,
  projectPath: string,
  sourceName: string,
  sequence: number,
  revisionSequence: number,
) {
  const register = await sourceRegister(page, sourceName);
  await register.getByRole("button", { name: "确认新基线" }).click();
  const dialog = page.getByRole("dialog", { name: `确认基线 B${sequence}` });
  await expect(dialog).toContainText(sourceName);
  await expect(dialog).toContainText(`R${revisionSequence}`);
  // Opening and cancelling confirmation must not accept anything.
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(
    await get<Baseline[]>(backend.api, `${projectPath}/baselines`),
  ).toHaveLength(sequence - 1);
  await register.getByRole("button", { name: "确认新基线" }).click();
  const accepted = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === `${projectPath}/baselines`,
  );
  await dialog
    .getByRole("button", { name: `确认 B${sequence}`, exact: true })
    .click();
  const response = await accepted;
  expect(response.status()).toBe(201);
  await expect(dialog).not.toBeVisible();
  return response.json() as Promise<Baseline>;
}

async function inspectImpact(
  page: Page,
  sourceName: string,
  workPackageName: string,
) {
  await sourceRegister(page, sourceName);
  const impact = page.getByRole("region", { name: "版本影响", exact: true });
  await impact
    .getByRole("button", { name: new RegExp(workPackageName) })
    .click();
  const dock = page.getByRole("region", { name: "影响构件", exact: true });
  await expect(dock).toBeVisible();
  await expect(page.getByRole("button", { name: /^确认关联/ })).toHaveCount(0);
  return dock;
}

async function investigate(
  page: Page,
  backend: Backend,
  projectPath: string,
  dock: Locator,
  status: AgentRun["status"],
) {
  const queued = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === `${projectPath}/agent/investigate`,
  );
  await dock.getByRole("button", { name: "调查当前选择" }).click();
  const response = await queued;
  expect(response.status()).toBe(202);
  const run = (await response.json()) as AgentRun;
  expect(run.category).toBe("investigation");
  await expect(
    page.getByRole("complementary", { name: "工程调查详情" }),
  ).toBeVisible();
  await waitRun(backend.api, run.id, status);
  const report = await get<InvestigationReport>(
    backend.api,
    `${projectPath}/agent/investigations/${run.id}`,
  );
  expect(report.persisted).toBe(true);
  expect(report.evidence.length).toBeGreaterThan(0);
  const timeline = await get<DTO<"StreamEvent">[]>(
    backend.api,
    `/api/runs/${run.id}/timeline`,
  );
  expect(timeline.length).toBeGreaterThan(2);
  expect(timeline.some((event) => event.payload.type === "RUN_STARTED")).toBe(
    true,
  );
  expect(timeline.some((event) => event.payload.type === "CUSTOM")).toBe(true);
  await expect(
    page.getByRole("complementary", { name: "工程调查详情" }),
  ).toContainText("判断依据");
  return { run, report, timeline };
}

// Geometry-only coordinate sampling: no SDK injection or invented selected GUID.
// The fixture is simple prisms; focus/isolate provides an actual visible hit target.
async function clickGeometry(page: Page, viewer: Locator, dock: Locator) {
  const highlight = viewer.getByRole("button", {
    name: "高亮候选",
    exact: true,
  });
  await expect(highlight).toHaveAttribute("aria-pressed", "true");
  await highlight.click();
  await expect(highlight).toHaveAttribute("aria-pressed", "false");
  await highlight.click();
  await expect(highlight).toHaveAttribute("aria-pressed", "true");
  await viewer.getByRole("button", { name: "隔离候选", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-isolated", "true");
  const canvas = viewer.locator("canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  let picked = false;
  for (const y of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    for (const x of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      await canvas.click({
        position: { x: bounds!.width * x, y: bounds!.height * y },
      });
      try {
        await expect
          .poll(
            async () => {
              const values = await dock
                .getByRole("checkbox")
                .evaluateAll((inputs) =>
                  inputs.map((input) => (input as HTMLInputElement).checked),
                );
              return values.filter(Boolean).length;
            },
            { timeout: 600 },
          )
          .toBe(1);
        picked = true;
        break;
      } catch {
        /* Sample the next real canvas point, not a fallback DOM selection. */
      }
    }
    if (picked) break;
  }
  expect(
    picked,
    "A single click on real IFC geometry must select one mapping candidate",
  ).toBe(true);
  await expect(
    page.getByRole("complementary", { name: "构件详情" }),
  ).toContainText("IfcWall");
  await viewer.getByRole("button", { name: "显示全部", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-isolated", "false");
}

async function captureWidths(page: Page, label: string) {
  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`${label}-${width}x${height}.png`),
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

test("unseeded project: real R1/R2 geometry, durable B1, scoped evidence, recorded observation, approved simulated recheck and B2", async ({
  page,
  backend,
}) => {
  const { api, fixture } = backend;
  const pageErrors: string[] = [];
  const remoteRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      /^https?:$/.test(url.protocol) &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      remoteRequests.push(url.href);
  });
  expect(await get<Project[]>(api, "/api/projects")).toEqual([]);
  await startPage(page, backend);
  await expect(
    page.getByRole("button", { name: "新建项目", exact: true }),
  ).toBeVisible();
  expect(await get<Project[]>(api, "/api/projects")).toEqual([]); // Visiting empty startup must not seed.
  const project = await createProject(page, backend);
  const projectPath = `/api/projects/${project.id}`;
  const wp = await createPackage(
    page,
    fixture.work_package_name,
    `Area ${randomUUID().slice(0, 8)}`,
    "Review deck",
  );
  const { source, revision: r1 } = await upload(
    page,
    backend,
    project,
    fixture.r1,
    fixture.source_name,
  );
  const sourcePath = `${projectPath}/sources/${source.id}`;
  const snapshot = await imported(backend, sourcePath, r1);
  await captureWidths(page, "project-source-r1");
  expect(snapshot.elements.map((item) => item.global_id).sort()).toEqual(
    Object.values(fixture.elements)
      .map((item) => item.global_id)
      .sort(),
  );
  await verifyOriginal(backend, sourcePath, r1, fixture.r1);
  expect(await get<Baseline[]>(api, `${projectPath}/baselines`)).toEqual([]);
  expect(
    await get<DTO<"BimBindingStatus">[]>(api, `${sourcePath}/bim-bindings`),
  ).toEqual([]);

  await openPackage(page, wp.name);
  await nav(page, "模型");
  await page.getByRole("button", { name: "关联 BIM", exact: true }).click();
  const dock = page.getByRole("region", { name: "关联候选构件", exact: true });
  const viewer = page.getByLabel("IFC 模型查看器", { exact: true });
  const target = snapshot.elements.find(
    (item) => item.global_id === fixture.elements.changed.global_id,
  )!;
  expect(target.storey).toBeTruthy();
  expect(target.space).toBeTruthy();
  await selectOption(
    page,
    dock.getByRole("combobox", { name: "楼层", exact: true }),
    target.storey!,
  );
  await selectOption(
    page,
    dock.getByRole("combobox", { name: "空间", exact: true }),
    target.space!,
  );
  await selectOption(
    page,
    dock.getByRole("combobox", { name: "IFC 类型", exact: true }),
    target.ifc_class,
  );
  const mapped = fixture.mapped_roles.map((role) => fixture.elements[role]);
  await expect(dock.getByRole("checkbox")).toHaveCount(mapped.length);
  for (const item of mapped)
    await expect(
      dock.getByRole("checkbox", { name: `关联 ${item.name}`, exact: true }),
    ).toBeVisible();
  await expect(viewer.locator("canvas")).toBeVisible();
  await clickGeometry(page, viewer, dock);
  await captureWidths(page, "model-mapping-r1");
  await page
    .getByRole("button", { name: "取消 / 返回工作包", exact: true })
    .click();
  expect(
    await get<DTO<"BimBindingStatus">[]>(api, `${sourcePath}/bim-bindings`),
  ).toEqual([]);

  // Reopening cannot inherit a cancelled selection. Filter again and batch-confirm.
  await nav(page, "模型");
  await page.getByRole("button", { name: "关联 BIM", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认关联 0 个构件" }),
  ).toBeDisabled();
  await selectOption(
    page,
    dock.getByRole("combobox", { name: "楼层", exact: true }),
    target.storey!,
  );
  await selectOption(
    page,
    dock.getByRole("combobox", { name: "空间", exact: true }),
    target.space!,
  );
  await selectOption(
    page,
    dock.getByRole("combobox", { name: "IFC 类型", exact: true }),
    target.ifc_class,
  );
  await dock.getByRole("button", { name: "选择全部", exact: true }).click();
  const confirmed = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === `${sourcePath}/bim-bindings`,
  );
  await page
    .getByRole("button", {
      name: `确认关联 ${mapped.length} 个构件`,
      exact: true,
    })
    .click();
  expect((await confirmed).status()).toBe(201);
  const bindings = await get<DTO<"BimBindingStatus">[]>(
    api,
    `${sourcePath}/bim-bindings?revision_id=${r1.id}`,
  );
  expect(bindings.map((item) => item.binding.global_id).sort()).toEqual(
    mapped.map((item) => item.global_id).sort(),
  );
  for (const item of bindings) {
    expect(item.binding).toMatchObject({
      project_id: project.id,
      source_id: source.id,
      work_package_id: wp.id,
      confirmation_revision_id: r1.id,
      origin: "human_confirmed",
    });
    expect(item.binding.evidence_id).toBeTruthy();
    expect(item.state).toBe("present");
  }
  const b1 = await acceptBaseline(
    page,
    backend,
    projectPath,
    fixture.source_name,
    1,
    r1.sequence,
  );
  expect(b1.entries).toEqual([{ source_id: source.id, revision_id: r1.id }]);
  const durable = await get<Workspace>(api, `${projectPath}/workspace`);

  await test.step("kill and restart the real DBOS process against the SAME data", async () => {
    await backend.restart();
    expect(await get<Workspace>(api, `${projectPath}/workspace`)).toEqual(
      durable,
    );
    expect(await get(api, `${projectPath}/baselines/${b1.id}`)).toEqual(b1);
    expect(
      await get(api, `${sourcePath}/bim-bindings?revision_id=${r1.id}`),
    ).toEqual(bindings);
    await verifyOriginal(backend, sourcePath, r1, fixture.r1);
    await page.reload();
    await expect(
      page.getByRole("navigation", { name: "当前位置" }),
    ).toContainText(project.name);
    await sourceRegister(page, fixture.source_name);
    const context = page.getByRole("complementary", { name: "资料上下文" });
    await expect(context).toContainText(basename(fixture.r1));
    await expect(
      context.getByRole("region", { name: "当前资料版本" }),
    ).toContainText("B1");
    await openPackage(page, wp.name);
    await expect(
      page.getByRole("region", { name: "模型上下文" }),
    ).toContainText(`${mapped.length} 个关联构件`);
  });

  const uploadedR2 = await upload(
    page,
    backend,
    project,
    fixture.r2,
    fixture.source_name,
    true,
  );
  const r2 = uploadedR2.revision;
  expect(uploadedR2.source.id).toBe(source.id);
  expect(r2.sequence).toBe(r1.sequence + 1);
  expect(
    await get<ProjectSourceStatus[]>(api, `${projectPath}/sources`),
  ).toHaveLength(1);
  await imported(backend, sourcePath, r2);
  await verifyOriginal(backend, sourcePath, r2, fixture.r2);
  await verifyOriginal(backend, sourcePath, r1, fixture.r1);
  expect(await get(api, `${projectPath}/baselines/${b1.id}`)).toEqual(b1);
  const pending = await get<ProjectSourceStatus>(api, sourcePath);
  expect(pending).toMatchObject({
    latest_revision_id: r2.id,
    accepted_revision_id: r1.id,
    has_pending_revision: true,
  });
  await sourceRegister(page, fixture.source_name);
  const context = page.getByRole("complementary", { name: "资料上下文" });
  await context.getByRole("button", { name: "查看变化", exact: true }).click();
  const impact = context.getByRole("region", { name: "版本影响", exact: true });
  await expect(impact).toContainText("新增");
  await expect(impact).toContainText("删除");
  await expect(impact).toContainText(wp.name);
  const [comparison] = await get<DTO<"RevisionComparison">[]>(
    api,
    `${sourcePath}/bim-comparisons`,
  );
  const detail = await get<DTO<"RevisionComparisonDetail">>(
    api,
    `${sourcePath}/bim-comparisons/${comparison.id}`,
  );
  expect(detail.comparison).toMatchObject({
    engine: "ifcdiff",
    from_revision_id: r1.id,
    to_revision_id: r2.id,
  });
  expect(
    detail.changes.map((item) => [item.global_id, item.change_kind]).sort(),
  ).toEqual(
    [
      [fixture.elements.changed.global_id, "changed"],
      [fixture.elements.deleted.global_id, "deleted"],
      [fixture.added.global_id, "added"],
    ].sort(),
  );
  expect(
    detail.affected_work_packages.map((item) => item.work_package_id),
  ).toEqual([wp.id]);
  const affectedIds = detail.affected_work_packages[0].changes
    .map((item) => item.global_id)
    .sort();
  expect(affectedIds).toEqual(
    [
      fixture.elements.changed.global_id,
      fixture.elements.deleted.global_id,
    ].sort(),
  );
  const updatedBindings = await get<DTO<"BimBindingStatus">[]>(
    api,
    `${sourcePath}/bim-bindings?revision_id=${r2.id}`,
  );
  expect(
    updatedBindings.find(
      (item) => item.binding.global_id === fixture.elements.deleted.global_id,
    )?.state,
  ).toBe("missing");
  expect(
    updatedBindings.find(
      (item) => item.binding.global_id === fixture.added.global_id,
    ),
  ).toBeUndefined();

  const affectedDock = await inspectImpact(page, fixture.source_name, wp.name);
  await expect(
    affectedDock.getByRole("region", { name: "比较变更构件" }),
  ).toContainText("目标版本无几何（历史变更保留）");
  await expect(viewer.locator("canvas")).toBeVisible();
  await expect(viewer.getByRole("status")).toContainText(
    `已匹配 1/${affectedIds.length} 个受影响构件 GUID`,
  );
  await affectedDock
    .getByRole("region", { name: "比较变更构件" })
    .getByRole("button", { name: new RegExp(fixture.changed_name_r2) })
    .click();
  const inspector = page.getByRole("complementary", { name: "构件详情" });
  await expect(inspector).toContainText(fixture.changed_name_r2);
  await expect(inspector).toContainText(target.storey!);
  await expect(inspector).toContainText(target.ifc_class);
  await expect(inspector).toContainText("R2");
  await affectedDock
    .getByRole("region", { name: "比较变更构件" })
    .getByRole("button", { name: new RegExp(fixture.elements.deleted.name) })
    .click();
  await expect(inspector).toContainText(fixture.elements.deleted.name);
  await expect(inspector).toContainText("历史属性，不是目标版本几何");
  await affectedDock
    .getByRole("region", { name: "比较变更构件" })
    .getByRole("button", { name: new RegExp(fixture.changed_name_r2) })
    .click();
  await captureWidths(page, "model-impact-r2");
  await viewer.getByRole("button", { name: "聚焦", exact: true }).click();
  await viewer.getByRole("button", { name: "隔离", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-isolated", "true");
  await viewer.getByRole("button", { name: "显示全部", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-isolated", "false");

  await test.step("scoped Ask is genuinely read-only", async () => {
    const before = await get<Workspace>(api, `${projectPath}/workspace`);
    const runs = await get<AgentRun[]>(api, `${projectPath}/runs`);
    await page
      .getByRole("button", { name: "询问 Concord", exact: true })
      .click();
    await page
      .getByLabel("询问当前工程问题", { exact: true })
      .fill(
        "Explain the selected revision changes without authorizing site work",
      );
    const answered = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        new URL(r.url()).pathname === `${projectPath}/agent/ask`,
    );
    await page.getByRole("button", { name: "询问", exact: true }).click();
    const response = await answered;
    expect(response.status()).toBe(200);
    const answer = (await response.json()) as DTO<"AgentResponse">;
    expect(answer.persisted).toBe(false);
    expect(answer.scope).toMatchObject({
      source_id: source.id,
      from_revision_id: r1.id,
      to_revision_id: r2.id,
      work_package_ids: [wp.id],
    });
    expect(answer.scope.element_ids.slice().sort()).toEqual(affectedIds);
    expect(answer.evidence.length).toBeGreaterThan(0);
    await expect(
      page.getByText("即时只读回答 · 不写入项目依据", { exact: true }),
    ).toBeVisible();
    expect(await get<Workspace>(api, `${projectPath}/workspace`)).toEqual(
      before,
    );
    expect(await get<AgentRun[]>(api, `${projectPath}/runs`)).toEqual(runs);
    expect(await get(api, `${projectPath}/baselines/${b1.id}`)).toEqual(b1);
    await page.keyboard.press("Escape");
  });

  const raw = await investigate(
    page,
    backend,
    projectPath,
    affectedDock,
    "COMPLETED",
  );
  expect(raw.report.scope).toMatchObject({
    source_id: source.id,
    from_revision_id: r1.id,
    to_revision_id: r2.id,
    work_package_ids: [wp.id],
  });
  expect(raw.report.scope.element_ids.slice().sort()).toEqual(affectedIds);
  const rawWorkspace = await get<Workspace>(api, `${projectPath}/workspace`);
  expect(rawWorkspace.events).toEqual([]);
  expect(
    rawWorkspace.proposals.filter((proposal) => proposal.run_id === raw.run.id),
  ).toEqual([]);
  expect(
    rawWorkspace.analysis!.constraints.filter(
      (constraint) => constraint.work_package_id === wp.id,
    ),
  ).toEqual([]);
  expect(
    rawWorkspace
      .analysis!.readiness.filter((row) => row.work_package_id === wp.id)
      .some((row) => row.status === "BLOCKED"),
  ).toBe(false);
  expect(
    raw.report.tools.some(
      (tool) => tool.available && tool.evidence_ids.length > 0,
    ),
  ).toBe(true);
  for (const id of affectedIds) {
    expect(
      raw.report.evidence.some(
        (evidence) =>
          evidence.source_id === source.id &&
          evidence.source_revision === r2.sha256 &&
          evidence.provider.startsWith("ifcdiff/") &&
          evidence.element_ids.includes(id),
      ),
    ).toBe(true);
    const binding = bindings.find((item) => item.binding.global_id === id)!;
    expect(
      raw.report.evidence.some(
        (evidence) =>
          evidence.source_id === source.id &&
          evidence.source_revision === r1.sha256 &&
          evidence.provider === "human-confirmed-bim-binding" &&
          evidence.fact.includes(binding.binding.evidence_id),
      ),
    ).toBe(true);
  }
  await backend.restart();
  expect(await get(api, `/api/runs/${raw.run.id}/timeline`)).toEqual(
    raw.timeline,
  );
  await page.reload();
  await sourceRegister(page, fixture.source_name);
  await expect(context).toContainText("判断依据");
  expect(
    await get(api, `${projectPath}/agent/investigations/${raw.run.id}`),
  ).toEqual(raw.report);

  // An actual human-recorded design observation, not a fabricated rule from IFC diff.
  await openPackage(page, wp.name);
  await page.getByRole("button", { name: "记录变更", exact: true }).click();
  const observation = page.getByRole("dialog", {
    name: "记录变更",
    exact: true,
  });
  await expect(observation.getByLabel("新版本", { exact: true })).toHaveValue(
    "",
  );
  const label = r2.external_label || `R${r2.sequence}`;
  await observation.getByLabel("新版本", { exact: true }).fill(label);
  await observation
    .getByLabel("来源说明（不受信任内容）")
    .fill(
      `Human review of ${r2.original_filename}; design confirmation required, not site execution.`,
    );
  const recorded = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === `${projectPath}/events`,
  );
  await observation.getByRole("button", { name: "提交并分析" }).click();
  const eventResponse = await recorded;
  expect(eventResponse.status()).toBe(202);
  const eventRun = (await eventResponse.json()) as AgentRun;
  await waitRun(api, eventRun.id, "WAITING_APPROVAL");
  const eventWorkspace = await get<Workspace>(api, `${projectPath}/workspace`);
  expect(eventWorkspace.events).toHaveLength(1);
  expect(eventWorkspace.events[0]).toMatchObject({
    project_id: project.id,
    work_package_id: wp.id,
    kind: "design_revision",
    source: "user-observation",
    change: { revision: label },
  });

  const eventProposal = eventWorkspace.proposals.find(
    (item) => item.run_id === eventRun.id && item.work_package_id === wp.id,
  )!;
  await page.getByRole("button", { name: "审查处理方案", exact: true }).click();
  const rejectResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
      `/api/proposals/${eventProposal.id}/reject`,
  );
  await page
    .getByLabel("拒绝原因（可选）")
    .fill("保留阻塞，重新核对比较范围后再决定");
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  expect((await rejectResponse).status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "已拒绝", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "执行并重新检查", exact: true }),
  ).toBeDisabled();
  expect(
    (
      await api.post(`/api/proposals/${eventProposal.id}/approve`, {
        data: { strong: true, confirmation: "APPROVE R4" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await api.post(`/api/proposals/${eventProposal.id}/execute`)).status(),
  ).toBe(409);
  const rejectedWorkspace = await get<Workspace>(
    api,
    `${projectPath}/workspace`,
  );
  expect(rejectedWorkspace.state).toEqual(eventWorkspace.state);
  expect(
    rejectedWorkspace.audit.some(
      (record) =>
        record.action === "ACTION_PROPOSAL_REJECTED" &&
        record.detail.proposal_id === eventProposal.id,
    ),
  ).toBe(true);

  const proposalDock = await inspectImpact(page, fixture.source_name, wp.name);
  const investigation = await investigate(
    page,
    backend,
    projectPath,
    proposalDock,
    "WAITING_APPROVAL",
  );
  const blocked = await get<Workspace>(api, `${projectPath}/workspace`);
  const proposal = blocked.proposals.find(
    (item) =>
      item.run_id === investigation.run.id && item.work_package_id === wp.id,
  )!;
  expect(proposal).toBeTruthy();
  expect(proposal.evidence_ids.length).toBeGreaterThan(0);
  const designConstraint = blocked.analysis!.constraints.find(
    (item) => item.work_package_id === wp.id && item.kind === "design",
  )!;
  expect(designConstraint).toBeTruthy();
  expect(
    blocked.analysis!.evidence.some(
      (evidence) =>
        designConstraint.evidence_ids.includes(evidence.id) &&
        evidence.fact.includes(label),
    ),
  ).toBe(true);
  expect(
    blocked.analysis!.constraints.some(
      (item) => item.work_package_id === wp.id,
    ),
  ).toBe(true);
  expect(
    blocked.analysis!.readiness.find((item) => item.work_package_id === wp.id)
      ?.status,
  ).toBe("BLOCKED");
  expect(
    (await api.post(`/api/proposals/${proposal.id}/execute`)).status(),
  ).toBe(403);
  expect(
    (await get<Workspace>(api, `${projectPath}/workspace`)).state.version,
  ).toBe(blocked.state.version);
  const investigationPane = page.getByRole("complementary", {
    name: "工程调查详情",
  });
  await investigationPane
    .getByRole("button", { name: "审查处理方案 →", exact: true })
    .click();
  const execute = page.getByRole("button", {
    name: "执行并重新检查",
    exact: true,
  });
  await expect(execute).toBeDisabled();
  const approvedResponse = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/proposals/${proposal.id}/approve`,
  );
  if (proposal.risk >= 4) await page.getByLabel("R4 强确认").fill("APPROVE R4");
  await page
    .getByRole("button", { name: `批准 R${proposal.risk}`, exact: true })
    .click();
  expect((await approvedResponse).status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "已批准", exact: true }),
  ).toBeVisible();
  const executedResponse = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/proposals/${proposal.id}/execute`,
  );
  await execute.click();
  const executionResponse = await executedResponse;
  expect(executionResponse.status()).toBe(202);
  const dispatch = (await executionResponse.json()) as DTO<"ExecuteResponse">;
  expect(dispatch).toMatchObject({
    run_id: investigation.run.id,
    operation_id: proposal.operation_id,
    queued: true,
  });
  expect(proposal.execution_mode).toBe("simulated");
  await waitRun(api, investigation.run.id, "COMPLETED");
  const rechecked = await get<Workspace>(api, `${projectPath}/workspace`);
  const freshReport = await get<InvestigationReport>(
    api,
    `${projectPath}/agent/investigations/${investigation.run.id}`,
  );
  expect(freshReport.analysis_id).not.toBe(investigation.report.analysis_id);
  expect(freshReport.persisted).toBe(true);
  expect(rechecked.analysis!.snapshot.version).toBe(rechecked.state.version);
  expect(
    rechecked.analysis!.readiness.find((item) => item.work_package_id === wp.id)
      ?.status,
  ).toBe("READY");
  expect(
    await get<DTO<"ActionExecution">>(
      api,
      `/api/operations/${dispatch.operation_id}`,
    ),
  ).toMatchObject({
    mode: "simulated",
    status: "VERIFIED",
    proposal_id: proposal.id,
  });
  await openPackage(page, wp.name);
  await expect(page.locator(".readiness-summary")).toContainText("可施工");
  await expect(page.locator(".readiness-summary")).toContainText("不代替现场");
  expect(await get(api, `${projectPath}/baselines/${b1.id}`)).toEqual(b1);
  const b2 = await acceptBaseline(
    page,
    backend,
    projectPath,
    fixture.source_name,
    2,
    r2.sequence,
  );
  expect(b2.entries).toEqual([{ source_id: source.id, revision_id: r2.id }]);
  expect(await get(api, `${projectPath}/baselines/${b1.id}`)).toEqual(b1);
  expect(await get<ProjectSourceStatus>(api, sourcePath)).toMatchObject({
    accepted_revision_id: r2.id,
    has_pending_revision: false,
  });
  await verifyOriginal(backend, sourcePath, r1, fixture.r1);
  await captureWidths(page, "project-baseline-b2");
  expect(remoteRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("invalid IFC keeps the real source/error across restart; resume still fails and project switching stays isolated", async ({
  page,
  backend,
}) => {
  const { api, fixture } = backend;
  expect(await get<Project[]>(api, "/api/projects")).toEqual([]);
  await startPage(page, backend);
  const project = await createProject(page, backend);
  const projectPath = `/api/projects/${project.id}`;
  const brokenName = `Rejected IFC ${randomUUID().slice(0, 8)}`;
  const { source, revision } = await upload(
    page,
    backend,
    project,
    fixture.invalid,
    brokenName,
  );
  const sourcePath = `${projectPath}/sources/${source.id}`;
  let linked: AgentRun | null = null;
  await expect
    .poll(async () => {
      linked = await get<AgentRun | null>(
        api,
        `${sourcePath}/revisions/${revision.id}/import`,
      );
      return linked?.id;
    })
    .toBeTruthy();
  const failed = await waitRun(api, linked!.id, "FAILED");
  expect(failed.error).toBeTruthy();
  expect(failed.category).toBe("bim_import");
  await sourceRegister(page, brokenName);
  const context = page.getByRole("complementary", {
    name: "资料上下文",
    exact: true,
  });
  await expect(context).toContainText("处理失败");
  await expect(context.getByRole("alert")).toContainText(failed.error!);
  await expect(
    context.getByRole("button", { name: "重试处理", exact: true }),
  ).toBeEnabled();
  const status = await get<ProjectSourceStatus>(api, sourcePath);
  expect(status).toMatchObject({
    latest_revision_id: revision.id,
    accepted_revision_id: null,
    has_pending_revision: true,
  });
  expect(await get<Baseline[]>(api, `${projectPath}/baselines`)).toEqual([]);
  expect(
    (
      await api.get(`${sourcePath}/revisions/${revision.id}/bim-snapshot`)
    ).status(),
  ).toBe(404);
  await verifyOriginal(backend, sourcePath, revision, fixture.invalid);

  await backend.restart();
  const restoredFailure = await get<AgentRun>(api, `/api/runs/${failed.id}`);
  // DBOS recovery may re-record the terminal failure timestamp; its identity,
  // generation, status and durable error must remain exactly the same.
  expect({ ...restoredFailure, updated_at: failed.updated_at }).toEqual(failed);
  expect(await get<ProjectSourceStatus>(api, sourcePath)).toEqual(status);
  await page.reload();
  await sourceRegister(page, brokenName);
  await expect(context.getByRole("alert")).toContainText(failed.error!);
  const resumed = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === `/api/runs/${failed.id}/resume`,
  );
  await context.getByRole("button", { name: "重试处理", exact: true }).click();
  const response = await resumed;
  expect(response.status()).toBe(202);
  const next = (await response.json()) as AgentRun;
  expect(next.id).toBe(failed.id);
  expect(next.generation).toBeGreaterThan(failed.generation);
  const failedAgain = await waitRun(api, next.id, "FAILED");
  expect(failedAgain.error).toBeTruthy();
  await expect(context.getByRole("alert")).toContainText(failedAgain.error!);
  expect(
    await get<ProjectSourceRevision[]>(api, `${sourcePath}/revisions`),
  ).toEqual([revision]);
  expect(await get<ProjectSourceStatus>(api, sourcePath)).toEqual(status);
  expect(await get<Baseline[]>(api, `${projectPath}/baselines`)).toEqual([]);
  const imports = (await get<AgentRun[]>(api, `${projectPath}/runs`)).filter(
    (run) => run.category === "bim_import",
  );
  expect(imports).toHaveLength(1); // Resume, never a fake success or duplicate import identity.
  await verifyOriginal(backend, sourcePath, revision, fixture.invalid);

  const empty = await createProject(
    page,
    backend,
    `Separate workspace ${randomUUID().slice(0, 8)}`,
  );
  await sourceRegister(page);
  await expect(
    page.getByRole("region", { name: "项目资料", exact: true }),
  ).toContainText("还没有资料");
  await expect(page.getByText(brokenName, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "资料上下文", exact: true }),
  ).toHaveCount(0);
  expect(
    await get<ProjectSourceStatus[]>(api, `/api/projects/${empty.id}/sources`),
  ).toEqual([]);
  expect(
    await get<Baseline[]>(api, `/api/projects/${empty.id}/baselines`),
  ).toEqual([]);
  expect(await get<AgentRun[]>(api, `/api/projects/${empty.id}/runs`)).toEqual(
    [],
  );
  const emptyState = await get<DTO<"ProjectState">>(
    api,
    `/api/projects/${empty.id}`,
  );
  expect(emptyState.areas).toEqual([]);
  expect(emptyState.work_packages).toEqual([]);
  // This original belongs to the first project even if its opaque IDs are known.
  expect(
    (
      await api.get(
        `/api/projects/${empty.id}/sources/${source.id}/revisions/${revision.id}/content`,
      )
    ).status(),
  ).toBe(404);
  await page.getByRole("button", { name: "切换项目", exact: true }).click();
  await page.getByRole("menuitem", { name: project.name, exact: true }).click();
  await sourceRegister(page, brokenName);
  await expect(context).toContainText(basename(fixture.invalid));
  await expect(context.getByRole("alert")).toContainText(failedAgain.error!);
  expect(
    (await get<Project[]>(api, "/api/projects")).map((item) => item.id).sort(),
  ).toEqual([project.id, empty.id].sort());
});

test("multi-file text ingestion uses real enabled parsers and a complete explicit baseline", async ({
  page,
  backend,
}) => {
  await startPage(page, backend);
  const project = await createProject(page, backend);
  await page.getByRole("button", { name: "+ 添加资料", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
  const files = [
    {
      name: "核对说明.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("现场记录：复核支撑位置；本文件不是施工批准。"),
    },
    {
      name: "版本约定.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# 版本约定\n资料原件应保留，基线需人工确认。"),
    },
  ];
  const input = dialog.locator('input[type="file"]');
  await expect(input).toHaveAttribute("multiple", "");
  expect(await input.getAttribute("accept")).not.toMatch(
    /pdf|docx|pptx|dwg|xlsx/i,
  );
  await input.setInputFiles(files);
  await dialog.getByRole("button", { name: "上传并处理", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "完成", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  const path = `/api/projects/${project.id}`;
  const sources = await get<ProjectSourceStatus[]>(
    backend.api,
    `${path}/sources`,
  );
  expect(sources).toHaveLength(2);
  for (const source of sources) {
    expect(source.source.kind).toBe("DOCUMENT");
    const revision = await get<ProjectSourceRevision>(
      backend.api,
      `${path}/sources/${source.source.id}/revisions/${source.latest_revision_id}`,
    );
    await expect
      .poll(
        async () =>
          (
            await get<AgentRun>(
              backend.api,
              `${path}/sources/${source.source.id}/revisions/${revision.id}/import`,
            )
          ).status,
      )
      .toBe("COMPLETED");
    const original = await backend.api.get(
      `${path}/sources/${source.source.id}/revisions/${revision.id}/content`,
    );
    expect(original.ok()).toBe(true);
    const file = files.find(
      (file) => file.name === revision.original_filename,
    )!;
    expect(sha256(await original.body())).toBe(sha256(file.buffer));
    expect(revision.sha256).toBe(sha256(file.buffer));
    expect(source.accepted_revision_id).toBeNull();
  }
  expect(await get(backend.api, `${path}/documents`)).toHaveLength(2);
  await page.getByRole("button", { name: "确认新基线", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "确认基线 B1",
    exact: true,
  });
  for (const source of sources)
    await expect(confirmation).toContainText(source.source.name);
  await confirmation
    .getByRole("button", { name: "确认 B1", exact: true })
    .click();
  const baselines = await get<Baseline[]>(backend.api, `${path}/baselines`);
  expect(baselines).toHaveLength(1);
  expect(baselines[0].entries).toHaveLength(2);
  await backend.restart();
  expect(
    await get(backend.api, `${path}/baselines/${baselines[0].id}`),
  ).toEqual(baselines[0]);
  expect(await get(backend.api, `${path}/documents`)).toHaveLength(2);
});
