import type { Page } from "@playwright/test";

/** Observe real iframe requests/replies; never replace or acknowledge native work. */
export async function observeNativeNavigation(page: Page) {
  await page.addInitScript(() => {
    const received: Record<string, unknown>[] = [];
    Object.assign(window, { hostNavigationMessages: received });
    window.addEventListener("message", (event) => {
      if (
        event.origin !== location.origin ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      const data = event.data;
      if (
        [
          "ifcviewer:navigate-elements",
          "ifcviewer:clear-target-selection",
          "result",
          "navigated",
        ].includes(data.type)
      ) {
        if (received.length >= 1000) received.shift();
        received.push(data);
      }
    });
  });
}

export async function nativeNavigationAcknowledged(
  page: Page,
  kind: "cad" | "bim",
  entity?: string,
) {
  return page.evaluate(
    ({ kind, entity }) => {
      type Message = {
        type: string;
        requestId?: string;
        ok?: boolean;
        target?: { entityId?: string };
        ids?: number[];
      };
      type Observer = Window & { hostNavigationMessages: Message[] };
      const messages = (window as unknown as Observer).hostNavigationMessages;
      if (kind === "cad")
        return messages.some(
          (message) =>
            message.type === "navigated" && message.target?.entityId === entity,
        );
      const frame = document.querySelector<HTMLIFrameElement>(
        'iframe[title="Concord IFC viewer"]',
      );
      const requests =
        (frame?.contentWindow as Observer | null)?.hostNavigationMessages ?? [];
      return requests.some(
        (request) =>
          request.type === "ifcviewer:navigate-elements" &&
          request.ids?.length === 1 &&
          messages.some(
            (message) =>
              message.type === "result" &&
              message.requestId === request.requestId &&
              message.ok === true,
          ),
      );
    },
    { kind, entity },
  );
}
