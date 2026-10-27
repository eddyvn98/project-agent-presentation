import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listPersonalAgentSkills, personalSkillsPrompt,
  togglePersonalAgentSkill, upsertPersonalAgentSkill } from "../../lib/project-agent/personal-agent-skills";

let temp: string | undefined;
const owner = "skills-regression@example.test";
async function setup() {
  temp = await mkdtemp(path.join(os.tmpdir(), "skills-regression-"));
  process.env.PROJECT_AGENT_PERSONAL_SKILLS_DIR = temp;
}
afterEach(async () => {
  delete process.env.PROJECT_AGENT_PERSONAL_SKILLS_DIR;
  if (temp) await rm(temp, { recursive: true, force: true });
  temp = undefined;
});

describe("personal skill persisted state", () => {
  it("is disabled by default, enabled across reads, and removed from prompt after disable", async () => {
    await setup();
    await upsertPersonalAgentSkill(owner, {
      name: "QA Gate", description: "Quality gate",
      instructions: "Follow the mandatory QA verification checklist before replying."
    });
    const saved = (await listPersonalAgentSkills(owner))[0];
    expect(saved.enabled).toBe(false);
    expect(await personalSkillsPrompt(owner)).toBe("");
    await togglePersonalAgentSkill(owner, saved.id, true);
    expect(await personalSkillsPrompt(owner)).toContain("mandatory QA verification checklist");
    await togglePersonalAgentSkill(owner, saved.id, false);
    expect((await listPersonalAgentSkills(owner))[0].enabled).toBe(false);
    expect(await personalSkillsPrompt(owner)).not.toContain("mandatory QA verification checklist");
  });

  it("does not leak skills across owners", async () => {
    await setup();
    await upsertPersonalAgentSkill(owner, {
      name: "Owner-only QA", description: "", instructions: "Only owner can see this instruction.", enabled: true
    });
    expect(await personalSkillsPrompt(owner)).toContain("Only owner");
    expect(await personalSkillsPrompt("different@example.test")).toBe("");
  });
});
