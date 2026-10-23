import { evaluateExpression, type InteractiveModel } from "@/lib/project-agent/interactive-model";

export interface ModelPlotPoint { x: number; y: number | null }
export interface ValidModelPlotPoint { x: number; y: number }

/** Sample the declared model without replacing failed calculations with zero. */
export function sampleModelPlot(block: InteractiveModel, values: Record<string, number>): ModelPlotPoint[] {
  const plot = block.plot;
  if (!plot) return [];
  const parameter = block.parameters.find((item) => item.id === plot.variable);
  if (!parameter) return [];
  const span = parameter.max - parameter.min;
  const intervals = Math.min(40, Math.max(1, Math.ceil(span / parameter.step)));
  const evaluate = (x: number) => evaluateExpression(plot.expression, { ...values, [parameter.id]: x });
  const points: ModelPlotPoint[] = [];
  for (let index = 0; index <= intervals; index += 1) {
    const x = parameter.min + index / intervals * span;
    const point = { x, y: evaluate(x) };
    const previous = points[points.length - 1];
    // Also inspect midpoints: a singularity between otherwise valid samples must not be bridged.
    if (previous && previous.y !== null && point.y !== null) {
      const middle = (previous.x + x) / 2;
      if (evaluate(middle) === null) points.push({ x: middle, y: null });
    }
    points.push(point);
  }
  return points;
}

/** Each run is drawn separately; unavailable values create visible gaps. */
export function segmentModelPlot(points: ModelPlotPoint[]): ValidModelPlotPoint[][] {
  const segments: ValidModelPlotPoint[][] = [];
  let current: ValidModelPlotPoint[] = [];
  for (const point of points) {
    if (point.y === null || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push({ x: point.x, y: point.y });
  }
  if (current.length) segments.push(current);
  return segments;
}
