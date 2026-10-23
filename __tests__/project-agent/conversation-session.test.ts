import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearProjectAgentConversationId,
	getProjectAgentConversationId,
	setProjectAgentConversationId,
} from "@/lib/project-agent/conversation-session";

describe("Project Agent conversation session", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("persists and clears a separate Dify conversation per project", () => {
		const values = new Map<string, string>();
		vi.stubGlobal("window", {
			localStorage: {
				getItem: (key: string) => values.get(key) ?? null,
				setItem: (key: string, value: string) => values.set(key, value),
				removeItem: (key: string) => values.delete(key),
			},
			dispatchEvent: () => true,
		});

		setProjectAgentConversationId("project/alpha", "conversation-1");
		setProjectAgentConversationId("project/beta", "conversation-2");
		expect(getProjectAgentConversationId("project/alpha")).toBe("conversation-1");
		expect(getProjectAgentConversationId("project/beta")).toBe("conversation-2");
		clearProjectAgentConversationId("project/alpha");
		expect(getProjectAgentConversationId("project/alpha")).toBeNull();
		expect(getProjectAgentConversationId("project/beta")).toBe("conversation-2");
	});

	it("does not fail when browser storage is unavailable", () => {
		vi.stubGlobal("window", { get localStorage() { throw new Error("storage disabled"); } });
		expect(getProjectAgentConversationId("project-alpha")).toBeNull();
		expect(() => setProjectAgentConversationId("project-alpha", "conversation-1")).not.toThrow();
		expect(() => clearProjectAgentConversationId("project-alpha")).not.toThrow();
	});
});
