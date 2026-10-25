import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// This contract is deliberately host-required: portable lab runs must not
// report a PASS without reading the actual AI-WEB-CHAT task repository.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hostPath = resolve(projectRoot, process.env.P7_HOST_TASK_REPO_PATH ??
  "services/mongodb/projectAgentTasks.repo.ts");
const adapterPath = resolve(projectRoot, "lib/project-agent/p7-qa-conditional-update.ts");

function collectionDeclaration(source, identifier, filename) {
  const pattern = new RegExp(`\\b(?:export\\s+)?const\\s+${identifier}\\s*(?::\\s*string)?\\s*=\\s*["']([^"']+)["']`);
  const match = source.match(pattern);
  assert.ok(match, `Missing ${identifier} string declaration in ${filename}`);
  return match[1];
}

test("P7 CAS matches the host-owned Mongo task collection", () => {
  let hostSource;
  try { hostSource = readFileSync(hostPath, "utf8"); }
  catch { throw new Error(
    `Host task repository is required for this test: ${hostPath}. Set P7_HOST_TASK_REPO_PATH.`,
  ); }
  const adapter = readFileSync(adapterPath, "utf8");
  const hostName = collectionDeclaration(hostSource, "COLLECTION", hostPath);
  const adapterName = collectionDeclaration(adapter, "PROJECT_AGENT_TASK_COLLECTION", adapterPath);
  assert.equal(hostName, "project_agent_tasks", "Unexpected host schema; review adapter, do not weaken CAS");
  assert.equal(adapterName, hostName, "CAS adapter drifted from host Mongo collection");
  assert.equal((adapter.match(/\.collection\(PROJECT_AGENT_TASK_COLLECTION\)/g) ?? []).length, 2,
    "Both conditional write and read-only schema probe must use the shared constant");
  assert.doesNotMatch(adapter, /\.collection\(["']projectAgentTasks["']\)/,
    "Obsolete camel-case Mongo collection must never be used");
});
