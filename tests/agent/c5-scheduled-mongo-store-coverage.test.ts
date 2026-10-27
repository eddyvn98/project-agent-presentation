import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
vi.mock("../../lib/project-agent/telegram-notifications", () => ({
  sendTelegramAgentNotice: vi.fn(async () => {}),
}));
import { getMongoAiDb } from "@/services/mongodb/client";
import { createSchedule, getSchedule, updateSchedule, claimScheduleRun,
  markScheduleRun, acknowledgeScheduleRun, setScheduleWatchDigest,
  listSchedules, importLegacySchedule } from "../../lib/project-agent/scheduled-mongo-store";
type Row = Record<string, any>;
let entries: Row[], loses: number;
const owner = "owner@project-agent.test";
const input = { projectId: "qa-project", title: "Synthetic schedule",
  prompt: "Review Project changes", spec: {
    kind: "interval" as const, timezone: "UTC", everyMinutes: 15 } };
const clone = <T,>(value: T): T => structuredClone(value);
const match = (row: Row, filter: Row) => Object.entries(filter).every(([key, needed]) =>
  row[key] === needed);
const coll = {
  createIndex: vi.fn(async () => "ok"),
  countDocuments: vi.fn(async (filter: Row) =>
    entries.filter(x => x.ownerEmail === filter.ownerEmail).length),
  findOne: vi.fn(async (filter: Row) =>
    clone(entries.find(x => match(x, filter)) ?? null)),
  insertOne: vi.fn(async (row: Row) => {
    if (entries.some(x => x.dedupeKey === row.dedupeKey && x.ownerEmail === row.ownerEmail))
      throw Object.assign(new Error("duplicate"), { code: 11000 });
    entries.push(clone(row));
    return { insertedId: row._id };
  }),
  replaceOne: vi.fn(async (filter: Row, row: Row) => {
    if (loses > 0) { loses--; return { matchedCount: 0 }; }
    const index = entries.findIndex(x => match(x, filter));
    if (index < 0) return { matchedCount: 0 };
    entries[index] = clone(row);
    return { matchedCount: 1 };
  }),
  deleteOne: vi.fn(async (filter: Row) => {
    const index = entries.findIndex(x => match(x, filter));
    if (index < 0) return { deletedCount: 0 };
    entries.splice(index, 1); return { deletedCount: 1 };
  }),
  updateOne: vi.fn(async (filter: Row, update: Row) => {
    const found = entries.find(x => match(x, filter));
    if (!found && update.$setOnInsert) {
      entries.push(clone(update.$setOnInsert));
      return { upsertedCount: 1 };
    }
    return { modifiedCount: 0 };
  }),
  find: vi.fn(() => ({
    sort: () => ({ limit: () => ({ toArray: async () => clone(entries) }) }),
  })),
};
beforeEach(() => {
  entries = []; loses = 0; vi.clearAllMocks();
  vi.mocked(getMongoAiDb).mockResolvedValue({ collection: () => coll } as never);
});
describe("C5 direct Mongo scheduler owner, approval and CAS paths", () => {
  it("creates a bounded canonical-owner schedule, with dedupe on duplicate insert", async () => {
    const created = await createSchedule(" OWNER@PROJECT-AGENT.TEST ", input);
    expect(created.ownerEmail).toBe(owner);
    expect(created.status).toBe("active");
    expect(created.id).toMatch(/^sat_[0-9a-f-]{36}$/);
    expect(await getSchedule("intruder@project-agent.test", created.id)).toBeNull();
    expect(await getSchedule(owner, created.id)).toMatchObject({ id: created.id });
    expect(await createSchedule(owner, input)).toMatchObject({ id: created.id });
    expect(await listSchedules(owner)).toHaveLength(1);
  });
  it("requires explicit approval and honors pause, resume and deletion", async () => {
    const scheduled = await createSchedule(owner, input, true);
    await expect(updateSchedule(owner, scheduled.id, { action: "resume" }))
      .rejects.toThrow(/Approve/);
    await expect(updateSchedule(owner, scheduled.id, { action: "suggest_pause" }))
      .rejects.toThrow(/Approve/);
    expect((await updateSchedule(owner, scheduled.id, { action: "approve" }))?.status)
      .toBe("active");
    expect((await updateSchedule(owner, scheduled.id, { action: "pause" }))?.status)
      .toBe("paused");
    expect((await updateSchedule(owner, scheduled.id, { action: "resume" }))?.status)
      .toBe("active");
    await updateSchedule(owner, scheduled.id, { action: "suggest_delete" });
    await updateSchedule(owner, scheduled.id, { action: "approve_action" });
    expect(await getSchedule(owner, scheduled.id)).toBeNull();
  });
  it("claims once with CAS, tolerates one contention and rejects foreign-owner editing", async () => {
    const record = await createSchedule(owner, input);
    loses = 1;
    expect(await claimScheduleRun(owner, record.id, true)).toMatchObject({
      run: { status: "dispatching" } });
    expect(await claimScheduleRun(owner, record.id, true)).toBeNull();
    await expect(updateSchedule("foreign@project-agent.test", record.id,
      { action: "pause" })).rejects.toThrow(/not found/);
    expect(entries[0].revision).toBe(1);
    expect(entries[0].activeRun).toBeDefined();
  });
  it("requires a finished run for acknowledgment and releases active-run on completion", async () => {
    const record = await createSchedule(owner, input);
    const claimed = (await claimScheduleRun(owner, record.id, true))!;
    const occurrence = claimed.run.occurrence;
    await expect(acknowledgeScheduleRun(owner, record.id, occurrence))
      .rejects.toThrow(/No completed notification/);
    await markScheduleRun(owner, record.id, occurrence, { status: "done" });
    expect(entries[0].activeRun).toBeUndefined();
    expect((await acknowledgeScheduleRun(owner, record.id, occurrence)).acknowledgedAt)
      .toBeTruthy();
    await expect(acknowledgeScheduleRun(owner, record.id, "bad"))
      .rejects.toThrow(/No completed notification/);
  });
  it("validates watch digest and does not set digest for interval schedule", async () => {
    const record = await createSchedule(owner, input);
    await expect(setScheduleWatchDigest(owner, record.id, "bad")).rejects.toThrow(/digest/);
    await setScheduleWatchDigest(owner, record.id, "a".repeat(64));
    expect(entries[0].watchDigest).toBeUndefined();
  });
  it("rejects unsafe schedule creations and legacy ID corruption", async () => {
    await expect(createSchedule(owner, { ...input, title: "" })).rejects.toThrow(/required/);
    await expect(createSchedule("not-an-email", input)).rejects.toThrow(/account/);
    await expect(createSchedule(owner, { ...input, workflowId: "invalid" }))
      .rejects.toThrow(/workflow/);
    await expect(importLegacySchedule({ id: "../../unsafe", ownerEmail: owner, runs: [] } as never))
      .rejects.toThrow(/Malformed/);
  });
});
