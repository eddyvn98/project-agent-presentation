import { describe, expect, it } from "vitest";
import { ActionReplayGuard, mayHaveExternalEffects } from
  "../../lib/project-agent/runtime/action-replay-guard";

describe("C13 external-effect replay and loop resilience", () => {
  it("reserves attempted external effects before the result becomes known", () => {
    const guard = new ActionReplayGuard();
    expect(guard.before("workspace_apply", "write-file", true)).toBeNull();
    guard.markAttempt("write-file", true);
    expect(guard.before("workspace_apply", "write-file", true)).toMatch(/already attempted/);
    expect(guard.before("workspace_apply", "write-other-file", true)).toBeNull();
    guard.record("workspace_apply", "write-other-file", "timeout", true);
    expect(guard.before("workspace_apply", "write-other-file", true)).toMatch(/already attempted/);
    expect(guard.noteBlocked("write-file")).toBe(1);
    expect(guard.noteBlocked("write-file")).toBe(2);
    expect(guard.noteBlocked("write-other-file")).toBe(1);
  });
  it("blocks a three-step identical loop without rejecting a new action", () => {
    const guard = new ActionReplayGuard();
    for (let i = 0; i < 3; i++) guard.record("browser", "click-ref", "  SAME  response  ");
    expect(guard.before("browser", "click-ref")).toMatch(/same action/i);
    expect(guard.before("browser", "inspect-dom")).toBeNull();
    guard.record("browser", "inspect-dom", "Different result");
    expect(guard.before("browser", "click-ref")).toBeNull();
  });
  it("detects alternating loops and ignores an unrelated recovery step", () => {
    const guard = new ActionReplayGuard();
    for (let i = 0; i < 3; i++) {
      guard.record("browser", "open", "unchanged page");
      guard.record("browser", "back", "unchanged history");
    }
    expect(guard.before("browser", "open")).toMatch(/two-action cycle/i);
    expect(guard.before("browser", "fresh-snapshot")).toBeNull();
  });
  it("counts progress-only actions but resets after real work", () => {
    const guard = new ActionReplayGuard();
    for (let i = 0; i < 3; i++) guard.record("progress", "status-" + i, "still running");
    expect(guard.before("progress", "another-progress")).toMatch(/progress messages/);
    guard.record("browser", "snapshot", "new UI");
    expect(guard.before("progress", "another-progress")).toBeNull();
  });
  it("marks effectful categories conservatively while allowing read-only listing", () => {
    for (const action of ["workspace_apply", "generate_image"])
      expect(mayHaveExternalEffects({ action })).toBe(true);
    expect(mayHaveExternalEffects({ action: "schedule", op: "create" })).toBe(true);
    expect(mayHaveExternalEffects({ action: "workflow", op: "stop" })).toBe(true);
    expect(mayHaveExternalEffects({ action: "schedule", op: "list" })).toBe(false);
    expect(mayHaveExternalEffects({ action: "browser", op: "snapshot" })).toBe(false);
  });
});
