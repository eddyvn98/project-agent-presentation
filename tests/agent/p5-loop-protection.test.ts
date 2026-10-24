import { describe, expect, it } from "vitest";
import { ActionReplayGuard, mayHaveExternalEffects } from "../../lib/project-agent/runtime/action-replay-guard";

describe("P5 technical loop protection", () => {
  it("blocks repeated external mutations after the first attempt", () => {
    const guard = new ActionReplayGuard();
    expect(guard.before("workspace_apply", "same", true)).toBeNull();
    guard.record("workspace_apply", "same", "applied", true);
    expect(guard.before("workspace_apply", "same", true)).toMatch(/already attempted/);
    expect(guard.before("workspace_apply", "different", true)).toBeNull();
  });
  it("stops identical actions returning unchanged results", () => {
    const guard = new ActionReplayGuard();
    for (let n = 0; n < 3; n++) {
      expect(guard.before("shell", "check")).toBeNull();
      guard.record("shell", "check", "no changes");
    }
    expect(guard.before("shell", "check")).toMatch(/same action/);
  });
  it("detects repeating two-action cycles", () => {
    const guard = new ActionReplayGuard();
    for (let n = 0; n < 3; n++) {
      guard.record("browser", "observe", "identical DOM");
      guard.record("shell", "probe", "identical output");
    }
    expect(guard.before("browser", "observe")).toMatch(/two-action cycle/);
  });
  it("does not stop progressing work with the same read action", () => {
    const guard = new ActionReplayGuard();
    for (let n = 0; n < 10; n++) {
      expect(guard.before("browser", "observe")).toBeNull();
      guard.record("browser", "observe", "step " + n);
    }
  });
  it("detects a stream of progress notes without actions", () => {
    const guard = new ActionReplayGuard();
    for (let n = 0; n < 3; n++) guard.record("progress", "progress-" + n, "working");
    expect(guard.before("progress", "progress-4")).toMatch(/progress messages/);
  });
  it("classifies state-changing actions without classifying reads as writes", () => {
    expect(mayHaveExternalEffects({ action: "workspace_apply" })).toBe(true);
    expect(mayHaveExternalEffects({ action: "schedule", op: "create" })).toBe(true);
    expect(mayHaveExternalEffects({ action: "schedule", op: "list" })).toBe(false);
    expect(mayHaveExternalEffects({ action: "web_search" })).toBe(false);
  });
});
