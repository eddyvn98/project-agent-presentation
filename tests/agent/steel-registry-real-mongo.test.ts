import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
vi.mock("../../lib/project-agent/runtime/browser-agent/steel-session", () => ({
  createSteelRemote: vi.fn(), releaseSteelRemote: vi.fn(),
}));
import { getMongoAiDb } from "@/services/mongodb/client";
import { createSteelRemote, releaseSteelRemote }
  from "../../lib/project-agent/runtime/browser-agent/steel-session";
import {
  ensureProjectRecord, findProjectRecord, closeProjectRecord,
} from "../../lib/project-agent/runtime/browser-agent/project-registry";

// Normal unit/coverage CI does not require the optional Mongo driver or a live database.
// A dedicated container-backed CI job opts into the tests explicitly.
const enabled = process.env.STEEL_REGISTRY_REAL_MONGO_QA === "1";
const suite = enabled ? describe : describe.skip;
const project = "steel_registry_isolated_qa", owner = "owner@qa.example.test";
let client: any, db: any, dbName = "", scope = "", marker = "";
const registry = () => db.collection("projectAgentSharedBrowsers");
const row = () => registry().findOne({ _id: scope });

suite("Project Steel registry against isolated real MongoDB", () => {
  beforeAll(async () => {
    const raw = process.env.STEEL_REGISTRY_MONGO_URI ?? "";
    let url: URL;
    try { url = new URL(raw); }
    catch { throw Error("Real-Mongo Steel QA requires an explicit local URI"); }
    if (url.protocol !== "mongodb:" || url.hostname !== "127.0.0.1" ||
        url.port !== "27019" || !["", "/"].includes(url.pathname) ||
        url.username || url.password || url.search || url.hash)
      throw Error("Steel registry QA permits only bare mongodb://127.0.0.1:27019");
    const MongoClient = createRequire(import.meta.url)("mongodb").MongoClient;
    marker = randomBytes(16).toString("hex");
    dbName = "steel_registry_qa_" + marker;
    client = new MongoClient(raw, { directConnection: true, serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db(dbName);
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.collection("qa_run_marker").insertOne({
      _id: "created-by-qa", marker, purpose: "steel-registry-real-mongo",
    });
  });
  afterAll(async () => {
    try {
      if (db && marker) {
        const stored = await db.collection("qa_run_marker").findOne({ _id: "created-by-qa" });
        if (stored?.marker !== marker || stored?.purpose !== "steel-registry-real-mongo")
          throw Error("QA cleanup refused: invalid database ownership marker");
        await db.dropDatabase();
      }
    } finally { await client?.close(); }
  });
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    scope = "pb_steel_qa_" + randomBytes(12).toString("hex");
    vi.clearAllMocks();
    vi.mocked(getMongoAiDb).mockResolvedValue(db);
    vi.mocked(createSteelRemote).mockResolvedValue({
      id: "steel-real-mongo-initial", timeout: 900_000,
    });
    vi.mocked(releaseSteelRemote).mockResolvedValue(undefined);
  });

  it("persists a reserved UUID before requesting a remote Steel session", async () => {
    vi.stubEnv("PROJECT_AGENT_STEEL_RESERVED_SESSION_IDS", "1");
    let requested = "";
    vi.mocked(createSteelRemote).mockImplementationOnce(async id => {
      requested = id!;
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9-]{27,}$/);
      expect(await row()).toMatchObject({
        state: "creating", reservedSteelId: id,
      });
      return { id: id!, timeout: 900_000 };
    });
    const active = await ensureProjectRecord(scope, project, owner);
    expect(active.steelId).toBe(requested);
    expect(active.reservedSteelId).toBeUndefined();
    expect((await row()).reservedSteelId).toBeUndefined();
  });

  it("keeps a known reservation if the create response is lost", async () => {
    vi.stubEnv("PROJECT_AGENT_STEEL_RESERVED_SESSION_IDS", "1");
    let reserved = "";
    vi.mocked(createSteelRemote).mockImplementationOnce(async id => {
      reserved = id!; throw Error("synthetic timeout after POST");
    });
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/outcome is unknown/);
    expect(await row()).toMatchObject({
      reservedSteelId: reserved, state: "creating", claimUntil: 0,
    });
    await expect(ensureProjectRecord(scope, project, owner, undefined, true))
      .rejects.toThrow(/reconcile Steel sessions/);
    expect(createSteelRemote).toHaveBeenCalledTimes(1);
  });

  it("two workers share a single reserved creation rather than racing", async () => {
    vi.stubEnv("PROJECT_AGENT_STEEL_RESERVED_SESSION_IDS", "1");
    let arrived!: () => void, finish!: () => void;
    const entered = new Promise<void>(resolve => { arrived = resolve; });
    const pending = new Promise<void>(resolve => { finish = resolve; });
    vi.mocked(createSteelRemote).mockImplementationOnce(async id => {
      arrived(); await pending; return { id: id!, timeout: 900_000 };
    });
    const first = ensureProjectRecord(scope, project, owner);
    await entered;
    const second = ensureProjectRecord(scope, project, owner);
    finish();
    const [a, z] = await Promise.all([first, second]);
    expect(a.steelId).toBe(z.steelId);
    expect(createSteelRemote).toHaveBeenCalledTimes(1);
  });

  it("fences reopening during Stop of a reserved creation", async () => {
    vi.stubEnv("PROJECT_AGENT_STEEL_RESERVED_SESSION_IDS", "1");
    vi.mocked(createSteelRemote).mockImplementationOnce(async id => {
      await closeProjectRecord(scope, project, owner);
      expect((await row()).reservedSteelId).toBe(id);
      await expect(ensureProjectRecord(scope, project, owner, undefined, true))
        .rejects.toThrow(/Reserved Steel creation outcome unknown/);
      return { id: id!, timeout: 900_000 };
    });
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/creation was fenced/);
    expect((await row()).reservedSteelId).toBeUndefined();
    expect((await row()).state).toBe("closed");
    expect(releaseSteelRemote).toHaveBeenCalledOnce();
  });

  it("releases a mismatched server-created session rather than trusting the reservation", async () => {
    vi.stubEnv("PROJECT_AGENT_STEEL_RESERVED_SESSION_IDS", "1");
    vi.mocked(createSteelRemote).mockResolvedValueOnce({
      id: "steel-unexpected-remote", timeout: 900_000,
    });
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/did not honor the reserved session ID/);
    expect(releaseSteelRemote).toHaveBeenCalledWith("steel-unexpected-remote");
    expect((await row()).reservedSteelId).toBeUndefined();
    expect((await row()).state).toBe("vacant");
  });

  it("two concurrent callers use one CAS-created Steel identity", async () => {
    const [first, second] = await Promise.all([
      ensureProjectRecord(scope, project, owner),
      ensureProjectRecord(scope, project, owner),
    ]);
    expect(first.steelId).toBe("steel-real-mongo-initial");
    expect(second.steelId).toBe(first.steelId);
    expect(await row()).toMatchObject({ state: "active", generation: 1,
      steelId: first.steelId });
    expect(createSteelRemote).toHaveBeenCalledTimes(1);
    expect(releaseSteelRemote).not.toHaveBeenCalled();
  });

  it("persists release after an outage and does not reopen prematurely", async () => {
    await ensureProjectRecord(scope, project, owner);
    vi.mocked(releaseSteelRemote).mockRejectedValue(
      new Error("synthetic remote service offline"));
    await expect(closeProjectRecord(scope, project, owner))
      .rejects.toThrow(/offline/);
    expect(await row()).toMatchObject({ state: "closed", generation: 2,
      releasePendingSteelId: "steel-real-mongo-initial" });
    await expect(ensureProjectRecord(scope, project, owner, undefined, true))
      .rejects.toThrow(/offline/);
    expect(createSteelRemote).toHaveBeenCalledTimes(1);
    vi.mocked(releaseSteelRemote).mockResolvedValue(undefined);
    vi.mocked(createSteelRemote).mockResolvedValueOnce({
      id: "steel-real-mongo-reopened", timeout: 900_000,
    });
    const reopened = await ensureProjectRecord(scope, project, owner, undefined, true);
    expect(reopened.steelId).toBe("steel-real-mongo-reopened");
    expect((await row()).releasePendingSteelId).toBeUndefined();
    expect(createSteelRemote).toHaveBeenCalledTimes(2);
  });

  it("persists an orphaned late creation when Stop wins and release fails", async () => {
    vi.mocked(createSteelRemote).mockImplementationOnce(async () => {
      await closeProjectRecord(scope, project, owner);
      return { id: "steel-real-mongo-late", timeout: 900_000 };
    });
    vi.mocked(releaseSteelRemote).mockRejectedValueOnce(
      new Error("synthetic release failed"));
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/cleanup is pending/);
    expect(await row()).toMatchObject({ state: "closed", generation: 2,
      releasePendingSteelId: "steel-real-mongo-late" });
    await closeProjectRecord(scope, project, owner);
    expect((await row()).releasePendingSteelId).toBeUndefined();
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/User closed/);
    expect(createSteelRemote).toHaveBeenCalledTimes(1);
  });

  it("fences a lost Steel create response even without a returned remote ID", async () => {
    vi.mocked(createSteelRemote).mockRejectedValueOnce(
      new Error("synthetic Steel POST timeout"));
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/creation outcome is unknown/);
    expect(await row()).toMatchObject({
      state: "creating", generation: 1, claimUntil: 0,
    });
    await expect(ensureProjectRecord(scope, project, owner, undefined, true))
      .rejects.toThrow(/reconcile Steel sessions/);
    expect(createSteelRemote).toHaveBeenCalledTimes(1);
    expect(releaseSteelRemote).not.toHaveBeenCalled();
  });

  it("blocks a stale creating claim even when a user explicitly requests reopen", async () => {
    const stale = { _id: scope, projectId: project, owner,
      state: "creating", generation: 1, claimToken: "dead-worker",
      claimUntil: Date.now() - 100, lastUsedAt: Date.now() };
    await registry().insertOne(stale);
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/creation outcome is unknown/);
    await expect(ensureProjectRecord(scope, project, owner, undefined, true))
      .rejects.toThrow(/reconcile Steel sessions/);
    expect(await row()).toMatchObject(stale);
    expect(createSteelRemote).not.toHaveBeenCalled();
    expect(releaseSteelRemote).not.toHaveBeenCalled();
  });

  it("never takes over an in-flight creation after its lease times out", async () => {
    let entered!: () => void;
    let finish!: (value: { id: string; timeout: number }) => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    vi.mocked(createSteelRemote).mockImplementationOnce(() => {
      entered();
      return new Promise(resolve => { finish = resolve; });
    });
    const first = ensureProjectRecord(scope, project, owner);
    await started;
    await registry().updateOne({ _id: scope, state: "creating" },
      { $set: { claimUntil: Date.now() - 1 } });
    try {
      await expect(ensureProjectRecord(scope, project, owner))
        .rejects.toThrow(/creation outcome is unknown/);
      expect(createSteelRemote).toHaveBeenCalledTimes(1);
    } finally {
      finish({ id: "steel-real-mongo-original", timeout: 900_000 });
    }
    const firstSession = await first;
    expect(firstSession.steelId).toBe("steel-real-mongo-original");
    expect((await row()).generation).toBe(1);
    expect(createSteelRemote).toHaveBeenCalledTimes(1);
  });

  it("still replaces an expired active remote only after confirmed release", async () => {
    await ensureProjectRecord(scope, project, owner);
    await registry().updateOne({ _id: scope },
      { $set: { expiresAt: Date.now() - 500 } });
    vi.mocked(releaseSteelRemote).mockRejectedValueOnce(
      new Error("synthetic Steel outage"));
    await expect(ensureProjectRecord(scope, project, owner))
      .rejects.toThrow(/Steel outage/);
    expect(await row()).toMatchObject({ generation: 1, state: "active",
      steelId: "steel-real-mongo-initial" });
    expect(createSteelRemote).toHaveBeenCalledTimes(1);
    vi.mocked(createSteelRemote).mockResolvedValueOnce({
      id: "steel-real-mongo-rotated", timeout: 900_000,
    });
    const rotated = await ensureProjectRecord(scope, project, owner);
    expect(rotated.steelId).toBe("steel-real-mongo-rotated");
    expect(rotated.generation).toBe(2);
    expect(releaseSteelRemote).toHaveBeenCalledTimes(2);
  });

  it("isolates a Project browser session from a different owner or Project", async () => {
    await ensureProjectRecord(scope, project, owner);
    expect(await findProjectRecord(scope, project, "intruder@qa.example.test"))
      .toBeNull();
    expect(await findProjectRecord(scope, "other-project", owner)).toBeNull();
    await closeProjectRecord(scope, project, "intruder@qa.example.test");
    expect(await row()).toMatchObject({ state: "active",
      steelId: "steel-real-mongo-initial" });
    await expect(ensureProjectRecord(scope, project,
      "intruder@qa.example.test", undefined, true))
      .rejects.toThrow(/not initialized/);
    expect(releaseSteelRemote).not.toHaveBeenCalled();
  });
});
