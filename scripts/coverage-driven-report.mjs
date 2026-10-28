import { readFile, writeFile } from "node:fs/promises";
import { buildCoveragePriorities, coveragePriorityMarkdown } from "./coverage-driven-core.mjs";

const directory = "test-results/c1";
const coverage = directory + "/coverage";
const [raw, summary] = await Promise.all([
  readFile(coverage + "/coverage-final.json", "utf8").then(JSON.parse),
  readFile(coverage + "/coverage-summary.json", "utf8").then(JSON.parse),
]);
const result = buildCoveragePriorities(raw, summary);
await Promise.all([
  writeFile(directory + "/coverage-priorities.json", JSON.stringify(result, null, 2) + "\n"),
  writeFile(directory + "/coverage-priorities.md", coveragePriorityMarkdown(result)),
]);
console.log(JSON.stringify({
  coverageDriven: "PASS", scope: result.measurement,
  branchCoverage: result.branchCoverage.pct,
  untestedInVitest: result.uncoveredFiles,
  highestPriority: result.topPriorities.slice(0, 5).map(row =>
    ({ file: row.file, missing: row.missing, risk: row.risk })),
}, null, 2));
