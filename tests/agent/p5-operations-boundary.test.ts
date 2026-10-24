import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
describe("P5 operational diagnostics access boundary", () => {
  const route = readFileSync(path.join(process.cwd(),
    "app/api/internal/project-agent/resources/route.ts"), "utf8");
  const session = readFileSync(path.join(process.cwd(),
    "lib/project-agent/runtime/browser-agent/session.ts"), "utf8");
  it("requires constant time operator secret and does not expose unauthenticated data", () => {
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("PROJECT_AGENT_OPERATOR_DIAGNOSTICS_SECRET");
    expect(route).toContain("status: 401");
    expect(route).toContain("no-store");
  });
  it("exports aggregate browser counters without user session contents", () => {
    const snapshot = session.slice(session.indexOf("export function browserResourceSnapshot()"));
    for (const field of ["activeContexts", "waitingContexts", "activeSessions", "pendingSessions"])
      expect(snapshot).toContain(field);
    for (const secret of ["authVersion", "ownerEmail", "cookies", "screenshot", "page.url()"])
      expect(snapshot).not.toContain(secret);
  });
});
