import { describe, expect, it } from "vitest";
import { p8QaSessionAllowed, p8QaDedicatedOrigin, P8_QA_PROMPT, P8_QA_OPERATIONS }
  from "../../lib/project-agent/p8-qa-session-guard";
const ctx = { runtime: "sandbox", browser: "1", fixture: "1",
  nodeEnv: "development", projectId: "proj_p8_qa",
  projectName: "P7 QA Synthetic P8", owner: "owner@project-agent.test",
  origin: "http://127.0.0.1:3006", requestOrigin: "http://127.0.0.1:3006",
  expectedProjectId: "proj_p8_qa" };
const task = { prompt: P8_QA_PROMPT, projectId: ctx.projectId,
  ownerEmail: ctx.owner, status: "running", cancelled: false };
const flags = { enabled: "1", loop: "1", isolated: "1", allowedOrigin: ctx.origin };
describe("P8 QA Chromium session fixture security contract", () => {
  it("only allows explicit isolated dev QA owner and exact synthetic task", () => {
    expect(p8QaSessionAllowed(ctx, task, flags)).toBe(true);
    expect(P8_QA_OPERATIONS.has("qa_prepare")).toBe(true);
    expect(P8_QA_OPERATIONS.has("click")).toBe(false);
  });
  it("permits only a dedicated loopback QA origin, never normal dev", () => {
    expect(p8QaDedicatedOrigin(ctx.origin, ctx.origin, "1")).toBe(true);
    for (const origin of ["http://127.0.0.1:3004", "http://127.0.0.1:3000",
      "http://example.org:3006", "https://127.0.0.1:3006"])
      expect(p8QaDedicatedOrigin(origin, origin, "1")).toBe(false);
    expect(p8QaDedicatedOrigin(ctx.origin, undefined, "1")).toBe(false);
  });
  it("denies production, other projects and untrusted owner accounts", () => {
    for (const c of [{ nodeEnv: "production" }, { owner: "staff@company.test" },
      { expectedProjectId: "another" }, { origin: "http://127.0.0.1:3005" },
      { requestOrigin: "http://127.0.0.1:3004", origin: "http://127.0.0.1:3004" },
      { requestOrigin: "https://127.0.0.1:3006", origin: "https://127.0.0.1:3006" },
      { projectName: "Employee Project" }])
      expect(p8QaSessionAllowed({ ...ctx, ...c }, task, flags)).toBe(false);
  });
  it("denies missing opt-in flags or a different allowed Origin", () => {
    for (const f of [{ enabled: "0" }, { enabled: undefined }, { loop: "0" },
      { isolated: "0" }, { allowedOrigin: "http://127.0.0.1:3005" }])
      expect(p8QaSessionAllowed(ctx, task, { ...flags, ...f })).toBe(false);
  });
  it("refuses normal employee work, cancelled, done or spoofed QA tasks", () => {
    for (const patch of [
      { prompt: "[P7_SYNTHETIC_QA] p8 other fixture - local synthetic data only" },
      { prompt: "Open bank website" }, { projectId: "another" },
      { ownerEmail: "another@project-agent.test" }, { status: "done" },
      { cancelled: true },
    ]) expect(p8QaSessionAllowed(ctx, { ...task, ...patch }, flags)).toBe(false);
  });
});
