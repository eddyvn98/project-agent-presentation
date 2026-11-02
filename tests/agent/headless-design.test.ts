import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseDesignSpec } from "../../lib/project-agent/runtime/design-model";
import { DESIGN_SCRIPT } from "../../lib/project-agent/runtime/design-script";
import { parseRuntimeActions } from "../../lib/project-agent/runtime/actions";
import { denyReason } from "../../lib/project-agent/runtime/policy";

const example = {
  title: "Concept test",
  units: "mm" as const,
  room: { width: 8000, depth: 5000, height: 3000, wallThickness: 150 },
  openings: [{ wall: "south", kind: "door", offset: 700, width: 900, height: 2100, sill: 0 }],
  furniture: [{ kind: "table", x: 4000, y: 2500, width: 2400, depth: 1200, height: 750, rotation: 0, label: "Meeting table" }],
};
const folders: string[] = [];
afterEach(() => { while (folders.length) rmSync(folders.pop()!, { recursive: true, force: true }); });

describe("Headless design concept", () => {
  it("accepts a bounded room and a typed agent action", () => {
    const model = parseDesignSpec(example);
    expect("spec" in model).toBe(true);
    const action = parseRuntimeActions(JSON.stringify({ action: "design", model: example }));
    expect("error" in action).toBe(false);
  });
  it("rejects malformed dimensions, overlaps and forbidden reviewer export", () => {
    expect("error" in parseDesignSpec({ ...example, room: { ...example.room, width: -1 } })).toBe(true);
    expect("error" in parseDesignSpec({ ...example, furniture: [{ ...example.furniture[0], x: 100 }] })).toBe(true);
    expect("error" in parseDesignSpec({ ...example, openings: [
      example.openings[0], { ...example.openings[0], offset: 800 },
    ] })).toBe(true);
    const action = { action: "design" as const, model: example as any };
    expect(denyReason({ readOnly: true }, action)).toMatch(/reviewer/i);
  });
  it("exports valid DXF, one-page PDF and GLB without optional Python libraries", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pa-design-"));
    folders.push(dir);
    const script = path.join(dir, "export.py");
    const model = path.join(dir, "model.json");
    const code = DESIGN_SCRIPT.replace('output = "/work/outputs"', "output = " + JSON.stringify(dir));
    writeFileSync(script, code);
    writeFileSync(model, JSON.stringify(example));
    const run = spawnSync("python3", [script, model, "sample"], { timeout: 15000, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const receipt = JSON.parse(run.stdout);
    expect(receipt.files).toHaveLength(5);
    const dxf = readFileSync(path.join(dir, "sample.dxf"), "utf8");
    expect(dxf).toContain("0\nSECTION\n");
    expect(dxf).toContain("0\nEOF\n");
    const pdf = readFileSync(path.join(dir, "sample.pdf"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("xref\n");
    const glb = readFileSync(path.join(dir, "sample.glb"));
    expect(glb.toString("ascii", 0, 4)).toBe("glTF");
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    const jsonLength = glb.readUInt32LE(12);
    const gltf = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength));
    expect(gltf.asset.version).toBe("2.0");
    expect(gltf.nodes.length).toBeGreaterThan(1);
    expect(glb.toString("ascii", 24 + jsonLength, 28 + jsonLength)).toBe("BIN\u0000");
    const viewer = readFileSync(path.join(dir, "sample.web.html"), "utf8");
    expect(viewer).toContain("OrbitControls");
    expect(viewer).toContain("GLTFLoader");
  });
});
