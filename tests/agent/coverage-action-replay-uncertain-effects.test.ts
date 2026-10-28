import { describe, expect, it } from "vitest";
import { ActionReplayGuard, mayHaveExternalEffects } from
  "../../lib/project-agent/runtime/action-replay-guard";

describe("Agent action replay: uncertain remote completion and safe inspection", () => {
  it("blocks exact repeated mutations even when the first attempt timed out", () => {
    const guard = new ActionReplayGuard();
    const key = "workspace_apply:synthetic-batch";
    expect(guard.before("workspace_apply", key, true)).toBeNull();
    guard.markAttempt(key, true);
    expect(guard.before("workspace_apply", key, true))
      .toMatch(/already attempted/i);
    expect(guard.before("workspace_apply", "workspace_apply:new-batch", true))
      .toBeNull();
  });
  it("does not falsely treat a failed read-only query as a permanent mutation", () => {
    const guard = new ActionReplayGuard();
    const key = "browser:snapshot";
    guard.markAttempt(key, false);
    expect(guard.before("browser", key, false)).toBeNull();
    guard.record("browser", key, "connection dropped", false);
    expect(guard.before("browser", key, false)).toBeNull();
  });
  it("fences effectful scheduling and workflow changes while permitting list", () => {
    const guard = new ActionReplayGuard();
    for (const action of [{ action: "schedule", op: "create" },
      { action: "schedule", op: "update" },
      { action: "workflow", op: "delete" },
      { action: "generate_image" },
      { action: "workspace_apply" }]) {
      expect(mayHaveExternalEffects(action)).toBe(true);
      const key = JSON.stringify(action);
      guard.record(action.action, key, "unknown timeout", true);
      expect(guard.before(action.action, key, true)).toMatch(/already attempted/);
    }
    for (const action of [{ action: "schedule", op: "list" },
      { action: "workflow", op: "list" },
      { action: "browser", op: "snapshot" }])
      expect(mayHaveExternalEffects(action)).toBe(false);
  });
  it("keeps effectful reservations isolated between separate task runs", () => {
    const originalRun = new ActionReplayGuard(), nextRun = new ActionReplayGuard();
    originalRun.markAttempt("schedule:create", true);
    expect(originalRun.before("schedule", "schedule:create", true)).not.toBeNull();
    expect(nextRun.before("schedule", "schedule:create", true)).toBeNull();
  });
  it("normalizes repeated whitespace but does not conflate different observations", () => {
    const guard = new ActionReplayGuard();
    for (const observation of ["  NO   CHANGE  ", "NO CHANGE", " NO\tCHANGE\n"])
      guard.record("browser", "click:synthetic", observation);
    expect(guard.before("browser", "click:synthetic")).toMatch(/same action/i);
    expect(guard.before("browser", "click:other")).toBeNull();
    guard.record("browser", "click:synthetic", "new page state");
    expect(guard.before("browser", "click:synthetic")).toBeNull();
  });
  it("blocks repeated progress-only output but resets once real work appears", () => {
    const guard = new ActionReplayGuard();
    for (let i = 0; i < 3; i++)
      guard.record("progress", "progress:" + i, "still trying");
    expect(guard.before("progress", "progress:new")).toMatch(/progress messages/i);
    guard.record("web_fetch", "lookup", "verified evidence");
    expect(guard.before("progress", "progress:new")).toBeNull();
  });
});
