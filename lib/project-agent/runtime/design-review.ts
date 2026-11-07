import type { DesignFurniture, DesignOpening, DesignSpec } from "./design-model";

export type DesignReviewIssue = {
  code: "furniture_overlap" | "door_clearance" | "tight_spacing";
  severity: "blocker" | "warning";
  furnitureIndices: number[];
  openingIndex?: number;
  message: string;
};
export type DesignReview = {
  status: "needs_changes" | "human_review_required";
  blockers: number;
  warnings: number;
  issues: DesignReviewIssue[];
};

type Rect = { minX: number; minY: number; maxX: number; maxY: number };
const aisle = 900; // Concept check only, NOT a jurisdiction-specific building-code minimum.
const spacing = 600;
const tolerance = 1;

function bounds(item: DesignFurniture): Rect {
  const rotated = item.rotation === 90 || item.rotation === 270;
  const halfW = (rotated ? item.depth : item.width) / 2;
  const halfD = (rotated ? item.width : item.depth) / 2;
  return { minX: item.x - halfW, maxX: item.x + halfW,
    minY: item.y - halfD, maxY: item.y + halfD };
}
function intersection(a: Rect, b: Rect) {
  return { x: Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX),
    y: Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) };
}
function doorApproach(opening: DesignOpening, spec: DesignSpec): Rect {
  const { room } = spec;
  const start = opening.offset, end = opening.offset + opening.width;
  switch (opening.wall) {
    case "south": return { minX: start, maxX: end, minY: room.wallThickness,
      maxY: room.wallThickness + aisle };
    case "north": return { minX: start, maxX: end, minY: room.depth - room.wallThickness - aisle,
      maxY: room.depth - room.wallThickness };
    case "west": return { minX: room.wallThickness, maxX: room.wallThickness + aisle,
      minY: start, maxY: end };
    case "east": return { minX: room.width - room.wallThickness - aisle,
      maxX: room.width - room.wallThickness, minY: start, maxY: end };
  }
}

/**
 * Fast, deterministic 2D risk review shared by Agent and UI.
 * Flags possible conflicts for human approval; it is NOT a structural or code-compliance certificate.
 * Invalid room dimensions must be rejected by parseDesignSpec before calling this.
 */
export function reviewDesign(spec: DesignSpec): DesignReview {
  const issues: DesignReviewIssue[] = [];
  const boxes = spec.furniture.map(bounds);
  let blockers = 0, warnings = 0;
  function record(issue: DesignReviewIssue) {
    if (issue.severity === "blocker") blockers++; else warnings++;
    issues.push(issue);
  }
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      const overlap = intersection(boxes[a], boxes[b]);
      const fa = spec.furniture[a].label, fb = spec.furniture[b].label;
      if (overlap.x > tolerance && overlap.y > tolerance) {
        record({ code: "furniture_overlap", severity: "blocker",
          furnitureIndices: [a, b],
          message: `Possible 2D collision: "${fa}" and "${fb}" overlap. Verify elevations and reposition.` });
      } else {
        const dx = Math.max(0, boxes[a].minX - boxes[b].maxX, boxes[b].minX - boxes[a].maxX);
        const dy = Math.max(0, boxes[a].minY - boxes[b].maxY, boxes[b].minY - boxes[a].maxY);
        const alongX = overlap.x > tolerance && dy > tolerance && dy < spacing;
        const alongY = overlap.y > tolerance && dx > tolerance && dx < spacing;
        if (alongX || alongY)
          record({ code: "tight_spacing", severity: "warning",
            furnitureIndices: [a, b],
            message: `Concept clearance under ${spacing} mm between "${fa}" and "${fb}". Check circulation.` });
      }
    }
  }
  spec.openings.forEach((opening, openingIndex) => {
    if (opening.kind !== "door") return;
    const approach = doorApproach(opening, spec);
    boxes.forEach((box, i) => {
      const overlap = intersection(approach, box);
      if (overlap.x > tolerance && overlap.y > tolerance)
        record({ code: "door_clearance", severity: "blocker", furnitureIndices: [i], openingIndex,
          message: `Possible blocked ${opening.wall} door approach: "${spec.furniture[i].label}" inside ${aisle} mm check zone.` });
    });
  });
  return { status: blockers ? "needs_changes" : "human_review_required",
    blockers, warnings, issues };
}
