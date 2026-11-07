import { describe, expect, it } from "vitest";
import { parseDesignSpec, type DesignSpec } from "../../lib/project-agent/runtime/design-model";
import { applyDesignEdits, parseDesignEdits } from "../../lib/project-agent/runtime/design-edit";
import { createDesignEditorPrompt, moveDesignFurniture, updateDesignFurniture } from "../../lib/project-agent/design-editor";

const seeds = [0x2f41, 0xbeef, 0xa11ce, 0xcad, 0x1234567, 0xdecaf, 0x500d, 0x9091];
const sourceName = "design-abcdefabcdef.design.json";

function random(seed: number) {
  let state = seed >>> 0;
  return (max: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % max;
  };
}
function origin(seed: number): DesignSpec {
  const width = 6500 + (seed % 5) * 500, depth = 5500 + (seed % 4) * 500;
  const raw = {
    title: "Seed " + seed, units: "mm",
    room: { width, depth, height: 3000, wallThickness: 151 },
    openings: [
      { wall: "south", kind: "door", offset: 700, width: 900, height: 2100, sill: 0 },
      { wall: "east", kind: "window", offset: 1800, width: 1100, height: 1100, sill: 900 },
    ],
    furniture: [
      { kind: "table", label: "Meeting", x: 1500, y: 1600, width: 1201, depth: 801, height: 750, rotation: 0 },
      { kind: "chair", label: "Seat", x: 3400, y: 2800, width: 601, depth: 601, height: 750, rotation: 90 },
      { kind: "cabinet", label: "Storage", x: width - 1400, y: depth - 1200,
        width: 901, depth: 501, height: 1800, rotation: 270 },
    ],
  };
  const parsed = parseDesignSpec(raw);
  if ("error" in parsed) throw Error("Invalid fuzz fixture seed=" + seed + ": " + parsed.error);
  return parsed.spec;
}
function geometry(spec: DesignSpec) {
  const { wallThickness: wall, width, depth } = spec.room;
  for (const f of spec.furniture) {
    const rotated = f.rotation === 90 || f.rotation === 270;
    const w = (rotated ? f.depth : f.width) / 2;
    const d = (rotated ? f.width : f.depth) / 2;
    expect(f.x - w).toBeGreaterThanOrEqual(wall);
    expect(f.x + w).toBeLessThanOrEqual(width - wall);
    expect(f.y - d).toBeGreaterThanOrEqual(wall);
    expect(f.y + d).toBeLessThanOrEqual(depth - wall);
    for (const value of [f.x, f.y, f.width, f.depth, f.height]) expect(Number.isFinite(value)).toBe(true);
  }
}
function changeCount(a: DesignSpec, b: DesignSpec) {
  return a.furniture.reduce((total, f, i) => total +
    Number(f.x !== b.furniture[i].x || f.y !== b.furniture[i].y) +
    Number(f.width !== b.furniture[i].width || f.depth !== b.furniture[i].depth), 0);
}
function replay(a: DesignSpec, b: DesignSpec, context: string) {
  const result = createDesignEditorPrompt(sourceName, a, b);
  if (!changeCount(a, b)) {
    expect(result, context).toMatchObject({ error: "There are no changes to apply." });
    return;
  }
  if ("error" in result) throw Error(context + " rejected valid draft: " + result.error);
  expect(result.edits.length).toBeGreaterThan(0);
  expect(result.edits.length).toBeLessThanOrEqual(8);
  const parsed = parseDesignEdits(result.edits);
  if ("error" in parsed) throw Error(context + " invalid typed edit: " + parsed.error);
  const applied = applyDesignEdits(a, parsed.edits);
  if ("error" in applied) throw Error(context + " rejected typed replay: " + applied.error);
  expect(applied.spec, context).toEqual(b);
  expect(result.prompt).toContain("design_edit");
}

