import { describe, expect, it } from "vitest";
import { compactionKey } from "../../lib/project-agent/compact-lease-core.mjs";
describe("L7 isolation of compaction lease identifiers", () => {
  const scope = { projectId: "p", ownerEmail: "alice@example.test", conversationId: "chat" };
  it("separates owner, Project and chat without exposing raw identifiers", () => {
    const key = compactionKey(scope);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("alice");
    expect(compactionKey({ ...scope, projectId: "other" })).not.toBe(key);
    expect(compactionKey({ ...scope, ownerEmail: "bob@example.test" })).not.toBe(key);
    expect(compactionKey({ ...scope, conversationId: "other" })).not.toBe(key);
  });
  it("rejects missing scope", () => {
    expect(() => compactionKey({ ...scope, projectId: "" })).toThrow();
  });
});
