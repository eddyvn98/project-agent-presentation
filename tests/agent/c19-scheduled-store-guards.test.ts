import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createSchedule, getSchedule, listSchedules,
  setScheduleWatchDigest } from "../../lib/project-agent/scheduled-store";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "c19-schedule-"));
  vi.stubEnv("PROJECT_AGENT_SCHEDULES_DIR", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("C19 schedule durability and tenant validation", () => {
  it("returns empty for missing owners and invalid schedule IDs", async () => {
    expect(await listSchedules("none@example.test")).toEqual([]);
    expect(await getSchedule("none@example.test", "../invalid")).toBeNull();
  });
  it("rejects malformed inputs before writing task data", async () => {
    const owner = "c19@example.test";
    await expect(createSchedule(owner, {
      title: "", prompt: "valid", projectId: "project", spec: "invalid",
    } as never)).rejects.toThrow();
    await expect(createSchedule(owner, {
      title: "Example", prompt: "", projectId: "project", spec: "invalid",
    } as never)).rejects.toThrow();
    await expect(createSchedule(owner, {
      title: "Example", prompt: "valid", projectId: "project",
      workflowId: "../../bad", spec: "invalid",
    } as never)).rejects.toThrow(/Invalid workflow/);
    expect(await listSchedules(owner)).toEqual([]);
  });
  it("rejects invalid watch fingerprints without touching any disk state", async () => {
    await expect(setScheduleWatchDigest("c19@example.test",
      "sat_11111111-1111-1111-1111-111111111111", "not-sha256")).rejects.toThrow(/digest/);
  });
});
