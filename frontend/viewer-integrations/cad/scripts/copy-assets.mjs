import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const target = new URL("../../../public/viewer/cad/", import.meta.url);
await mkdir(target, { recursive: true });
const library = dirname(require.resolve("@mlightcad/cad-simple-viewer"));
await copyFile(
  join(library, "mtext-renderer-worker.js"),
  new URL("mtext-renderer-worker.js", target),
);

await writeFile(
  new URL("capability.json", target),
  JSON.stringify({ name: "concord-cad-integration", version: "1.7.3" }) + "\n",
);
