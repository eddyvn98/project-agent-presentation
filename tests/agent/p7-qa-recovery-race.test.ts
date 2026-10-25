import { describe, expect, it } from "vitest";
import { recoverP7SyntheticBrowser, type P7RecoverTask } from "../../lib/project-agent/p7-qa-recovery";

const projectId = "proj_p7_synthetic", owner = "p7-owner@project-agent.test";
const source = (): P7RecoverTask => ({
  id: "pat_123456789abc", projectId, ownerEmail: owner,
  prompt: "[P7_SYNTHETIC_QA] browser fixture - local synthetic data only",
  status: "failed", cancelled: false, updatedAt: "2026-10-25T00:00:00Z",
});
function harness() {
  let stored: P7RecoverTask | null = source(), paused = false, updates = 0, cleans = 0;
  let begin!: () => void, unblock!: () => void;
  let beforeCommit: (() => void) | undefined;
  const started = new Promise<void>(resolve => { begin = resolve; });
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const run = () => recoverP7SyntheticBrowser({
    task: source(), projectId, owner, controlPaused: () => paused,
    prepare: async () => { begin(); await gate; return { hasFrame: true, sequence: 1 }; },
    readTask: async () => stored,
    markRunning: async latest => {
      beforeCommit?.();
      if (!stored || stored.cancelled || stored.status !== latest.status ||
          stored.updatedAt !== latest.updatedAt || paused) return false;
      updates++; stored = { ...stored, status: "running" }; return true;
    },
    cleanup: async () => { cleans++; },
  });
  return {
    run, started, unblock,
    stop: () => { stored = { ...source(), status: "failed", cancelled: true }; },
    takeover: () => { paused = true; },
    replace: (next: P7RecoverTask | null) => { stored = next; },
    beforeCommit: (fn: () => void) => { beforeCommit = fn; },
    writes: () => updates, cleanups: () => cleans,
  };
}
describe("P7 synthetic browser recovery race", () => {
  it("cleans browser/Watch when Stop wins during Chromium preparation", async () => {
    const qa = harness(), pending = qa.run();
    await qa.started; qa.stop(); qa.unblock();
    expect(await pending).toEqual({ ok: false, reason: "task_changed" });
    expect(qa.writes()).toBe(0);
    expect(qa.cleanups()).toBe(1);
  });
  it("does not clean frames/session owned by a human takeover", async () => {
    const qa = harness(), pending = qa.run();
    await qa.started; qa.takeover(); qa.unblock();
    expect(await pending).toEqual({ ok: false, reason: "human_takeover" });
    expect(qa.writes()).toBe(0);
    expect(qa.cleanups()).toBe(0);
  });
  it("cleans when deletion, owner change or completion follows prepare", async () => {
    for (const changed of [null, { ...source(), ownerEmail: "other@project-agent.test" },
      { ...source(), projectId: "proj_other" }, { ...source(), status: "done" }]) {
      const qa = harness(), pending = qa.run();
      await qa.started; qa.replace(changed); qa.unblock();
      expect(await pending).toEqual({ ok: false, reason: "task_changed" });
      expect(qa.cleanups()).toBe(1);
    }
  });
  it("keeps successful recovery session and Watch alive", async () => {
    const qa = harness(), pending = qa.run();
    await qa.started; qa.unblock();
    expect(await pending).toEqual({ ok: true, frame: { hasFrame: true, sequence: 1 } });
    expect(qa.writes()).toBe(1);
    expect(qa.cleanups()).toBe(0);
  });
  it("Stop between last read and conditional write rejects without resurrection", async () => {
    const qa = harness(), pending = qa.run();
    qa.beforeCommit(qa.stop);
    await qa.started; qa.unblock();
    expect(await pending).toEqual({ ok: false, reason: "task_changed" });
    expect(qa.writes()).toBe(0);
    expect(qa.cleanups()).toBe(1);
  });
  it("takeover after last read leaves the manual session intact", async () => {
    const qa = harness(), pending = qa.run();
    qa.beforeCommit(qa.takeover);
    await qa.started; qa.unblock();
    expect(await pending).toEqual({ ok: false, reason: "human_takeover" });
    expect(qa.cleanups()).toBe(0);
  });
  it("does not clean if takeover begins during task re-read", async () => {
    let paused = false, cleans = 0, writes = 0;
    const result = await recoverP7SyntheticBrowser({
      task: source(), projectId, owner, controlPaused: () => paused,
      prepare: async () => ({ hasFrame: true }),
      readTask: async () => { paused = true; return source(); },
      markRunning: async () => { writes++; return true; },
      cleanup: async () => { cleans++; },
    });
    expect(result).toEqual({ ok: false, reason: "human_takeover" });
    expect(writes).toBe(0);
    expect(cleans).toBe(0);
  });
  it("cleans when preparation throws after creating a browser session", async () => {
    let cleans = 0;
    await expect(recoverP7SyntheticBrowser({
      task: source(), projectId, owner, controlPaused: () => false,
      prepare: async () => { throw new Error("Chromium disconnected"); },
      readTask: async () => source(), markRunning: async () => true,
      cleanup: async () => { cleans++; },
    })).rejects.toThrow("Chromium disconnected");
    expect(cleans).toBe(1);
  });
});
