import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// The design contract.
//
// Every assertion below is a *relationship* a design system depends on - "two
// neighbouring planes must be distinguishable", "product text must be readable on
// the darkest plane it lands on", "a control boundary must be identifiable" - or a
// structural fact about *where* a value may be written. No assertion pins an
// individual colour value, because that would turn an art-direction decision into a
// test failure instead of an art-direction decision.
//
// Ownership, which is what makes the rest checkable:
//
//   styles/concord/tokens.css   the palette: every colour literal in the product,
//                               both looks, the token bridge, and the ThatOpen
//                               component bridge
//   styles/base.css             the scales (type, space, controls, radius, motion)
//                               and the semantic colour names, with no literal
//   styles/concord/*.css        the material, spent through tokens
//   vendor/opentakeoff/**       byte-pinned donor sheets, which may not be edited and
//                               whose values are therefore owned by the palette
// ─────────────────────────────────────────────────────────────────────────────

const stylesDir = fileURLToPath(new URL("../src/styles", import.meta.url));
const palettePath = join(stylesDir, "concord/tokens.css");
const basePath = join(stylesDir, "base.css");
const entryPath = join(stylesDir, "../styles.css");
const palette = readFileSync(palettePath, "utf8");
const base = readFileSync(basePath, "utf8");
const entrySheet = readFileSync(entryPath, "utf8");

/** Every `--name: value;` declaration inside one scope. */
function declarations(text) {
  const out = new Map();
  for (const [, name, value] of text.matchAll(/--([a-z0-9_-]+):\s*([^;]+);/g)) {
    out.set(name, value.trim());
  }
  return out;
}

const at = (needle) => {
  const index = palette.indexOf(needle);
  assert.ok(index !== -1, `tokens.css must declare ${needle}`);
  return index;
};

const lightPalette = declarations(
  palette.slice(0, at(':root[data-concord-look="dark"]')),
);
const darkPalette = declarations(
  palette.slice(at(':root[data-concord-look="dark"]'), at("── Token bridge")),
);
/*
 * The two look scopes, so each ladder can be asserted on its own, and the alias bridge,
 * which is declared once on `:root` and once on the shell scope.
 */
const lightLook = palette.slice(0, at(':root[data-concord-look="dark"]'));
const darkLook = palette.slice(
  at(':root[data-concord-look="dark"]'),
  at("── Token bridge"),
);
const bridge = declarations(
  palette.slice(at("── Token bridge"), at("The instrument-band vocabulary")),
);
const baseDeclarations = declarations(base);

/** The look a `--c-*` name resolves to, given the scope's own declaration map. */
const raw = (name, look) => {
  const scope = look === "dark" ? darkPalette : lightPalette;
  const value = scope.get(`c-${name}`) ?? lightPalette.get(`c-${name}`);
  assert.ok(value, `the palette must declare --c-${name}`);
  return value;
};

const channels = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));

