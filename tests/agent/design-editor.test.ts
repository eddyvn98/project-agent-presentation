import { describe, expect, it } from "vitest";
import { createDesignEditorPrompt, moveDesignFurniture, updateDesignFurniture } from "../../lib/project-agent/design-editor";
import { applyDesignEdits, parseDesignEdits } from "../../lib/project-agent/runtime/design-edit";
import { parseDesignSpec } from "../../lib/project-agent/runtime/design-model";

const room = { width: 6000, depth: 4500, height: 3000, wallThickness: 150 };
const base = {
  title: "Mobile concept", units: "mm" as const, room,
  openings: [{ wall: "south" as const, kind: "door" as const, offset: 300, width: 900, height: 2100, sill: 0 }],
  furniture: [{ kind: "table" as const, x: 3000, y: 2200, width: 1500, depth: 800,
    height: 750, rotation: 0 as const, label: "Meeting table" }],
};
const original = (() => {
  const parsed = parseDesignSpec(base);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.spec;
})();

describe("2D editor semantic draft", () => {
  it("snaps movement to 25mm and clamps within inner wall faces", () => {
    const moved = moveDesignFurniture(original, 0, 3464, 2537);
    expect("spec" in moved).toBe(true);
    if ("spec" in moved) expect(moved.spec.furniture[0]).toMatchObject({ x: 3475, y: 2550 });
    const limited = moveDesignFurniture(original, 0, -200, 9000);
    expect("spec" in limited).toBe(true);
    if ("spec" in limited) expect(limited.spec.furniture[0]).toMatchObject({ x: 900, y: 3950 });
  });
  it("rejects geometry or selection errors without changing the original", () => {
    expect("error" in updateDesignFurniture(original, 0, { width: 7000 })).toBe(true);
    expect("error" in updateDesignFurniture(original, -1, { x: 1000 })).toBe(true);
    expect("error" in moveDesignFurniture(original, 0, Number.NaN, 900)).toBe(true);
    expect(original.furniture[0].x).toBe(3000);
  });
  it("creates typed edits that replay to the identical new model", () => {
    const moved = moveDesignFurniture(original, 0, 3400, 2500);
    if ("error" in moved) throw new Error(moved.error);
    const sized = updateDesignFurniture(moved.spec, 0, { width: 1700, depth: 900 });
    if ("error" in sized) throw new Error(sized.error);
    const result = createDesignEditorPrompt("design-abcdefabcdef.design.json", original, sized.spec);
    expect("edits" in result).toBe(true);
    if ("error" in result) throw new Error(result.error);
    expect(result.edits).toEqual([
      { type: "move_furniture", index: 0, x: 3400, y: 2500 },
      { type: "resize_furniture", index: 0, width: 1700, depth: 900 },
    ]);
    const parsed = parseDesignEdits(result.edits);
    if ("error" in parsed) throw new Error(parsed.error);
    const applied = applyDesignEdits(original, parsed.edits);
    expect(applied).toEqual({ spec: sized.spec });
    expect(result.prompt).toContain('"action":"design_edit"');
    expect(result.prompt).toContain("outputs/design-abcdefabcdef.design.json");
  });
  it("blocks no-change, tampered, unsafe path and oversized edit batches", () => {
    expect(createDesignEditorPrompt("design-abcdefabcdef.design.json", original, original))
      .toMatchObject({ error: "There are no changes to apply." });
    expect("error" in createDesignEditorPrompt("../secret.json", original, original)).toBe(true);
    expect("error" in createDesignEditorPrompt("design-abcdefabcdef.design.json", original,
      { ...original, room: { ...original.room, width: 7000 } })).toBe(true);
    expect("error" in createDesignEditorPrompt("design-abcdefabcdef.design.json", original,
      { ...original, furniture: [{ ...original.furniture[0], label: "Changed" }] })).toBe(true);
    const many = { ...original, furniture: Array.from({ length: 5 }, (_, i) =>
      ({ ...original.furniture[0], x: 1000 + 800*i, y: 1200, width: 300, depth: 300, label: "Item "+i })) };
    const changed = { ...many, furniture: many.furniture.map(item =>
      ({ ...item, x: item.x + 25, width: 325 })) };
    expect(createDesignEditorPrompt("design-abcdefabcdef.design.json", many, changed))
      .toMatchObject({ error: "Too many edits. Apply at most 8 operations per revision." });
  });
});
