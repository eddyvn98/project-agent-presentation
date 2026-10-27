import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
const folder = "test-results/c1/coverage";
const raw = JSON.parse(await readFile(folder + "/coverage-final.json", "utf8"));
const summary = JSON.parse(await readFile(folder + "/coverage-summary.json", "utf8"));
const core = new Set(["runtime/browser-agent/g2-lease-core.mjs",
  "compact-lease-core.mjs", "task-terminal-guard.ts", "recovery-decision.ts",
  "runtime/browser-agent/personal-vault.ts", "runtime/context-checkpoint.ts",
  "runtime/web-security.ts", "scheduled-worker.ts"]);
const entries = Object.entries(raw).filter(([path]) =>
  path.replaceAll("\\", "/").includes("/lib/project-agent/"))
  .map(([path, data]) => {
    const name = relative(resolve("."), path).replaceAll("\\", "/");
    const values = Object.values(data.s ?? {});
    const branches = Object.values(data.b ?? {}).flat();
    const count = xs => xs.filter(n => n > 0).length;
    return { file: name, statements: values.length,
      statementPct: values.length ? Math.round(10000 * count(values) / values.length) / 100 : null,
      branches: branches.length,
      branchPct: branches.length ? Math.round(10000 * count(branches) / branches.length) / 100 : null,
      core: [...core].some(s => name.endsWith("/" + s)) };
  });
assert.ok(entries.length >= 20, "Coverage instrumentation did not include enough Agent modules");
const ranked = entries.filter(row => row.branches > 0)
  .sort((a, b) => a.branchPct - b.branchPct || b.branches - a.branches);
const gaps = ranked.filter(row => row.core || row.branches >= 10).slice(0, 25);
const output = {
  measurement: "agent V8 branch coverage (CI subset, not production E2E)",
  instrumentedFiles: entries.length, total: summary.total,
  highPriorityUncoveredBranches: gaps,
  // Keep security/control hotspots visible even when large uncovered modules
  // dominate the general top-25 list. Percentages are CI unit coverage only.
  securityControlGaps: ranked.filter(row => /(?:access|vault|personal-auth|watch-access|browser-session-health|task-browser|project-control|project-sessions|control|handback|lease|recover|task-stop|terminal|session-routing|policy-hook)/i.test(row.file))
    .slice(0, 30),
  fullyUncoveredFiles: entries.filter(row => row.statements > 0 && row.statementPct === 0)
    .map(row => row.file).slice(0, 60),
};
await writeFile("test-results/c1/agent-coverage-gaps.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify({ c1: "PASS", instrumentedFiles: entries.length,
  totalBranches: summary.total.branches, gapCount: gaps.length }, null, 2));
