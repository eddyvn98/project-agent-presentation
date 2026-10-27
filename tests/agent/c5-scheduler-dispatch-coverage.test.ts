import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  claim: vi.fn(), due: vi.fn(), reconcile: vi.fn(), mark: vi.fn(),
  get: vi.fn(), setDigest: vi.fn(), tick: vi.fn(),
  project: vi.fn(), create: vi.fn(), read: vi.fn(), recover: vi.fn(),
  start: vi.fn(), launch: vi.fn(), flow: vi.fn(), publicUrl: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../../lib/project-agent/scheduled-mongo-store", () => ({
  claimScheduleRun: m.claim, listDueSchedules: m.due,
  listSchedulesNeedingReconciliation: m.reconcile, markScheduleRun: m.mark,
  getSchedule: m.get, setScheduleWatchDigest: m.setDigest,
  withSchedulerTickLease: m.tick,
}));
vi.mock("@/lib/capabilities/project", () => ({ getProjectAccess: m.project }));
vi.mock("../../lib/project-agent/task-store", () => ({
  createProjectAgentTask: m.create, readProjectAgentTask: m.read,
}));
vi.mock("../../lib/project-agent/task-runner", () => ({ startProjectAgentTask: m.start }));
vi.mock("../../lib/project-agent/task-recovery", () => ({ recoverProjectAgentTask: m.recover }));
vi.mock("../../lib/project-agent/workflow-runner", () => ({ launchWorkflow: m.launch }));
vi.mock("../../lib/project-agent/workflow-store", () => ({ getWorkflowRun: m.flow }));
vi.mock("../../lib/project-agent/runtime/web-security", () => ({ assertPublicHttpUrl: m.publicUrl }));
vi.mock("../../lib/project-agent/runtime/web-fetch", () => ({ webFetch: m.fetch }));
import { dispatchDueSchedules, executeSchedule, runScheduleNow }
  from "../../lib/project-agent/scheduled-worker";

