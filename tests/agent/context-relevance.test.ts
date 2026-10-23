import { describe, expect, it } from "vitest";
import { clipHistoryExcerpt, rankRelevantHistory } from "../../lib/project-agent/context-relevance";

describe("Project Agent context relevance", () => {
  it("selects matching older work instead of unrelated recent work", () => {
    const history = [
      "Last task: prepare a floor plan for a school",
      "Earlier task: adjust a project timeline",
      "Older task: revenue break-even by product units and cost",
    ];
    expect(rankRelevantHistory(history, "Recompute revenue break-even by units", (x) => x, 2))
      .toEqual([history[2]]);
  });
  it("uses recent history for short follow-ups without useful search terms", () => {
    expect(rankRelevantHistory(["newest", "older"], "vậy", (x) => x, 1)).toEqual(["newest"]);
  });
  it("keeps the source identity when trimming a long history excerpt", () => {
    const value = "### Project conversation 123\n" + "x".repeat(4000) + "\nCurrent decision: approved.";
    const clipped = clipHistoryExcerpt(value, 300);
    expect(clipped).toContain("Project conversation 123");
    expect(clipped).toContain("Current decision: approved.");
    expect(clipped.length).toBeLessThanOrEqual(300);
  });
});
