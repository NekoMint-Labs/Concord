/** Bundle workers and WASM locally; the application must not fetch IFC engines from a CDN. */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdir, copyFile, readdir, stat, cp } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const target = new URL('../public/viewer/', import.meta.url);
await mkdir(new URL('wasm/', target), { recursive: true });
async function find(root, predicate, depth = 0) {
  if (depth > 4) return [];
  const found = [];
  for (const name of await readdir(root)) {
    const path = join(root, name);
    if ((await stat(path)).isDirectory() && name !== 'node_modules') found.push(...await find(path, predicate, depth + 1));
    else if (predicate(name)) found.push(path);
  }
  return found;
}
const fragments = dirname(require.resolve('@thatopen/fragments'));
const workers = await find(fragments, name => name === 'worker.mjs' || name === 'worker.js');
if (!workers[0]) throw new Error('Installed @thatopen/fragments does not expose its worker. Check the package version and asset path.');
await copyFile(workers[0], new URL('worker.mjs', target));
const wasm = await find(dirname(require.resolve('web-ifc')), name => name.endsWith('.wasm'));
if (!wasm.length) throw new Error('web-ifc WASM files not found.');
for (const file of wasm) await copyFile(file, new URL(`wasm/${file.split(/[\\/]/).pop()}`, target));
console.log(`Copied local fragment worker and ${wasm.length} IFC WASM assets.`);

// OpenTakeoff/PDF diff share one pinned, local PDF.js runtime and its assets.
const pdf = dirname(dirname(require.resolve('pdfjs-dist')));
const pdfTarget = new URL('pdf/', target);
await mkdir(pdfTarget, { recursive: true });
for (const directory of ['cmaps', 'standard_fonts']) {
  await cp(join(pdf, directory), new URL(`${directory}/`, pdfTarget), { recursive: true });
}
console.log('Copied local PDF.js CMaps and standard fonts.');
