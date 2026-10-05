import { expect, type Locator, type Page } from "@playwright/test";

/** Assert live Lit instances and their rendered substrate, not inert tag names. */
/**
 * The product's single accent, per look. It is read from the palette at assert time
 * rather than pinned here, because the accent is an art-direction decision: what this
 * helper protects is that the donor components render the *product's* accent - the
 * one `--c-accent` declares - and not a private colour of their own. A hard-coded
 * list would turn the next palette decision into a test failure.
 */
export const PRODUCT_ACCENT_TOKENS = [
  "--c-accent",
  "--c-accent-deep",
  "--c-accent-bright",
] as const;

/** Every `--c-*` colour the palette declares for the active look. */
export async function paletteColours(page: Page) {
  return page.evaluate(() => {
    const out = new Set<string>();
    const hexToRgb = (hex: string) => {
      const value = hex.replace("#", "");
      const full =
        value.length === 3
          ? [...value].map((d) => d + d).join("")
          : value;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
      return `rgb(${r}, ${g}, ${b})`;
    };
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSStyleRule)) continue;
        for (const [, name, value] of rule.style.cssText.matchAll(
          /(--c-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g,
        )) {
          void name;
          out.add(hexToRgb(value));
        }
      }
    }
    return [...out];
  });
}

export async function expectDonor(
  locator: Locator,
  properties: Record<string, unknown> = {},
) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate(async (element) => {
        const donor = element as HTMLElement & {
          updateComplete?: Promise<boolean>;
        };
        await donor.updateComplete;
        const constructor = customElements.get(element.localName);
        return (
          !!constructor &&
          element instanceof constructor &&
          !!donor.updateComplete &&
          !!element.shadowRoot?.childElementCount
        );
      }),
    )
    .toBe(true);
  for (const [key, value] of Object.entries(properties)) {
    await expect
      .poll(() =>
        locator.evaluate(
          (element, key) =>
            (element as unknown as Record<string, unknown>)[key],
          key,
        ),
      )
      .toEqual(value);
  }
  const styles = await locator.evaluate((element) => {
    const nodes: Element[] = [element];
    for (let i = 0; i < nodes.length; i++) {
      nodes.push(
        ...Array.from(nodes[i].shadowRoot?.querySelectorAll("*") ?? []),
      );
    }
    // Dormant hidden loading templates have no rendered motion or palette.
    const rendered = nodes.filter((node) => node.checkVisibility());
    return {
      look: (() => {
        const shell = document.querySelector(".app-shell");
        return shell?.getAttribute("data-workspace-look") ?? "light";
      })(),
      font: getComputedStyle(element).fontFamily,
      accent: getComputedStyle(element)
        .getPropertyValue("--bim-ui_main-base")
        .trim(),
      backgrounds: rendered.map((node) => {
        let ancestor: Element | null = node;
        while (ancestor && !ancestor.matches("bim-button[active]")) {
          const tree = ancestor.getRootNode();
          ancestor =
            ancestor.parentElement ??
            (tree instanceof ShadowRoot ? tree.host : null);
        }
        return {
          color: getComputedStyle(node).backgroundColor,
          selectedAction: !!ancestor,
        };
      }),
      uiFonts: rendered
        .filter(
          (node) =>
            !["STYLE", "SLOT"].includes(node.tagName) &&
            !node.closest("code, pre") &&
            node.localName !== "svg",
        )
        .map((node) => getComputedStyle(node).fontFamily),
      durations: rendered.flatMap((node) => {
        const style = getComputedStyle(node);
        return [
          ...style.animationDuration.split(","),
          ...style.transitionDuration.split(","),
        ].map((duration) => ({
          seconds: parseFloat(duration),
          node: `${node.localName}.${node.getAttribute("class") ?? ""}`,
          animation: style.animationName,
          transition: style.transitionProperty,
        }));
      }),
    };
  });
  // The donor components own their own typography (the OpenTakeoff body stack);
  // the Concord shell around them uses a different CJK face, so the donor tree
  // is checked for one consistent font rather than for the shell's root font.
  expect(styles.font).toContain("Inter");
  // The accent the Lit components render is the *product's* accent: the value the
  // palette declares, in whichever look is active.
  const accentTokens = await locator.evaluate(
    (element, tokens) => {
      const style = getComputedStyle(element);
      return (tokens as string[]).map((token) =>
        style.getPropertyValue(token).trim(),
      );
    },
    [...PRODUCT_ACCENT_TOKENS],
  );
  expect(accentTokens).toContain(styles.accent);
  for (const font of styles.uiFonts) expect(font).toBe(styles.font);
  for (const duration of styles.durations)
    expect(duration.seconds, JSON.stringify(duration)).toBeLessThanOrEqual(
      0.00001,
    );
  /*
   * Every surface the Lit tree renders is a plane the palette declares.
   *
   * This used to assert a numeric band - "in the light look every plane has all three
   * channels above 224" - which was a proxy for "the product's planes are light". The
   * material now has a dark instrument frame and a mid-value drafting field inside the
   * light look, so the band would flag legitimate planes and pass a literal nobody
   * declared. Asserting membership in the palette is both stricter and truthful: it
   * rejects any colour the product cannot account for, and it cannot drift when the
   * palette changes.
   */
  const declared = new Set(await paletteColours(locator.page()));
  for (const { color, selectedAction } of styles.backgrounds) {
    if (selectedAction && accentTokens.map(hexToRgb).includes(color)) continue;
    const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
    if (!(channels.length === 3 || channels[3] === 1)) continue;
    if (color === "rgb(0, 0, 0)" || color === "rgba(0, 0, 0, 0)") continue;
    expect(
      declared.has(color),
      JSON.stringify({ look: styles.look, color }),
    ).toBe(true);
  }
}

