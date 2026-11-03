import { describe, expect, it } from "vitest";
import { applyDesignEdits, parseDesignEdits } from "../../lib/project-agent/runtime/design-edit";
import { parseRuntimeAction } from "../../lib/project-agent/runtime/actions";
import { denyReason } from "../../lib/project-agent/runtime/policy";

const source = {
  title: "Revision demo", units: "mm" as const,
  room: { width: 8000, depth: 5000, height: 3000, wallThickness: 150 },
  openings: [{ wall: "south", kind: "door", offset: 700, width: 900, height: 2100, sill: 0 }],
  furniture: [{ kind: "cabinet", x: 3200, y: 2400, width: 1200, depth: 500, height: 1800, rotation: 0, label: "Storage" }],
};
function edits(items: unknown) {
  const result = parseDesignEdits(items);
  expect("edits" in result).toBe(true);
  if ("error" in result) throw new Error(result.error);
  return result.edits;
}

describe("headless design revisions", () => {
  it("moves a door by 300 mm while preserving source and other objects", () => {
    const original = JSON.stringify(source);
    const changed = applyDesignEdits(source, edits([{ type: "move_opening", index: 0, offset: 1000 }]));
    expect("spec" in changed).toBe(true);
    if ("spec" in changed) {
      expect(changed.spec.openings[0].offset).toBe(1000);
      expect(changed.spec.furniture[0]).toMatchObject(source.furniture[0]);
    }
    expect(JSON.stringify(source)).toBe(original);
  });
  it("supports sequential furniture edits without mutating prior revisions", () => {
    const first = applyDesignEdits(source, edits([
      { type: "move_furniture", index: 0, x: 3700, y: 2700 },
      { type: "resize_furniture", index: 0, width: 1600 },
      { type: "rename_furniture", index: 0, label: "New storage" },
    ]));
    expect("spec" in first).toBe(true);
    if (!("spec" in first)) return;
    expect(first.spec.furniture[0]).toMatchObject({ x: 3700, y: 2700, width: 1600, label: "New storage" });
    const next = applyDesignEdits(first.spec, edits([{ type: "rotate_furniture", index: 0, rotation: 90 }]));
    expect("spec" in next).toBe(true);
    if ("spec" in next) expect(next.spec.furniture[0].rotation).toBe(90);
    expect(first.spec.furniture[0].rotation).toBe(0);
  });
  it("rejects invalid geometry rather than clipping outside the room", () => {
    const original = JSON.stringify(source);
    for (const proposed of [
      [{ type: "move_opening", index: 0, offset: 7800 }],
      [{ type: "move_furniture", index: 0, x: 200, y: 2700 }],
      [{ type: "resize_furniture", index: 0, width: 99999 }],
      [{ type: "move_opening", index: 5, offset: 900 }],
    ]) {
      expect("error" in applyDesignEdits(source, edits(proposed))).toBe(true);
    }
    expect(JSON.stringify(source)).toBe(original);
  });
  it("rejects non-finite, oversized and unrecognized patch requests", () => {
    for (const proposed of [
      [], new Array(9).fill({ type: "remove_furniture", index: 0 }),
      [{ type: "move_furniture", index: 0, x: "100", y: 500 }],
      [{ type: "move_opening", index: -1, offset: 100 }],
      [{ type: "remove_furniture", index: 1.5 }],
      [{ type: "rename_furniture", index: 0, label: "" }],
      [{ type: "run_python", command: "os.system('rm -rf /')" }],
    ]) expect("error" in parseDesignEdits(proposed)).toBe(true);
  });
  it("limits source to saved design models and denies reviewer edits", () => {
    const valid = parseRuntimeAction(JSON.stringify({
      action: "design_edit", source: "outputs/design-abcdefabcdef.design.json",
      edits: [{ type: "move_opening", index: 0, offset: 1200 }],
    }));
    expect("error" in valid).toBe(false);
    if ("error" in valid) return;
    expect(denyReason({ readOnly: true }, valid)).toMatch(/reviewer/i);
    for (const path of [
      "../../inputs/design.json", "/work/outputs/design-abcdefabcdef.design.json",
      "outputs/design-abcdefabcdef.design.json/../other", "outputs/other.design.json",
    ]) expect("error" in parseRuntimeAction(JSON.stringify({
      action: "design_edit", source: path, edits: [{ type: "remove_furniture", index: 0 }],
    }))).toBe(true);
  });
  it("allows removal and addition with full model validation", () => {
    const changed = applyDesignEdits(source, edits([
      { type: "remove_furniture", index: 0 },
      { type: "add_furniture", furniture: {
        kind: "desk", x: 4000, y: 2000, width: 1400, depth: 700, height: 750, rotation: 0, label: "Desk",
      } },
    ]));
    expect("spec" in changed).toBe(true);
    if ("spec" in changed) expect(changed.spec.furniture).toHaveLength(1);
    const invalid = applyDesignEdits(source, edits([{ type: "add_opening", opening: {
      kind: "window", wall: "south", offset: 800, width: 1400, height: 1000, sill: 1000,
    } }]));
    expect("error" in invalid).toBe(true);
  });
});
