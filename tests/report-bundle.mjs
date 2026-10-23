import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const dist = "dist";
const assets = join(dist, "assets");
const jsFiles = readdirSync(assets).filter((file) => file.endsWith(".js"));
const entryHtml = readFileSync(join(dist, "index.html"), "utf8");
const entryPaths = Array.from(entryHtml.matchAll(/<script[^>]+src="([^"]+\.js)"/g), (match) => match[1]);
if (!entryPaths.length) throw new Error("No JavaScript entry found in dist/index.html");
const sizes = jsFiles.map((name) => {
  const bytes = readFileSync(join(assets, name));
  return { name, bytes: statSync(join(assets, name)).size, gzip: gzipSync(bytes).length };
}).sort((a, b) => b.bytes - a.bytes);
const initial = sizes.filter((file) => entryPaths.some((src) => src.endsWith("/" + file.name)));
const deferred = sizes.filter((file) => file.name.startsWith("ProjectAgentChart-"));
const deferredMath = sizes.filter((file) => file.name.startsWith("ProjectAgentMathMarkdown-"));
if (!deferred.length) throw new Error("Expected a separate, asynchronously loaded chart chunk.");
if (!deferredMath.length) throw new Error("Expected a separate, asynchronously loaded math renderer.");
const format = (value) => (value / 1024).toFixed(1) + " KiB";
console.log("Initial JS: " + initial.map((f) => f.name + " " + format(f.bytes) + " / " + format(f.gzip) + " gzip").join("; "));
console.log("Deferred chart: " + deferred.map((f) => f.name + " " + format(f.bytes) + " / " + format(f.gzip) + " gzip").join("; "));
console.log("Deferred math: " + deferredMath.map((f) => f.name + " " + format(f.bytes) + " / " + format(f.gzip) + " gzip").join("; "));
console.log("Largest JS chunks: " + sizes.slice(0, 6).map((f) => f.name + " " + format(f.bytes)).join("; "));
