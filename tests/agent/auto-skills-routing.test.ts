import { describe, expect, it } from "vitest";
import { formatProjectSkills } from "@/lib/project-agent/project-skills";
import { rankTaskSkills } from "@/lib/project-agent/skill-ranking";

describe("automatic skill routing contracts", () => {
  it("ranks relevant knowledge without dropping unrelated skills from registry", () => {
    const skills = [
      { title: "Project programme", description: "critical path schedule" },
      { title: "Browser recovery", description: "stale DOM snapshot" },
    ];
    const ranked = rankTaskSkills(skills, "browser DOM recovery");
    expect(ranked[0].title).toBe("Browser recovery");
    expect(ranked).toHaveLength(2);
  });
  it("keeps chapter files on-demand rather than inlining the entire skill", () => {
    const prompt = formatProjectSkills([{
      id: "auto_example", title: "System architecture", description: "Reliability patterns",
      instructions: "a".repeat(4000), files: ["references/reliability.md"],
    }], "reliability");
    expect(prompt).toContain("skillId=auto_example");
    expect(prompt).toContain("references/reliability.md");
    expect(prompt).not.toContain("a".repeat(200));
  });
});
