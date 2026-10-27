import { describe, expect, it } from "vitest";
import { completedStreamingMarkdown, splitPresentationSections } from "../lib/project-agent/presentation-mode";
import { normalizeResponseFences } from "../shared/project-agent/response-contract";
import { parseRichUiBlock as hostParse } from "../lib/project-agent/rich-ui";
import { parseRichUiBlock as demoParse } from "../src/lib/project-agent/rich-ui";
import { responseShowcase } from "../demo/response-fixtures";

const ticks = String.fromCharCode(96).repeat(3);

describe("rich response streaming and language fidelity", () => {
  it("does not reveal half-written JSON visual fences during streaming", () => {
    const prose = "## Tổng quan\n\nCác số liệu chỉ để minh họa.";
    const unfinished = prose + "\n\n" + ticks + 'agent-ui\n{"type":"chart","categories":';
    expect(completedStreamingMarkdown(unfinished)).toEqual({
      text: prose + "\n", pending: true,
    });
    const finished = unfinished + '["T1"],"series":[{"name":"Doanh thu","values":[0]}]}\n' + ticks + "\n\nKết thúc.";
    expect(completedStreamingMarkdown(finished)).toEqual({
      text: finished, pending: false,
    });
  });

  it("keeps headings inside both backtick and tilde fences out of slide splitting", () => {
    const markdown = [
      "## First", "Intro", "~~~mermaid", "flowchart LR",
      "## Not a slide heading", "A-->B", "~~~",
      "## Second", "More", ticks + "text", "## Also not a slide heading", ticks,
    ].join("\n");
    const sections = splitPresentationSections(markdown);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain("## Not a slide heading");
    expect(sections[1]).toContain("## Also not a slide heading");
  });

  it("normalizes host/demo fence vocabulary without translating content", () => {
    const vi = { type: "chart", kind: "line", title: "Doanh thu",
      categories: ["Tháng 1", "Tháng 2"],
      series: [{ name: "Số liệu", values: [0, 1250.5] }] };
    const raw = JSON.stringify(vi);
    for (const surface of ["host", "demo"] as const) {
      const language = surface === "host" ? "ong-ui" : "agent-ui";
      const normalized = normalizeResponseFences("~~~ong-ui\n" + raw + "\n~~~", surface);
      expect(normalized).toContain("~~~" + language + "\n");
      expect(normalized).toContain(raw);
    }
    expect(hostParse(raw)).toEqual(demoParse(raw));
    expect(hostParse(raw)).toMatchObject(vi);
  });

  it("includes mixed-language and multi-chart QA coverage in the integrated fixture", () => {
    for (const kind of ["line", "pie", "bar", "stacked"]) {
      expect(responseShowcase).toContain("Synthetic " + kind + " chart");
    }
    expect(responseShowcase).toContain("Người dùng");
    expect(responseShowcase).toContain("Active accounts");
    expect(responseShowcase).toContain("Synthetic process diagram");
    expect(responseShowcase).toContain("Synthetic completion");
  });
});
