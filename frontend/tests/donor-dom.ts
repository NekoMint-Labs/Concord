import { waitFor, within } from "@testing-library/react";

// Testing Library deliberately doesn't traverse shadow DOM. These helpers keep
// table assertions on the real donor cells, not a mock of their React adapter.
export function donorRoots(scope: ParentNode): ShadowRoot[] {
  const roots = Array.from(scope.querySelectorAll("*")).flatMap((element) =>
    element.shadowRoot
      ? [element.shadowRoot, ...donorRoots(element.shadowRoot)]
      : [],
  );
  return scope instanceof Element && scope.shadowRoot
    ? [scope.shadowRoot, ...donorRoots(scope.shadowRoot), ...roots]
    : roots;
}

export function donorButton(name: string | RegExp, scope: ParentNode) {
  return donorRoots(scope).flatMap((root) =>
    within(root as unknown as HTMLElement).queryAllByRole("button", { name }),
  )[0];
}

export function donorText(text: string, scope: ParentNode) {
  // Donor table cells live in shadow roots; named React slots stay in light DOM.
  return [scope, ...donorRoots(scope)].flatMap((root) =>
    within(root as unknown as HTMLElement).queryAllByText(text),
  )[0];
}

export async function findDonorControl(
  role: "textbox" | "combobox",
  name: string,
  scope: ParentNode = document.body,
) {
  return waitFor(() => {
    const control = donorRoots(scope).flatMap((root) =>
      within(root as unknown as HTMLElement).queryAllByRole(role, { name }),
    )[0];
    if (!control) throw new Error(`Donor ${role} "${name}" is not rendered`);
    return control;
  });
}
