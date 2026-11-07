import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => {
  const rows = new Map<string, Map<string, Record<string, unknown>>>();
  return { rows };
});
vi.mock("@/services/mongodb/client", () => ({
  getMongoAiDb: async () => ({
    collection: (name: string) => {
      const table = storage.rows.get(name) ?? new Map<string, Record<string, unknown>>();
      storage.rows.set(name, table);
      const matches = (value: Record<string, unknown>, query: Record<string, unknown>) =>
        Object.entries(query).every(([key, expected]) => value[key] === expected);
      return {
        createIndex: async () => "index",
        insertOne: async (record: Record<string, unknown>) => {
          table.set(String(record._id), { ...record });
          return { acknowledged: true };
        },
        findOne: async (query: Record<string, unknown>) =>
          [...table.values()].find(record => matches(record, query)) ?? null,
        updateOne: async (query: Record<string, unknown>,
          update: { $setOnInsert: Record<string, unknown> }, options: { upsert?: boolean }) => {
          const exists = [...table.values()].some(record => matches(record, query));
          if (!exists && options?.upsert) table.set(String(query._id),
            { ...query, ...update.$setOnInsert });
          return { acknowledged: true, matchedCount: Number(exists) };
        },
        find: (query: Record<string, unknown>) => {
          let entries = [...table.values()].filter(record => matches(record, query));
          const chain = {
            sort: () => {
              entries = [...entries].reverse();
              return chain;
            },
            limit: (count: number) => {
              entries = entries.slice(0, count);
              return chain;
            },
            toArray: async () => entries,
            next: async () => entries[0] ?? null,
          };
          return chain;
        },
      };
    },
  }),
}));

import { decideDesignApproval } from "../../lib/project-agent/design-approval-store";
import { archiveApprovedDesign, listDesignArchives, getDesignArchive,
  readArchivedDesignFile } from "../../lib/project-agent/design-archive-store";

const id = "design-abcdefabcdef";
const context = { projectId: "project_1", taskId: "pat_abcdefabcdef",
  sourceFileId: "80ce4b21-61e8-4a77-93d6-2a72377b7684", ownerEmail: "Owner@Example.com" };
const model = { title: "Room QA", units: "mm",
  room: { width: 6000, depth: 4500, height: 3000, wallThickness: 150 },
  openings: [], furniture: [{
    kind: "table", label: "Desk", x: 2500, y: 2400, width: 1000,
    depth: 750, height: 750, rotation: 0,
  }],
};
const original = Buffer.from(JSON.stringify(model));
function binaryGlb() {
  const b = Buffer.alloc(20);
  b.write("glTF", 0, "ascii");
  b.writeUInt32LE(2, 4);
  b.writeUInt32LE(b.length, 8);
  return b;
}
function makeInput() {
  const files = [
    { name: id + ".design.json", mimeType: "application/json", bytes: Buffer.from(original) },
    { name: id + ".pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4\nexample") },
    { name: id + ".dxf", mimeType: "image/vnd.dxf", bytes: Buffer.from("0\nSECTION\n0\nEOF") },
    { name: id + ".glb", mimeType: "model/gltf-binary", bytes: binaryGlb() },
    { name: id + ".preview.png", mimeType: "image/png",
      bytes: Buffer.from([137,80,78,71,13,10,26,10,0,1,2,3]) },
    { name: id + ".ifc", mimeType: "text/plain",
      bytes: Buffer.from("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\n") },
  ];
  return { ...context, sourceName: id + ".design.json", sourceBytes: Buffer.from(original), files };
}
beforeEach(() => storage.rows.clear());

