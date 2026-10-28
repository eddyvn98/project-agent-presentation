import { describe, expect, it } from "vitest";
import { MAX_ACTIONS_PER_REPLY, parseRuntimeAction, parseRuntimeActions,
  plainAnswerAsFinal } from "../../lib/project-agent/runtime/actions";

const action = (value: unknown) => parseRuntimeAction(JSON.stringify(value));
describe("Runtime action parsing and bounded model replies", () => {
  it("accepts fenced JSON and reports malformed output", () => {
    const fence = String.fromCharCode(96).repeat(3);
    expect(parseRuntimeAction("Step:\n" + fence +
      'json\n{"action":"shell","command":"echo synthetic","timeout":20}\n' + fence))
      .toMatchObject({ action: "shell", command: "echo synthetic", timeout: 20 });
    expect(parseRuntimeAction("No tool call")).toHaveProperty("error");
    expect(parseRuntimeAction('{"action":"shell","command":')).toHaveProperty("error");
  });
  it("normalizes XML tool syntax and numeric JSON parameters", () => {
    expect(parseRuntimeAction('<invoke name="render">' +
      '<parameter name="path">report.pdf</parameter>' +
      '<parameter name="pages">[1,3]</parameter></invoke>')).toMatchObject({
      action: "render", path: "report.pdf", pages: [1, 3],
    });
    expect(parseRuntimeActions(
      '<invoke name="shell"><parameter name="command">echo one</parameter></invoke>\n' +
      '<invoke name="final"><parameter name="answer">Finished</parameter></invoke>',
    )).toMatchObject([
      { action: "shell", command: "echo one" },
      { action: "final", answer: "Finished" },
    ]);
  });
  it("stops at final without accepting later mutations", () => {
    const parsed = parseRuntimeActions([
      '{"action":"shell","command":"echo first"}',
      '{"action":"final","answer":"Done","files":[]}',
      '{"action":"write_file","path":"outputs/should-not-run","content":"bad"}',
    ].join("\n"));
    expect(parsed).toHaveLength(2);
    expect(parsed).toMatchObject([
      { action: "shell", command: "echo first" },
      { action: "final", answer: "Done" },
    ]);
  });
  it("caps the number of actions in a single model response", () => {
    const many = Array.from({ length: MAX_ACTIONS_PER_REPLY + 3 },
      (_, i) => JSON.stringify({ action: "shell", command: "echo " + i })).join("\n");
    const parsed = parseRuntimeActions(many);
    expect(parsed).toHaveLength(MAX_ACTIONS_PER_REPLY);
    if ("error" in parsed) throw Error(parsed.error);
    expect(parsed.at(-1)).toMatchObject({ action: "shell",
      command: "echo " + (MAX_ACTIONS_PER_REPLY - 1) });
  });
  it("rejects the whole batch when any action is invalid", () => {
    const parsed = parseRuntimeActions('{"action":"shell","command":"echo safe"}\n' +
      '{"action":"read_output","id":"../../etc/passwd"}');
    expect(parsed).toHaveProperty("error");
  });
  it.each([
    [{ action: "shell", command: " ", timeout: 30 }, "shell"],
    [{ action: "shell", command: "echo x", timeout: 0 }, "timeout"],
    [{ action: "shell", command: "echo x", timeout: -1 }, "timeout"],
    [{ action: "shell", command: "echo x", timeout: "12" }, "timeout"],
    [{ action: "read_output", id: "out_" + "a".repeat(20), offset: 8_500_001 }, "offset"],
    [{ action: "read_output", id: "out_" + "a".repeat(20), length: 7_001 }, "length"],
    [{ action: "search_output", id: "out_" + "b".repeat(20), query: "ab", limit: 9 }, "limit"],
    [{ action: "web_fetch", url: "https://example.test", offset: 1.5 }, "offset"],
    [{ action: "render", path: "outputs/report.pdf", pages: [0, 1] }, "pages"],
    [{ action: "render", path: "outputs/report.pdf", region:
      { x: 90, y: 0, width: 20, height: 10 } }, "region"],
    [{ action: "generate_image", prompt: "synthetic", count: 5 }, "count"],
    [{ action: "workspace_apply", actions: [{ type: 2 }] }, "actions"],
    [{ action: "workspace_apply", actions: [{ type: "rename" }], revision: -1 }, "revision"],
    [{ action: "final", answer: "done", needsInput: "" }, "needsInput"],
    [{ action: "final", answer: "done", workflowOutcome: "maybe" }, "workflowOutcome"],
    [{ action: "schedule", op: "delete", id: "not-a-schedule-id" }, "schedule id"],
    [{ action: "workflow", op: "propose", title: "Synthetic", steps: [] }, "steps"],
  ] as const)("rejects invalid parameter %j", (raw, fragment) => {
    const parsed = action(raw);
    expect(parsed).toHaveProperty("error");
    if ("error" in parsed) expect(parsed.error).toContain(fragment);
  });
  it("normalizes search and reference requests", () => {
    expect(action({ action: "web_search", query: "  outage  ",
      queries: ["  one  ", "", 19, "two", "three", "four", "five"],
      recency: "week", lang: "vi-VN" })).toMatchObject({
      action: "web_search", query: "outage",
      queries: ["one", "two", "three", "four"], recency: "week", lang: "vi-VN",
    });
    expect(action({ action: "reference", id: "  ref001  " }))
      .toMatchObject({ action: "reference", id: "ref001" });
  });
  it("validates workspace mutations, and routes PDF options to strict parsing", () => {
    expect(action({ action: "workspace_apply",
      actions: [{ type: "rename", blockId: "synthetic" }], revision: "2" }))
      .toMatchObject({ action: "workspace_apply", revision: 2 });
    expect(action({ action: "pdf", op: "info", path: "inputs/document.pdf" }))
      .toMatchObject({ action: "pdf", op: "info" });
  });
  it("does not convert promises or tool markup into an asserted final answer", () => {
    expect(plainAnswerAsFinal("I will now " + "inspect the file. ".repeat(22)))
      .toBeNull();
    expect(plainAnswerAsFinal('{"action":"final","answer":"' +
      "x".repeat(210) + '"}')).toBeNull();
    const narrative = "The requested analysis is complete. " +
      "All evidence has been checked against the source. ".repeat(6);
    expect(plainAnswerAsFinal(narrative)).toMatchObject({
      action: "final", answer: narrative.trim(),
    });
  });
});
