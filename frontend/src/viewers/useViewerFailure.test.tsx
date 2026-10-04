import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useViewerFailure } from "./useViewerFailure";
function Failure({
  message,
  report,
}: {
  message: string;
  report: (message: string | null) => void;
}) {
  useViewerFailure(message, report);
  return null;
}
afterEach(cleanup);
it("reports failures and recovery to the current host without clearing on unmount", () => {
  const report = vi.fn();
  const view = render(<Failure message="" report={report} />);
  expect(report).toHaveBeenLastCalledWith(null);
  view.rerender(<Failure message="Unavailable revision" report={report} />);
  expect(report).toHaveBeenLastCalledWith("Unavailable revision");
  view.rerender(<Failure message="" report={report} />);
  expect(report).toHaveBeenLastCalledWith(null);
  view.unmount();
  expect(report).toHaveBeenCalledTimes(3);
});
it("delivers a persistent failure when the Evidence host callback changes", () => {
  const previous = vi.fn(),
    current = vi.fn();
  const view = render(<Failure message="Missing entity" report={previous} />);
  view.rerender(<Failure message="Missing entity" report={current} />);
  expect(previous).toHaveBeenCalledExactlyOnceWith("Missing entity");
  expect(current).toHaveBeenCalledExactlyOnceWith("Missing entity");
});
