import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const entry = new URL("../src/styles.css", import.meta.url);
const imports = readFileSync(entry, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

test("the stylesheet entry keeps every import separate and terminated", () => {
  for (const line of imports) {
    assert.match(
      line,
      /^@import "[^"\n]+";$/,
      `Invalid stylesheet import: ${line}`,
    );
  }
  assert.deepEqual(imports.slice(0, 3), [
    '@import "tailwindcss";',
    '@import "@xyflow/react/dist/style.css";',
    '@import "maplibre-gl/dist/maplibre-gl.css";',
  ]);
});

test("ownership stylesheets are imported once and resolve to real source files", () => {
  const local = imports
    .slice(3)
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