describe("CAD/BIM deterministic stateful fuzz — replay with seed", () => {
  for (const seed of seeds) {
    it("runs 350 real geometry mutations, seed=" + seed, () => {
      const pick = random(seed);
      const first = origin(seed);
      const immutableSource = JSON.stringify(first);
      let draft = first;
      const trace: string[] = [];
      for (let step = 0; step < 350; step++) {
        const index = pick(draft.furniture.length);
        const action = pick(6);
        const before = JSON.stringify(draft);
        const item = draft.furniture[index];
        let result;
        if (action <= 2) {
          const x = pick(draft.room.width + 8000) - 4000 + pick(100) / 100;
          const y = pick(draft.room.depth + 8000) - 4000 + pick(100) / 100;
          trace.push("move[" + index + "](" + x + "," + y + ")");
          result = moveDesignFurniture(draft, index, x, y);
        } else {
          const field = action === 3 ? "width" : action === 4 ? "depth" : (pick(2) ? "width" : "depth");
          const value = action === 5 ? item[field] + (pick(7) - 3) * 100
            : pick(8500) - 1000 + pick(100) / 100;
          trace.push("resize[" + index + "]." + field + "=" + value);
          result = updateDesignFurniture(draft, index, { [field]: value });
        }
        if (trace.length > 14) trace.shift();
        try {
          expect(JSON.stringify(draft)).toBe(before);
          if ("spec" in result) {
            geometry(result.spec);
            expect(parseDesignSpec(result.spec)).toEqual(result);
            draft = result.spec;
          } else {
            expect(result.error.length).toBeGreaterThan(0);
            expect(JSON.stringify(draft)).toBe(before);
          }
          expect(JSON.stringify(first)).toBe(immutableSource);
          if (step % 13 === 0) replay(first, draft,
            "seed=" + seed + " step=" + step + " trace=" + trace.join(" | "));
        } catch (error) {
          throw Error("CAD FUZZ FAIL seed=" + seed + " step=" + step +
            " trace=" + trace.join(" | ") + " cause=" + String(error));
        }
      }
      replay(first, draft, "seed=" + seed + " final");
      expect(JSON.stringify(first)).toBe(immutableSource);
    });
  }

  it("rejects 512 adversarial operation payloads without changing the source", () => {
    const src = origin(0xcad);
    const original = JSON.stringify(src);
    const pick = random(0xbadf00d);
    for (let i = 0; i < 512; i++) {
      const bad = [
        null, [], Array.from({ length: 9 }, () => ({ type: "remove_furniture", index: 0 })),
        [{ type: "unknown" }],
        [{ type: "move_furniture", index: -1, x: 1000, y: 1000 }],
        [{ type: "move_furniture", index: 1.1, x: 1000, y: 1000 }],
        [{ type: "move_furniture", index: 0, x: Number.NaN, y: 1000 }],
        [{ type: "move_furniture", index: 0, x: Infinity, y: 1000 }],
        [{ type: "move_furniture", index: 0, x: "1000", y: 1000 }],
        [{ type: "rotate_furniture", index: 0, rotation: 45 }],
        [{ type: "resize_furniture", index: 0 }],
        [{ type: "rename_furniture", index: 0, label: " " }],
      ][pick(12)];
      const parsed = parseDesignEdits(bad);
      expect("error" in parsed, "bad case #" + i).toBe(true);
      expect(JSON.stringify(src)).toBe(original);
    }
  });

  it("rolls back a valid first edit when a later edit crosses a wall or targets a missing object", () => {
    const src = origin(0x123456);
    const original = JSON.stringify(src);
    const batches = [
      [{ type: "move_furniture", index: 0, x: 2000, y: 2100 },
        { type: "resize_furniture", index: 0, width: 6500 }],
      [{ type: "move_furniture", index: 0, x: 2000, y: 2100 },
        { type: "remove_furniture", index: 63 }],
    ];
    for (const batch of batches) {
      const parsed = parseDesignEdits(batch);
      if ("error" in parsed) throw Error(parsed.error);
      expect("error" in applyDesignEdits(src, parsed.edits)).toBe(true);
      expect(JSON.stringify(src)).toBe(original);
    }
  });
});
