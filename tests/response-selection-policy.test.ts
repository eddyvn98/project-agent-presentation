import { describe, expect, it } from "vitest";
import { RICH_UI_INSTRUCTIONS as host } from "../lib/project-agent/rich-ui";
import { RICH_UI_INSTRUCTIONS as demo } from "../src/lib/project-agent/rich-ui";
import { RESPONSE_SELECTION_POLICY } from "../shared/project-agent/response-selection-policy";

describe("P0 Agent response decision guidance", () => {
  it("uses the same selection rules on host and demo", () => {
    for (const policy of RESPONSE_SELECTION_POLICY) {
      expect(host).toContain(policy);
      expect(demo).toContain(policy);
    }
  });
  it("defaults to prose, never forces visuals or followups, and preserves numbers", () => {
    for (const instructions of [host, demo]) {
      expect(instructions).toMatch(/Plain Markdown is the default/);
      expect(instructions).toMatch(/never invent data/i);
      expect(instructions).toMatch(/Follow-ups are optional/);
      expect(instructions).not.toMatch(/finish with one followups block of exactly 3/);
      expect(instructions).toMatch(/requested language and locale/);
      expect(instructions).toMatch(/Never repeat a resolved question/);
    }
  });
  it("only offers authenticated and sandboxed 3D artifacts", () => {
    for (const instructions of [host, demo]) {
      expect(instructions).toMatch(/verified same-origin viewer artifact|authenticated host already supplied/);
      expect(instructions).toMatch(/never invent/i);
    }
  });
});
