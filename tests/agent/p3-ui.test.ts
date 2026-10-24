import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
describe("P3 owner UI and internal routes", () => {
  it("exposes Benchmark Lab and all account-wide control pages", () => {
    const nav = readFileSync(path.join(root, "components/features/projects/AgentAccountNav.tsx"), "utf8");
    for (const route of ["agent-benchmark","agent-control","agent-observability",
      "agent-workflows","agent-skills","scheduled-tasks","browser-sessions"]) {
      expect(nav).toContain('href: "/account/' + route + '"');
      const page = path.join(root, "app/account", route, "page.tsx");
      expect(existsSync(page)).toBe(true);
      expect(readFileSync(page,"utf8")).toContain("<ProtectedRoute>");
    }
  });
  it("keeps live Browser Watch limited to owner-only task routes", () => {
    const source = readFileSync(path.join(root,
      "app/api/projects/[projectId]/agent/tasks/[taskId]/browser/live/route.ts"),"utf8");
    expect(source).toContain("resolveProjectRequestAccess");
    expect(source).toContain("task.ownerEmail.toLowerCase()");
    expect(source).toContain("sensitiveScreenshotMask");
  });
});
