/** Bounded declarative math expressions: no eval, scripts, HTML or arbitrary functions. */
export type NumericExpression = number | { var: string } | {
  op: "add" | "sub" | "mul" | "div" | "pow" | "min" | "max";
  args: NumericExpression[];
};
export type ModelParameter = { id: string; label: string; min: number; max: number; step: number; initial: number; unit?: string };
export type ModelOutput = { label: string; expression: NumericExpression; unit?: string };
export interface InteractiveModel {
  type: "interactive";
  title: string;
  description?: string;
  parameters: ModelParameter[];
  outputs: ModelOutput[];
  plot?: { variable: string; expression: NumericExpression; label: string };
}
const obj = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
const boundedText = (x: unknown, size = 80) => typeof x === "string" ? x.trim().slice(0, size) : "";
const num = (x: unknown): number | null => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1e12 ? x : null;
const safeId = (s: string) => /^[a-z][a-z0-9_]{0,31}$/.test(s);
function parseExpression(raw: unknown, ids: Set<string>, depth = 0): NumericExpression | null {
  if (depth > 8) return null;
  if (num(raw) !== null) return raw as number;
  const item = obj(raw);
  if (!item) return null;
  if (typeof item.var === "string" && safeId(item.var) && ids.has(item.var) && Object.keys(item).length === 1) return { var: item.var };
  const ops = ["add", "sub", "mul", "div", "pow", "min", "max"];
  if (typeof item.op !== "string" || !ops.includes(item.op) || !Array.isArray(item.args) || item.args.length < 2 || item.args.length > 4) return null;
  if (["sub", "div", "pow"].includes(item.op) && item.args.length !== 2) return null;
  const args = item.args.map((arg) => parseExpression(arg, ids, depth + 1));
  if (args.some((arg) => arg === null)) return null;
  return { op: item.op as Exclude<NumericExpression, number | { var: string }>["op"], args: args as NumericExpression[] };
}
export function parseInteractiveModel(raw: unknown): InteractiveModel | null {
  const data = obj(raw);
  if (!data || data.type !== "interactive" || !Array.isArray(data.parameters) || !Array.isArray(data.outputs)) return null;
  if (data.parameters.length < 1 || data.parameters.length > 4 || data.outputs.length < 1 || data.outputs.length > 4) return null;
  const parameters: ModelParameter[] = [];
  for (const candidate of data.parameters) {
    const p = obj(candidate);
    if (!p) return null;
    const id = boundedText(p.id, 32), label = boundedText(p.label);
    const min = num(p.min), max = num(p.max), step = num(p.step), initial = num(p.initial);
    if (!safeId(id) || !label || min === null || max === null || step === null || initial === null ||
      max <= min || step <= 0 || initial < min || initial > max || (max - min) / step > 10000 ||
      parameters.some((other) => other.id === id)) return null;
    parameters.push({ id, label, min, max, step, initial, unit: boundedText(p.unit, 24) || undefined });
  }
  const ids = new Set(parameters.map((p) => p.id));
  const outputs: ModelOutput[] = [];
  for (const candidate of data.outputs) {
    const o = obj(candidate);
    if (!o) return null;
    const label = boundedText(o.label), expression = parseExpression(o.expression, ids);
    if (!label || expression === null) return null;
    outputs.push({ label, expression, unit: boundedText(o.unit, 24) || undefined });
  }
  let plot: InteractiveModel["plot"];
  if (data.plot !== undefined) {
    const p = obj(data.plot);
    if (!p || typeof p.variable !== "string" || !ids.has(p.variable)) return null;
    const expression = parseExpression(p.expression, ids);
    if (expression === null) return null;
    plot = { variable: p.variable, expression, label: boundedText(p.label) || "Trend" };
  }
  const title = boundedText(data.title, 120);
  if (!title) return null;
  return { type: "interactive", title, description: boundedText(data.description, 240) || undefined, parameters, outputs, plot };
}
export function evaluateExpression(expression: NumericExpression, variables: Record<string, number>): number | null {
  const visit = (expr: NumericExpression, depth: number): number | null => {
    if (depth > 8) return null;
    if (typeof expr === "number") return num(expr);
    if ("var" in expr) return Object.hasOwn(variables, expr.var) ? num(variables[expr.var]) : null;
    const args = expr.args.map((arg) => visit(arg, depth + 1));
    if (args.some((n) => n === null)) return null;
    const v = args as number[];
    const result = expr.op === "add" ? v.reduce((a,b) => a+b, 0) :
      expr.op === "sub" ? v[0]-v[1] :
      expr.op === "mul" ? v.reduce((a,b) => a*b, 1) :
      expr.op === "div" ? v[1] === 0 ? NaN : v[0]/v[1] :
      expr.op === "pow" ? Math.pow(v[0], v[1]) :
      expr.op === "min" ? Math.min(...v) : Math.max(...v);
    return num(result);
  };
  return visit(expression, 0);
}
