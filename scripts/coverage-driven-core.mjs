/** Risk-weighted V8 coverage prioritization. This does not merge external Playwright/Mongo metrics. */
const RISK = [
  ["critical-control", 6, /(?:access|auth|vault|permission|task-stop|terminal|recovery|lease|durable-queue|project-control|browser-agent\/index|browser-agent\/manual|handback|action-replay)/i],
  ["external-actions", 5, /(?:dify-agent|web-fetch|web-search|pdf-action|workspace|sandbox|actions|files\.ts|tool|upload)/i],
  ["state-scheduling", 4, /(?:scheduled|scheduler|compact|checkpoint|memory|harness-lab|auto-skills|conversation)/i],
];
const round = (n) => Math.round(n * 100) / 100;
const category = (file) => {
  const match = RISK.find(([, , pattern]) => pattern.test(file));
  return match ? { risk: match[0], weight: match[1] } : { risk: "other", weight: 2 };
};
export function buildCoveragePriorities(raw, summary, limit = 40) {
  if (!raw || typeof raw !== "object" || !summary?.total?.branches)
    throw new Error("V8 coverage-final and coverage-summary are required");
  const files = Object.entries(raw).filter(([name]) =>
    name.replaceAll("\\", "/").includes("/lib/project-agent/")).map(([file, data]) => {
    const normalized = file.replaceAll("\\", "/");
    const name = "lib/project-agent/" + normalized.split("/lib/project-agent/")[1];
    const stats = Object.entries(data.b ?? {}).flatMap(([id, values]) => {
      const map = data.branchMap?.[id];
      return (Array.isArray(values) ? values : []).map((count, index) => ({
        count, line: map?.locations?.[index]?.start?.line ??
          map?.line ?? map?.loc?.start?.line ?? 0, type: map?.type ?? "unknown",
      }));
    });
    const covered = stats.filter(x => x.count > 0).length;
    const missing = stats.length - covered;
    const { risk, weight } = category(name);
    const locations = new Map();
    for (const item of stats.filter(x => x.count === 0 && x.line > 0)) {
      const entry = locations.get(item.line) ?? { line: item.line, missed: 0, kinds: new Set() };
      entry.missed++;
      entry.kinds.add(item.type);
      locations.set(item.line, entry);
    }
    const uncoveredLines = [...locations.values()].sort((a, b) =>
      b.missed - a.missed || a.line - b.line).slice(0, 12)
      .map(row => ({ line: row.line, missed: row.missed, kinds: [...row.kinds] }));
    return { file: name, risk, weight, branches: stats.length, covered, missing,
      branchPct: stats.length ? round(100 * covered / stats.length) : null,
      priorityScore: missing * weight + (stats.length && covered === 0 ? 20 : 0),
      uncoveredLines };
  });
  const ranked = files.filter(x => x.branches > 0).sort((a, b) =>
    b.priorityScore - a.priorityScore || b.missing - a.missing || a.file.localeCompare(b.file));
  const rollup = RISK.map(([risk]) => {
    const subset = files.filter(f => f.risk === risk);
    const total = subset.reduce((a, f) => a + f.branches, 0);
    const covered = subset.reduce((a, f) => a + f.covered, 0);
    return { risk, files: subset.length, branches: total, covered,
      missing: total - covered, branchPct: total ? round(covered * 100 / total) : null };
  });
  const priority = ranked.slice(0, Math.max(1, Math.min(100, limit)));
  const baseline = summary.total.branches;
  return {
    measurement: "V8 Unit/Agent Vitest only (not integrated E2E coverage)",
    branchCoverage: baseline, instrumentedFiles: files.length,
    scopes: [
      { suite: "unit-agent-vitest", measured: true, aggregate: "current report" },
      { suite: "mongodb-integration", measured: false, aggregate: "separate CI evidence" },
      { suite: "chromium-playwright-e2e", measured: false, aggregate: "separate CI evidence" },
      { suite: "real-two-host-e2e", measured: false, aggregate: "not claimed" },
    ],
    policy: { goalCriticalBranchPct: 80, strictCriticalGate: false,
      rationale: "Informational until per-module targeted suites and baseline are established" },
    riskGroups: rollup, topPriorities: priority,
    uncoveredFiles: ranked.filter(x => x.covered === 0).length,
  };
}
export function coveragePriorityMarkdown(report) {
  const lines = [
    "# Agent coverage-driven priorities",
    "",
    "**Scope:** V8 Agent Vitest only. Mongo integration, Chromium and two-host E2E",
    "are not counted in this percentage. A zero does not prove a feature untested elsewhere.",
    "",
    "## Current measured branch coverage",
    "",
    "- " + report.branchCoverage.covered + " / " + report.branchCoverage.total +
      " (" + report.branchCoverage.pct + "%) over " + report.instrumentedFiles + " files",
    "- Critical-control target: " + report.policy.goalCriticalBranchPct +
      "% (informational; not a passing gate)",
    "",
    "## Prioritized uncovered branches",
    "",
    "| Priority | File | Risk | Missing / Total | Branch % | First targets |",
    "|---:|---|---|---:|---:|---|",
  ];
  report.topPriorities.forEach((row, i) => lines.push(
    "|" + (i + 1) + "| \`" + row.file + "\` | " + row.risk +
    " | " + row.missing + "/" + row.branches + " | " + row.branchPct +
    "% | " + row.uncoveredLines.slice(0, 5).map(x =>
      "L" + x.line + " (" + x.missed + ")").join(", ") + " |"));
  lines.push("", "## Measurement limitations", "",
    "- Branch locations are hints; read source and design assertions before adding tests.",
    "- Keep CI integration/E2E results as separate pass/fail evidence, not synthetic coverage.",
    "- Re-evaluate score and targets after each CI run; favor security invariants over raw %",
    "");
  return lines.join("\n");
}
