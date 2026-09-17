import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { Workspace } from '../src/api/client';

const authorization = { Authorization: 'Bearer local-demo-admin' };
const project = '/api/projects/harbor-east';
const workspaceRoute = '**/api/projects/harbor-east/workspace';

async function workspace(request: APIRequestContext): Promise<Workspace> {
  const response = await request.get(`${project}/workspace`, { headers: authorization });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<Workspace>;
}

async function event(request: APIRequestContext, change = { revision: 'V17' }) {
  const response = await request.post(`${project}/events`, { headers: authorization, data: {
    id: randomUUID(), project_id: 'harbor-east', work_package_id: 'WP-200',
    kind: 'design_revision', title: 'Browser E2E design update', change,
  } });
  expect(response.status()).toBe(202);
  return response.json();
}

/** The selected work package reports its state beside its own title. */
const stateTag = (page: Page) => page.locator('.coordination-state-tag');
const inspector = (page: Page) =>
  page.getByRole('complementary', { name: '判断依据与处理详情' });

async function expectBlocked(page: Page) {
  await expect(stateTag(page)).toContainText('已阻塞', { timeout: 30_000 });
}

async function expectReady(page: Page) {
  await expect(page.getByText('当前没有阻塞施工的条件')).toBeVisible({ timeout: 30_000 });
}

/**
 * The header's own entry: 记录变更 is the workflow action beside it, and the 高级
 * menu is the one door to everything that is not the workflow - the diagnostics
 * and, on the local demonstration profile, the fixture tools.
 *
 * Menus are opened with the keyboard, which is how a keyboard user opens them and
 * also the only way to open one here without a race: a menu that opens on the
 * pointer's press can be closed again by the same press's release arriving late on
 * a loaded machine, and the product is not what that timing measures.
 */
async function openHeaderMenu(page: Page) {
  await page.locator('.header-tools .quiet-trigger').focus();
  await page.keyboard.press('Enter');
}

/** The deterministic demo fixture is reached through that one advanced entry. */
async function injectDemoEvent(page: Page, label: RegExp | string) {
  // Both menus dismiss on selection, on Escape, and on a click elsewhere, so no
  // cleanup is needed.
  await openHeaderMenu(page);
  await page.getByRole('menuitem', { name: label }).click();
}

/** An advanced view is a destination inside 高级, not a peer of the workflow. */
async function openAdvancedView(page: Page, label: string) {
  await openHeaderMenu(page);
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

/** Secondary workflow destinations live behind 更多; none of them is primary navigation. */
async function openSecondaryView(page: Page, label: string) {
  await page.locator('.more-views .quiet-trigger').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

test.beforeEach(async ({ request, page }) => {
  const reset = await request.post('/api/demo/reset', { headers: authorization });
  expect(reset.status()).toBe(202);
  const resetRun = await reset.json();
  await expect.poll(async () => {
    const current = await workspace(request);
    return current.run?.id === resetRun.id && current.run.status === 'COMPLETED'
      && !current.stale && current.analysis?.readiness.every(row => row.status === 'READY');
  }).toBe(true);
  await page.addInitScript(() => { if (!sessionStorage.getItem('cca-token')) sessionStorage.setItem('cca-token', 'local-demo-admin'); });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: '东翼风管安装' })).toBeVisible();
});