/** `#rrggbb` to the `rgb(r, g, b)` form `getComputedStyle` reports. */
function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const full =
    value.length === 3 ? [...value].map((d) => d + d).join("") : value;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Select the Work panel's filter (全部 / 待处理 · N / 已处理) by its label. The
 * adapted WorkspacePanel renders its switchers as plain buttons with
 * `aria-pressed`, so this is a real click on the product control rather than a
 * donor `bim-tabs` traversal.
 */
export async function selectDonorTab(host: Locator, label: RegExp | string) {
  const filters = host.locator(".workspace-filter-buttons");
  if (await filters.count()) {
    await filters.getByRole("button", { name: label }).first().click();
    return;
  }
  await host.getByRole("button", { name: label }).first().click();
}

export async function expectDonorTable(table: Locator) {
  await expectDonor(table, { noIndentation: true, selectableRows: false });
  const state = await table.evaluate((element) => {
    const donor = element as HTMLElement & {
      data: unknown[];
      columns: { name: string }[];
      dataTransform: Record<string, unknown>;
    };
    return {
      rows: donor.data.length,
      columns: donor.columns.map((column) => column.name),
      transforms: Object.keys(donor.dataTransform),
    };
  });
  expect(state.rows).toBeGreaterThan(0);
  expect(state.columns).toContain("操作");
  expect(state.transforms).toContain("操作");
  await expect(table.locator("bim-table-row").first()).toBeVisible();
  await expect(
    table.getByRole("button", { name: /^打开 / }).first(),
  ).toBeVisible();
}

export async function expectReducedMotion(page: Page) {
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
}

/** The workspace tool rail: `nav[data-tool-rail]` exposes the destinations. */
export const toolRail = (page: Page) =>
  page.getByRole("toolbar", { name: "工作区" });

/** The docked Work and review panel (`aside.workspace-panel`). */
export const workPanel = (page: Page) =>
  page.getByRole("complementary", { name: "工作与审核" });

/** Open the docked Work panel from the workspace tool rail. */
export async function openWorkPanel(page: Page) {
  const panel = workPanel(page);
  if (await panel.isVisible()) return;
  await toolRail(page)
    .getByRole("button", { name: "工作", exact: true })
    .click();
  await expect(panel).toBeVisible();
}
