import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

// The design contract lives in one place: src/styles/base.css. Feature
// stylesheets consume it, they never restate it.
//
// This file asserts *relationships*, not taste. Every number here is a threshold
// a design-system invariant actually depends on - "two neighbouring planes must
// be distinguishable", "product text must be readable on the darkest plane it
// lands on", "a control boundary must be identifiable". The values of the tokens
// themselves are the art direction's business and are deliberately not asserted,
// because pinning e.g. `--line: #dcdcd7` here would turn a palette decision into
// a test failure instead of a palette decision.
const stylesDir = fileURLToPath(new URL("../src/styles", import.meta.url));
const basePath = join(stylesDir, "base.css");
const base = readFileSync(basePath, "utf8");

function stylesheets(dir = stylesDir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

function hexToken(name) {
  const match = new RegExp(`--${name}: #([0-9a-f]{3}|[0-9a-f]{6});`).exec(base);
  assert.ok(match, `base.css must declare --${name} as a hex colour`);
  const digits = match[1];
  return `#${digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits}`;
}

function channels(hex) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  const linear = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** WCAG contrast ratio between two opaque colours. */
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

/** Composite an `rgba(r, g, b, a)` token over an opaque plane. */
function composite(name, over) {
  const match = new RegExp(
    `--${name}: rgba\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\s*\\)`,
  ).exec(base);
  assert.ok(match, `base.css must declare --${name} as an rgba colour`);
  const [red, green, blue, alpha] = match.slice(1).map(Number);
  const plane = channels(over);
  const mixed = [red, green, blue].map((value, index) =>
    Math.round(value * alpha + plane[index] * (1 - alpha)),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The structural ladder, ordered from the dimmest plane to the work plane. The
 * order is the design: navigation is the most receded plane, then secondary
 * panes and recessed wells, then chrome bands and pane headers, and the surface
 * you work on is the lightest thing on screen.
 */
const planes = [
  "bg-app",
  "surface-nav",
  "surface-detail",
  "surface-chrome",
  "surface-workspace",
];

/**
 * The smallest step two neighbouring planes may have. The rejected pass
 * separated its planes by about 1.06:1; at that size a plane change is invisible
 * next to the hairline drawn on top of it, which is how the shell turned into a
 * ruled table. 1.08 is the smallest step that survives next to real linework.
 */
const PLANE_STEP = 1.08;

/** Text may not fall below this on any plane it is allowed to land on. */
const TEXT_FLOOR = 4.5;

/** WCAG 1.4.11: a boundary that identifies a control. */
const CONTROL_FLOOR = 3;

test("the token scales keep one step per role", () => {
  const expected = [
    ["--radius-none", "0px"],
    ["--radius-sm", "4px"],
    ["--radius-md", "6px"],
    ["--radius-lg", "8px"],
    ["--radius-xl", "10px"],
    ["--motion-instant", "100ms"],
    ["--motion-fast", "120ms"],
    ["--motion", "160ms"],
  ];
  for (const [token, value] of expected) {
    assert.ok(
      base.includes(`${token}: ${value};`),
      `${token} drifted from ${value}; update the scale in base.css and this contract together`,
    );
  }
});

test("the structural planes are ordered by recession and stay distinguishable", () => {
  // Two neighbouring planes that differ by less than the step below do not read
  // as two planes. That failure is invisible in isolation and obvious in a
  // screenshot, so it is asserted here rather than trusted to review.
  const values = planes.map((name) => luminance(hexToken(name)));
  for (let index = 1; index < values.length; index += 1) {
    const ratio = contrast(
      hexToken(planes[index]),
      hexToken(planes[index - 1]),
    );
    assert.ok(
      ratio >= PLANE_STEP,
      `${planes[index]} to ${planes[index - 1]} is ${ratio.toFixed(3)}:1, below the ${PLANE_STEP}:1 plane step`,
    );
  }
  const workspace = luminance(hexToken("surface-workspace"));
  assert.equal(
    workspace,
    Math.max(...values),
    "the work plane must be the lightest structural plane on screen",
  );
  assert.equal(
    luminance(hexToken("bg-app")),
    Math.min(...values),
    "the window backdrop must be the dimmest structural plane",
  );
});

test("colour is declared once, in base.css", () => {
  const literal =
    /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|:\s*(?:white|black)\b/;
  const offenders = [];
  for (const path of stylesheets()) {
    if (path === basePath) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (literal.test(line)) {
        offenders.push(
          `${relative(stylesDir, path)}:${index + 1}: ${line.trim()}`,
        );
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Colour outside base.css must route through a token:\n${offenders.join("\n")}`,
  );
});

test("the semantic layer resolves to the physical ladder, not to new values", () => {
  // Product code and components/ui name a colour by what it is for. That layer
  // must stay an alias: if it ever declares its own value, the palette has two
  // owners and one of them will drift.
  const semantic = [
    "background",
    "workspace",
    "sidebar",
    "chrome",
    "surface-elevated",
    "border",
    "border-strong",
    "text",
    "text-secondary",
    "text-muted",
    "text-faint",
    "warning",
    "warning-muted",
    "focus-ring",
  ];
  for (const name of semantic) {
    const match = new RegExp(`--${name}: var\\(--([a-z0-9-]+)\\);`).exec(base);
    assert.ok(match, `--${name} must resolve to a physical token with var()`);
    assert.ok(
      new RegExp(`--${match[1]}: [#a-z]`).test(base),
      `--${name} points at --${match[1]}, which base.css does not declare`,
    );
  }
  for (const name of ["accent-muted", "success"]) {
    assert.ok(
      new RegExp(`--${name}: [#a-z]`).test(base),
      `--${name} is part of the semantic layer and must be declared in base.css`,
    );
  }
});

test("the spacing rhythm is one repeating step", () => {
  const steps = ["1", "2", "3", "4", "5", "6"];
  const values = steps.map((step) =>
    Number(new RegExp(`--space-${step}: (\\d+)px;`).exec(base)[1]),
  );
  assert.deepEqual(
    values,
    [...values].sort((a, b) => a - b),
    "the spacing scale must be monotonic",
  );
  assert.equal(values[0] % 4, 0, "the rhythm is based on 4px");
  assert.ok(
    values.every((value) => value % values[0] === 0),
    "every spacing step must be a multiple of the base step",
  );
});

test("the motion vocabulary stays a three-step ramp", () => {
  const ms = (token) =>
    Number(new RegExp(`--${token}: (\\d+)ms;`).exec(base)[1]);
  const [instant, fast, normal] = [
    ms("motion-instant"),
    ms("motion-fast"),
    ms("motion"),
  ];
  assert.ok(instant < fast && fast < normal, "the ramp must be ordered");
  assert.ok(normal <= 200, "a state change must not outlast 200ms");
});

test("radius is semantic: monotonic, and no structural surface reaches the dialog", () => {
  const steps = ["none", "sm", "md", "lg", "xl"];
  const values = steps.map((step) =>
    Number(new RegExp(`--radius-${step}: (\\d+)px;`).exec(base)[1]),
  );
  assert.deepEqual(
    values,
    [...values].sort((a, b) => a - b),
    "the radius scale must be monotonic",
  );
  assert.equal(values[0], 0, "a structural seam must be able to stay square");
  assert.equal(
    Math.max(...values),
    10,
    "no structural surface may reach the dialog radius",
  );
});

test("technical identifiers have one mono role", () => {
  assert.match(
    base,
    /--font-mono: /,
    "base.css must declare the technical face",
  );
  assert.match(base, /--font-ui:/, "base.css must declare the interface face");
  const offenders = [];
  for (const path of stylesheets()) {
    if (path === basePath) continue;
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (
          /font-family:/.test(line) &&
          !/var\(--font-(?:mono|ui)\)/.test(line)
        ) {
          offenders.push(`${relative(stylesDir, path)}:${index + 1}`);
        }
      });
  }
  assert.deepEqual(
    offenders,
    [],
    `Mono must route through --font-mono:\n${offenders.join("\n")}`,
  );
});

test("reduced motion is honoured globally rather than per selector", () => {
  assert.match(
    base,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{/,
    "base.css must collapse every duration under prefers-reduced-motion",
  );
});

test("the neutral ladder stays neutral, cool-stone, and never blue", () => {
  // The ladder is neutral graphite with a whisper of cool.
  //
  // This assertion used to require a *warm* bias (`r >= g >= b`) on every
  // neutral, which is the direction the palette review rejected: at these
  // densities a few points of warmth in every plane read as a yellow-green cast
  // rather than as material, and the workspace looked dirty next to the white
  // objects sitting on it. Warmth and cold are both failures at the extremes -
  // a cream ladder turns the product into a theme, and a blue-grey ladder reads
  // as an absence of colour - so the contract now holds the whole ladder inside a
  // narrow band around true neutral instead of pinning it to one side of it.
  //
  // `blue - red` is the axis that matters: it is what separates "clean graphite"
  // from both "muddy olive" (well negative) and "blue" (well positive). The
  // band is wide enough to let the ladder carry a cool cast and no wider.
  const neutral = [
    ...planes,
    "surface",
    "line",
    "line-soft",
    "line-control",
    "line-float",
    "ink",
    "ink-2",
    "muted",
    "muted-2",
  ];
  for (const name of neutral) {
    const hex = hexToken(name);
    const [r, g, b] = channels(hex);
    assert.ok(
      Math.max(r, g, b) - Math.min(r, g, b) <= 12,
      `--${name} (${hex}) is too saturated for the neutral ladder; saturation belongs to --accent and the warning family`,
    );
    assert.ok(
      b - r >= -3 && b - r <= 7,
      `--${name} (${hex}) is off the neutral axis (blue - red = ${b - r}); the ladder is graphite with a whisper of cool, neither a warm cast nor a blue grey`,
    );
  }
});

test("every text token clears AA against every plane it can land on", () => {
  // The reference plane is the darkest structural plane a token can land on
  // (--surface-nav), which is what pulled --muted-2 down when the ladder
  // darkened. --background is the window backdrop and only ever carries the
  // startup surface and the canvas label, so only those two are checked there.
  for (const name of ["ink", "ink-2", "muted"]) {
    for (const plane of planes) {
      const ratio = contrast(hexToken(name), hexToken(plane));
      assert.ok(
        ratio >= TEXT_FLOOR,
        `--${name} is ${ratio.toFixed(2)}:1 on --${plane}, below the ${TEXT_FLOOR}:1 AA floor`,
      );
    }
    const onBackdrop = contrast(hexToken(name), hexToken("bg-app"));
    assert.ok(
      onBackdrop >= TEXT_FLOOR,
      `--${name} is ${onBackdrop.toFixed(2)}:1 on the window backdrop`,
    );
  }
  for (const name of ["muted-2", "warn-fg", "danger-fg"]) {
    for (const plane of [
      "surface-nav",
      "surface-detail",
      "surface-chrome",
      "surface-workspace",
      "surface",
    ]) {
      const ratio = contrast(hexToken(name), hexToken(plane));
      assert.ok(
        ratio >= TEXT_FLOOR,
        `--${name} is ${ratio.toFixed(2)}:1 on --${plane}, below the ${TEXT_FLOOR}:1 AA floor`,
      );
    }
  }
});

test("a control boundary is identifiable, and a content rule is visible where it is drawn", () => {
  // WCAG 1.4.11 for controls: a boundary that identifies a control has to be
  // identifiable *wherever the control is placed*, which includes the darker
  // navigation plane the project picker sits on - a tone tuned only against
  // white passes the common case and fails the one that matters.
  for (const plane of [
    "surface",
    "surface-nav",
    "surface-detail",
    "surface-chrome",
  ]) {
    const ratio = contrast(hexToken("line-control"), hexToken(plane));
    assert.ok(
      ratio >= CONTROL_FLOOR,
      `--line-control is ${ratio.toFixed(2)}:1 on --${plane}; a control boundary must clear ${CONTROL_FLOOR}:1`,
    );
  }
  for (const name of ["line", "line-soft"]) {
    const ratio = contrast(hexToken(name), hexToken("surface-workspace"));
    assert.ok(
      ratio >= 1.15,
      `--${name} is ${ratio.toFixed(3)}:1 on the work plane; a content rule drawn there must stay visible`,
    );
  }
  const floatEdge = contrast(hexToken("line-float"), hexToken("surface"));
  assert.ok(
    floatEdge >= 1.3,
    `--line-float is ${floatEdge.toFixed(3)}:1 on --surface; a floating surface must close its own shape`,
  );
});

test("the document shell declares no palette value of its own", () => {
  // index.html sits outside the token layer, so the contract test that scans
  // src/styles cannot see it. The window tint has to be a literal there (HTML
  // cannot read a custom property), so the rule is narrower and still real: it
  // must be a value the ladder already declares, and it must be the only literal
  // in the file. A second one would be a second owner of a palette value.
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const literals = [
    ...html.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/g),
  ].map((match) => match[0]);
  const tint = /<meta\s+name="theme-color"\s+content="(#[0-9a-f]{6})"/.exec(
    html,
  )?.[1];
  assert.ok(tint, "index.html must declare a theme-color tint");
  assert.deepEqual(
    literals,
    [tint],
    "the window tint must be the only colour literal in index.html",
  );
  const ladder = new Set(
    [...base.matchAll(/--[a-z0-9-]+: (#[0-9a-f]{6});/g)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  assert.ok(
    ladder.has(tint.toLowerCase()),
    `the window tint ${tint} is not a value declared in the token ladder`,
  );
});

test("the accent has area, and position never reads as exception", () => {
  // The accent is a surface now, not only a 1-2px indicator, so the selected
  // state has to be a visible step on both planes a selected row can sit on -
  // the recessed pane plane (a source list) and the work plane (a reading
  // surface). If this ever stops clearing a visible step, selection has quietly
  // gone back to being one hairline.
  for (const plane of [
    "surface-workspace",
    "surface-detail",
    "surface-chrome",
  ]) {
    const surface = composite("accent-muted", hexToken(plane));
    const ratio = contrast(surface, hexToken(plane));
    assert.ok(
      ratio >= 1.08,
      `an accent-muted selection on --${plane} is only ${ratio.toFixed(3)}:1`,
    );
  }
  // The denser step exists for a mark inside running text, so it has to be a
  // *highlight* rather than a selection tint: a found match must be the first
  // thing the eye lands on in a paragraph.
  const highlight = composite("accent-strong", hexToken("surface-workspace"));
  const highlightRatio = contrast(highlight, hexToken("surface-workspace"));
  assert.ok(
    highlightRatio >= 1.25,
    `an accent-strong match highlight on the work plane is only ${highlightRatio.toFixed(3)}:1`,
  );
  const onHighlight = contrast(hexToken("ink"), highlight);
  assert.ok(
    onHighlight >= TEXT_FLOOR,
    `body ink on an accent-strong highlight is ${onHighlight.toFixed(2)}:1`,
  );
  // The primary control is the accent's own family taken to a working depth, not
  // a second colour: a committed action and the current position have to belong
  // to one identity, and white has to survive on the fill. This is what replaced
  // a neutral-black button, which read as a generic template control.
  for (const name of ["primary", "primary-hover"]) {
    const [r, g, b] = channels(hexToken(name));
    assert.ok(
      b > r && b > g,
      `--${name} must stay in the accent's cool family; a committed action shares the product's identity rather than starting a second one`,
    );
    const onPrimary = contrast(hexToken("on-primary"), hexToken(name));
    assert.ok(
      onPrimary >= TEXT_FLOOR,
      `the primary label is ${onPrimary.toFixed(2)}:1 on --${name}, below the ${TEXT_FLOOR}:1 AA floor`,
    );
  }
  // One accent family, and hues that cannot be confused: position is cool,
  // exception and danger are warm, health is green.
  const cool = channels(hexToken("accent"));
  assert.ok(
    cool[2] > cool[0] && cool[2] > cool[1],
    "--accent must stay a cool hue",
  );
  for (const name of ["warn-fg", "danger-fg"]) {
    const [r, g, b] = channels(hexToken(name));
    assert.ok(
      r > g && g >= b,
      `--${name} must stay a warm hue, distinct from position`,
    );
  }
  const success = channels(hexToken("success"));
  assert.ok(
    success[1] > success[0],
    "--success must not drift into the accent or the warning family",
  );
});
