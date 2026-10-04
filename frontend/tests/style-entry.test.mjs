import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const entry = new URL("../src/styles.css", import.meta.url);
const source = readFileSync(entry, "utf8");
// Comments carry the reasoning for the import order; only rules are contracted.
const imports = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const VENDOR = [
  "./vendor/opentakeoff/styles/tokens.css",
  "./vendor/opentakeoff/styles/app.css",
  "./vendor/opentakeoff/styles/premiumWorkspace.css",
  "./vendor/opentakeoff/components/workspaceChrome.css",
  "./vendor/opentakeoff/components/workspacePanel.css",
];

test("the stylesheet entry keeps every import separate and terminated", () => {
  for (const line of imports) {
    assert.match(
      line,
      /^@import (?:url\(")?"?[^"\n]+"?"?\)?;$/,
      `Invalid stylesheet import: ${line}`,
    );
  }
  // Concord is local-first: the app must not fetch from the public internet at
  // load (`frontend/e2e/real-project.spec.ts` holds `remoteRequests === []`), so
  // the vendored donor's Google-Fonts import is deliberately not re-declared and
  // the donor stack falls back to system-ui.
  for (const line of imports)
    assert.doesNotMatch(
      line,
      /fonts\.(googleapis|gstatic)\.com/,
      `The stylesheet entry must not import remote fonts: ${line}`,
    );
  assert.deepEqual(imports.slice(0, 3), [
    '@import "tailwindcss";',
    '@import "@xyflow/react/dist/style.css";',
    '@import "maplibre-gl/dist/maplibre-gl.css";',
  ]);
});

test("ownership stylesheets are imported once and resolve to real source files", () => {
  const local = imports
    .slice(3)
    .filter((line) => !VENDOR.includes(line.match(/^@import "([^"]+)";$/)?.[1]))
    .map((line) => line.match(/^@import "(\.\/[^"\n]+)";$/)?.[1]);
  assert.ok(local.length > 0);
  assert.equal(new Set(local).size, local.length);
  for (const path of local) {
    assert.ok(
      path,
      "Only relative ownership stylesheet imports belong after vendor CSS",
    );
    assert.ok(existsSync(new URL(path, entry)), `Missing stylesheet: ${path}`);
  }
});

test("the vendored OpenTakeoff stylesheets are imported once, after base.css", () => {
  const declared = imports
    .map((line) => line.match(/^@import "([^"]+)";$/)?.[1])
    .filter((path) => path?.startsWith("./vendor/opentakeoff/"));
  assert.deepEqual(declared, VENDOR);
  for (const path of VENDOR)
    assert.ok(
      existsSync(new URL(path, entry)),
      `Missing vendored donor: ${path}`,
    );
  assert.ok(
    imports.indexOf('@import "./styles/base.css";') <
      imports.indexOf('@import "./vendor/opentakeoff/styles/tokens.css";'),
    "the donor palette must win the cascade over Concord's own tokens",
  );
});

test("ordinary donor actions have no competing shared native surface skin", () => {
  const css = (name) =>
    readFileSync(new URL(`../src/styles/${name}.css`, import.meta.url), "utf8");
  const controls = css("components");
  for (const name of [
    "button",
    "button-primary",
    "button-secondary",
    "button-ghost",
    "button-danger",
    "button-sm",
  ]) {
    assert.match(controls, new RegExp(`button\\.${name}\\s*\\{`));
    assert.doesNotMatch(controls, new RegExp(`(^|\\n)\\.${name}(?:[:\\s{])`));
  }
  const ui = css("ui");
  assert.doesNotMatch(ui, /\.app-select-/);
  const menu = ui.match(/\.menu-content\s*\{([^}]+)\}/)?.[1];
  assert.ok(menu);
  assert.doesNotMatch(menu, /(?:background|border|box-shadow)\s*:/);
  const trigger = controls.match(/\.icon-button\s*\{([^}]+)\}/)?.[1];
  assert.ok(trigger);
  assert.doesNotMatch(trigger, /(?:background|border|color)\s*:/);
});
