import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { localizeCadWorkerFonts } from "./local-fonts.mjs";
const require = createRequire(import.meta.url);
const target = new URL("../../../public/viewer/cad/", import.meta.url);
await mkdir(target, { recursive: true });
const library = dirname(require.resolve("@mlightcad/cad-simple-viewer"));
const worker = await readFile(
  join(library, "mtext-renderer-worker.js"),
  "utf8",
);
await writeFile(
  new URL("mtext-renderer-worker.js", target),
  localizeCadWorkerFonts(worker),
);

// An empty local catalog explicitly advertises that no licensed CAD fonts ship.
// Deployments may supply licensed files and a catalog here; never use a CDN.
const fonts = new URL("fonts/", target);
await mkdir(fonts, { recursive: true });
await writeFile(new URL("fonts.json", fonts), "[]\n", { flag: "wx" }).catch(
  (error) => {
    if (error.code !== "EEXIST") throw error;
  },
);

await writeFile(
  new URL("capability.json", target),
  JSON.stringify({ name: "concord-cad-integration", version: "1.7.3" }) + "\n",
);
