import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const dir = join(root, "tests/agent");
const files = readdirSync(dir).filter(name => /\.test\.(ts|tsx)$/.test(name)).sort()
  .map(name => "tests/agent/" + name);
const extra = ["__tests__/project-agent/client.test.ts", "__tests__/project-agent/conversations.test.ts",
  "__tests__/project-agent/conversation-session.test.ts", "__tests__/project-agent/runtime-engines.test.ts",
  "__tests__/project-agent/task-error-notice.test.tsx", "__tests__/project-agent/task-pagination.test.ts",
  "__tests__/project-agent/wait-action.test.ts", "__tests__/project-agent/runtime-actions.test.ts"];
const targets = [...files, ...extra.filter(file => existsSync(join(root, file)))];
const timeoutMs = Number(process.env.AGENT_QA_FILE_TIMEOUT_MS ?? 45000);
const failures = [];
for (const [index, file] of targets.entries()) {
  console.log(`[agent-qa ${index + 1}/${targets.length}] ${file}`);
  const started = Date.now();
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config",
    "vitest.agent.config.ts", file, "--pool=forks", "--maxWorkers=1", "--minWorkers=1"], {
    cwd: root, timeout: timeoutMs, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PROJECT_AGENT_P3_BROWSER_QA: "0" },
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const status = result.error?.code === "ETIMEDOUT" ? "TIMEOUT" : result.status === 0 ? "PASS" : "FAIL";
  console.log(`[agent-qa] ${status} ${Date.now() - started}ms`);
  if (status !== "PASS") {
    failures.push({ file, status, exit: result.status, tail: output.slice(-5000) });
    console.error(output.slice(-5000));
  }
}
console.log(JSON.stringify({ total: targets.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
