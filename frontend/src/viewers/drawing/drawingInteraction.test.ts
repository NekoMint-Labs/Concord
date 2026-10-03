import { describe, expect, it } from "vitest";
import {
  appendDrawingPoint,
  calibratedScale,
  markupMetrics,
} from "./drawingInteraction";
describe("OpenTakeoff drawing interaction", () => {
  it("keeps page calibration independent of zoom", () => {
    const scale = calibratedScale(
      [
        [0, 0],
        [100, 0],
      ],
      5,
    );
    expect(
      markupMetrics(
        {
          id: "m",
          page: 1,
          tool: "distance",
          points: [
            [0, 0],
            [300, 400],
          ],
        },
        scale,
      ),
    ).toBe("25.00 m");
    expect(
      markupMetrics(
        {
          id: "m",
          page: 1,
          tool: "area",
          points: [
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100],
          ],
        },
        scale,
      ),
    ).toBe("25.00 m² / 20.00 m perimeter");
  });
  it("does not invent measurements before calibration", () => {
    expect(
      markupMetrics({
        id: "m",
        page: 1,
        tool: "distance",
        points: [
          [0, 0],
          [10, 0],
        ],
      }),
    ).toBe("Uncalibrated");
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid calibration %s", (value) => {
    expect(() =>
      calibratedScale(
        [
          [0, 0],
          [10, 0],
        ],
        value,
      ),
    ).toThrow();
  });
  it("rejects degenerate calibration and resets two-point tools", () => {
    expect(() =>
      calibratedScale(
        [
          [0, 0],
          [0, 0],
        ],
        1,
      ),
    ).toThrow();
    expect(() => calibratedScale([[0, 0]], 1)).toThrow();
    expect(
      appendDrawingPoint(
        [
          [0, 0],
          [1, 0],
        ],
        [2, 0],
        "calibrate",
      ),
    ).toEqual([[2, 0]]);
    expect(
      appendDrawingPoint(
        [
          [0, 0],
          [1, 0],
        ],
        [2, 0],
        "area",
      ),
    ).toHaveLength(3);
    expect(appendDrawingPoint([], [2, 0], "navigate")).toEqual([]);
  });
});