test('coordinates a design change through evidence, approval, receipt, and a fresh recheck', async ({ page, request }) => {
  const panel = inspector(page);
  await injectDemoEvent(page, /图纸 V16/);
  await expectBlocked(page);
  await expect(page.getByText('图纸已更新至 V17，但当前施工面仍基于 V16。')).toBeVisible();

  // Evidence is one click away, and the pane reports only the opened detail.
  await page.getByRole('button', { name: '查看依据' }).click();
  await expect(panel.getByText(/来源 structured-drawing/)).toBeVisible();
  await expect(panel.getByText('完成相关负责人确认后，重新检查当前施工条件。')).toHaveCount(0);

  const before = await workspace(request);
  const proposal = before.proposals.find(item => item.work_package_id === 'WP-200')!;
  expect(before.analysis!.evidence.length).toBeGreaterThan(0);
  const denied = await request.post(`/api/proposals/${proposal.id}/execute`, { headers: authorization });
  expect(denied.status()).toBe(403);

  await page.getByRole('button', { name: '批准并继续' }).click();
  await expect(panel.getByRole('button', { name: '执行并重新检查' })).toBeDisabled();
  await panel.getByRole('button', { name: /^批准 R/ }).click();
  await expect(panel.getByRole('button', { name: '已批准' })).toBeVisible();
  await panel.getByRole('button', { name: '执行并重新检查' }).click();
  await expectReady(page);

  const after = await workspace(request);
  expect(after.analysis!.snapshot.id).not.toBe(before.analysis!.snapshot.id);
  expect(after.analysis!.snapshot.version).toBe(after.state.version);
  const receipt = await request.get(`/api/operations/${proposal.operation_id}`, { headers: authorization });
  expect(receipt.status()).toBe(200);
  const firstReceipt = await receipt.json();
  await request.post(`/api/proposals/${proposal.id}/execute`, { headers: authorization });
  const retried = await request.get(`/api/operations/${proposal.operation_id}`, { headers: authorization });
  expect(await retried.json()).toEqual(firstReceipt);
  expect((await workspace(request)).state.version).toBe(firstReceipt.after_version);

  // The secondary workforce case runs through the same engine and the same view.
  await injectDemoEvent(page, '电气班组不足');
  await expect(page.getByRole('heading', { level: 2, name: '03 层电气粗装' })).toBeVisible();
  await expectBlocked(page);
  await page.getByRole('button', { name: '批准并继续' }).click();
  await panel.getByRole('button', { name: /^批准 R/ }).click();
  await panel.getByRole('button', { name: '执行并重新检查' }).click();
  await expectReady(page);
});

test('stale approval is rejected and the browser refreshes instead of silently approving', async ({ page, request }) => {
  const panel = inspector(page);
  await injectDemoEvent(page, /图纸 V16/);
  await expectBlocked(page);
  await page.getByRole('button', { name: '批准并继续' }).click();
  const approve = panel.getByRole('button', { name: /^批准 R/ });
  await expect(approve).toBeEnabled();

  const staleWorkspace = await workspace(request);
  const old = staleWorkspace.proposals.find(item => item.work_package_id === 'WP-200')!;
  // Keep this tab's old snapshot until the click, while another client updates
  // authoritative facts. This tests the 409 path without a polling-time race.
  await page.route(workspaceRoute, route => route.fulfill({ json: staleWorkspace }));
  await event(request, { revision: 'V18' });
  const rejected = page.waitForResponse(response => response.url().endsWith(`/proposals/${old.id}/approve`));
  await approve.click();
  expect((await rejected).status()).toBe(409);
  await page.unroute(workspaceRoute);
  await expect(page.getByRole('alert').first()).toBeVisible();
  expect((await workspace(request)).approvals.some(approval => approval.proposal_id === old.id)).toBe(false);
});

test('inspection R4 requires exact typed confirmation', async ({ page, request }) => {
  const response = await request.post(`${project}/events`, { headers: authorization, data: {
    project_id: 'harbor-east', work_package_id: 'WP-200', kind: 'inspection',
    title: 'Browser E2E inspection', change: { inspection_passed: false },
  } });
  expect(response.status()).toBe(202);
  await page.reload();
  await expectBlocked(page);
  await page.getByRole('button', { name: '批准并继续' }).click();
  const panel = inspector(page);
  const approve = panel.getByRole('button', { name: '批准 R4' });
  await expect(approve).toBeDisabled();
  await panel.getByLabel('R4 confirmation').fill('approve r4');
  await expect(approve).toBeDisabled();
  await panel.getByLabel('R4 confirmation').fill('APPROVE R4');
  await approve.click();
  await panel.getByRole('button', { name: '执行并重新检查' }).click();
  await expectReady(page);
});

