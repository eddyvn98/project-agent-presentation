import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RuntimeInput } from "./run-agent-types";
import type { DesignSpec } from "./design-model";
import { DESIGN_SCRIPT } from "./design-script";
import { execInSandbox, resolveWorkspacePath, workspaceDir } from "./sandbox";

/** Generates five artifacts in one bounded sandbox command. No model-provided shell text. */
export async function runDesignAction(input: RuntimeInput, model: DesignSpec):
  Promise<{ text: string; failed?: boolean }> {
  if (input.readOnly) return { text: "Reviewers cannot create designs.", failed: true };
  const name = "design-" + randomUUID().slice(0, 12);
  const root = workspaceDir(input.chatId);
  const tool = path.join(root, ".tools", name + ".py");
  const request = path.join(root, ".tmp", name + ".json");
  try {
    await fs.mkdir(path.dirname(tool), { recursive: true });
    await fs.mkdir(path.dirname(request), { recursive: true });
    await fs.mkdir(path.join(root, "outputs"), { recursive: true });
    await fs.writeFile(tool, DESIGN_SCRIPT, { mode: 0o600, flag: "wx" });
    await fs.writeFile(request, JSON.stringify(model), { mode: 0o600, flag: "wx" });
    input.onStep?.({ tool: "design", detail: "Generating dimensioned concept plan and 3D model" });
    const command = "python3 /work/.tools/" + name + ".py /work/.tmp/" + name + ".json " + name;
    const result = await execInSandbox(input.chatId, command, 100);
    if (result.exitCode !== 0)
      return { text: "Headless design export failed: " + result.output.slice(0, 1000), failed: true };
    let receipt: { files: string[]; warnings?: string[]; conceptOnly: boolean };
    try { receipt = JSON.parse(result.output) as typeof receipt; }
    catch { return { text: "Headless exporter returned an invalid receipt.", failed: true }; }
    const expected = ["design.json", "dxf", "pdf", "glb", "web.html"].map(ext => "outputs/" + name + "." + ext);
    if (!Array.isArray(receipt.files) || receipt.files.length !== expected.length ||
        !expected.every(file => receipt.files.includes(file)))
      return { text: "Headless exporter returned unexpected file names.", failed: true };
    for (const file of expected) {
      const bytes = await fs.readFile(resolveWorkspacePath(input.chatId, file));
      if (!bytes.length || bytes.length > 20 * 1024 * 1024)
        return { text: "Output file was missing, empty or too large: " + file, failed: true };
      if (file.endsWith(".pdf") && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
        return { text: "PDF signature check failed.", failed: true };
      if (file.endsWith(".glb") && bytes.toString("ascii", 0, 4) !== "glTF")
        return { text: "GLB signature check failed.", failed: true };
    }
    const cautions = (receipt.warnings ?? []).slice(0, 10).join("; ");
    return { text: "Generated headless interior concept: " + expected.join(", ") +
      ". Return these paths in final.files and use render on the PDF before final. The .web.html viewer uses an HTTPS CDN for Three.js. " +
      "Concept only, not a construction-ready or Revit/BIM deliverable." +
      (cautions ? " Geometry warnings: " + cautions : "") };
  } catch (error) {
    return { text: "Design export failed: " + (error instanceof Error ? error.message : "error"), failed: true };
  } finally {
    await Promise.all([fs.rm(tool, { force: true }).catch(() => undefined),
      fs.rm(request, { force: true }).catch(() => undefined)]);
  }
}
