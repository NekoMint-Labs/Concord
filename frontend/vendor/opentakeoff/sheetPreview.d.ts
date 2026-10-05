export function previewPixelWidth(cssWidth?: number, dpr?: number): number;
/** The donor consumes only numeric viewport dimensions; real PDF pages retain their richer result type. */
export function previewViewport<T extends { width: number; height: number }>(
  page: { getViewport(options: { scale: number }): T },
  width: number,
): T;
