import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { localizeCadWorkerFonts } from "../scripts/local-fonts.mjs";

it("keeps the actual pinned worker font default local before SDK configuration", () => {
  const require = createRequire(import.meta.url);
  const original = readFileSync(
    join(
      dirname(require.resolve("@mlightcad/cad-simple-viewer")),
      "mtext-renderer-worker.js",
    ),
    "utf8",
  );
  const adapted = localizeCadWorkerFonts(original);
  expect(adapted).not.toContain(
    "https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/",
  );
  const local = 'new URL("./fonts/", self.location.href).href';
  expect(adapted.split(local)).toHaveLength(2);
  expect(
    adapted.replace(
      local,
      '"https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/"',
    ),
  ).toBe(original);
  expect(
    new URL("./fonts/", "http://localhost/viewer/cad/mtext-renderer-worker.js")
      .href,
  ).toBe("http://localhost/viewer/cad/fonts/");
});

it.each([
  "",
  '"https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/"'.repeat(2),
])(
  "rejects changed or ambiguous donor defaults rather than shipping a remote fallback",
  (source) =>
    expect(() => localizeCadWorkerFonts(source)).toThrow(
      "review the adaptation",
    ),
);
