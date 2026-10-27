import { describe, expect, it } from "vitest";
import { queueRecoveryDecision } from "../../lib/project-agent/recovery-decision";
describe("C2 independent queue recovery invariants", () => {
  it("requires review even if an orphaned task appears terminal after uncertain effects", () => {
    expect(queueRecoveryDecision("needs_review", "done", false)).toBe("review");
    expect(queueRecoveryDecision("needs_review", null, true)).toBe("review");
    expect(queueRecoveryDecision("running", "queued", true)).toBe("review");
    expect(queueRecoveryDecision("running", "running", false)).toBe("wait");
  });
  it("only dispatches safe queued work, never an uncertain running state", () => {
    expect(queueRecoveryDecision("queued", "queued", false)).toBe("dispatch");
    expect(queueRecoveryDecision("queued", "running", true)).toBe("review");
    expect(queueRecoveryDecision("queued", null, false)).toBe("fail");
    expect(queueRecoveryDecision("queued", "done", false)).toBe("complete");
    expect(queueRecoveryDecision("done", "running", true)).toBe("complete");
    expect(queueRecoveryDecision("failed", "queued", false)).toBe("fail");
  });
});
