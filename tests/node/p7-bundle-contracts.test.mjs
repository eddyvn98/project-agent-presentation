import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const load = (relative) => {
  const code = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
  const js = ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { exports: module.exports, module, require, Buffer, URL });
  return module.exports;
};
const guard = load("../../lib/project-agent/p7-qa-guard.ts");
const pdf = load("../../lib/project-agent/p7-synthetic-pdf.ts");
const ids = load("../../lib/project-agent/request-idempotency.ts");
test("synthetic endpoint cannot run in production or at foreign origin", () => {
  const base = { runtime: "sandbox", browser: "1", fixture: "1", nodeEnv: "development",
    projectId: "proj_qa", projectName: "P7 QA Synthetic local", owner: "p7-owner@project-agent.test",
    origin: "http://127.0.0.1:3004", requestOrigin: "http://127.0.0.1:3004" };
  assert.equal(guard.p7QaAllowed(base), true);
  for (const patch of [{ nodeEnv: "production" }, { browser: "0" }, { fixture: "0" },
    { owner: "employee@example.com" }, { requestOrigin: "http://127.0.0.1:3003" }])
    assert.equal(guard.p7QaAllowed({ ...base, ...patch }), false);
});
test("synthetic PDF offsets and request identity are deterministic", () => {
  const body = pdf.p7SyntheticPdf().toString("ascii");
  const offset = Number(body.match(/startxref\n(\d+)/)?.[1]);
  assert.equal(body.slice(offset, offset + 4), "xref");
  const uuid = "12345678-1234-1234-1234-123456789abc";
  assert.notEqual(ids.requestTaskKey("proj_a", uuid), ids.requestTaskKey("proj_b", uuid));
  assert.notEqual(ids.fingerprintTaskBody("proj_a", { prompt: "A" }),
    ids.fingerprintTaskBody("proj_a", { prompt: "B" }));
});
