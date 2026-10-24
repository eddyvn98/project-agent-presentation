import { describe, expect, it } from "vitest";
import { VerificationGate } from "../../lib/project-agent/runtime/verify";
describe("P6 evidence for multiple deliverables", () => {
  it("requires each Office file to be rendered, not just one", () => {
    const gate = new VerificationGate();
    gate.noteRender("outputs/a.docx");
    expect(gate.check(["outputs/a.docx", "outputs/b.pdf"])).toContain("outputs/b.pdf");
  });
  it("accepts known individually rendered files", () => {
    const gate = new VerificationGate();
    gate.noteRender("/work/outputs/a.docx");
    gate.noteRender("outputs/b.pdf");
    expect(gate.check(["outputs/a.docx", "outputs/b.pdf"])).toBeNull();
  });
  it("invalidates old visual evidence after a workspace mutation", () => {
    const gate = new VerificationGate();
    gate.noteRender("outputs/a.xlsx");
    gate.noteMutation();
    expect(gate.check(["outputs/a.xlsx"])).toMatch(/not rendered/);
  });
  it("does not demand visual checks for text-only deliverables", () => {
    expect(new VerificationGate().check(["outputs/readme.md"])).toBeNull();
  });
});
