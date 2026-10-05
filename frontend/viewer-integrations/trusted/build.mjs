/** Build only from the existing frozen frontend/CAD locks; no runtime dev server. */
import { spawnSync } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const frontend = fileURLToPath(new URL("../../", import.meta.url));
for (const config of [
  "viewer-integrations/trusted/vite.config.ts",
  "viewer-integrations/trusted/vite.normalize.config.ts",
]) {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../../node_modules/vite/bin/vite.js", import.meta.url),
      ),
      "build",
      "--config",
      config,
    ],
    { cwd: frontend, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const target = new URL("./dist/web/viewer/", import.meta.url);
await mkdir(target, { recursive: true });
for (const directory of ["pdf", "cad"])
  await cp(
    new URL(`../../public/viewer/${directory}/`, import.meta.url),
    new URL(`${directory}/`, target),
    { recursive: true },
  );
const { versions } = await import("./dist/mapper/normalization.mjs");
await writeFile(
  new URL("./dist/manifest.json", import.meta.url),
  JSON.stringify({ schema: 1, versions }),
);
