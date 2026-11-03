import { describe, expect, it } from "vitest";
import type { ProjectAgentTaskFile } from "../../lib/project-agent/types";
import { collectDesignHandoffs, makeDesignEditPrompt } from "../../lib/project-agent/design-handoff";
import { buildProjectAgentFileHeaders, inferProjectAgentFileMimeType } from "../../lib/project-agent/files";

const id = "abcdefabcdef";
const makeFile = (name: string): ProjectAgentTaskFile => ({
  id: name, name, size: 128, mimeType: inferProjectAgentFileMimeType(name, null),
});
const designFile = (extension: string) => makeFile("design-" + id + "." + extension);
const primary = ["design.json", "pdf", "dxf", "glb"].map(designFile);

describe("mobile CAD/BIM handoff", () => {
  it("groups an entire revision with the correct download files and preview assets", () => {
    const files = [...primary, designFile("preview.png"), designFile("web.html"), designFile("ifc"), makeFile("notes.txt")];
    const { handoffs, groupedIds } = collectDesignHandoffs(files);
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].pdf.name).toBe("design-" + id + ".pdf");
    expect(handoffs[0].ifc?.name).toBe("design-" + id + ".ifc");
    expect(handoffs[0].viewer?.name).toBe("design-" + id + ".web.html");
    expect(groupedIds.size).toBe(7);
    expect(groupedIds.has("notes.txt")).toBe(false);
  });
  it("does not hide incomplete design sets or mistakenly group unrelated files", () => {
    const files = [designFile("design.json"), designFile("pdf"), designFile("glb"), makeFile("drawing.dxf")];
    expect(collectDesignHandoffs(files)).toMatchObject({ handoffs: [] });
    expect(collectDesignHandoffs(files).groupedIds.size).toBe(0);
  });
  it("supports multiple separately downloaded revisions without collisions", () => {
    const additional = ["design.json", "pdf", "dxf", "glb"].map(ext => makeFile("design-123456789abc." + ext));
    const grouped = collectDesignHandoffs([...primary, ...additional]);
    expect(grouped.handoffs).toHaveLength(2);
    expect(grouped.groupedIds.size).toBe(8);
  });
  it("prefills only a validated design JSON source, without submitting a task", () => {
    const prompt = makeDesignEditPrompt(primary[0].name);
    expect(prompt).toContain('outputs/design-' + id + '.design.json');
    expect(prompt).toContain("design_edit");
    for (const name of ["../source.json", "design-z66666666666.design.json", "design-" + id + ".pdf"]) {
      expect(makeDesignEditPrompt(name)).toBeNull();
    }
  });
  it("delivers IFC, DXF and GLB as attachments with accurate content types", () => {
    for (const [ext, mime] of [["ifc", "application/x-step"], ["dxf", "image/vnd.dxf"], ["glb", "model/gltf-binary"]]) {
      const file = designFile(ext);
      expect(file.mimeType).toBe(mime);
      const headers = buildProjectAgentFileHeaders(file, true);
      expect(headers["Content-Disposition"]).toContain("attachment;");
      expect(headers["Cache-Control"]).toBe("private, no-store");
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    }
  });
});
