import { applyDesignEdits, parseDesignEdits, type DesignEdit } from "./design-edit";
import { parseDesignSpec, type DesignSpec } from "./design-model";
import { reviewDesign } from "./design-review";

export type DesignRepairResult = {
  status: "repaired" | "no_change" | "unresolved";
  spec: DesignSpec;
  edits: DesignEdit[];
  initialBlockers: number;
  remainingBlockers: number;
  warnings: number;
  attempts: number;
  message: string;
};

const STEP = 100;
const MAX_EDITS = 8;
const RINGS = 32;
const MAX_TRIALS = 3000;

/**
 * Deterministic concept-layout repair, not an AI-generated structural design.
 * Moves only existing furniture; does not delete, resize, rotate, or overwrite the source.
 * The host Agent may propose this validated solution, but cannot approve it for a human.
 */
export function proposeDesignRepair(source: DesignSpec): DesignRepairResult {
  const parsed = parseDesignSpec(source);
  if ("error" in parsed) throw new Error(parsed.error);
  const original = parsed.spec;
  let draft = original;
  const before = reviewDesign(original);
  const edits: DesignEdit[] = [];
  let attempts = 0;
  const attempted = new Set<string>();
  if (!before.blockers) return { status: "no_change", spec: original, edits,
    initialBlockers: 0, remainingBlockers: 0, warnings: before.warnings, attempts,
    message: "No blocking geometry conflicts. A person must still review the concept." };

  for (let editNumber = 0; editNumber < MAX_EDITS && attempts < MAX_TRIALS; editNumber++) {
    const current = reviewDesign(draft);
    if (!current.blockers) break;
    const relevant = [...new Set(current.issues
      .filter(issue => issue.severity === "blocker").flatMap(issue => issue.furnitureIndices))];
    let best: { spec: DesignSpec; index: number; x: number; y: number;
      blockers: number; warnings: number; distance: number } | null = null;
    for (const index of relevant) {
      const item = draft.furniture[index];
      const rotated = item.rotation === 90 || item.rotation === 270;
      const halfWidth = (rotated ? item.depth : item.width) / 2;
      const halfDepth = (rotated ? item.width : item.depth) / 2;
      const minX = draft.room.wallThickness + halfWidth;
      const maxX = draft.room.width - draft.room.wallThickness - halfWidth;
      const minY = draft.room.wallThickness + halfDepth;
      const maxY = draft.room.depth - draft.room.wallThickness - halfDepth;
      for (let ring = 1; ring <= RINGS && attempts < MAX_TRIALS; ring++) {
        for (let dx = -ring; dx <= ring && attempts < MAX_TRIALS; dx++) {
          for (const dy of [-ring, ring]) {
            if (attempts >= MAX_TRIALS) break;
            consider(dx, dy);
          }
        }
        for (let dy = -ring + 1; dy < ring && attempts < MAX_TRIALS; dy++) {
          for (const dx of [-ring, ring]) {
            if (attempts >= MAX_TRIALS) break;
            consider(dx, dy);
          }
        }
      }
      function consider(dx: number, dy: number) {
        const x = Math.round((item.x + dx * STEP) / 25) * 25;
        const y = Math.round((item.y + dy * STEP) / 25) * 25;
        if (x < minX || x > maxX || y < minY || y > maxY) return;
        const key = [editNumber, index, x, y].join(":");
        if (attempted.has(key)) return;
        attempted.add(key);
        attempts++;
        const proposed = { ...draft, furniture: draft.furniture.map((f, i) =>
          i === index ? { ...f, x, y } : f) };
        const report = reviewDesign(proposed);
        if (report.blockers > current.blockers) return;
        const distance = Math.abs(x - item.x) + Math.abs(y - item.y);
        const improves = report.blockers < current.blockers ||
          (report.blockers === current.blockers && report.warnings < current.warnings);
        if (!improves) return;
        if (!best || report.blockers < best.blockers ||
          (report.blockers === best.blockers && report.warnings < best.warnings) ||
          (report.blockers === best.blockers && report.warnings === best.warnings &&
            distance < best.distance)) {
          best = { spec: proposed, index, x, y, blockers: report.blockers,
            warnings: report.warnings, distance };
        }
      }
    }
    if (!best) break;
    const winner = best as { spec: DesignSpec; index: number; x: number; y: number };
    edits.push({ type: "move_furniture", index: winner.index, x: winner.x, y: winner.y });
    draft = winner.spec;
  }
  const checked = reviewDesign(draft);
  const batch = edits.length ? parseDesignEdits(edits) : null;
  if (batch && "error" in batch) throw new Error("Auto repair emitted an invalid edit batch");
  if (batch && "edits" in batch) {
    const replay = applyDesignEdits(original, batch.edits);
    if ("error" in replay || JSON.stringify(replay.spec) !== JSON.stringify(draft))
      throw new Error("Auto repair failed atomic replay validation");
  }
  const status = !edits.length ? "unresolved" :
    checked.blockers === 0 ? "repaired" : "unresolved";
  return { status, spec: draft, edits, initialBlockers: before.blockers,
    remainingBlockers: checked.blockers, warnings: checked.warnings, attempts,
    message: checked.blockers === 0
      ? "AI layout proposal clears the checked 2D blockers. Human review is required."
      : "AI could not resolve every concept conflict. Human redesign is required." };
}
