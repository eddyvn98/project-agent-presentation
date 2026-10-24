import { describe, expect, it } from "vitest";
import { queueRecoveryDecision } from "../../lib/project-agent/recovery-decision";
describe("P3 deterministic recovery decision matrix", () => {
  it.each([
    ["queued", "queued", false, "dispatch"],
    ["queued", "running", false, "review"],
    ["queued", "done", false, "complete"],
    ["queued", "failed", true, "fail"],
    ["running", "running", false, "wait"],
    ["running", "running", true, "review"],
    ["running", null, true, "review"],
    ["running", "queued", true, "review"],
    ["running", "done", true, "complete"],
    ["running", "failed", true, "fail"],
    ["needs_review", "queued", true, "review"],
    ["done", "done", true, "complete"],
    ["failed", "failed", true, "fail"],
  ] as const)("queue=%s task=%s leaseExpired=%s -> %s", (queue, task, expired, expected) => {
    expect(queueRecoveryDecision(queue, task, expired)).toBe(expected);
  });
  it("never dispatches a queue state with uncertain external side effects", () => {
    for (const task of [null,"queued","running","done","failed"] as const) {
      const actual = queueRecoveryDecision("running", task, true);
      expect(actual).not.toBe("dispatch");
    }
  });
});
