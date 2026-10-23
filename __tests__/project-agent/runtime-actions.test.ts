import { parseRuntimeAction } from "@/lib/project-agent/runtime/actions";
import { describe, it, expect } from "vitest";
it("xml", () => {
 expect(parseRuntimeAction('<invoke name="shell"> <parameter name="command">ls -la\n</parameter></invoke>')).toMatchObject({action:"shell",command:"ls -la"});
 expect(parseRuntimeAction('{"action":"shell","command":"ls"}')).toMatchObject({action:"shell"});
});

import { parseRuntimeActions } from "@/lib/project-agent/runtime/actions";
it("reads several actions in order and drops those after final", () => {
	const text = '{"action":"write_file","path":"a.py","content":"print(1)"}\n{"action":"shell","command":"python3 a.py"}\n{"action":"final","answer":"ok"}\n{"action":"shell","command":"rm -rf x"}';
	const actions = parseRuntimeActions(text);
	expect(Array.isArray(actions) && actions.map((action) => action.action)).toEqual(["write_file", "shell", "final"]);
	const xml = '<invoke name="shell"><parameter name="command">ls</parameter></invoke><invoke name="shell"><parameter name="command">pwd</parameter></invoke>';
	expect(parseRuntimeActions(xml)).toHaveLength(2);
	expect(parseRuntimeActions("just prose")).toHaveProperty("error");
});

describe("web_fetch and verification gate", () => {
	it("parses web_fetch", () => {
		expect(parseRuntimeActions('{"action":"web_fetch","url":"https://example.com"}')).toEqual([{ action: "web_fetch", url: "https://example.com", note: undefined }]);
	});
	it("asks for a render once before accepting an office deliverable", async () => {
		const { VerificationGate } = await import("@/lib/project-agent/runtime/verify");
		const gate = new VerificationGate();
		expect(gate.check(["outputs/a.docx"])).toMatch(/not rendered/);
		expect(gate.check(["outputs/a.docx"])).toBeNull();
		const second = new VerificationGate();
		second.noteRender();
		expect(second.check(["outputs/a.docx"])).toBeNull();
		expect(new VerificationGate().check(["outputs/notes.txt"])).toBeNull();
	});
});

it("parses generate_image", () => {
	expect(parseRuntimeActions('{"action":"generate_image","prompt":"a lobby","aspect_ratio":"16:9","count":2}')).toMatchObject([{ action: "generate_image", prompt: "a lobby", aspectRatio: "16:9", count: 2 }]);
});

it("parses delegate", () => {
	expect(parseRuntimeActions('{"action":"delegate","task":"Check the render against the template"}')).toMatchObject([{ action: "delegate", task: "Check the render against the template" }]);
	expect(parseRuntimeActions('{"action":"delegate"}')).toEqual({ error: "delegate needs a task" });
});

it("parses the delegate role", () => {
	expect(parseRuntimeActions('{"action":"delegate","task":"check","role":"reviewer"}')).toMatchObject([{ action: "delegate", role: "reviewer" }]);
	expect(parseRuntimeActions('{"action":"delegate","task":"check"}')).toMatchObject([{ action: "delegate", role: "worker" }]);
});

it("treats a plain prose first reply as the final answer, but not action-like text", async () => {
	const { plainAnswerAsFinal } = await import("@/lib/project-agent/runtime/actions");
	const answer = "Rw + Ctr ≥ 50 dB là yêu cầu cách âm không khí của vách, sàn hoặc cửa: giá trị đo hoặc công bố phải đạt tối thiểu 50 dB. Rw là chỉ số cách âm có trọng số theo ISO 717-1, Ctr là số hiệu chỉnh phổ cho tiếng ồn giao thông và tiếng ồn tần số thấp, thường âm nên Rw + Ctr luôn nhỏ hơn Rw."; // vi-allow
	expect(plainAnswerAsFinal(answer)).toMatchObject({ action: "final" });
	expect(plainAnswerAsFinal(`<think>hmm</think>${answer}`)).toMatchObject({ action: "final" });
	expect(plainAnswerAsFinal("<think>hmm</think>Short")).toBeNull();
	expect(plainAnswerAsFinal(`Let me open the attached file first. ${answer}`)).toBeNull();
	expect(plainAnswerAsFinal('{"action":"shell","command":"ls"} and more text to pass the length check ok')).toBeNull();
	expect(plainAnswerAsFinal("<invoke name=\"shell\"><parameter name=\"command\">ls</parameter></invoke> plus enough extra words here")).toBeNull();
});
