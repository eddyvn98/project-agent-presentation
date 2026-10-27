import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listPersonalAgentSkills, upsertPersonalAgentSkill,
  togglePersonalAgentSkill, deletePersonalAgentSkill, personalSkillsPrompt } from
  "../../lib/project-agent/personal-agent-skills";
import { saveAgentWorkflow, getAgentWorkflow, listAgentWorkflows,
  changeAgentWorkflow, createWorkflowRun, getWorkflowRun,
  updateWorkflowRun } from "../../lib/project-agent/workflow-store";

const users = Array.from({ length: 6 }, (_, i) => "p1-user-" + i + "@project-agent.test");
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "p1-security-"));
  process.env.PROJECT_AGENT_PERSONAL_SKILLS_DIR = path.join(root, "skills");
  process.env.PROJECT_AGENT_WORKFLOWS_DIR = path.join(root, "workflows");
});
afterEach(async () => {
  delete process.env.PROJECT_AGENT_PERSONAL_SKILLS_DIR;
  delete process.env.PROJECT_AGENT_WORKFLOWS_DIR;
  await rm(root, { recursive: true, force: true });
});
describe("P1 multi-tenant authorization matrix (real persistent store)", () => {
  it("six users cannot read, enable, delete, update or prompt-inject each other's skills", async () => {
    const skills = await Promise.all(users.map(async (user, i) =>
      (await upsertPersonalAgentSkill(user, { name: "Private QA " + i,
        description: "Only user " + i,
        instructions: "Evidence private for account number " + i + " only." }))[0]));
    for (let i = 0; i < users.length; i++) {
      await togglePersonalAgentSkill(users[i], skills[i].id, true);
      expect((await listPersonalAgentSkills(users[i])).map(s => s.id)).toEqual([skills[i].id]);
      const prompt = await personalSkillsPrompt(users[i]);
      expect(prompt).toContain("Private QA " + i);
      for (let j = 0; j < users.length; j++) {
        if (i === j) continue;
        expect(prompt).not.toContain("Private QA " + j);
        await expect(togglePersonalAgentSkill(users[j], skills[i].id, true)).rejects.toThrow(/not found/i);
        await expect(deletePersonalAgentSkill(users[j], skills[i].id)).rejects.toThrow(/not found/i);
        await expect(upsertPersonalAgentSkill(users[j], {
          id: skills[i].id, name: "Overwritten", description: "bad",
          instructions: "Replace foreign account data without permission.",
        })).rejects.toThrow(/not found/i);
      }
    }
    expect(await Promise.all(users.map(u => listPersonalAgentSkills(u)))).toHaveLength(6);
  });

  it("six users cannot access foreign workflow definitions, run progress or delete them", async () => {
    const workflows = await Promise.all(users.map((u, i) =>
      saveAgentWorkflow(u, { projectId: "qa-project-" + i,
        title: "Private workflow " + i, enabled: true, description: "Synthetic",
        steps: [{ id: "step_1", title: "Check", prompt: "Inspect QA fixture",
          requiresApproval: true }] })));
    const runs = await Promise.all(users.map((u, i) => createWorkflowRun(u, workflows[i])));
    for (let i = 0; i < users.length; i++) {
      expect(await listAgentWorkflows(users[i])).toHaveLength(1);
      for (let j = 0; j < users.length; j++) {
        if (i === j) continue;
        expect(await getAgentWorkflow(users[j], workflows[i].id)).toBeNull();
        expect(await getWorkflowRun(users[j], runs[i].id)).toBeNull();
        await expect(changeAgentWorkflow(users[j], workflows[i].id, "delete"))
          .rejects.toThrow(/not found/i);
        await expect(updateWorkflowRun(users[j], runs[i].id,
          row => { row.status = "done"; })).rejects.toThrow(/not found/i);
      }
      expect((await getWorkflowRun(users[i], runs[i].id))?.status).toBe("ready");
    }
  });

  it("concurrent writes stay valid; per-owner skill limit never exceeds 40", async () => {
    const owner = users[0];
    const operations = Array.from({ length: 80 }, (_, i) =>
      upsertPersonalAgentSkill(owner, { name: "Burst " + i,
        description: "Concurrency QA", instructions: "Verify concurrent writes are not corrupted." }));
    const outcomes = await Promise.allSettled(operations);
    expect(outcomes.some(x => x.status === "fulfilled")).toBe(true);
    const persisted = await listPersonalAgentSkills(owner);
    expect(persisted.length).toBeGreaterThan(0);
    expect(persisted.length).toBeLessThanOrEqual(40);
    expect(new Set(persisted.map(s => s.id)).size).toBe(persisted.length);
    expect((await listPersonalAgentSkills(users[1]))).toEqual([]);
  });
});