const luminance = (hex) => {
  const linear = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

/** WCAG contrast ratio between two opaque colours. */
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

/** Flatten an `rgb(r g b / a)` value (channels may be a `--c-*-rgb` triplet) over a plane. */
function composite(value, over, look) {
  const rgb = /rgb\(\s*([\d, ]+)\s*(?:\/\s*([\d.]+)\s*)?\)/.exec(value);
  assert.ok(rgb, `expected an rgb() colour, got ${value}`);
  const parts = rgb[1].split(/[,\s]+/).filter(Boolean).map(Number);
  assert.equal(parts.length, 3, `expected three channels in ${value}`);
  const alpha = rgb[2] === undefined ? 1 : Number(rgb[2]);
  const plane = channels(over);
  const mixed = parts.map((part, index) =>
    Math.round(part * alpha + plane[index] * (1 - alpha)),
  );
  void look;
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The structural ladder, dimmest plane first. The order is the design: the window
 * backdrop is the dimmest thing on screen, then a docked column, then the plane you
 * work on, then the objects that sit on top of it.
 *
 * The dark look runs the same order rather than the inverse: elevation is a *value*
 * relationship in both looks, so "where I am working" is always the lighter of the two
 * planes beside it.
 */
const PLANES = ["backdrop", "nav", "work", "raised"];

/** Text may not fall below this on any plane it is allowed to land on. */
const TEXT_FLOOR = 4.5;
/** WCAG 1.4.11: a boundary that identifies a control. */
const CONTROL_FLOOR = 3;
/** The point at which an area difference starts to be seen as two materials. */
const PLANE_STEP = 1.08;

test("the scale layer holds one step per role", () => {
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

test("the type ramp is monotonic and never falls below the 12px reading floor", () => {
  const order = [
    "fs-display",
    "fs-title",
    "fs-section",
    "fs-body",
    "fs-action",
    "fs-meta",
    "fs-label",
  ];
  const sizes = order.map((name) =>
    Number(new RegExp(`--${name}: (\\d+)px;`).exec(base)[1]),
  );
  assert.deepEqual(
    sizes,
    [...sizes].sort((a, b) => b - a),
    "the type ramp must be monotonic",
  );
  assert.ok(
    Math.min(...sizes) >= 12,
    "no text role may fall below 12px: below that a reader stops reading and starts decoding",
  );
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

test("reduced motion is honoured globally rather than per selector", () => {
  assert.match(
    base,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{/,
    "base.css must collapse every duration under prefers-reduced-motion",
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

function stylesheets(dir = stylesDir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

test("colour is declared once, in the palette", () => {
  // One owner, and it is a file you can read top to bottom. Any other sheet that
  // writes a literal has started a second palette, which is how the previous
  // direction ended up with 130 hard-coded greys and eleven near-identical planes.
  const literal =
    /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|:\s*(?:white|black)\b/;
  const offenders = [];
  for (const path of stylesheets()) {
    if (path === palettePath) continue;
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, index) => {
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
    `Colour outside tokens.css must route through a token:\n${offenders.join("\n")}`,
  );
});

test("the semantic layer resolves to the palette, not to new values", () => {
  // Product code and every component under components/ui name a colour by what it is
  // for. That layer must stay an alias: if it ever declares its own value the palette
  // has two owners, and one of them will drift.
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
    "success",
    "focus-ring",
  ];
  for (const name of semantic) {
    const value = baseDeclarations.get(name);
    assert.ok(value, `--${name} must be declared in base.css`);
    const reference = /^var\(--c-([a-z0-9-]+)\)$/.exec(value);
    assert.ok(
      reference,
      `--${name} must resolve to a --c-* palette token, got ${value}`,
    );
    assert.ok(
      lightPalette.has(`c-${reference[1]}`),
      `--${name} points at --c-${reference[1]}, which the palette does not declare`,
    );
  }
});

test("every alias in the bridge names a palette token", () => {
  // The bridge is what lets three vocabularies - Concord's own names, the vendored
  // OpenTakeoff names, and the accumulated --concord-* feature names - resolve onto one
  // palette. An alias that points at a token nobody declares resolves to nothing, and a
  // property that resolves to nothing is an invisible failure.
  assert.ok(bridge.size > 60, "the bridge must keep the full alias set");
  for (const [name, value] of bridge) {
    const references = [...value.matchAll(/var\(--([a-z0-9_-]+)\)/g)].map(
      (match) => match[1],
    );
    if (!references.length) {
      // a few aliases are structural (e.g. `--glow: none`), which is intentional
      continue;
    }
    for (const reference of references) {
      assert.ok(
        lightPalette.has(reference) ||
          bridge.has(reference) ||
          baseDeclarations.has(reference) ||
          /^c-/.test(reference),
        `--${name} points at --${reference}, which nothing declares`,
      );
    }
  }
  // The donor's own names must be declared by the palette, because the vendored sheets
  // are byte-pinned and cannot be edited: they can only be re-pointed.
  for (const donorName of [
    "paper-bright",
    "paper-cream",
    "paper-shadow",
    "ink",
    "ink-soft",
    "ink-muted",
    "ink-faint",
    "cobalt",
    "cobalt-deep",
    "accent-contrast",
    "status-bg",
    "status-fg",
    "status-acc",
    "workspace-face",
    "workspace-active-face",
    "workspace-glow",
    "stage",
    "well",
  ]) {
    assert.ok(
      bridge.has(donorName),
      `the bridge must re-point the donor token --${donorName}`,
    );
  }
  // ...and the donor's generated faces must be neutralised: this product has no
  // gradients and no glow.
  for (const flattened of ["workspace-glow", "glow"]) {
    assert.equal(
      bridge.get(flattened),
      "none",
      `--${flattened} must be flattened to none`,
    );
  }
});

test("the bridge is declared on the shell as well as :root", () => {
  // The vendored premiumWorkspace.css re-declares --cobalt, --paper-*, --ink-* and
  // --stage per look *on the shell element*, at a specificity that outranks a plain
  // :root copy. An alias declared only on :root therefore loses inside the window -
  // which is exactly the failure that left the donor's blue on every Concord control.
  const scopes = palette.match(
    /\.app-shell\.premium-workspace\[data-workspace-look\]\s*\{/g,
  );
  assert.equal(
    scopes?.length,
    1,
    "the shell scope must carry one bridge copy",
  );
  const shellAt = palette.indexOf(".app-shell.premium-workspace[");
  const shellDeclarations = declarations(
    palette.slice(shellAt, palette.indexOf("\n}", shellAt)),
  );
  let covered = 0;
  for (const [name, value] of bridge) {
    // The look-dependent names have to be mirrored - that is the point of the second
    // copy. The `--concord-*` feature aliases are look-independent (they resolve to
    // other aliases), and `--stage` is the one name the two looks place differently.
    if (name.startsWith("concord-") || name === "stage") continue;
    assert.equal(
      shellDeclarations.get(name),
      value,
      `--${name} must be identical on :root and on the shell scope`,
    );
    covered += 1;
  }
  assert.ok(
    covered > 50,
    `the shell scope must mirror the look-dependent bridge (only ${covered} names matched)`,
  );
});

test("both looks spend one step per structural role, in order", () => {
  for (const look of ["light", "dark"]) {
    for (let step = 1; step < PLANES.length; step += 1) {
      const ratio = contrast(
        raw(PLANES[step - 1], look),
        raw(PLANES[step], look),
      );
      assert.ok(
        ratio >= PLANE_STEP,
        `${look}: ${PLANES[step - 1]} to ${PLANES[step]} is only ${ratio.toFixed(3)}:1; neighbouring planes must read as two materials`,
      );
    }
  }
});

test("the instrument frame is a different material from the page", () => {
  // The frame is dark in BOTH looks and that is the point: it states where the
  // application ends and the document begins, and it is why a window of panels does
  // not read as one pale slab. Asserted as a *material* relationship, not a direction.
  for (const look of ["light", "dark"]) {
    const frame = raw("chrome", look);
    for (const plane of ["work", "nav"]) {
      const page = raw(plane, look);
      const ratio = contrast(frame, page);
      const floor = look === "light" ? 4 : 1.25;
      assert.ok(
        ratio >= floor,
        `${look}: the frame is only ${ratio.toFixed(2)}:1 from --c-${plane}; the instrument must be a different material from the page`,
      );
    }
    assert.ok(
      luminance(frame) < luminance(raw("work", look)),
      `${look}: the frame must be the darker of the two, or it stops reading as the instrument around the document`,
    );
  }
});

test("every text tier clears AA against every plane it can land on", () => {
  for (const look of ["light", "dark"]) {
    for (const ink of ["ink", "ink-2", "ink-3", "ink-4"]) {
      for (const plane of PLANES) {
        const ratio = contrast(raw(ink, look), raw(plane, look));
        assert.ok(
          ratio >= TEXT_FLOOR,
          `${look}: --c-${ink} is ${ratio.toFixed(2)}:1 on --c-${plane}, below the ${TEXT_FLOOR}:1 AA floor`,
        );
      }
    }
    // The frame's own ink, against the frame.
    for (const ink of ["chrome-ink", "chrome-ink-2"]) {
      const ratio = contrast(raw(ink, look), raw("chrome", look));
      assert.ok(
        ratio >= TEXT_FLOOR,
        `${look}: --c-${ink} is ${ratio.toFixed(2)}:1 on the frame`,
      );
    }
    // Status colours are text colours: they are read as state, in a chip or as a word.
    for (const status of ["positive", "warning", "danger", "info"]) {
      for (const plane of ["nav", "work"]) {
        const ratio = contrast(raw(status, look), raw(plane, look));
        assert.ok(
          ratio >= TEXT_FLOOR,
          `${look}: --c-${status} is ${ratio.toFixed(2)}:1 on --c-${plane}`,
        );
      }
    }
  }
});

test("a control boundary is identifiable, and a content rule is visible where it is drawn", () => {
  for (const look of ["light", "dark"]) {
    // `--line-control` may land on any plane, including the darkest one.
    for (const plane of PLANES) {
      const ratio = contrast(raw("line-control", look), raw(plane, look));
      assert.ok(
        ratio >= CONTROL_FLOOR,
        `${look}: --c-line-control is ${ratio.toFixed(2)}:1 on --c-${plane}; a control boundary must clear ${CONTROL_FLOOR}:1 wherever it is placed`,
      );
    }
    // `-soft` is the quieter boundary, spent only on the light planes where most
    // controls actually sit.
    for (const plane of ["nav", "work", "raised"]) {
      const ratio = contrast(
        raw("line-control-soft", look),
        raw(plane, look),
      );
      assert.ok(
        ratio >= CONTROL_FLOOR,
        `${look}: --c-line-control-soft is ${ratio.toFixed(2)}:1 on --c-${plane}; it may only be spent where it clears the floor`,
      );
    }
    assert.ok(
      contrast(raw("line-control-soft", look), raw("work", look)) <
        contrast(raw("line-control", look), raw("work", look)),
      `${look}: --c-line-control-soft must be the quieter of the two, or the split has no reason to exist`,
    );
    // A content rule has no contrast floor, but it must be visible on the plane it is
    // drawn on: an invisible hairline is a table that lost its rows.
    const rule = contrast(raw("line", look), raw("work", look));
    assert.ok(
      rule >= 1.1,
      `${look}: --c-line is ${rule.toFixed(3)}:1 on --c-work; a content rule must stay visible`,
    );
    const floatEdge = contrast(raw("line-float", look), raw("raised", look));
    assert.ok(
      floatEdge >= 1.15,
      `${look}: --c-line-float is ${floatEdge.toFixed(3)}:1 on --c-raised; a floating surface must close its own shape`,
    );
  }
});

test("the accent is warm, saturated, and carries its own label", () => {
  for (const look of ["light", "dark"]) {
    const accent = raw("accent", look);
    const [r, g, b] = channels(accent);
    assert.ok(
      r > g && g > b,
      `${look}: --c-accent (${accent}) must stay a warm hue; position belongs to one warm family, not a second colour`,
    );
    // Saturated, unlike the exception family: a state must be separable from the accent
    // by chroma and not only by hue, because hue alone is the one signal a colour-blind
    // reader does not have.
    assert.ok(
      Math.max(r, g, b) - Math.min(r, g, b) > 80,
      `${look}: --c-accent (${accent}) is too desaturated to be read as "current position"`,
    );
    for (const name of ["accent", "accent-deep"]) {
      const ratio = contrast(raw("on-accent", look), raw(name, look));
      assert.ok(
        ratio >= TEXT_FLOOR,
        `${look}: the label on --c-${name} is ${ratio.toFixed(2)}:1, below the ${TEXT_FLOOR}:1 floor`,
      );
    }
  }
  // The exception family is ochre and rust: warm, but low-chroma, so it never reads as
  // the accent.
  for (const look of ["light", "dark"]) {
    for (const name of ["warning", "danger"]) {
      const [r, g, b] = channels(raw(name, look));
      assert.ok(
        r > b,
        `${look}: --c-${name} must stay a warm hue, distinct from a cool information colour`,
      );
    }
    const [pr, pg] = channels(raw("positive", look));
    assert.ok(
      pg >= pr,
      `${look}: --c-positive must not drift into the accent or the exception family`,
    );
  }
});

test("a selection has area, and a match inside running text is a highlight", () => {
  // Selection is a surface, not only a 1-2px indicator, so it has to be a visible step
  // on both planes a selected row can sit on: a docked panel and the work plane.
  for (const look of ["light", "dark"]) {
    const tint = {
      ...palette,
    };
    const accentRgb = raw("accent-rgb", look);
    const selection = `rgb(${accentRgb} / ${look === "dark" ? 0.15 : 0.11})`;
    for (const plane of ["nav", "work", "chrome-band"]) {
      const surface = composite(selection, raw(plane, look), look);
      const ratio = contrast(surface, raw(plane, look));
      assert.ok(
        ratio >= 1.08,
        `${look}: a selection tint on --c-${plane} is only ${ratio.toFixed(3)}:1`,
      );
    }
    // The denser step exists for a match inside running text, so it has to be a
    // highlight rather than a selection tint.
    const highlight = composite(
      `rgb(${accentRgb} / ${look === "dark" ? 0.27 : 0.2})`,
      raw("work", look),
      look,
    );
    const ratio = contrast(highlight, raw("work", look));
    assert.ok(
      ratio >= 1.25,
      `${look}: an accent-strong match on the work plane is only ${ratio.toFixed(3)}:1`,
    );
    void tint;
  }
});

test("the neutral ladder is warm stone, never cream and never grey", () => {
  // Warmth is the material: a few degrees of it is what stops the product reading as
  // an absence of colour. The failure modes on either side are real - a saturated cream
  // turns the product into a theme, and a cool grey reads as a default - so the whole
  // ladder is held inside a narrow band: warm (red above blue) and low-chroma.
  const neutral = [
    ...PLANES,
    "detail",
    "list",
    "chrome-band",
    "canvas",
    "inset",
    "line",
    "line-soft",
    "line-control",
    "line-control-soft",
    "line-float",
    "well",
  ];
  for (const look of ["light", "dark"]) {
    for (const name of neutral) {
      const hex = raw(name, look);
      const [r, g, b] = channels(hex);
      assert.ok(
        r >= b,
        `${look}: --c-${name} (${hex}) is cool (blue above red); the ladder is warm stone`,
      );
      assert.ok(
        Math.max(r, g, b) - Math.min(r, g, b) <= 32,
        `${look}: --c-${name} (${hex}) is too saturated for the neutral ladder; saturation belongs to --c-accent and the status family`,
      );
    }
  }
  // The paper well is the one light surface in the dark look - a drawing or an
  // extracted document is read on paper - and it is deliberately not pure white.
  for (const look of ["light", "dark"]) {
    const well = raw("well", look);
    assert.ok(
      luminance(well) > 0.75,
      `${look}: --c-well must stay a light reading surface`,
    );
    assert.ok(
      !/^#(?:fff|ffffff)$/i.test(well),
      `${look}: the media well must not be pure white`,
    );
  }
});

test("the ThatOpen components inherit the same material", () => {
  // The Lit components are the one surface this stylesheet cannot reach directly: they
  // read their own bridge. Every variable that bridge needs must therefore be declared,
  // or a panel renders in the library's default palette - which is a second theme no
  // stylesheet in this repository can see.
  const required = [
    "bim-ui_bg-base",
    "bim-ui_bg-contrast-10",
    "bim-ui_bg-contrast-50",
    "bim-ui_main-base",
    "bim-ui_main-contrast",
    "bim-ui_accent-base",
    "bim-ui_danger-base",
    "bim-ui_warning-base",
    "bim-ui_success-base",
    "bim-ui_info-base",
  ];
  for (const name of required) {
    assert.match(
      bridge.get(name) ?? "",
      /^var\(--c-/,
      `the bridge must point ${name} at a palette token`,
    );
    const reference = /^var\(--([a-z0-9-]+)\)$/.exec(bridge.get(name));
    assert.ok(
      lightPalette.has(reference[1]) ||
        bridge.has(reference[1]) ||
        baseDeclarations.has(reference[1]),
      `${name} points at --${reference[1]}, which nothing declares`,
    );
  }
  // The component's *primary* colour is the product accent, and its label ink is the
  // accent's own label - so a Lit button and a React button are the same object.
  assert.equal(bridge.get("bim-ui_main-base"), "var(--c-accent)");
  assert.equal(bridge.get("bim-ui_main-contrast"), "var(--c-on-accent)");
  // A status surface takes the ink that is legible on it, which is light in the light
  // look and the window's own charcoal in the dark look.
  for (const name of ["danger", "warning", "success", "info"]) {
    assert.equal(
      bridge.get(`bim-ui_${name}-contrast`),
      "var(--c-on-status)",
      `${name} surfaces must take --c-on-status as their label ink`,
    );
  }
  // ...and the library's own generator variables that the sheets above never touch must
  // be flattened, or the donor's glow returns on a hover.
  for (const name of ["workspace-glow", "glow"]) {
    assert.equal(bridge.get(name), "none");
  }
});

test("the entry point imports the palette last, and only once", () => {
  // The cascade is the mechanism: the palette has to win over the vendored donor sheets,
  // and the donor sheets have to be loaded at all for the bridge to resolve.
  const imports = entrySheet
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const paletteAt = imports.indexOf('@import "./styles/concord/tokens.css";');
  const donorAt = imports.indexOf(
    '@import "./vendor/opentakeoff/styles/tokens.css";',
  );
  const vendorAt = imports.findIndex((line) =>
    /^@import "\.\/vendor\/opentakeoff\/styles\/premiumWorkspace\.css";$/.test(
      line,
    ),
  );
  assert.notEqual(paletteAt, -1, "the entry must import the palette");
  assert.ok(
    donorAt !== -1 && vendorAt !== -1,
    "the vendored donor sheets must still be imported",
  );
  assert.ok(
    paletteAt > donorAt && paletteAt > vendorAt,
    "the palette must be imported after the vendored sheets so it wins the cascade",
  );
  assert.equal(
    imports.filter((line) => line.includes("concord/tokens.css")).length,
    1,
    "the palette must be imported exactly once",
  );
});

test("the document shell declares no palette value of its own", () => {
  // index.html sits outside the token layer, so the contract test that scans
  // src/styles cannot see it. The window tint has to be a literal there (HTML cannot
  // read a custom property), so the rule is narrower and still real: it must be a value
  // the palette already declares, and it must be the only literal in the file.
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
  const declared = new Set(
    [...palette.matchAll(/--[a-z0-9-]+:\s*(#[0-9a-f]{6});/g)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  assert.ok(
    declared.has(tint.toLowerCase()),
    `the window tint ${tint} is not a value the palette declares`,
  );
  // The tint is the frame, so it must be the frame's value: a Windows title bar in a
  // third colour is exactly the seam this contract exists to prevent.
  assert.ok(
    tint.toLowerCase() === raw("chrome", "light") ||
      tint.toLowerCase() === raw("chrome", "dark"),
    `the window tint ${tint} must be the instrument frame's own value`,
  );
});

test("the palette and the scales are each imported through the single entry", () => {
  // Two sheets owning the same thing is the failure this whole file guards against, so
  // assert the ownership split explicitly: base.css must not declare a colour literal,
  // and the palette must not declare a scale.
  assert.doesNotMatch(
    base,
    /#[0-9a-fA-F]{3,8}\b/,
    "base.css owns scales and semantics; the palette owns colour values",
  );
  for (const scale of ["--space-4", "--radius-lg", "--motion:"]) {
    assert.ok(
      !palette.includes(`${scale}`),
      `the palette must not restate the scale token ${scale}`,
    );
  }
});
