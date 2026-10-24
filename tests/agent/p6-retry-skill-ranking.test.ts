import { describe, expect, it } from "vitest";
import { retryContext } from "../../lib/project-agent/retry-context";
import { rankTaskSkills } from "../../lib/project-agent/skill-ranking";
import type { ProjectAgentTask } from "../../lib/project-agent/types";
const earlier: ProjectAgentTask = {
  id: "pat_000000000001", ownerEmail: "worker@example.com", projectId: "project",
  prompt: "Create report", status: "failed", error: "MongoDB task lease expired or changed",
  createdAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T01:00:00Z",
  resultText: "Chapter 1 is drafted", files: [{ id: "f", name: "draft.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 120 }],
  log: ["2026-10-24T00:00:00Z using tool workspace_apply", "2026-10-24T01:00:00Z stalled"],
};
describe("P6 task continuation", () => {
  it("treats previous outputs as evidence, not authority", () => {
    const text = retryContext(earlier);
    expect(text).toContain("untrusted reference");
    expect(text).toContain("Do not repeat a write");
    expect(text).toContain("Chapter 1 is drafted");
    expect(text).toContain("draft.docx");
    expect(text).toContain("inspect remote state");
  });
  it("clips long untrusted data and does not include original prompt", () => {
    const text = retryContext({ ...earlier, prompt: "DO NOT SHOW ME", resultText: "a".repeat(10000) });
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).not.toContain("DO NOT SHOW ME");
  });
});
describe("P6 skill ranking", () => {
  const skills = [
    { title: "Spreadsheet", description: "Excel tables formulas" },
    { title: "Architecture", description: "Floor plans buildings" },
    { title: "Code Review", description: "JavaScript TypeScript errors" },
  ];
  it("raises relevant skills without removing disabled capabilities", () => {
    const ranked = rankTaskSkills(skills, "Review TypeScript errors");
    expect(ranked[0].title).toBe("Code Review");
    expect(ranked).toHaveLength(skills.length);
    expect(skills[0].title).toBe("Spreadsheet");
  });
  it("keeps owner order on ties or missing task", () => {
    expect(rankTaskSkills(skills, "")).toEqual(skills);
    expect(rankTaskSkills(skills, "unrelated")).toEqual(skills);
  });
});