test('an outdated judgement is raised beside the work package, not as a global banner', async ({ page, request }) => {
  // An authoritative fact changes behind this client's back, so the recorded
  // judgement is no longer current.
  await event(request, { revision: 'V18' });
  await page.reload();
  await expectBlocked(page);
  // The work package reports its own state; nothing is raised application-wide.
  await expect(page.locator('.alert')).toHaveCount(0);
  await expect(page.locator('.coordination-workspace')).toContainText('已阻塞');
});

test('document upload, retrieval and authenticated source download use the real API', async ({ page }) => {
  await page.getByRole('navigation', { name: '工作区视图' }).getByRole('button', { name: '文档', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'browser-evidence.md', mimeType: 'text/markdown', buffer: Buffer.from('# Browser evidence\nunique-browser-evidence-phrase'),
  });
  await expect(page.getByText('browser-evidence.md', { exact: true })).toBeVisible();
  await page.getByText('browser-evidence.md', { exact: true }).click();
  await page.getByLabel('搜索文档').fill('unique-browser-evidence-phrase');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.document-chunk')).toContainText('unique-browser-evidence-phrase');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存来源' }).click();
  expect((await download).suggestedFilename()).toBe('browser-evidence.md');
});

test('viewer can read but cannot approve or execute', async ({ page, request }) => {
  await event(request);
  await page.evaluate(() => sessionStorage.setItem('cca-token', 'local-demo-viewer'));
  await page.reload();
  await expectBlocked(page);
  await page.getByRole('button', { name: '批准并继续' }).click();
  const panel = inspector(page);
  const response = page.waitForResponse(value => value.url().endsWith('/approve'));
  await panel.getByRole('button', { name: /^批准 R/ }).click();
  expect((await response).status()).toBe(403);
  await expect(page.getByRole('alert').first()).toBeVisible();
  const data = await workspace(request);
  expect(data.approvals).toHaveLength(0);
});

