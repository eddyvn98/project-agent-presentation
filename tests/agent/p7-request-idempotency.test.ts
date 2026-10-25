import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deterministicAgentTaskId } from "../../lib/project-agent/task-idempotency";
import { requestTaskKey, fingerprintTaskBody } from "../../lib/project-agent/request-idempotency";
describe("P7 HTTP idempotency", () => {
  it("is stable for an owner and Project, isolated from other owners", () => {
    const key = randomUUID(), a = requestTaskKey("proj_a", key)!;
    const b = requestTaskKey("proj_b", key)!;
    expect(deterministicAgentTaskId("owner@example.test", a)).toBe(deterministicAgentTaskId("owner@example.test", a));
    expect(deterministicAgentTaskId("owner@example.test", a)).not.toBe(deterministicAgentTaskId("owner@example.test", b));
    expect(deterministicAgentTaskId("other@example.test", a)).not.toBe(deterministicAgentTaskId("owner@example.test", a));
  });
  it("rejects unsafe keys and fingerprints changed request bodies", () => {
    expect(requestTaskKey("proj_a", null)).toBeUndefined();
    expect(() => requestTaskKey("proj_a", "not-uuid")).toThrow(/UUID/);
    expect(fingerprintTaskBody("proj_a", { prompt: "A" })).not.toBe(fingerprintTaskBody("proj_a", { prompt: "B" }));
    expect(() => fingerprintTaskBody("proj_a", { prompt: "X".repeat(300000) })).toThrow(/too large/);
  });
});
