import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const base = process.argv[2] ?? "c6165f5";
const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", base], { encoding: "utf8" });
const added = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" });
const paths = [...new Set(`${changed}\n${added}`.split("\n"))].filter((path) => /\.(tsx?|mjs|css)$/.test(path));
let largest = { path: "", lines: 0 };
for (const path of paths) {
  const source = await readFile(path, "utf8");
  const lines = source.trimEnd().split("\n").length;
  if (lines >= 300) throw new Error(`${path}: ${lines} lines; must be under 300`);
  if (lines > largest.lines) largest = { path, lines };
  if (/\.tsx?$/.test(path)) {
    const result = ts.transpileModule(source, { fileName: path, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
    const errors = result.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error) ?? [];
    if (errors.length) throw new Error(`${path}: ${errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n")}`);
  }
}
console.log(`${paths.length} changed/new source files: under 300 lines; TypeScript syntax passed.`);
console.log(`Largest: ${largest.path} (${largest.lines} lines). This is a syntax check, not host typechecking.`);
