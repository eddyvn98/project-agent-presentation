/** GUI screenshots are only actionable with the exact viewport that produced them. */
export interface VisualViewportState {
  width: number;
  height: number;
  dpr: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
}
export function sameVisualViewport(a: VisualViewportState, b: VisualViewportState): boolean {
  return Object.keys(a).every(key =>
    a[key as keyof VisualViewportState] === b[key as keyof VisualViewportState]);
}
export function normalizedVisualPoint(x: number, y: number,
  viewport: Pick<VisualViewportState, "width" | "height">) {
  if (![x, y, viewport.width, viewport.height].every(Number.isFinite) ||
      x < 0 || x > 1 || y < 0 || y > 1 ||
      viewport.width < 1 || viewport.height < 1)
    throw new Error("Visual coordinates or viewport are invalid");
  return {
    x: Math.min(viewport.width - 1, Math.floor(x * viewport.width)),
    y: Math.min(viewport.height - 1, Math.floor(y * viewport.height)),
  };
}