describe("Persistent multi-file CAD archive and replay safety", () => {
  it("fails closed without human approval", async () => {
    await expect(archiveApprovedDesign(makeInput())).rejects.toThrow("human must approve");
    expect(storage.rows.get("projectAgentCadArchives")?.size ?? 0).toBe(0);
  });
  it("persists every binary and source across independent reads with SHA-256", async () => {
    const input = makeInput();
    const decision = await decideDesignApproval({ ...context, bytes: input.sourceBytes,
      reviewer: "OWNER@example.com", approve: true });
    if ("error" in decision) throw Error(decision.error);
    const archived = await archiveApprovedDesign(input);
    expect(archived.id).toMatch(/^cad_[a-f0-9]{24}$/);
    expect(archived.files).toHaveLength(input.files.length);
    const list = await listDesignArchives(context.projectId, context.ownerEmail);
    expect(list.map(v => v.id)).toContain(archived.id);
    for (const file of input.files) {
      const read = await readArchivedDesignFile(context.projectId,
        context.ownerEmail, archived.id, file.name);
      expect(read?.bytes).toEqual(file.bytes);
    }
    expect(await getDesignArchive(context.projectId, "other@example.com", archived.id)).toBeNull();
    expect(await getDesignArchive("otherProject", context.ownerEmail, archived.id)).toBeNull();
  });
  it("is idempotent across retries and concurrent publication", async () => {
    const input = makeInput();
    await decideDesignApproval({ ...context, bytes: input.sourceBytes,
      reviewer: "owner@example.com", approve: true });
    const [a, b, c] = await Promise.all([
      archiveApprovedDesign(input), archiveApprovedDesign(input), archiveApprovedDesign(input),
    ]);
    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);
    expect(storage.rows.get("projectAgentCadArchives")?.size).toBe(1);
    const oldCount = storage.rows.get("projectAgentCadChunks")!.size;
    expect((await archiveApprovedDesign(input)).id).toBe(a.id);
    expect(storage.rows.get("projectAgentCadChunks")!.size).toBe(oldCount);
  });
  it("rejects altered approved source and unchanged-source conflicting retry", async () => {
    const input = makeInput();
    await decideDesignApproval({ ...context, bytes: input.sourceBytes,
      reviewer: "owner@example.com", approve: true });
    const initial = await archiveApprovedDesign(input);
    const changed = makeInput();
    changed.files.find(f => f.name.endsWith(".dxf"))!.bytes = Buffer.from("changed binary");
    await expect(archiveApprovedDesign(changed)).rejects.toThrow("Conflicting archive");
    const renamed = makeInput();
    renamed.sourceBytes = Buffer.from(JSON.stringify({ ...model, title: "different" }));
    renamed.files[0].bytes = renamed.sourceBytes;
    await expect(archiveApprovedDesign(renamed)).rejects.toThrow("human must approve");
    expect((await readArchivedDesignFile(context.projectId,
      context.ownerEmail, initial.id, input.files[2].name))?.bytes).toEqual(input.files[2].bytes);
  });
  it("detects post-publication chunk corruption and does not return partial bytes", async () => {
    const input = makeInput();
    await decideDesignApproval({ ...context, bytes: input.sourceBytes,
      reviewer: "owner@example.com", approve: true });
    const record = await archiveApprovedDesign(input);
    const chunks = storage.rows.get("projectAgentCadChunks")!;
    const entry = [...chunks.entries()].find(([key]) => key.includes(".glb:"))!;
    entry[1].payload = "AAAA";
    await expect(readArchivedDesignFile(context.projectId, context.ownerEmail,
      record.id, id + ".glb")).rejects.toThrow("integrity");
  });
  it("does not publish incomplete or malformed CAD bundles", async () => {
    const input = makeInput();
    await decideDesignApproval({ ...context, bytes: input.sourceBytes,
      reviewer: "owner@example.com", approve: true });
    const noDxf = makeInput();
    noDxf.files = noDxf.files.filter(f => !f.name.endsWith(".dxf"));
    await expect(archiveApprovedDesign(noDxf)).rejects.toThrow("Incomplete");
    const broken = makeInput();
    broken.files.find(f => f.name.endsWith(".glb"))!.bytes = Buffer.from("not glTF");
    await expect(archiveApprovedDesign(broken)).rejects.toThrow("Corrupt GLB");
    expect(storage.rows.get("projectAgentCadArchives")?.size ?? 0).toBe(0);
  });
});
