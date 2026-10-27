import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deletePersonalAgentSkill, listPersonalAgentSkills,
  personalSkillsPrompt, togglePersonalAgentSkill, upsertPersonalAgentSkill,
} from "../../lib/project-agent/personal-agent-skills";
import { saveAgentWorkflow, changeAgentWorkflow, createWorkflowRun,
  getAgentWorkflow, getWorkflowRun, listAgentWorkflows, listWorkflowRuns,
  updateWorkflowRun } from "../../lib/project-agent/workflow-store";

const ownerA = "owner-a@project-agent.test", ownerB = "owner-b@project-agent.test";
let root = "";
const content = (name: string) => ({
  name, description: "Synthetic test", instructions: "Verify the source and present documented evidence.",
});
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "p0-multiuser-"));
  process.env.PROJECT_AGENT_PERSONAL_SKILLS_DIR = path.join(root, "skills");
  process.env.PROJECT_AGENT_WORKFLOWS_DIR = path.join(root, "workflows");
});
afterEach(async () => {
  delete process.env.PROJECT_AGENT_PERSONAL_SKILLS_DIR;
  delete process.env.PROJECT_AGENT_WORKFLOWS_DIR;
  await rm(root, { recursive: true, force: true });
});

describe("P0 personal Skills and Workflow store multi-tenant isolation (real filesystem)", () => {
  it("owner B cannot list, enable, delete or change owner A's skill", async () => {
    const skill = (await upsertPersonalAgentSkill(ownerA, content("Owner A only")))[0];
    const bSkills = await listPersonalAgentSkills(ownerB);
    expect(bSkills).toEqual([]);
    await expect(togglePersonalAgentSkill(ownerB, skill.id, true)).rejects.toThrow(/not found/i);
    await expect(deletePersonalAgentSkill(ownerB, skill.id)).rejects.toThrow(/not found/i);
    await expect(upsertPersonalAgentSkill(ownerB, { ...content("Impersonate"), id: skill.id }))
      .rejects.toThrow(/not found/i);
    expect(await personalSkillsPrompt(ownerB)).toBe("");
    expect(await listPersonalAgentSkills(ownerA)).toMatchObject([{ enabled: false, id: skill.id }]);
  });

  it("enabling a skill is scoped to one owner and does not leak into the other prompt", async () => {
    const a = (await upsertPersonalAgentSkill(ownerA, content("Research A")))[0];
    const b = (await upsertPersonalAgentSkill(ownerB, content("Draft B")))[0];
    await togglePersonalAgentSkill(ownerA, a.id, true);
    expect(await personalSkillsPrompt(ownerA)).toContain("Research A");
    expect(await personalSkillsPrompt(ownerA)).not.toContain("Draft B");
    expect(await personalSkillsPrompt(ownerB)).toBe("");
    await togglePersonalAgentSkill(ownerB, b.id, true);
    expect(await personalSkillsPrompt(ownerB)).toContain("Draft B");
    expect(await personalSkillsPrompt(ownerB)).not.toContain("Research A");
  });

  it("a second owner cannot read, edit or advance a foreign workflow or its run", async () => {
    const workflow = await saveAgentWorkflow(ownerA, {
      projectId: "isolated", title: "Owner A only", description: "Synthetic",
      enabled: true, steps: [{ id: "step_1", title: "Collect", prompt: "Read QA data",
        requiresApproval: true }],
    });
    const run = await createWorkflowRun(ownerA, workflow);
    expect(await getAgentWorkflow(ownerB, workflow.id)).toBeNull();
    expect(await getWorkflowRun(ownerB, run.id)).toBeNull();
    expect(await listAgentWorkflows(ownerB)).toEqual([]);
    expect(await listWorkflowRuns(ownerB)).toEqual([]);
    await expect(changeAgentWorkflow(ownerB, workflow.id, "delete")).rejects.toThrow(/not found/i);
    await expect(updateWorkflowRun(ownerB, run.id, current => { current.status = "done"; }))
      .rejects.toThrow(/not found/i);
    expect((await getWorkflowRun(ownerA, run.id))?.status).toBe("ready");
    expect((await getAgentWorkflow(ownerA, workflow.id))?.enabled).toBe(true);
  });
});
