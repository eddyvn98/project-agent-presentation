import { describe, expect, it } from "vitest";
import { parseDesignSpec } from "../../lib/project-agent/runtime/design-model";
import { reviewDesign } from "../../lib/project-agent/runtime/design-review";

const base = {
  title: "AI reviewed concept", units: "mm",
  room: { width: 6000, depth: 5000, height: 3000, wallThickness: 150 },
  openings: [{ wall: "south", kind: "door", offset: 2700, width: 900, height: 2100, sill: 0 }],
  furniture: [
    { kind: "table", label: "Table", x: 1700, y: 2100, width: 1100, depth: 750, height: 750, rotation: 0 },
    { kind: "chair", label: "Chair", x: 4000, y: 3200, width: 550, depth: 550, height: 800, rotation: 90 },
  ],
};
function valid(raw: unknown) {
  const checked = parseDesignSpec(raw);
  if ("error" in checked) throw Error(checked.error);
  return checked.spec;
}
describe("AI-first design preflight, human approval", () => {
  it("returns explicit human review status on an unobstructed concept", () => {
    const result = reviewDesign(valid(base));
    expect(result).toMatchObject({ status: "human_review_required", blockers: 0 });
    expect(result.issues.every(issue => issue.severity === "warning")).toBe(true);
  });
  it("flags two furniture objects occupying the same plan area", () => {
    const raw = { ...base, furniture: [
      { ...base.furniture[0] }, { ...base.furniture[1], x: 1700, y: 2100 },
    ] };
    const result = reviewDesign(valid(raw));
    expect(result.status).toBe("needs_changes");
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "furniture_overlap", severity: "blocker", furnitureIndices: [0, 1] }),
    ]));
  });
  it("flags an entry blocked by furniture without rejecting the source model", () => {
    const raw = { ...base, furniture: [{
      ...base.furniture[0], x: 3000, y: 550, width: 600, depth: 700,
    }] };
    const model = valid(raw);
    const result = reviewDesign(model);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "door_clearance", severity: "blocker", openingIndex: 0 }),
    ]));
    expect(parseDesignSpec(model)).toEqual({ spec: model });
  });
  it("accounts for 90-degree rotation in collision bounds", () => {
    const raw = { ...base, furniture: [
      { ...base.furniture[0], x: 2400, y: 2200, width: 1400, depth: 350, rotation: 90 },
      { ...base.furniture[1], x: 2700, y: 2200, width: 350, depth: 350, rotation: 0 },
    ] };
    expect(reviewDesign(valid(raw)).issues.some(issue => issue.code === "furniture_overlap")).toBe(true);
  });
  it("detects narrow spacing as advisory, not a code compliance conclusion", () => {
    const raw = { ...base, furniture: [
      { ...base.furniture[0], x: 1900, y: 2400, width: 800, depth: 600 },
      { ...base.furniture[1], x: 3050, y: 2400, width: 800, depth: 600 },
    ] };
    const result = reviewDesign(valid(raw));
    expect(result).toMatchObject({ status: "human_review_required", blockers: 0 });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "tight_spacing", severity: "warning" }),
    ]));
  });
  it("never mutates the source scene during review", () => {
    const spec = valid(base);
    const initial = JSON.stringify(spec);
    for (let i = 0; i < 20; i++) expect(reviewDesign(spec).blockers).toBe(0);
    expect(JSON.stringify(spec)).toBe(initial);
  });
});
