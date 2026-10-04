import { expect, type Locator, type Page } from "@playwright/test";

/** Assert live Lit instances and their rendered substrate, not inert tag names. */
/** The donor's single accent per vendored look (`tokens.css` light,
 * `premiumWorkspace.css` graphite/hud). Concord's petrol `#2b6671` is never a
 * donor accent, so it never satisfies these assertions. */
export const DONOR_ACCENTS = ["#1f3fc7", "#82b4ff"];
export const DONOR_ACCENT_RGB = ["rgb(31, 63, 199)", "rgb(130, 180, 255)"];

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
  // The single donor accent, in whichever vendored workspace look is active:
  // `#1f3fc7` outside the workspace scope (tokens.css light) and `#82b4ff`
  // inside `[data-workspace-look="graphite"]`/`hud` (premiumWorkspace.css).
  // What matters is that it is the donor cobalt and not Concord's petrol
  // `#2b6671`, which no longer owns any action surface.
  expect(DONOR_ACCENTS).toContain(styles.accent);
  for (const font of styles.uiFonts) expect(font).toBe(styles.font);
  for (const duration of styles.durations)
    expect(duration.seconds, JSON.stringify(duration)).toBeLessThanOrEqual(
      0.00001,
    );
  // Planes follow the active workspace look: the light product's planes are
  // light, and the graphite/hud look's planes are dark. A media "well" stays
  // light in every look; an explicitly selected donor action uses the workspace
  // accent. What is rejected is a mid-tone plane that belongs to neither look.
  const darkLook = styles.look === "graphite" || styles.look === "hud";
  for (const { color, selectedAction } of styles.backgrounds) {
    if (selectedAction && DONOR_ACCENT_RGB.includes(color)) continue;
    const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
    if (!(channels.length === 3 || channels[3] === 1)) continue;
    const rgb = channels.slice(0, 3);
    const light = rgb.every((channel) => channel >= 224);
    const dark = rgb.every((channel) => channel <= 112);
    if (darkLook)
      expect(light || dark, JSON.stringify({ look: styles.look, color })).toBe(
        true,
      );
    else
      for (const channel of rgb)
        expect(
          channel,
          JSON.stringify({ look: styles.look, color }),
        ).toBeGreaterThanOrEqual(224);
  }
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

/**
 * Open the docked Work panel from the header's 工作 toggle. The panel is a
 * togglable dock (`aria-expanded` on `button.calm-work`), not a permanently
 * visible surface, so callers must open it before reading its rows.
 */
export async function openWorkPanel(page: Page) {
  const toggle = page.locator(".calm-work");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
}
