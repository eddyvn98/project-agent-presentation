import { describe, expect, it } from "vitest";
import { parseDesignSpec } from "../../lib/project-agent/runtime/design-model";
import { parseDesignEdits, applyDesignEdits } from "../../lib/project-agent/runtime/design-edit";
import { proposeDesignRepair } from "../../lib/project-agent/runtime/design-repair";
import { reviewDesign } from "../../lib/project-agent/runtime/design-review";

const source = {
  title: "AI proposal human review", units: "mm",
  room: { width: 6000, depth: 4500, height: 3000, wallThickness: 150 },
  openings: [{ wall: "south", kind: "door", offset: 200, width: 900, height: 2100, sill: 0 }],
  furniture: [
    { kind: "table", label: "Desk", x: 3000, y: 2200, width: 1400,
      depth: 900, height: 750, rotation: 0 },
    { kind: "chair", label: "Chair", x: 3100, y: 2400, width: 550,
      depth: 550, height: 750, rotation: 90 },
  ],
};
function valid(raw: unknown) {
  const res = parseDesignSpec(raw);
  if ("error" in res) throw Error(res.error);
  return res.spec;
}
describe("AI layout repair is bounded, explainable and not a human approval", () => {
  it("detects a collision and produces a replayable independent proposal", () => {
    const original = valid(source);
    const json = JSON.stringify(original);
    expect(reviewDesign(original).blockers).toBeGreaterThan(0);
    const fixed = proposeDesignRepair(original);
    expect(fixed.status).toBe("repaired");
    expect(fixed.initialBlockers).toBeGreaterThan(0);
    expect(fixed.remainingBlockers).toBe(0);
    expect(fixed.edits.length).toBeGreaterThan(0);
    expect(fixed.edits.length).toBeLessThanOrEqual(8);
    expect(fixed.message).toContain("Human review");
    const typed = parseDesignEdits(fixed.edits);
    if ("error" in typed) throw Error(typed.error);
    expect(applyDesignEdits(original, typed.edits)).toEqual({ spec: fixed.spec });
    expect(JSON.stringify(original)).toBe(json);
    expect(proposeDesignRepair(original)).toEqual(fixed);
  });
  it("clears a blocked door when another valid location exists", () => {
    const raw = { ...source, furniture: [{
      ...source.furniture[0], x: 600, y: 600, width: 500, depth: 600,
    }] };
    const original = valid(raw);
    expect(reviewDesign(original).issues.some(issue => issue.code === "door_clearance")).toBe(true);
    const result = proposeDesignRepair(original);
    expect(result.status).toBe("repaired");
    expect(reviewDesign(result.spec).blockers).toBe(0);
  });
  it("leaves a healthy source untouched and keeps approval in human hands", () => {
    const raw = { ...source, furniture: [source.furniture[0]] };
    const original = valid(raw);
    const fixed = proposeDesignRepair(original);
    expect(fixed).toMatchObject({ status: "no_change", edits: [], spec: original, remainingBlockers: 0 });
  });
  it("does not silently delete or resize objects to make a crowded concept fit", () => {
    const raw = { ...source, room: { ...source.room, width: 2800, depth: 2800 },
      openings: [], furniture: Array.from({ length: 11 }, (_, i) => ({
        ...source.furniture[1], label: "Chair " + i, x: 800 + (i%3)*500,
        y: 800 + Math.floor(i/3)*450, width: 700, depth: 700,
      })) };
    const original = valid(raw);
    const result = proposeDesignRepair(original);
    expect(result.edits.length).toBeLessThanOrEqual(8);
    expect(result.spec.furniture.length).toBe(original.furniture.length);
    result.spec.furniture.forEach((f, i) => {
      expect(f.label).toBe(original.furniture[i].label);
      expect(f.kind).toBe(original.furniture[i].kind);
      expect(f.width).toBe(original.furniture[i].width);
      expect(f.height).toBe(original.furniture[i].height);
    });
    expect(result.remainingBlockers).toBeGreaterThanOrEqual(0);
    if (result.remainingBlockers > 0) expect(result.status).toBe("unresolved");
  }, 20_000);
  it("fuzzes 24 seeded overlaps with deterministic, immutable proposals", () => {
    for (let seed = 1; seed <= 24; seed++) {
      const x = 1900 + (seed % 8) * 150;
      const y = 1800 + (seed % 6) * 100;
      const raw = { ...source, furniture: [
        { ...source.furniture[0], x, y },
        { ...source.furniture[1], x: x+50, y: y+50 },
      ] };
      const model = valid(raw), old = JSON.stringify(model);
      const fixed = proposeDesignRepair(model);
      expect(fixed.remainingBlockers, "seed=" + seed).toBeLessThanOrEqual(fixed.initialBlockers);
      expect(fixed.edits.length).toBeLessThanOrEqual(8);
      expect(JSON.stringify(model)).toBe(old);
      expect(proposeDesignRepair(model)).toEqual(fixed);
    }
  }, 30_000);
});
