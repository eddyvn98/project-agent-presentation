import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({ records: [] as Record<string, unknown>[] }));
vi.mock("@/services/mongodb/client", () => ({
  getMongoAiDb: async () => ({
    collection: () => ({
      createIndex: async () => "projectId_1_taskId_1",
      insertOne: async (record: Record<string, unknown>) => {
        memory.records.push({ ...record }); return { acknowledged: true };
      },
      find: (query: Record<string, unknown>) => ({
        sort: () => ({ limit: () => ({ next: async () =>
          [...memory.records].reverse().find(record =>
            Object.entries(query).every(([key, value]) => record[key] === value)) ?? null,
        }) }),
      }),
    }),
  }),
}));
import {
  inspectDesignApproval, getDesignApprovalState, decideDesignApproval,
  canReleaseDesign, designFileFamily,
} from "../../lib/project-agent/design-approval-store";

const base = {
  title: "Approval fixture", units: "mm",
  room: { width: 6000, depth: 4500, height: 3000, wallThickness: 150 },
  openings: [{ wall: "south", kind: "door", offset: 200, width: 900, height: 2100, sill: 0 }],
  furniture: [{ kind: "table", label: "Desk", x: 3000, y: 2200, width: 1200,
    depth: 700, height: 750, rotation: 0 }],
};
const bytes = Buffer.from(JSON.stringify(base));
const identity = { projectId: "project-1", taskId: "task-1", sourceFileId: "file-1" };
beforeEach(() => { memory.records.length = 0; });

describe("SHA-bound owner design approval and release gate", () => {
  it("requires approval before Project release and stores an explicit human decision", async () => {
    expect(await canReleaseDesign({ ...identity, bytes })).toBe(false);
    const initial = await getDesignApprovalState({ ...identity, bytes });
    if ("error" in initial) throw Error(initial.error);
    expect(initial.status).toBe("awaiting_approval");
    const decision = await decideDesignApproval({
      ...identity, bytes, reviewer: "OWNER@EXAMPLE.COM", approve: true,
    });
    if ("error" in decision) throw Error(decision.error);
    expect(decision).toMatchObject({ decision: "approved", reviewer: "owner@example.com",
      sha256: initial.sha256 });
    expect(await canReleaseDesign({ ...identity, bytes })).toBe(true);
    expect(memory.records).toHaveLength(1);
  });
  it("binds approval to a particular file, task, project and exact contents", async () => {
    await decideDesignApproval({ ...identity, bytes, reviewer: "owner@example.com", approve: true });
    expect(await canReleaseDesign({ ...identity, bytes })).toBe(true);
    expect(await canReleaseDesign({ ...identity, taskId: "task-2", bytes })).toBe(false);
    expect(await canReleaseDesign({ ...identity, sourceFileId: "file-2", bytes })).toBe(false);
    expect(await canReleaseDesign({ ...identity, projectId: "project-2", bytes })).toBe(false);
    const changed = Buffer.from(JSON.stringify({ ...base, title: "Revised" }));
    expect(await canReleaseDesign({ ...identity, bytes: changed })).toBe(false);
  });
  it("blocks approval for unresolved collisions and permits rejection records", async () => {
    const invalidLayout = Buffer.from(JSON.stringify({ ...base, furniture: [
      base.furniture[0], { ...base.furniture[0], label: "Collision", x: 3050 },
    ] }));
    const inspected = inspectDesignApproval(invalidLayout);
    if ("error" in inspected) throw Error(inspected.error);
    expect(inspected.review.blockers).toBeGreaterThan(0);
    const approved = await decideDesignApproval({
      ...identity, bytes: invalidLayout, reviewer: "owner@example.com", approve: true,
    });
    expect(approved).toMatchObject({ error: expect.stringContaining("Unresolved") });
    expect(memory.records).toHaveLength(0);
    const rejected = await decideDesignApproval({
      ...identity, bytes: invalidLayout, reviewer: "owner@example.com", approve: false,
    });
    expect(rejected).toMatchObject({ decision: "rejected" });
    expect(await canReleaseDesign({ ...identity, bytes: invalidLayout })).toBe(false);
  });
  it("rejects invalid source and only identifies exact CAD artifact families", async () => {
    expect(inspectDesignApproval(Buffer.from("{bad-json"))).toHaveProperty("error");
    expect(inspectDesignApproval(Buffer.alloc(101_000))).toHaveProperty("error");
    expect(await canReleaseDesign({ ...identity, bytes: Buffer.from("{}") })).toBe(false);
    expect(designFileFamily("design-abcdef123456.glb")?.[1]).toBe("design-abcdef123456");
    expect(designFileFamily("design-abcdef123456.design.json")?.[1]).toBe("design-abcdef123456");
    expect(designFileFamily("../design-abcdef123456.glb")).toBeNull();
    expect(designFileFamily("report.docx")).toBeNull();
  });
});
