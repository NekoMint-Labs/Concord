import type { DonorAnnotation, NativeTextRun } from "./AnnotationWorkbench";
export interface MarkupPatch<T> {
  ids: string[];
  before: T[];
  after: T[];
  beforeOrder: string[];
  afterOrder: string[];
}
export function markupPatch<T extends { id: string }>(
  before: T[],
  after: T[],
): MarkupPatch<T>;
export function applyMarkupPatch<T extends { id: string }>(
  current: T[],
  patch: MarkupPatch<T>,
  side: "before" | "after",
): T[];
export function nativeTextRuns(
  content: unknown,
  transform: number[],
): NativeTextRun[];
export function shiftedMarkup(
  markup: DonorAnnotation,
  dx: number,
  dy: number,
): DonorAnnotation;
