import { describe, expect, it, vi } from "vitest";
import type { KnowledgeFile } from "@/stores/useProjectStore";
import { buildProjectLargeSourceInstructions, readObservedMessage, runProjectChatWithLargeSources } from "@/lib/project-agent/project-chat-large-source";

const source = (overrides: Partial<KnowledgeFile> = {}): KnowledgeFile => ({
	id: "kf_abcdef1234567890",
	projectId: "project-1",
	name: "report.pdf",
	mimeType: "application/pdf",
	fileType: "text",
	sizeBytes: 80_000_000,
	status: "ready",
	isLargeSource: true,
	uploadedAt: Date.now(),
	...overrides,
});

describe("Project chat large sources", () => {
	it("instructs chat to request bounded sections from ready large sources", () => {
		const instructions = buildProjectLargeSourceInstructions([
			source(),
			source({ id: "kf_0123456789abcdef", name: "pending.pdf", status: "processing" }),
		]);
		expect(instructions).toContain("report.pdf");
		expect(instructions).toContain("<project_source_read>");
		expect(instructions).not.toContain("pending.pdf");
		expect(buildProjectLargeSourceInstructions([])).toBe("");
	});

	it("reads the Dify response and completes a chat turn without unnecessary tool calls", async () => {
		const chunks: Uint8Array[] = [];
		const finishes: string[] = [];
		const sse = 'data: {"event":"message","conversation_id":"conv-1","answer":"Here is the answer."}\n\n' +
			'data: {"event":"message_end","conversation_id":"conv-1"}\n\n';
		const firstResponse = new Response(sse, { headers: { "Content-Type": "text/event-stream" } });
		const readMessage = (response: Response) => readObservedMessage(response, (chunk) => chunks.push(chunk), (reason) => finishes.push(reason));
		const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected continuation"));
		try {
			const result = await runProjectChatWithLargeSources({
				firstResponse,
				files: [source()],
				user: "user@example.com",
				ownerEmail: "user@example.com",
				projectId: "project_123",
				endpoint: "https://dify.example/v1/chat-messages",
				apiKey: "test-key",
				signal: new AbortController().signal,
				readMessage,
			});
			expect(result.answer).toBe("Here is the answer.");
			expect(result.conversationId).toBe("conv-1");
			expect(new TextDecoder().decode(result.passthroughBytes)).toContain('"event":"message_end"');
			expect(chunks.length).toBeGreaterThan(0);
			expect(finishes).toEqual(["complete"]);
			expect(fetchMock).not.toHaveBeenCalled();
		} finally {
			fetchMock.mockRestore();
		}
	});
});