test('the change composer supports keyboard selection and dismissal in the product control', async ({
  page,
  request,
}) => {
  await page.getByRole('button', { name: '记录变更' }).click();
  const trigger = page.locator('.event-dialog [role=combobox]');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const selected = page.getByRole('option', { name: '设计修订' });
  await expect(selected).toBeVisible();
  await expect(selected).toBeFocused();
  await page.keyboard.press('ArrowDown');
  // Radix moves the arrow-key highlight on a deferred timer, so the move is waited
  // for as the product state it is rather than assumed to have landed before Enter.
  await expect(page.getByRole('option', { name: '班组人员不足' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('班组人员不足');

  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const workforce = page.getByRole('option', { name: '班组人员不足' });
  await expect(workforce).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.getByRole('button', { name: '提交并分析' }).click();
  await expectBlocked(page);

  // The submitted value is still the API's own enum, not the Chinese word the
  // user chose, and the record's own title carries the Chinese label.
  const recorded = (await workspace(request)).events.find(
    item =>
      item.kind === 'workforce' &&
      item.work_package_id === 'WP-200' &&
      item.source === 'local-demo-ui',
  );
  expect(recorded?.title).toBe('班组人员不足 / WP-200');
});

test('structured BIM, capability status, and run history remain usable without optional SDKs', async ({ page }) => {
  const views = page.getByRole('navigation', { name: '工作区视图' });
  await views.getByRole('button', { name: 'BIM', exact: true }).click();
  await expect(page.locator('.bim-element').first()).toBeVisible();
  await page.locator('.bim-element').first().click();
  await expect(page.locator('.bim-property-list')).toBeVisible();
  // The diagnostics are still reachable and still intact: they are behind 高级
  // rather than beside 协调, which is a placement change and not a deletion.
  await openAdvancedView(page, '能力诊断');
  await expect(page.locator('.capability-table')).toBeVisible();
  await openAdvancedView(page, '运行记录');
  await expect(page.locator('.operations-view')).toBeVisible();
  await expect(
    page.locator('.operations-view .operation-form').first().getByRole('button'),
  ).toBeDisabled();
});

test('real local GIS renders and selects its linked work package', async ({ page }) => {
  await page.locator('.package-nav').filter({ hasText: 'WP-300' }).click();
  await page.locator('.package-nav[aria-current="page"]').filter({ hasText: 'WP-300' }).waitFor();
  await openSecondaryView(page, '现场地图');
  await expect(page.locator('.viewer-toolbar')).toContainText('地图已就绪');
  // The map says what it is showing: the site polygon, the work-package points,
  // and which work package is current.
  await expect(page.locator('.gis-context')).toContainText('WP-300');
  const canvas = page.locator('.maplibregl-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  // The original synthetic WP-200 marker is exactly at the map's declared center.
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await expect(page.locator('.breadcrumb strong')).toHaveText('WP-200');
  await expect(page.locator('.package-nav[aria-current="page"]')).toContainText('WP-200');
  await openSecondaryView(page, '工作包');
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
});

test('a disconnected event stream refreshes stale approvals behind a newer document job', async ({ page, request }) => {
  let attempts = 0;
  await page.route('**/api/runs/*/events', route => {
    attempts += 1;
    // Fail the transport, not the backend. The next fetch must reconnect to the
    // real SSE endpoint, rather than receiving a mocked success response.
    return attempts === 1 ? route.abort('connectionreset') : route.continue();
  });
  await injectDemoEvent(page, /图纸 V16/);
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(2);
  await expectBlocked(page);
  await page.getByRole('button', { name: '批准并继续' }).click();
  const panel = inspector(page);
  await expect(panel.getByRole('button', { name: /^批准 R/ })).toBeEnabled();

  const current = await workspace(request);
  const proposal = current.proposals.find(item => item.work_package_id === 'WP-200')!;
  await page.getByRole('navigation', { name: '工作区视图' }).getByRole('button', { name: '文档', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'approval-stream.md', mimeType: 'text/markdown', buffer: Buffer.from('Independent document job'),
  });
  await expect(page.getByText('approval-stream.md', { exact: true })).toBeVisible();
  await expect(page.locator('.upload-status')).toContainText('已完成');
  await expect(page.locator('.timeline-heading')).toContainText('已完成');
  const uploaded = await workspace(request);
  expect(uploaded.run!.id).not.toBe(current.run!.id);
  expect(uploaded.analysis_run!.id).toBe(current.analysis_run!.id);
  expect(uploaded.analysis_run!.status).toBe('WAITING_APPROVAL');
  expect(uploaded.state.version).toBeGreaterThan(current.state.version);
  expect(uploaded.stale).toBe(true);
  await expect(panel.getByRole('button', { name: /^批准 R/ })).toBeDisabled();

  // Published document evidence invalidates the old snapshot. A stale approval
  // must be rejected and trigger a fresh analysis on its existing durable run.
  const rejected = await request.post(`/api/proposals/${proposal.id}/approve`, {
    headers: authorization,
    data: { strong: false, confirmation: '' },
  });
  expect(rejected.status()).toBe(409);
  await expect.poll(async () => {
    const refreshed = await workspace(request);
    return !refreshed.stale && refreshed.analysis?.id !== current.analysis?.id;
  }).toBe(true);
  const refreshed = await workspace(request);
  expect(refreshed.run!.id).toBe(uploaded.run!.id);
  expect(refreshed.analysis_run!.id).toBe(current.analysis_run!.id);
  expect(refreshed.analysis!.snapshot.version).toBe(refreshed.state.version);
  expect(refreshed.approvals.some(item => item.proposal_id === proposal.id)).toBe(false);
  const freshProposal = refreshed.proposals.find(item => item.work_package_id === 'WP-200')!;
  expect(freshProposal.id).not.toBe(proposal.id);
  await expect(panel.getByRole('button', { name: /^批准 R/ })).toBeEnabled();

  // This separate client does not trigger React Query invalidation in the tab.
  // The approval owner's real stream must deliver both the fresh analysis and
  // its approval even while the completed document job owns the visible timeline.
  const approved = await request.post(`/api/proposals/${freshProposal.id}/approve`, {
    headers: authorization,
    data: { strong: false, confirmation: '' },
  });
  expect(approved.status()).toBe(200);
  await expect(panel.getByRole('button', { name: '已批准', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '执行并重新检查' })).toBeEnabled();
});
