import { describe, expect, it } from "vitest";
import { taskRecoveryPlan } from "../../lib/project-agent/task-recovery-policy";
const options = { durableQueue: false, orphaned: false };
describe("P7 restart safety decision", () => {
  it("re-dispatches queued work only when it was never cancelled", () => {
    expect(taskRecoveryPlan({ status: "queued" }, options)).toBe("dispatch");
    expect(taskRecoveryPlan({ status: "queued", cancelled: true }, options)).toBe("stop");
  });
  it("does not replay a running task after a server restart", () => {
    expect(taskRecoveryPlan({ status: "running" }, { ...options, orphaned: true })).toBe("review");
    expect(taskRecoveryPlan({ status: "running", cancelled: true }, { ...options, orphaned: true })).toBe("stop");
  });
  it("defers durable running tasks to the owning lease worker", () => {
    expect(taskRecoveryPlan({ status: "running" }, { durableQueue: true, orphaned: false }))
      .toBe("wait_for_lease");
    expect(taskRecoveryPlan({ status: "running" }, { durableQueue: true, orphaned: true }))
      .toBe("wait_for_lease");
  });
  it("does not resurrect already terminal states", () => {
    for (const status of ["done", "failed"] as const)
      expect(taskRecoveryPlan({ status, cancelled: true }, { ...options, orphaned: true })).toBe("none");
  });
  it("does not replay non-orphaned active running work", () => {
    expect(taskRecoveryPlan({ status: "running" }, options)).toBe("none");
  });
});
