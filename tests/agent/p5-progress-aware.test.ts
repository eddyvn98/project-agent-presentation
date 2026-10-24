import { describe, expect, it } from "vitest";
import { StallGuard, stallLimits } from "../../lib/project-agent/runtime/stall-guard";
import { ActionReplayGuard } from "../../lib/project-agent/runtime/action-replay-guard";
import { hasVerifiedMilestone } from "../../lib/project-agent/runtime/progress-evidence";
describe("P5 progress-aware technical guard", () => {
  it("tracks identical no-progress outputs, not changed results", () => {
    const guard = new StallGuard();
    for (let n = 0; n < 9; n++) guard.noteAction("read", false, "page " + n);
    expect(guard.check({ step: 10, elapsedMs: 1000, waitedMs: 0, tokens: 100 })).toEqual({});
    for (let n = 0; n < 5; n++) guard.noteAction("read", false, "unchanged");
    expect(guard.check({ step: 11, elapsedMs: 1000, waitedMs: 0, tokens: 100 }).stop).toMatch(/same action/);
  });
  it("grants bounded extra turns only for distinct successful milestones", () => {
    const guard = new StallGuard();
    expect(guard.additionalSteps(60)).toBe(0);
    for (let n = 0; n < 12; n++) guard.noteMilestone(n + 1, "saved-" + n);
    expect(guard.additionalSteps(13)).toBe(30);
    expect(guard.additionalSteps(26)).toBe(0);
    guard.noteMilestone(27, "saved-0");
    expect(guard.additionalSteps(27)).toBe(0);
  });
  it("does not treat self-reported progress as a verified milestone", () => {
    expect(hasVerifiedMilestone({ action: "progress" }, { text: "Done" })).toBe(false);
    expect(hasVerifiedMilestone({ action: "shell" }, { text: "All tests passed" })).toBe(false);
    expect(hasVerifiedMilestone({ action: "workspace_apply" }, { text: "Nothing was saved" })).toBe(false);
    expect(hasVerifiedMilestone({ action: "workspace_apply" }, { text: "Saved 2 of 2 command(s); board revision 3 -> 4." })).toBe(true);
    expect(hasVerifiedMilestone({ action: "write_file" }, { text: "Wrote outputs/a.md (300 characters)." })).toBe(true);
    expect(hasVerifiedMilestone({ action: "render" }, { text: "ok", image: {} })).toBe(true);
    expect(hasVerifiedMilestone({ action: "render" }, { text: "ok", image: {}, failed: true })).toBe(false);
  });
  it("reserves external mutations before remote completion", () => {
    const guard = new ActionReplayGuard();
    expect(guard.before("workspace_apply", "batch-1", true)).toBeNull();
    guard.markAttempt("batch-1", true);
    expect(guard.before("workspace_apply", "batch-1", true)).toMatch(/already attempted/);
    expect(guard.noteBlocked("batch-1")).toBe(1);
    expect(guard.noteBlocked("batch-1")).toBe(2);
  });
  it("retains hard technical safeguards regardless of milestones", () => {
    const guard = new StallGuard(stallLimits());
    guard.noteMilestone(1, "artifact");
    expect(guard.check({ step: 2, elapsedMs: 1000, waitedMs: 0, tokens: 999999 }).stop).toMatch(/new tokens/);
  });
});
