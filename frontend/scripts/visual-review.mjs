// Real API + real IFC browser screenshots for six Concord work surfaces.
// Start scripts/e2e_backend.py against a fresh isolated store and build frontend first.
import { chromium, request } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseURL = process.env.CCA_VISUAL_URL ?? 'http://127.0.0.1:18000';
const output = new URL('../../artifacts/', import.meta.url);
const prefix = process.env.CCA_VISUAL_PREFIX ?? 'baseline';
const api = await request.newContext({ baseURL, extraHTTPHeaders: { Authorization: 'Bearer local-demo-admin' } });
const path = '/api/projects/harbor-east';
async function json(response) {
  if (!response.ok()) throw new Error(`${response.url()} ${response.status()} ${await response.text()}`);
  return response.json();
}
async function poll(fn, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await fn()) return; } catch { /* an import may not have committed yet */ }
    await new Promise(resolve => setTimeout(resolve, 900));
  }
  throw new Error('Visual-review data did not become ready');
}
const [source] = await json(await api.get(`${path}/sources`));
let sourceId = source?.source.id;
if (!sourceId) {
  sourceId = (await json(await api.post(`${path}/sources`, { data: { name: 'East Wing MEP', kind: 'BIM' } }))).id;
  const uploaded = [];
  for (const [name, label] of [['harbor-east-v16.ifc', 'V16'], ['concord-review.ifc', 'V17']]) {
    const result = await json(await api.post(`${path}/sources/${sourceId}/revisions`, {
      multipart: { file: { name, mimeType: 'application/octet-stream', buffer: await readFile(`${root}fixtures/${name}`) }, external_label: label },
    }));
    uploaded.push(result.revision.id);
    const run = await json(await api.post(`${path}/sources/${sourceId}/revisions/${result.revision.id}/import`));
    await poll(async () => (await json(await api.get(`/api/runs/${run.id}`))).status === 'COMPLETED');
    await poll(async () => (await api.get(`${path}/sources/${sourceId}/revisions/${result.revision.id}/bim-snapshot`)).ok());
  }
  await json(await api.post(`${path}/baselines`, { data: { name: 'B1', entries: [{ source_id: sourceId, revision_id: uploaded[0] }] } }));
  const compared = await json(await api.post(`${path}/sources/${sourceId}/bim-comparisons`, { data: { from_revision_id: uploaded[0], to_revision_id: uploaded[1] } }));
  console.log('Comparison:', compared.changes.length, 'real IFC changes');
}
// Local profile uses the lightweight parser (text/Markdown only); do not stage an unsupported PDF.
const events = await json(await api.get(`${path}/workspace`));
if (!events.analysis?.impact?.element_ids?.length) {
  const run = await json(await api.post(`${path}/events`, { data: { id: randomUUID(), project_id: 'harbor-east', work_package_id: 'WP-200', kind: 'design_revision', title: 'Revised duct route V17', change: { revision: 'V17' } } }));
  await poll(async () => ['COMPLETED','WAITING_APPROVAL'].includes((await json(await api.get(`/api/runs/${run.id}`))).status));
}
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle','--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1365, height: 637 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { sessionStorage.setItem('cca-token','local-demo-admin'); localStorage.setItem('concord:last-project','harbor-east'); });
await page.goto(baseURL);
const nav = page.getByRole('navigation',{name:'主要工作区'});
async function loaded(expected = '') {
  const viewer = page.getByLabel('IFC 模型查看器');
  await viewer.locator('canvas').first().waitFor({timeout:120_000});
  await viewer.getByRole('status').filter({hasText: expected ? new RegExp(`${expected.replace('.', '\\.') }：已匹配`) : /已匹配/}).waitFor({timeout:120_000});
  if (await viewer.getByRole('alert').count()) throw new Error(await viewer.getByRole('alert').innerText());
  await page.waitForTimeout(700);
  return viewer.getByRole('status').innerText();
}
async function shot(name) {
  await page.screenshot({path: fileURLToPath(new URL(`${prefix}-${name}.png`, output))});
  console.log(`${name}: ${await page.locator('.app-header').innerText()}`);
}
try {
  await loaded(); await shot('model');
  await nav.getByRole('button',{name:'Changes'}).click(); await loaded('R2.ifc'); await page.getByRole('button',{name:'Expand context list'}).click(); await page.locator('.spatial-context tbody tr').first().waitFor(); await page.getByRole('button',{name:'Collapse context list'}).click(); await shot('changes');
  await nav.getByRole('button',{name:'Issues'}).click(); await loaded('current-model.ifc'); await page.locator('.spatial-context-tabs button').filter({hasText:'Issues'}).click(); await page.locator('.spatial-context tbody tr').first().click(); await page.getByRole('button',{name:'Collapse context list'}).click(); await shot('issues');
  await page.getByRole('button',{name:'Review resolution →'}).click();
  await page.getByLabel('判断依据与处理详情').getByText('东翼风管安装').first().waitFor();
  await page.getByLabel('判断依据与处理详情').getByRole('button',{name:'关闭详情'}).click();
  await nav.getByRole('button',{name:'Documents'}).click(); await page.locator('.document-content .document-chunk').first().waitFor(); await shot('documents');
  await nav.getByRole('button',{name:'Work Packages'}).click(); await page.getByRole('region',{name:'工作包概览'}).waitFor(); await page.locator('.overview-model-stage').getByRole('status').filter({hasText:/已匹配/}).waitFor({timeout:120_000}); await shot('work-packages');
  await nav.getByRole('button',{name:'Overview'}).click(); await page.getByRole('region',{name:'工作包概览'}).waitFor(); await page.locator('.overview-model-stage').getByRole('status').filter({hasText:/已匹配/}).waitFor({timeout:120_000}); await page.waitForTimeout(1200); await shot('overview');
  // Investigation must use the real UI action and wait for the authoritative report.
  await nav.getByRole('button',{name:'Changes'}).click(); await loaded('R2.ifc');
  await page.getByRole('button',{name:'Investigate change →'}).click();
  await page.getByLabel('工程调查详情').waitFor({timeout:90_000});
  await page.getByLabel('工程调查详情').locator('.investigation-answer').waitFor({timeout:120_000});
  await page.locator('.investigation-model').getByRole('status').filter({hasText:/已匹配/}).waitFor({timeout:120_000});
  await page.waitForTimeout(1200);
  await shot('investigation');
  console.log('Issue resolution opened its owning work package; browser errors:',errors);
} finally { await browser.close(); await api.dispose(); }
