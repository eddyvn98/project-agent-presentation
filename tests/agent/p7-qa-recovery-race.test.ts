import { describe, expect, it } from "vitest";
import { recoverP7SyntheticBrowser, type P7RecoverTask } from "../../lib/project-agent/p7-qa-recovery";

const projectId = "proj_p7_synthetic";
const owner = "p7-owner@project-agent.test";
const source = (): P7RecoverTask => ({
  id: "pat_123456789abc", projectId, ownerEmail: owner,
  prompt: "[P7_SYNTHETIC_QA] browser fixture - local synthetic data only",
  status: "failed", cancelled: false,
});
function harness() {
  let stored: P7RecoverTask | null = source();
  let paused = false;
  let updates = 0;
  let begin!: () => void;
  let unblock!: () => void;
  const started = new Promise<void>(resolve => { begin = resolve; });
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const run = () => recoverP7SyntheticBrowser({
    task: source(), projectId, owner,
    controlPaused: () => paused,
    prepare: async () => { begin(); await gate; return { hasFrame: true, sequence: 1 }; },
    readTask: async () => stored,
    markRunning: async () => { updates++; },
  });
  return { run, started, unblock, stop: () => { stored = { ...source(), status: "failed", cancelled: true }; },
    takeover: () => { paused = true; }, replace: (next: P7RecoverTask | null) => { stored = next; },
    writes: () => updates };
}
describe("P7 synthetic browser recovery race", () => {
  it("does not resurrect an explicitly stopped task during Chromium preparation", async () => {
    const qa = harness(), pending = qa.run();
    await qa.started;
    qa.stop();
    qa.unblock();
    expect(await pending).toEqual({ ok: false, reason: "task_changed" });
    expect(qa.writes()).toBe(0);
  });
  it("does not interfere when a human takes control during preparation", async () => {
    const qa = harness(), pending = qa.run();
    await qa.started;
    qa.takeover();
    qa.unblock();
    expect(await pending).toEqual({ ok: false, reason: "human_takeover" });
    expect(qa.writes()).toBe(0);
  });
  it("rejects deletion, owner change, or completion after preparation", async () => {
    for (const changed of [null, { ...source(), ownerEmail: "other@project-agent.test" },
      { ...source(), projectId: "proj_other" }, { ...source(), status: "done" }]) {
      const qa = harness(), pending = qa.run();
      await qa.started;
      qa.replace(changed);
      qa.unblock();
      expect(await pending).toEqual({ ok: false, reason: "task_changed" });
      expect(qa.writes()).toBe(0);
    }
  });
  it("commits an unchanged, unpaused synthetic browser after a frame exists", async () => {
    const qa = harness(), pending = qa.run();
    await qa.started;
    qa.unblock();
    expect(await pending).toEqual({ ok: true, frame: { hasFrame: true, sequence: 1 } });
    expect(qa.writes()).toBe(1);
  });
  it("rechecks control even when takeover occurs during the fresh task read", async () => {
    let paused = false, writes = 0;
    const result = await recoverP7SyntheticBrowser({
      task: source(), projectId, owner, controlPaused: () => paused,
      prepare: async () => ({ hasFrame: true }),
      readTask: async () => { paused = true; return source(); },
      markRunning: async () => { writes++; },
    });
    expect(result).toEqual({ ok: false, reason: "human_takeover" });
    expect(writes).toBe(0);
  });
});