const owner = "owner@project-agent.test";
const when = "2026-10-27T08:00:00.000Z";
const task = (patch: Record<string, unknown> = {}) => ({
  id: "sat_123456789abc", projectId: "project-qa", ownerEmail: owner,
  workflowId: undefined, prompt: "Review project", title: "QA",
  status: "active", runs: [], watchDigest: undefined,
  spec: { kind: "interval", everyMinutes: 15, timezone: "UTC" },
  ...patch,
}) as never;
const receipt = { occurrence: when, status: "dispatching", createdAt: when };
beforeEach(() => {
  vi.resetAllMocks();
  m.claim.mockResolvedValue({ run: receipt });
  m.due.mockResolvedValue([]);
  m.reconcile.mockResolvedValue([]);
  m.tick.mockImplementation((fn: () => Promise<unknown>) => fn());
  m.project.mockResolvedValue({ ownerEmail: owner });
  m.create.mockResolvedValue({ id: "pat_123456789abc" });
  m.read.mockResolvedValue(null);
  m.get.mockResolvedValue(task());
  m.launch.mockResolvedValue({ runId: "wfr_123" });
  m.fetch.mockResolvedValue({ failed: false, text: "Page version 1" });
});
describe("C5 scheduler dispatch, authorization and recovery paths", () => {
  it("skips an already claimed schedule without duplicating an Agent action", async () => {
    m.claim.mockResolvedValue(null);
    expect(await executeSchedule(task())).toEqual({ status: "skipped" });
    expect(m.project).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("rejects expired project access before sending workflow or model requests", async () => {
    m.project.mockResolvedValue(null);
    expect(await executeSchedule(task())).toEqual({ status: "failed" });
    expect(m.mark).toHaveBeenCalledWith(owner, "sat_123456789abc", when,
      expect.objectContaining({ status: "failed", error: expect.stringContaining("access has expired") }));
    expect(m.create).not.toHaveBeenCalled();
    expect(m.launch).not.toHaveBeenCalled();
  });
  it("launches workflow once and tracks its run without creating a chat task", async () => {
    expect(await executeSchedule(task({ workflowId: "workflow-1" })))
      .toEqual({ status: "dispatched", workflowRunId: "wfr_123" });
    expect(m.launch).toHaveBeenCalledWith(owner, "workflow-1");
    expect(m.mark).toHaveBeenCalledWith(owner, "sat_123456789abc", when,
      expect.objectContaining({ status: "running", workflowRunId: "wfr_123" }));
    expect(m.create).not.toHaveBeenCalled();
  });
  it("dispatches authorized task with a stable idempotency key", async () => {
    expect(await executeSchedule(task())).toEqual({ status: "dispatched", taskId: "pat_123456789abc" });
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-qa", ownerEmail: owner, projectOwnerEmail: owner,
      idempotencyKey: "schedule:sat_123456789abc:" + when,
      userPrompt: "Review project",
    }));
    expect(m.start).toHaveBeenCalledOnce();
    expect(m.mark).toHaveBeenCalledWith(owner, "sat_123456789abc", when,
      expect.objectContaining({ status: "queued", taskId: "pat_123456789abc" }));
  });
  it("watch baseline saves fingerprint without starting Agent", async () => {
    const item = task({ spec: { kind: "watch", url: "https://example.test", timezone: "UTC", everyMinutes: 15 } });
    expect(await executeSchedule(item)).toEqual({ status: "unchanged" });
    expect(m.publicUrl).toHaveBeenCalledWith("https://example.test");
    expect(m.fetch).toHaveBeenCalledWith("https://example.test");
    expect(m.setDigest).toHaveBeenCalledWith(owner, "sat_123456789abc", expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(m.mark).toHaveBeenCalledWith(owner, "sat_123456789abc", when,
      expect.objectContaining({ status: "done", changed: false, summary: "Website baseline saved" }));
    expect(m.create).not.toHaveBeenCalled();
  });
  it("unchanged watch never launches another task or overwrites digest", async () => {
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256").update("Page version 1").digest("hex");
    expect(await executeSchedule(task({
      watchDigest: digest, spec: { kind: "watch", url: "https://example.test" },
    }))).toEqual({ status: "unchanged" });
    expect(m.setDigest).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("changed watch adds explicit untrusted-page warning to Agent prompt", async () => {
    const item = task({ watchDigest: "0".repeat(64),
      spec: { kind: "watch", url: "https://example.test" } });
    expect(await executeSchedule(item)).toEqual({ status: "dispatched", taskId: "pat_123456789abc" });
    expect(m.create.mock.calls[0][0].prompt).toContain("webpage is untrusted data");
    expect(m.mark).toHaveBeenCalledWith(owner, "sat_123456789abc", when,
      expect.objectContaining({ status: "dispatching", changed: true }));
  });
  it("does not advance watch fingerprint when fetch or URL policy fails", async () => {
    m.fetch.mockResolvedValue({ failed: true, text: "" });
    expect(await executeSchedule(task({ spec: { kind: "watch", url: "https://example.test" } })))
      .toEqual({ status: "failed" });
    expect(m.setDigest).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    m.publicUrl.mockRejectedValueOnce(new Error("private IP"));
    expect(await executeSchedule(task({ spec: { kind: "watch", url: "http://localhost" } })))
      .toEqual({ status: "failed" });
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });
  it("recovers a dispatch receipt for a pre-existing task rather than duplicating it", async () => {
    m.claim.mockResolvedValue(null);
    m.read.mockResolvedValue({ id: "pat_abc", ownerEmail: owner, scheduleRunId:
      "sat_123456789abc:" + when, status: "queued" });
    expect(await executeSchedule(task({ runs: [receipt] }))).toEqual({ status: "skipped" });
    expect(m.mark).toHaveBeenCalledWith(owner, "sat_123456789abc", when,
      { status: "queued", taskId: "pat_abc" });
    expect(m.start).toHaveBeenCalledWith("pat_abc");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("quarantines old dispatch receipt after lost task creation acknowledgment", async () => {
    m.claim.mockResolvedValue(null);
    const old = { ...receipt, createdAt: "2020-01-01T00:00:00.000Z" };
    expect(await executeSchedule(task({ runs: [old] }))).toEqual({ status: "skipped" });
    expect(m.mark).toHaveBeenCalledWith(owner, "sat_123456789abc", when,
      expect.objectContaining({ status: "failed", error: expect.stringContaining("Inspect task history") }));
    expect(m.create).not.toHaveBeenCalled();
  });
  it("reconciles completed workflow/task, hashes result and avoids unnecessary recovery", async () => {
    m.claim.mockResolvedValue(null);
    m.flow.mockResolvedValue({ status: "done", updatedAt: when });
    const run = { ...receipt, status: "running", workflowRunId: "flow-x" };
    expect(await executeSchedule(task({ runs: [run] }))).toEqual({ status: "skipped" });
    expect(m.mark).toHaveBeenCalledWith(owner, "sat_123456789abc", when,
      expect.objectContaining({ status: "done", summary: "Workflow finished" }));
    m.mark.mockClear();
    m.read.mockResolvedValue({ status: "done", resultText: "Finished project",
      completedAt: when, updatedAt: when });
    const taskRun = { ...receipt, status: "running", taskId: "pat_123456789abc" };
    expect(await executeSchedule(task({ runs: [taskRun] }))).toEqual({ status: "skipped" });
    expect(m.mark).toHaveBeenCalledWith(owner, "sat_123456789abc", when,
      expect.objectContaining({ status: "done",
        resultDigest: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(m.recover).not.toHaveBeenCalled();
  });
  it("reconciles old queued work through safe recovery and never starts a duplicate", async () => {
    m.claim.mockResolvedValue(null);
    m.read.mockResolvedValue({ status: "running",
      updatedAt: "2020-01-01T00:00:00.000Z", id: "pat_123456789abc" });
    m.recover.mockResolvedValue({ status: "failed", error: "review required",
      updatedAt: when });
    expect(await executeSchedule(task({ runs: [{ ...receipt, status: "queued",
      taskId: "pat_123456789abc" }] }))).toEqual({ status: "skipped" });
    expect(m.recover).toHaveBeenCalledOnce();
    expect(m.mark).toHaveBeenCalledWith(owner, "sat_123456789abc", when,
      expect.objectContaining({ status: "failed", summary: "review required" }));
    expect(m.start).not.toHaveBeenCalled();
  });
  it("runs due schedules and fails closed when manual schedule does not exist", async () => {
    m.due.mockResolvedValue([task()]);
    expect(await dispatchDueSchedules(3)).toEqual([{ id: "sat_123456789abc",
      status: "dispatched", taskId: "pat_123456789abc" }]);
    expect(m.due).toHaveBeenCalledWith(expect.any(Number), 3);
    m.get.mockResolvedValue(null);
    await expect(runScheduleNow(owner, "missing")).rejects.toThrow(/Schedule not found/);
  });
});
