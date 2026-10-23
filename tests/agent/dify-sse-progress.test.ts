import { describe, expect, it } from "vitest";
import { readDifyAgentMessage, type DifyToolProgress } from "../../lib/project-agent/dify-stream";
import { projectAgentLanguage } from "../../lib/project-agent/activity-language";
import { taskActivity, toPublicProjectAgentTask } from "../../lib/project-agent/public-task";
import type { ProjectAgentTask } from "../../lib/project-agent/types";

function event(payload: Record<string, unknown>): string {
  return "data: " + JSON.stringify(payload) + "\n\n";
}
function stream(...events: Record<string, unknown>[]): Response {
  return new Response(events.map(event).join(""), { headers: { "Content-Type": "text/event-stream" } });
}
function task(prompt: string, log: string[]): ProjectAgentTask {
  return { id: "pat_0123456789ab", projectId: "project-1", ownerEmail: "a@b.test", prompt,
    createdAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T00:00:00Z",
    status: "running", log };
}
describe("ordinary Dify tool lifecycle and user-language activity", () => {
  it("reports tool start once and returned observation once, while retaining split Office bytes", async () => {
    const progress: Array<{ tool?: string; step?: DifyToolProgress }> = [];
    const result = await readDifyAgentMessage(stream(
      { event: "agent_thought", id: "thought-1", tool: "md_to_pptx", tool_input: '{"output_filename":"deck.pptx"}' },
      { event: "agent_thought", id: "thought-1", tool: "md_to_pptx", tool_input: '{"output_filename":"deck.pptx"}' },
      { event: "agent_thought", id: "thought-1", observation: "blob=b'PK\\x03\\x04demo'" },
      { event: "agent_thought", id: "thought-1", observation: "blob=b'PK\\x03\\x04demo'" },
      { event: "agent_message", answer: "Your file is ready.", conversation_id: "conversation-1" },
    ), (_answer, tool, step) => progress.push({ tool: tool ?? undefined, step }));
    expect(progress.filter((item) => item.step).map((item) => item.step?.phase)).toEqual(["started", "returned"]);
    expect(result.conversationId).toBe("conversation-1");
    expect(result.answer).toBe("Your file is ready.");
    expect(result.inlineFiles.map((file) => file.name)).toEqual(["deck.pptx"]);
    expect([...result.inlineFiles[0].bytes.slice(0, 2)]).toEqual([80, 75]);
  });
  it("preserves the ordinary SSE answer while emitting partial text", async () => {
    const partials: string[] = [];
    const answer = await readDifyAgentMessage(stream(
      { event: "message", answer: "Hello ", conversation_id: "x" },
      { event: "message", answer: "Hello world", conversation_id: "x" },
    ), (text) => partials.push(text));
    expect(answer.answer).toBe("Hello world");
    expect(partials).toEqual(["Hello ", "Hello world"]);
    expect(answer.inlineFiles).toHaveLength(0);
  });
  it("distinguishes tool-return events from success and translates the live timeline per turn", () => {
    const log = [
      "t1 app_stage :: loading_context",
      "t2 using tool web_search #search-1 :: latest regulation",
      "t3 tool returned web_search #search-1",
      "t4 app_stage :: checking_output",
      "t5 using tool md_to_docx #export-1",
    ];
    const vi = toPublicProjectAgentTask(task("Tôi muốn kiểm tra các tài liệu", log));
    const en = toPublicProjectAgentTask(task("Please check the files", log));
    expect(vi.activityLanguage).toBe("vi");
    expect(en.activityLanguage).toBe("en");
    expect(vi.activity?.[0].kind).toBe("update");
    expect(vi.activity?.[1].returnedCount).toBe(1);
    expect(vi.activity?.[1].count).toBe(1);
    expect(vi.activity?.[1].label).not.toBe(en.activity?.[1].label);
    expect(vi.progress).not.toContain("md_to_docx");
    expect(en.progress).not.toContain("md_to_docx");
    expect(vi).not.toHaveProperty("log");
    expect(taskActivity(["t1 using tool web_search #a", "t2 using tool web_search #b"]).map((x) => x.count)).toEqual([2]);
  });
  it("recognizes Vietnamese diacritics, explicit output language and leaves English as default", () => {
    expect(projectAgentLanguage("đổi nền phía sau")).toBe("vi");
    expect(projectAgentLanguage("Hãy trả lời bằng tiếng Anh")).toBe("en");
    expect(projectAgentLanguage("Please reply in Spanish")).toBe("es");
    expect(projectAgentLanguage("Please review the test failures")).toBe("en");
  });
});
