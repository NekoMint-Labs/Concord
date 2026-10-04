import { expect, type Locator, type Page } from "@playwright/test";

/** Assert live Lit instances and their rendered substrate, not inert tag names. */
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
    const root = getComputedStyle(document.documentElement);
    const nodes: Element[] = [element];
    for (let i = 0; i < nodes.length; i++) {
      nodes.push(
        ...Array.from(nodes[i].shadowRoot?.querySelectorAll("*") ?? []),
      );
    }
    // Dormant hidden loading templates have no rendered motion or palette.
    const rendered = nodes.filter((node) => node.checkVisibility());
    return {
      font: getComputedStyle(element).fontFamily,
      rootFont: root.fontFamily,
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
  expect(styles.font).toBe(styles.rootFont);
  expect(styles.font).toContain("Noto Sans CJK SC");
  expect(styles.accent).toBe("#2b6671");
  for (const font of styles.uiFonts) expect(font).toBe(styles.rootFont);
  for (const duration of styles.durations)
    expect(duration.seconds, JSON.stringify(duration)).toBeLessThanOrEqual(
      0.00001,
    );
  // Planes stay light; an explicitly selected action uses the verified petrol accent.
  for (const { color, selectedAction } of styles.backgrounds) {
    if (selectedAction && color === "rgb(43, 102, 113)") continue;
    const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
    if (channels.length === 3 || channels[3] === 1)
      for (const channel of channels.slice(0, 3))
        expect(channel).toBeGreaterThanOrEqual(230);
  }
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
