import { parseDesignSpec, type DesignSpec, type DesignFurniture, type DesignOpening } from "./design-model";

/** A bounded patch modifies only an existing semantic concept, never an arbitrary user file or script. */
export type DesignEdit =
  | { type: "move_opening"; index: number; offset: number }
  | { type: "resize_opening"; index: number; width?: number; height?: number; sill?: number }
  | { type: "add_opening"; opening: DesignOpening }
  | { type: "remove_opening"; index: number }
  | { type: "move_furniture"; index: number; x: number; y: number }
  | { type: "resize_furniture"; index: number; width?: number; depth?: number; height?: number }
  | { type: "rotate_furniture"; index: number; rotation: 0 | 90 | 180 | 270 }
  | { type: "rename_furniture"; index: number; label: string }
  | { type: "add_furniture"; furniture: DesignFurniture }
  | { type: "remove_furniture"; index: number };

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const index = (v: unknown): v is number => Number.isInteger(v) && finite(v) && v >= 0 && v < 64;
const numericFields = (v: Record<string, unknown>, fields: string[]) =>
  fields.every(k => finite(v[k]));
const optionalDimensions = (v: Record<string, unknown>, fields: string[]) =>
  fields.some(k => v[k] !== undefined) && fields.every(k => v[k] === undefined || finite(v[k]));

export function parseDesignEdits(raw: unknown): { edits: DesignEdit[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8)
    return { error: "design_edit needs 1-8 typed modifications" };
  const edits: DesignEdit[] = [];
  for (const item of raw) {
    const op = obj(item);
    if (!op) return { error: "Each edit must be an object" };
    const i = op.index;
    switch (op.type) {
      case "move_opening":
        if (!index(i) || !numericFields(op, ["offset"])) break;
        edits.push({ type: op.type, index: i, offset: op.offset as number }); continue;
      case "resize_opening":
        if (!index(i) || !optionalDimensions(op, ["width", "height", "sill"])) break;
        edits.push({ type: op.type, index: i, ...dims(op, ["width", "height", "sill"]) }); continue;
      case "add_opening":
        if (!obj(op.opening)) break;
        edits.push({ type: op.type, opening: op.opening as unknown as DesignOpening }); continue;
      case "remove_opening":
      case "remove_furniture":
        if (!index(i)) break;
        edits.push({ type: op.type, index: i }); continue;
      case "move_furniture":
        if (!index(i) || !numericFields(op, ["x", "y"])) break;
        edits.push({ type: op.type, index: i, x: op.x as number, y: op.y as number }); continue;
      case "resize_furniture":
        if (!index(i) || !optionalDimensions(op, ["width", "depth", "height"])) break;
        edits.push({ type: op.type, index: i, ...dims(op, ["width", "depth", "height"]) }); continue;
      case "rotate_furniture":
        if (!index(i) || ![0, 90, 180, 270].includes(op.rotation as number)) break;
        edits.push({ type: op.type, index: i, rotation: op.rotation as DesignFurniture["rotation"] }); continue;
      case "rename_furniture":
        if (!index(i) || typeof op.label !== "string" || !op.label.trim() || op.label.length > 80) break;
        edits.push({ type: op.type, index: i, label: op.label.trim() }); continue;
      case "add_furniture":
        if (!obj(op.furniture)) break;
        edits.push({ type: op.type, furniture: op.furniture as unknown as DesignFurniture }); continue;
    }
    return { error: "Invalid design edit or unsupported operation: " + String(op.type) };
  }
  return { edits };
}
function dims(op: Record<string, unknown>, keys: string[]): Record<string, number> {
  return Object.fromEntries(keys.filter(k => op[k] !== undefined).map(k => [k, op[k] as number]));
}

/** Atomically validates the entire proposed new scene. On failure, the source remains untouched. */
export function applyDesignEdits(raw: unknown, edits: DesignEdit[]):
  { spec: DesignSpec } | { error: string } {
  const parsed = parseDesignSpec(raw);
  if ("error" in parsed) return parsed;
  const spec: DesignSpec = structuredClone(parsed.spec);
  for (const op of edits) {
    if (op.type === "add_opening") spec.openings.push(op.opening);
    else if (op.type === "add_furniture") spec.furniture.push(op.furniture);
    else if ("index" in op) {
      const opening = op.type.endsWith("_opening");
      const collection = opening ? spec.openings : spec.furniture;
      if (op.index >= collection.length) return { error: "Design edit target index does not exist: " + op.index };
      if (op.type === "remove_opening") spec.openings.splice(op.index, 1);
      else if (op.type === "remove_furniture") spec.furniture.splice(op.index, 1);
      else if (op.type === "move_opening") Object.assign(spec.openings[op.index], { offset: op.offset });
      else if (op.type === "resize_opening") Object.assign(spec.openings[op.index], dims(op, ["width", "height", "sill"]));
      else if (op.type === "move_furniture") Object.assign(spec.furniture[op.index], { x: op.x, y: op.y });
      else if (op.type === "resize_furniture") Object.assign(spec.furniture[op.index], dims(op, ["width", "depth", "height"]));
      else if (op.type === "rotate_furniture") Object.assign(spec.furniture[op.index], { rotation: op.rotation });
      else if (op.type === "rename_furniture") Object.assign(spec.furniture[op.index], { label: op.label });
    }
  }
  return parseDesignSpec(spec);
}
