import { parseDesignSpec, type DesignFurniture, type DesignSpec, type DesignParse } from "./runtime/design-model";
import { applyDesignEdits, parseDesignEdits, type DesignEdit } from "./runtime/design-edit";
import { makeDesignEditPrompt } from "./design-handoff";

type FurnitureChanges = Partial<Pick<DesignFurniture, "x" | "y" | "width" | "depth">>;
export type DesignEditorResult = { edits: DesignEdit[]; prompt: string } | { error: string };

const roundGrid = (value: number) => Math.round(value / 25) * 25;
const clamp = (value: number, lower: number, upper: number) => Math.min(upper, Math.max(lower, value));

/** Do not update a mesh directly: every draft change runs through the existing semantic validator. */
export function updateDesignFurniture(
  spec: DesignSpec, index: number, changes: FurnitureChanges,
): DesignParse {
  if (!Number.isInteger(index) || index < 0 || index >= spec.furniture.length)
    return { error: "Furniture selection is no longer valid." };
  if (Object.values(changes).some(v => typeof v !== "number" || !Number.isFinite(v)))
    return { error: "Dimensions and position must be finite numbers." };
  const furniture = spec.furniture.map((item, i) => i === index ? { ...item, ...changes } : { ...item });
  return parseDesignSpec({ ...spec, furniture });
}

/** Move against the inner wall faces. Snap to 25 mm without clipping a component. */
export function moveDesignFurniture(
  spec: DesignSpec, index: number, x: number, y: number,
): DesignParse {
  const item = spec.furniture[index];
  if (!item || !Number.isFinite(x) || !Number.isFinite(y))
    return { error: "Invalid furniture position." };
  const rotated = item.rotation === 90 || item.rotation === 270;
  const halfWidth = (rotated ? item.depth : item.width) / 2;
  const halfDepth = (rotated ? item.width : item.depth) / 2;
  const { width, depth, wallThickness: wall } = spec.room;
  return updateDesignFurniture(spec, index, {
    x: clamp(roundGrid(x), wall + halfWidth, width - wall - halfWidth),
    y: clamp(roundGrid(y), wall + halfDepth, depth - wall - halfDepth),
  });
}

/** Only motion and width/depth are supported by the mobile editor; other properties are protected. */
export function createDesignEditorPrompt(
  sourceName: string, original: DesignSpec, draft: DesignSpec,
): DesignEditorResult {
  const start = makeDesignEditPrompt(sourceName);
  if (!start) return { error: "Unrecognized design revision source." };
  const originalValid = parseDesignSpec(original), draftValid = parseDesignSpec(draft);
  if ("error" in originalValid || "error" in draftValid)
    return { error: "The original or revised geometry is invalid." };
  const a = originalValid.spec, b = draftValid.spec;
  if (a.title !== b.title || JSON.stringify(a.room) !== JSON.stringify(b.room) ||
      JSON.stringify(a.openings) !== JSON.stringify(b.openings) ||
      a.furniture.length !== b.furniture.length)
    return { error: "Only moving and resizing existing furniture is permitted." };
  const edits: DesignEdit[] = [];
  for (let index = 0; index < a.furniture.length; index++) {
    const before = a.furniture[index], after = b.furniture[index];
    if (before.kind !== after.kind || before.label !== after.label ||
        before.height !== after.height || before.rotation !== after.rotation)
      return { error: "Furniture identity, height and rotation cannot be changed here." };
    if (before.x !== after.x || before.y !== after.y)
      edits.push({ type: "move_furniture", index, x: after.x, y: after.y });
    if (before.width !== after.width || before.depth !== after.depth)
      edits.push({ type: "resize_furniture", index, width: after.width, depth: after.depth });
  }
  if (!edits.length) return { error: "There are no changes to apply." };
  if (edits.length > 8) return { error: "Too many edits. Apply at most 8 operations per revision." };
  const typed = parseDesignEdits(edits);
  if ("error" in typed) return { error: typed.error };
  const applied = applyDesignEdits(a, typed.edits);
  if ("error" in applied || JSON.stringify(applied.spec) !== JSON.stringify(b))
    return { error: "The proposed changes do not reproduce the validated design." };
  const source = "outputs/" + sourceName;
  return {
    edits: typed.edits,
    prompt: start + "Apply these exact typed operations, in order, without changing other objects: " +
      JSON.stringify({ action: "design_edit", source, edits: typed.edits }) +
      ". Validate dimensions against the inner walls, create a NEW revision, and preserve the original.",
  };
}
