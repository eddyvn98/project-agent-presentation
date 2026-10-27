import { describe, expect, it } from "vitest";
import { parseRichUiBlock as hostParse, repairOngUiFences } from "../lib/project-agent/rich-ui";
import { parseRichUiBlock as demoParse, repairAgentUiFences } from "../src/lib/project-agent/rich-ui";
import { normalizeResponseFences, RESPONSE_BLOCK_TYPES } from "../shared/project-agent/response-contract";

const model = { type: "interactive", title: "QA calculator", parameters: [
  { id: "amount", label: "Amount", min: 0, max: 10, step: 1, initial: 2 },
], outputs: [{ label: "Result", expression: { op: "mul", args: [{ var: "amount" }, 3] } }] };
const examples: unknown[] = [
  { type: "kpis", items: [{ label: "Users", value: "20" }] },
  { type: "chart", kind: "line", categories: ["Jan", "Feb"], series: [{ name: "Total", values: [0, 2] }] },
  { type: "progress", title: "Done", value: 20, max: 100 },
  { type: "stack", title: "Budget", items: [{ label: "Design", value: 20 }] },
  { type: "options", items: [{ title: "A", points: ["Stable"], recommended: false }] },
  { type: "callout", text: "Source required", tone: "info" },
  { type: "steps", items: [{ title: "Review" }] },
  { type: "explorer", title: "Changes", steps: [
    { label: "Start", title: "A", text: "Starting" },
    { label: "End", title: "B", text: "Ending" },
  ] },
  { type: "mermaid", code: "flowchart LR\n A-->B" },
  { type: "scene3d", title: "Model", viewerUrl: "/api/projects/qa/agent/files/scene.html" },
  { type: "ask", questions: [{ question: "Which?", options: ["A", "B"] }] },
  { type: "form", fields: [{ label: "Name", kind: "text" }] },
  model,
  { type: "quiz", question: "Two plus two?", options: ["3", "4"], answerIndex: 1 },
  { type: "followups", items: [{ label: "More", prompt: "Expand" }] },
];
describe("P0 rich-response contract between host and demo", () => {
  it("supports the same 15 typed blocks on both surfaces", () => {
    expect(examples.map(x => (x as {type:string}).type)).toEqual([...RESPONSE_BLOCK_TYPES]);
    for (const raw of examples) {
      const json = JSON.stringify(raw);
      const host = hostParse(json);
      const demo = demoParse(json);
      expect(host, "host: " + (raw as {type:string}).type).not.toBeNull();
      expect(demo, "demo: " + (raw as {type:string}).type).not.toBeNull();
      expect(host).toEqual(demo);
    }
  });
  it("accepts both historic Markdown fences without rewriting prose", () => {
    const fixture = ["Code is not a fence: agent-ui", "```agent-ui",
      JSON.stringify(examples[0]), "```", "```ong-doc", "title: QA", "Text", "```"].join("\n");
    const host = repairOngUiFences(fixture);
    const demo = repairAgentUiFences(fixture);
    expect(host).toContain("```ong-ui\n");
    expect(demo).toContain("```agent-ui\n");
    expect(host).toContain("```ong-doc\n");
    expect(demo).toContain("```agent-doc\n");
    expect(host).toContain("Code is not a fence: agent-ui");
    expect(normalizeResponseFences("```agent-ui\n{}\n```", "host")).toContain("```ong-ui");
  });
  it("rejects unauthorized 3D URLs identically on both surfaces", () => {
    const raw = JSON.stringify({ type: "scene3d", title: "X", viewerUrl: "https://attacker.test/model.html" });
    expect(hostParse(raw)).toBeNull();
    expect(demoParse(raw)).toBeNull();
  });
});
