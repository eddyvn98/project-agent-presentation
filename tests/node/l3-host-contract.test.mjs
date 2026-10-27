import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const file = readFileSync(new URL("../../lib/project-agent/dify-agent.ts", import.meta.url), "utf8");
test("L3: single recap import, authorized task CAS before compaction", () => {
  const parsed = ts.createSourceFile("dify-agent.ts", file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(parsed.parseDiagnostics.length, 0);
  const imports = [];
  for (const item of parsed.statements) {
    if (!ts.isImportDeclaration(item)) continue;
    const bindings = item.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) imports.push(element.name.text);
    }
  }
  assert.equal(imports.filter(name => name === "buildChatRecap").length, 1);
  const authorized = file.indexOf("const projectAccess = await projectCap.getProjectAccess(");
  const cas = file.indexOf("await markTaskRunningIfQueued(");
  const compact = file.indexOf("await autoCompactIfNeeded(task)");
  assert.ok(authorized > 0 && authorized < cas && cas < compact,
    "Access verification and queued-to-running CAS must happen before auto-compaction");
});
