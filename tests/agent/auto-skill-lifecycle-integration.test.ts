import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { claimAutoSkill, completeAutoSkill, dueAutoSkillJobs,
  listAutoSkillEntries, queueAutoSkillSource, removeAutoSkillSource } from
  "../../lib/project-agent/auto-skills/store";
import { personalSkillsPrompt, togglePersonalAgentSkill,
  upsertPersonalAgentSkill } from "../../lib/project-agent/personal-agent-skills";

const owner = "owner@example.test", other = "nonmember@example.test";
const project = "synthetic-research-project", file = "kf_abcdef12";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "agent-skill-lifecycle-"));
  process.env.PROJECT_AGENT_AUTO_SKILLS_DIR = path.join(dir, "auto");
  process.env.PROJECT_AGENT_PERSONAL_SKILLS_DIR = path.join(dir, "personal");
});
afterEach(async () => {
  delete process.env.PROJECT_AGENT_AUTO_SKILLS_DIR;
  delete process.env.PROJECT_AGENT_PERSONAL_SKILLS_DIR;
  await rm(dir, { recursive: true, force: true });
});
const readySkill = (revision: string) => ({
  id: "auto_test", sourceId: file, revision, title: "Synthetic QA",
  description: "Testing", instructions: "Use the approved fixture.",
  files: { "SKILL.md": "Read the fixture" },
});

describe("automatic source-to-skill lifecycle", () => {
  it("deduplicates queues and fences simultaneous claims across workers", async () => {
    await Promise.all(Array.from({ length: 6 }, () =>
      queueAutoSkillSource(project, owner, file, "Test handbook", "rev1")));
    expect(await listAutoSkillEntries(project, owner)).toHaveLength(1);
    const claims = await Promise.all(Array.from({ length: 6 }, () =>
      claimAutoSkill(project, owner, file)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    const current = (await listAutoSkillEntries(project, owner))[0];
    expect(current).toMatchObject({ status: "running", attempts: 1 });
    await completeAutoSkill(project, owner, file, "rev1", readySkill("rev1"));
    expect(await claimAutoSkill(project, owner, file)).toBeNull();
    expect((await listAutoSkillEntries(project, owner))[0].status).toBe("ready");
  });

  it("rejects stale generation after a source revision changes", async () => {
    await queueAutoSkillSource(project, owner, file, "Handbook", "rev1");
    expect(await claimAutoSkill(project, owner, file)).not.toBeNull();
    await queueAutoSkillSource(project, owner, file, "Handbook", "rev2");
    await completeAutoSkill(project, owner, file, "rev1", readySkill("rev1"));
    expect((await listAutoSkillEntries(project, owner))[0]).toMatchObject({
      revision: "rev2", status: "pending", attempts: 0,
    });
    await claimAutoSkill(project, owner, file);
    await completeAutoSkill(project, owner, file, "rev2", readySkill("rev2"));
    expect((await listAutoSkillEntries(project, owner))[0].skill?.revision).toBe("rev2");
  });

  it("uses exponential retry and prevents cross-user or cross-project leakage", async () => {
    await queueAutoSkillSource(project, owner, file, "Handbook", "rev1");
    await claimAutoSkill(project, owner, file);
    await completeAutoSkill(project, owner, file, "rev1", null, "synthetic timeout");
    const failed = (await listAutoSkillEntries(project, owner))[0];
    expect(failed.status).toBe("failed");
    expect(failed.nextRetryAt).toBeGreaterThan(Date.now());
    expect(await claimAutoSkill(project, owner, file)).toBeNull();
    expect(await listAutoSkillEntries(project, other)).toEqual([]);
    expect(await listAutoSkillEntries("other-project", owner)).toEqual([]);
    expect((await dueAutoSkillJobs()).some(job => job.fileId === file)).toBe(false);
    await removeAutoSkillSource(project, owner, file);
    expect(await listAutoSkillEntries(project, owner)).toEqual([]);
  });
});

describe("manual personal skill activation truth", () => {
  it("reads enabled state from disk after each toggle, never from old prompt text", async () => {
    await upsertPersonalAgentSkill(owner, { name: "Synthetic QA",
      description: "Lifecycle", instructions: "Use a source-backed test evidence receipt.",
      enabled: false });
    const { listPersonalAgentSkills } = await import("../../lib/project-agent/personal-agent-skills");
    const item = (await listPersonalAgentSkills(owner))[0];
    expect(await personalSkillsPrompt(owner)).toBe("");
    await togglePersonalAgentSkill(owner, item.id, true);
    expect(await personalSkillsPrompt(owner)).toContain("source-backed test evidence");
    await togglePersonalAgentSkill(owner, item.id, false);
    expect(await personalSkillsPrompt(owner)).toBe("");
    expect(await personalSkillsPrompt(other)).toBe("");
  });
});
