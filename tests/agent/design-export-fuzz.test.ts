import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DESIGN_SCRIPT } from "../../lib/project-agent/runtime/design-script";
import { parseDesignSpec } from "../../lib/project-agent/runtime/design-model";
import { applyDesignEdits, parseDesignEdits } from "../../lib/project-agent/runtime/design-edit";

const seeds = [11, 29, 73, 131, 257, 509, 1021, 2047, 4093, 8191, 16381, 32749];
function rand(seed: number) {
  let state = seed >>> 0;
  return (max: number) => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) % max;
  };
}
function checkFile(dir: string, name: string, labels: string[]) {
  const pdf = readFileSync(path.join(dir, name + ".pdf"));
  expect(pdf.toString("ascii", 0, 5)).toBe("%PDF-");
  expect(pdf.toString("latin1")).toContain("xref\n");
  const dxf = readFileSync(path.join(dir, name + ".dxf"), "utf8");
  expect(dxf).toContain("0\nSECTION\n");
  expect(dxf).toContain("0\nEOF\n");
  const png = readFileSync(path.join(dir, name + ".preview.png"));
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.readUInt32BE(16)).toBe(1280);
  const glb = readFileSync(path.join(dir, name + ".glb"));
  expect(glb.toString("ascii", 0, 4)).toBe("glTF");
  expect(glb.readUInt32LE(8)).toBe(glb.length);
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength));
  expect(gltf.asset.version).toBe("2.0");
  expect(gltf.nodes.length).toBeGreaterThanOrEqual(labels.length + 1);
  for (const label of labels) {
    expect(gltf.nodes.some((node: { name?: string }) => node.name?.includes(label))).toBe(true);
  }
  const html = readFileSync(path.join(dir, name + ".web.html"), "utf8");
  expect(html).toContain("data:model/gltf-binary;base64,");
  expect(html).toContain("babylonjs@9.28.0");
  return ["pdf", "dxf", "glb", "preview.png", "web.html"]
    .map(ext => [ext, readFileSync(path.join(dir, name + "." + ext))] as const);
}

describe("CAD/BIM fuzz — actual headless exporter and unchanged revisions", () => {
  for (const seed of seeds) {
    it("exports a reproducible random geometry and its revision, seed=" + seed, () => {
      const pick = rand(seed);
      const width = 5200 + pick(9000), depth = 4700 + pick(8000);
      const wallThickness = 100 + pick(201), height = 2600 + pick(1800);
      const model = {
        title: "Geometry seed " + seed, units: "mm",
        room: { width, depth, height, wallThickness },
        openings: [
          { wall: "south", kind: "door", offset: 450 + pick(300), width: 800 + pick(350),
            height: 1950 + pick(200), sill: 0 },
          { wall: "east", kind: "window", offset: 750 + pick(250), width: 800 + pick(350),
            height: 850 + pick(300), sill: 800 },
        ],
        furniture: [
          { kind: "table", label: "Table " + seed, x: Math.round(width * .35), y: Math.round(depth * .35),
            width: 1000 + pick(500), depth: 700 + pick(300), height: 750, rotation: 0 },
          { kind: "cabinet", label: "Cabinet " + seed, x: Math.round(width * .7), y: Math.round(depth * .65),
            width: 700 + pick(350), depth: 500 + pick(300), height: 1700, rotation: 90 },
        ],
      };
      const parsed = parseDesignSpec(model);
      if ("error" in parsed) throw Error("seed=" + seed + " invalid generated model: " + parsed.error);
      const original = parsed.spec;
      const raw = JSON.stringify(original);
      const instructions = parseDesignEdits([
        { type: "move_furniture", index: 0, x: original.furniture[0].x + 200,
          y: original.furniture[0].y + 100 },
      ]);
      if ("error" in instructions) throw Error(instructions.error);
      const edited = applyDesignEdits(original, instructions.edits);
      if ("error" in edited) throw Error("seed=" + seed + " revised model: " + edited.error);
      const dir = mkdtempSync(path.join(tmpdir(), "cad-fuzz-" + seed + "-"));
      try {
        const python = path.join(dir, "export.py");
        writeFileSync(python, DESIGN_SCRIPT.replace('output = "/work/outputs"', "output = " + JSON.stringify(dir)));
        for (const [key, scene] of [["before", original], ["after", edited.spec]] as const) {
          const input = path.join(dir, key + ".input.json");
          writeFileSync(input, JSON.stringify(scene));
          const process = spawnSync("python3", [python, input, key], {
            encoding: "utf8", timeout: 20000, maxBuffer: 500_000,
          });
          expect(process.status, "seed=" + seed + " " + key + " " + process.stderr).toBe(0);
          expect(JSON.parse(process.stdout).files).toHaveLength(6);
          expect(JSON.parse(readFileSync(path.join(dir, key + ".design.json"), "utf8"))).toEqual(scene);
        }
        const before = checkFile(dir, "before", original.furniture.map(f => f.label));
        const after = checkFile(dir, "after", edited.spec.furniture.map(f => f.label));
        for (let i = 0; i < before.length; i++) {
          expect(before[i][0]).toBe(after[i][0]);
          expect(before[i][1].equals(after[i][1]), "seed=" + seed + " unchanged " + before[i][0]).toBe(false);
          expect(readFileSync(path.join(dir, "before." + before[i][0])).equals(before[i][1])).toBe(true);
        }
        expect(JSON.stringify(original)).toBe(raw);
      } catch (error) {
        throw Error("EXPORT FUZZ seed=" + seed + " " + String(error));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 35_000);
  }
});
