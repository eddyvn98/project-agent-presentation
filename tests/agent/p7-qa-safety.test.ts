import { describe, expect, it } from "vitest";
import { p7QaAllowed, p7SyntheticTask } from "../../lib/project-agent/p7-qa-guard";
import { p7SyntheticPdf } from "../../lib/project-agent/p7-synthetic-pdf";
import { assertPublicHttpUrl } from "../../lib/project-agent/runtime/web-security";
const safe = { runtime: "sandbox", browser: "1", fixture: "1", nodeEnv: "development",
  projectId: "proj_qa", projectName: "P7 QA Synthetic local", owner: "p7-owner@project-agent.test",
  origin: "http://127.0.0.1:3004", requestOrigin: "http://127.0.0.1:3004" };
describe("P7 synthetic security boundaries", () => {
  it("requires explicit flags, synthetic owner/Project and exact local Origin", () => {
    expect(p7QaAllowed(safe)).toBe(true);
    for (const patch of [
      { nodeEnv: "production" }, { fixture: "0" }, { browser: "0" }, { runtime: "classic" },
      { owner: "employee@company.test" }, { projectName: "Real project" },
      { requestOrigin: "http://127.0.0.1:3003" }, { origin: "https://attacker.invalid" },
      { expectedProjectId: "proj_other" },
    ]) expect(p7QaAllowed({ ...safe, ...patch })).toBe(false);
  });
  it("will not delete unrelated or foreign tasks", () => {
    expect(p7SyntheticTask({ prompt: "[P7_SYNTHETIC_QA] browser fixture", ownerEmail: safe.owner,
      projectId: safe.projectId }, safe.projectId, safe.owner)).toBe(true);
    expect(p7SyntheticTask({ prompt: "A real request", ownerEmail: safe.owner,
      projectId: safe.projectId }, safe.projectId, safe.owner)).toBe(false);
  });
  it("does not loosen loopback/private network SSRF protections", async () => {
    for (const url of ["http://127.0.0.1:3004", "http://192.168.1.1", "http://[::1]"])
      await expect(assertPublicHttpUrl(url)).rejects.toThrow(/private or local/);
  });
  it("renders an in-memory synthetic PDF without private user data", () => {
    const pdf = p7SyntheticPdf().toString("ascii");
    const offset = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
    expect(pdf.slice(offset, offset + 4)).toBe("xref");
    expect(pdf).toContain("P7 synthetic artifact");
  });
});
