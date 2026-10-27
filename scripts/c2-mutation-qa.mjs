import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
if (process.env.C2_MUTATION_QA !== "1" ||
    process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true")
  throw Error("C2 source mutation is restricted to ephemeral GitHub CI checkout");
const current = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
assert.equal(current, "", "C2 refuses a dirty working tree");
const hash = value => createHash("sha256").update(value).digest("hex");
const cases = [
  {
    id: "uncertain-recovery-must-review",
    path: "lib/project-agent/recovery-decision.ts",
    before: 'if (queue === "needs_review") return "review";',
    after: 'if (queue === "needs_review") return "dispatch";',
    test: ["tests/agent/c2-recovery-invariants.test.ts"],
  },
  {
    id: "owner-key-compaction-isolation",
    path: "lib/project-agent/compact-lease-core.mjs",
    before: '.update(scope.ownerEmail.toLowerCase())',
    after: '.update("shared-owner-bug")',
    test: ["tests/agent/compact-lease-l7.test.ts"],
  },
  {
    id: "terminal-write-scoped-owner",
    path: "lib/project-agent/task-terminal-guard.ts",
    before: '_id: task.id, projectId: task.projectId, ownerEmail: task.ownerEmail,',
    after: '_id: task.id, projectId: task.projectId, ownerEmail: "foreign@project-agent.test",',
    test: ["tests/agent/p7-terminal-write-stop-race.test.ts"],
  },
  {
    id: "browser-claim-must-require-vacant",
    path: "lib/project-agent/runtime/browser-agent/g2-lease-core.mjs",
    before: '_id: id, ownerEmail: owner, state: "vacant",\n  }, {',
    after: '_id: id, ownerEmail: owner, state: "agent",\n  }, {',
    test: ["tests/node/g2-browser-lease.test.mjs"],
    node: true,
  },
];
const run = (item) => spawnSync(process.execPath, item.node ?
  ["--test", ...item.test] :
  ["./node_modules/vitest/vitest.mjs", "run", "--config",
    "vitest.agent.config.ts", ...item.test], {
  encoding: "utf8", timeout: 90_000, maxBuffer: 2 * 1024 * 1024,
  env: { ...process.env, NO_COLOR: "1" },
});
const report = [];
for (const item of cases) {
  const source = await readFile(item.path, "utf8");
  assert.equal(source.split(item.before).length, 2,
    "Mutation anchor must appear exactly once: " + item.id);
  const baseline = run(item);
  assert.equal(baseline.status, 0, "Baseline failed before mutation " + item.id +
    ": " + (baseline.stdout + baseline.stderr).slice(-2000));
  let outcome;
  try {
    await writeFile(item.path, source.replace(item.before, item.after));
    outcome = run(item);
  } finally {
    await writeFile(item.path, source);
  }
  assert.equal(hash(await readFile(item.path)), hash(source),
    "Original source not recovered: " + item.id);
  const text = (outcome.stdout ?? "") + (outcome.stderr ?? "");
  const killed = outcome.status !== 0 && !outcome.error &&
    /FAIL|Failed Tests|not ok|AssertionError/.test(text) &&
    !/Failed to resolve import|Cannot find module|SyntaxError/.test(text);
  report.push({ mutant: item.id, killed, exitCode: outcome.status,
    diagnostic: killed ? "Target tests rejected a semantically altered implementation" :
      text.slice(-1500) });
}
await mkdir("test-results/c2", { recursive: true });
const score = Math.round(100 * report.filter(x => x.killed).length / report.length);
await writeFile("test-results/c2/mutation-report.json",
  JSON.stringify({ c2: score === 100 ? "PASS" : "SURVIVORS", score,
    total: report.length, mutants: report, isolation: "ephemeral GitHub checkout" }, null, 2));
console.log(JSON.stringify({ c2: score === 100 ? "PASS" : "SURVIVORS",
  score, total: report.length, mutants: report.map(x => ({
    mutant: x.mutant, killed: x.killed })) }, null, 2));
if (score !== 100) process.exitCode = 1;
