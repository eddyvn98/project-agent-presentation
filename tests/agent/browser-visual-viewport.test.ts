import { describe, expect, it } from "vitest";
import { normalizedVisualPoint, sameVisualViewport } from
  "../../lib/project-agent/runtime/browser-agent/visual-viewport";

const viewport = { width: 1280, height: 720, dpr: 2, zoom: 1,
  scrollX: 0, scrollY: 0 };
describe("screenshot-based GUI action geometry", () => {
  it("rejects resizes, zoom, DPR and scroll since the last image", () => {
    expect(sameVisualViewport(viewport, { ...viewport })).toBe(true);
    for (const patch of [{ width: 390 }, { height: 820 }, { dpr: 1 },
      { zoom: 1.25 }, { scrollX: 10 }, { scrollY: 20 }]) {
      expect(sameVisualViewport(viewport, { ...viewport, ...patch })).toBe(false);
    }
  });
  it("converts normalized coordinates using CSS viewport dimensions", () => {
    expect(normalizedVisualPoint(0, 0, viewport)).toEqual({ x: 0, y: 0 });
    expect(normalizedVisualPoint(.5, .5, viewport)).toEqual({ x: 640, y: 360 });
    expect(normalizedVisualPoint(1, 1, viewport)).toEqual({ x: 1279, y: 719 });
  });
  it.each([[-1, 0], [1.01, .5], [NaN, 0], [.5, Infinity]])(
    "rejects invalid normalized input (%s,%s)", (x, y) => {
      expect(() => normalizedVisualPoint(x, y, viewport)).toThrow(/invalid/);
    });
});
