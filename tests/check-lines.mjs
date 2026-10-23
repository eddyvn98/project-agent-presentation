import { readdir, readFile } from "node:fs/promises";
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await check(path);
    else if (/\.(tsx?|mjs|css)$/.test(path)) {
      const lines = (await readFile(path, "utf8")).trimEnd().split("\n").length;
      if (lines >= 300) throw new Error(`${path}: ${lines} lines (must be under 300)`);
    }
  }
}
await Promise.all(["src", "tests", "demo"].map(check));
console.log("All source, demo and test files are under 300 lines.");
