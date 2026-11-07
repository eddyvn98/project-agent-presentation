import fs from "node:fs/promises";
import type { DifyChatFile } from "../dify-input-files";
import { uploadRuntimeImage } from "./model";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RuntimeInput } from "./run-agent-types";
import type { DesignSpec } from "./design-model";
import { reviewDesign } from "./design-review";
import { DESIGN_SCRIPT } from "./design-script";
import { IFC_DESIGN_SCRIPT } from "./design-ifc-script";
import { execInSandbox, resolveWorkspacePath, workspaceDir } from "./sandbox";

/** Generated names must match design-handoff and design-edit source validators. */
export const createDesignName = () => "design-" + randomUUID().replace(/-/g, "").slice(0, 12);

/** Generates six artifacts in one bounded sandbox command. No model-provided shell text. */
export async function runDesignAction(input: RuntimeInput, model: DesignSpec):
  Promise<{ text: string; failed?: boolean; image?: DifyChatFile }> {
  if (input.readOnly) return { text: "Reviewers cannot create designs.", failed: true };
  const name = createDesignName();
  const root = workspaceDir(input.chatId);
  const tool = path.join(root, ".tools", name + ".py");
  const request = path.join(root, ".tmp", name + ".json");
  const ifcTool = path.join(root, ".tools", name + "-ifc.py");
  try {
    await fs.mkdir(path.dirname(tool), { recursive: true });
    await fs.mkdir(path.dirname(request), { recursive: true });
    await fs.mkdir(path.join(root, "outputs"), { recursive: true });
    await fs.writeFile(tool, DESIGN_SCRIPT, { mode: 0o600, flag: "wx" });
    await fs.writeFile(request, JSON.stringify(model), { mode: 0o600, flag: "wx" });
    await fs.writeFile(ifcTool, IFC_DESIGN_SCRIPT, { mode: 0o600, flag: "wx" });
    input.onStep?.({ tool: "design", detail: "Generating dimensioned concept plan and 3D model" });
    const command = "python3 /work/.tools/" + name + ".py /work/.tmp/" + name + ".json " + name;
    const result = await execInSandbox(input.chatId, command, 100);
    if (result.exitCode !== 0)
      return { text: "Headless design export failed: " + result.output.slice(0, 1000), failed: true };
    let receipt: { files: string[]; warnings?: string[]; conceptOnly: boolean };
    try { receipt = JSON.parse(result.output) as typeof receipt; }
    catch { return { text: "Headless exporter returned an invalid receipt.", failed: true }; }
    const expected = ["design.json", "dxf", "pdf", "glb", "web.html", "preview.png"].map(ext => "outputs/" + name + "." + ext);
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
    const preview = await fs.readFile(resolveWorkspacePath(input.chatId, "outputs/" + name + ".preview.png"));
    if (!preview.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
      return { text: "PNG preview signature check failed.", failed: true };
    const image = await uploadRuntimeImage(name + "-preview", preview, input.user);
    const ifcPath = "outputs/" + name + ".ifc";
    const ifcCommand = "python3 /work/.tools/" + name + "-ifc.py /work/.tmp/" + name + ".json /work/" + ifcPath;
    const ifcResult = await execInSandbox(input.chatId, ifcCommand, 110);
    let ifcStatus = "IFC unavailable: the sandbox needs preinstalled IfcOpenShell + numpy.";
    if (ifcResult.exitCode === 0) {
      const bytes = await fs.readFile(resolveWorkspacePath(input.chatId, ifcPath));
      const header = bytes.toString("utf8", 0, Math.min(bytes.length, 1024));
      if (bytes.length > 0 && bytes.length < 20 * 1024 * 1024 &&
          header.startsWith("ISO-10303-21;") && header.includes("IFC4")) {
        expected.push(ifcPath);
        ifcStatus = "Validated IFC4 handoff included; open IFC in Revit and save RVT. Native families are not guaranteed.";
      } else {
        await fs.rm(resolveWorkspacePath(input.chatId, ifcPath), { force: true }).catch(() => undefined);
        ifcStatus = "IFC validation failed; no IFC delivered.";
      }
    } else if (!ifcResult.output.includes("IFC_DEPENDENCY_MISSING")) {
      ifcStatus = "IFC export failed: " + ifcResult.output.slice(0, 300);
    }
    const review = reviewDesign(model);
    const reviewSamples = review.issues.filter(issue => issue.severity === "blocker")
      .slice(0, 6).map(issue => issue.message).join(" | ");
    const reviewText = review.blockers
      ? " AI geometry preflight found " + review.blockers + " possible collision/door blockers (" +
        reviewSamples + "). Automatically propose a corrected revision before presenting as ready."
      : " AI geometry preflight found no 2D collision/door blockers; " +
        review.warnings + " conceptual spacing warning(s).";
    const cautions = (receipt.warnings ?? []).slice(0, 10).join("; ");
    return { text: "Generated headless interior concept: " + expected.join(", ") +
      ". Return these paths in final.files and use render on the PDF before final. The .web.html viewer uses pinned Babylon.js scripts from an HTTPS CDN. " +
      "AI-generated draft; HUMAN REVIEW REQUIRED before release. Not verified for construction. " +
      reviewText + " " + ifcStatus +
      (cautions ? " Geometry warnings: " + cautions : ""), image };
  } catch (error) {
    return { text: "Design export failed: " + (error instanceof Error ? error.message : "error"), failed: true };
  } finally {
    await Promise.all([fs.rm(tool, { force: true }).catch(() => undefined),
      fs.rm(request, { force: true }).catch(() => undefined),
      fs.rm(ifcTool, { force: true }).catch(() => undefined)]);
  }
}
