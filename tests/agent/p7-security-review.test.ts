import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
import { getMongoAiDb } from "@/services/mongodb/client";
import { assertPublicHttpUrl } from "../../lib/project-agent/runtime/web-security";
import { publicBrowserWatchLocation } from "../../lib/project-agent/runtime/browser-agent/watch";
import { p7QaAllowed, p7QaRequestOrigin } from "../../lib/project-agent/p7-qa-guard";
import { recordBrowserSecurityAudit } from "../../lib/project-agent/browser-security-policy";

const owner = "owner@project-agent.test";
const devQa = { runtime: "sandbox", browser: "1", fixture: "1",
  nodeEnv: "development", projectId: "proj_qa",
  projectName: "P7 QA Synthetic local", owner,
  origin: "http://127.0.0.1:3005", requestOrigin: "http://127.0.0.1:3005" };
let oldStrict: string | undefined, oldNode: string | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  oldStrict = process.env.PROJECT_AGENT_STRICT_BROWSER_AUDIT;
  oldNode = process.env.NODE_ENV;
});
afterEach(() => {
  if (oldStrict === undefined) delete process.env.PROJECT_AGENT_STRICT_BROWSER_AUDIT;
  else process.env.PROJECT_AGENT_STRICT_BROWSER_AUDIT = oldStrict;
  if (oldNode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = oldNode;
});
describe("P7.6.3 local security review regression", () => {
  it("rejects embedded credentials without performing DNS resolution", async () => {
    const dns = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    await expect(assertPublicHttpUrl("https://user:secret@public.example/x", dns))
      .rejects.toThrow(/credentials/);
    expect(dns).not.toHaveBeenCalled();
  });
  it("denies mixed public/private DNS, loopback, metadata and unsafe protocols", async () => {
    const dns = vi.fn(async () => [{ address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 }]);
    await expect(assertPublicHttpUrl("https://public.example/", dns))
      .rejects.toThrow(/private or local/);
    for (const url of ["http://127.0.0.1:3004", "http://169.254.169.254/",
      "http://192.168.0.3/", "http://[::1]/", "file:///etc/passwd"])
      await expect(assertPublicHttpUrl(url)).rejects.toThrow();
  });
  it("does not leak path IDs, access tokens or query secrets in Browser Watch status", () => {
    const url = "https://public.example/account/private-id?access_token=very-secret#fragment";
    expect(publicBrowserWatchLocation(url)).toBe("https://public.example");
    expect(publicBrowserWatchLocation("data:text/plain,secret")).toBe("");
  });
  it("QA mutations are denied without exact same Origin, including in production", () => {
    expect(p7QaAllowed(devQa)).toBe(true);
    expect(p7QaAllowed({ ...devQa, nodeEnv: "production" })).toBe(false);
    expect(p7QaAllowed({ ...devQa, origin: p7QaRequestOrigin("PATCH", null,
      devQa.requestOrigin) })).toBe(false);
    expect(p7QaAllowed({ ...devQa, origin: "http://127.0.0.1:3004" })).toBe(false);
    expect(p7QaAllowed({ ...devQa, owner: "employee@example.com" })).toBe(false);
  });
  it("audit logs contain only a digest of sensitive action labels", async () => {
    const insertOne = vi.fn(async (_doc: Record<string, unknown>) => ({}));
    vi.mocked(getMongoAiDb).mockResolvedValue({ collection: () => ({
      createIndex: async () => "ok", insertOne,
    }) } as never);
    await recordBrowserSecurityAudit({ owner, taskId: "pat_123456789abc",
      projectId: "proj_qa", hostname: "public.example", action: "click",
      decision: "allow", label: "secret-test-value" });
    expect(insertOne).toHaveBeenCalledTimes(1);
    const doc = insertOne.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.labelDigest).toMatch(/^[a-f0-9]{18}$/);
    expect(JSON.stringify(doc)).not.toContain("secret-test-value");
  });
  it("production browser audit fails closed on database error", async () => {
    process.env.NODE_ENV = "production";
    vi.mocked(getMongoAiDb).mockRejectedValue(new Error("audit database unavailable"));
    await expect(recordBrowserSecurityAudit({ owner, taskId: "pat_123456789abc",
      projectId: "proj_qa", hostname: "public.example", action: "click",
      decision: "allow" })).rejects.toThrow("audit database unavailable");
  });
  it("explicit strict audit flag also fails closed outside production", async () => {
    process.env.PROJECT_AGENT_STRICT_BROWSER_AUDIT = "1";
    vi.mocked(getMongoAiDb).mockRejectedValue(new Error("audit unavailable"));
    await expect(recordBrowserSecurityAudit({ owner, taskId: "pat_123456789abc",
      projectId: "proj_qa", hostname: "public.example", action: "click",
      decision: "deny" })).rejects.toThrow(/audit unavailable/);
  });
});
