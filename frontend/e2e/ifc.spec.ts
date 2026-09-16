import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext } from '@playwright/test';
import type { Workspace } from '../src/api/client';

const headers = { Authorization: 'Bearer local-demo-admin' };
const project = '/api/projects/harbor-east';
// Fail at test collection, rather than skip, when the real SDK fixture was not generated.
const fixture = fileURLToPath(new URL('../../fixtures/harbor-east.ifc', import.meta.url));
const original = readFileSync(fixture);
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');

async function workspace(request: APIRequestContext): Promise<Workspace> {
  const response = await request.get(`${project}/workspace`, { headers });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<Workspace>;
}

test('real IFC renders, matches analysis GUIDs, imports, and downloads unchanged', async ({ request, page }) => {
  const errors: string[] = [];
  const remote: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) remote.push(url.href);
  });
  const reset = await request.post('/api/demo/reset', { headers });
  expect(reset.status()).toBe(202);
  const resetRun = await reset.json();
  await expect.poll(async () => {
    const state = await workspace(request);
    return state.run?.id === resetRun.id && state.run.status === 'COMPLETED' && !state.stale;
  }).toBe(true);
  /*
   * The viewer highlights the analysis's own impact set, and the reset state is
   * clean by construction, so this test needs a real judgement that reports
   * impacts. The event is posted through the API rather than through 记录变更,
   * because the product path for recording a change - the composer, its menus, and
   * the blocked workspace that follows - is coordination.spec.ts's subject. This
   * file's subject is what the viewer does with the judgement, so the judgement is
   * established with the narrowest deterministic setup and the browser is then
   * required to render it.
   */
  const change = await request.post(`${project}/events`, { headers, data: {
    id: randomUUID(), project_id: 'harbor-east', work_package_id: 'WP-200',
    kind: 'design_revision', title: 'IFC E2E design update', change: { revision: 'V17' },
  } });
  expect(change.status()).toBe(202);
  let impacted: string[] = [];
  await expect.poll(async () => {
    const state = await workspace(request);
    impacted = state.analysis?.impact.element_ids ?? [];
    return !state.stale && impacted.length > 0;
  }).toBe(true);

  await page.addInitScript(() => sessionStorage.setItem('cca-token', 'local-demo-admin'));
  await page.goto('/');
  /*
   * The work package reports the judgement beside its own title, so the browser is
   * demonstrably rendering the same analysis whose impacted GUIDs the viewer is
   * about to match - not a second, unrelated state assembled for the assertion.
   */
  await expect(page.locator('.coordination-state-tag')).toContainText('已阻塞');
  await page.getByRole('navigation', { name: '工作区视图' }).getByRole('button', { name: 'BIM', exact: true }).click();
  const uploads: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/bim/import')) uploads.push(request.url());
  });
  await page.getByLabel('本地 IFC 文件', { exact: true }).setInputFiles(fixture);
  const viewer = page.getByLabel('IFC 模型查看器', { exact: true });
  await expect(viewer.locator('canvas')).toBeVisible();
  // Every GUID the analysis reports as impacted has to be found in the real model,
  // so the total is the analysis's own count and the matched count must be non-zero.
  await expect(viewer.getByRole('status')).toContainText(
    new RegExp(`[1-9]\\d*/${impacted.length} 个受影响构件 GUID`),
  );
  expect(uploads).toEqual([]); // Merely opening a local file must never upload it.
  await viewer.getByRole('button', { name: '聚焦', exact: true }).click();
  await expect(viewer.getByRole('button', { name: '隔离', exact: true })).toBeEnabled();
  await viewer.getByRole('button', { name: '隔离', exact: true }).click();
  await expect(viewer.getByRole('button', { name: '显示全部', exact: true })).toBeEnabled();
  await viewer.getByRole('button', { name: '显示全部', exact: true }).click();
  await expect(viewer.getByRole('button', { name: '聚焦', exact: true })).toBeEnabled();
  await expect(viewer.getByRole('alert')).toHaveCount(0);

  const upload = page.waitForResponse(response => response.request().method() === 'POST'
    && response.url().includes('/bim/import'));
  await page.getByRole('button', { name: '导入项目', exact: true }).click();
  expect((await upload).status()).toBe(202);
  await expect(page.locator('.bim-workspace').getByRole('status').filter({ hasText: '导入 已完成。' })).toBeVisible();
  expect(uploads).toHaveLength(1);
  const source = await request.get(`${project}/bim/content`, { headers });
  expect(source.status()).toBe(200);
  expect(digest(await source.body())).toBe(digest(original));
  const elements = await request.get(`${project}/bim/elements`, { headers });
  expect(elements.ok()).toBeTruthy();
  expect((await elements.json()).length).toBe(3);
  await page.getByRole('button', { name: '结构化视图', exact: true }).click();
  await expect(page.locator('.bim-element')).toHaveCount(3);
  await expect(viewer).toHaveCount(0);
  await page.getByRole('button', { name: '打开项目 IFC', exact: true }).click();
  await expect(viewer.getByRole('status')).toContainText(
    /project-import\.ifc：已匹配 [1-9]\d*\/[1-9]\d* 个受影响构件 GUID/,
  );
  await expect(viewer.getByRole('alert')).toHaveCount(0);
  expect(remote).toEqual([]); // WASM and fragment worker must be bundled locally.
  expect(errors).toEqual([]);
});
