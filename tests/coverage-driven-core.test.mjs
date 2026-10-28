import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCoveragePriorities, coveragePriorityMarkdown } from
  "../scripts/coverage-driven-core.mjs";

const branch = (line, counts) => ({
  branchMap: { 0: { line, type: "if", locations: counts.map(() => ({
    start: { line }, end: { line },
  })) } }, b: { 0: counts },
});
const summary = { total: { branches: { total: 6, covered: 1, pct: 16.67 } } };
describe("coverage driven ranking and evidence labels", () => {
  it("ranks untested high-risk modules ahead of low-risk modules", () => {
    const raw = {
      "/work/lib/project-agent/runtime/browser-agent/index.ts": branch(33, [0, 0]),
      "/work/lib/project-agent/byte-range.ts": branch(14, [0, 0, 0, 0]),
      "/work/lib/project-agent/durable-queue.ts": branch(48, [1, 0]),
    };
    const result = buildCoveragePriorities(raw, summary, 20);
    assert.equal(result.topPriorities[0].risk, "critical-control");
    assert.equal(result.topPriorities[0].file, "lib/project-agent/runtime/browser-agent/index.ts");
    assert.equal(result.topPriorities[0].uncoveredLines[0].line, 33);
    assert.equal(result.topPriorities.find(x => x.file === "lib/project-agent/durable-queue.ts").covered, 1);
    assert.equal(result.instrumentedFiles, 3);
    assert.equal(result.uncoveredFiles, 2);
    assert.equal(result.scopes.find(x => x.suite === "mongodb-integration").measured, false);
    assert.match(coveragePriorityMarkdown(result), /not counted in this percentage/);
  });
  it("handles empty branches and refuses a missing summary", () => {
    const file = "/work/lib/project-agent/access.ts";
    const result = buildCoveragePriorities({ [file]: { b: {}, branchMap: {} } }, summary);
    assert.equal(result.topPriorities.length, 0);
    assert.throws(() => buildCoveragePriorities({}, {}), /required/);
  });
  it("counts missing branch paths and picks hottest source lines", () => {
    const result = buildCoveragePriorities({
      "/work/lib/project-agent/compact-lease.ts": {
        b: { 0: [0, 0], 1: [1, 0] },
        branchMap: {
          0: { type: "if", locations: [{ start: { line: 22 } },
            { start: { line: 22 } }] },
          1: { type: "if", locations: [{ start: { line: 40 } },
            { start: { line: 42 } }] },
        },
      },
    }, summary);
    const target = result.topPriorities[0];
    assert.equal(target.missing, 3);
    assert.deepEqual(target.uncoveredLines[0], {
      line: 22, missed: 2, kinds: ["if"],
    });
  });
});
