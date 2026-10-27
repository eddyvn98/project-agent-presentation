import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { contextScopeDir, saveContextOutput, deleteContextScope,
  readContextOutput } from "../../lib/project-agent/runtime/context-output-store";
import { readContextCheckpoint, recordContextCheckpoint } from
  "../../lib/project-agent/runtime/context-checkpoint";
const scopes: Array<{ projectId: string; chatId: string }> = [];
afterEach(async () => { await Promise.all(scopes.splice(0).map(s => deleteContextScope(s))); });
describe("L16 ephemeral filesystem and listener resource lifecycle", () => {
  it("bounds 100 captured outputs and fully removes scope after deletion", async () => {
    const scope = { projectId: randomUUID(), chatId: randomUUID() };
    scopes.push(scope);
    let last = "";
    for (let i = 0; i < 100; i++) {
      const saved = await saveContextOutput(scope, "observation-" + i);
      last = saved.id;
    }
    const files = await fs.readdir(contextScopeDir(scope));
    expect(files.filter(x => x.endsWith(".txt")).length).toBeLessThanOrEqual(32);
    expect((await readContextOutput(scope, last)).failed).toBe(false);
    await recordContextCheckpoint(scope, { taskId: "task", step: 1,
      action: "shell", failed: false, observation: "completed" });
    expect(await readContextCheckpoint(scope)).toContain("completed");
    await deleteContextScope(scope);
    await expect(fs.stat(contextScopeDir(scope))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readContextOutput(scope, last)).failed).toBe(true);
    expect(await readContextCheckpoint(scope)).toBe("");
  });
});
