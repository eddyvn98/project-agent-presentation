import { afterEach, describe, expect, it, vi } from "vitest";
import { formatProjectAgentTaskMessage, runProjectAgentTaskFromClient } from "@/lib/project-agent/client";

describe("Project Agent task client", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("does not describe a still-running task as a failure", () => {
		const result = formatProjectAgentTaskMessage("project-1", {
			id: "pat_0123456789ab", projectId: "project-1", prompt: "Create a report",
			status: "running", progress: "Reviewing saved files (pass 2/4)",
			createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
		});

		expect(result.error).toBe(false);
		expect(result.content).toContain("Reviewing saved files (pass 2/4)");
		expect(result.content).toContain("Project Agent history");
	});

	it("returns the latest persisted task when the chat poll window ends", async () => {
		const task = await runProjectAgentTaskFromClient({
			projectId: "project-1", prompt: "Create a report", maxPolls: 0,
			fetcher: async () => ({
				ok: true, status: 202,
				json: async () => ({ task: {
					id: "pat_0123456789ab", projectId: "project-1", prompt: "Create a report",
					status: "running", progress: "Reviewing saved files (pass 2/4)",
					createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
				} }),
			}),
		});

		expect(formatProjectAgentTaskMessage("project-1", task).error).toBe(false);
		expect(task.status).toBe("running");
	});

	it("retries a transient poll network error without recreating the task", async () => {
		let creates = 0;
		let polls = 0;
		const task = await runProjectAgentTaskFromClient({
			projectId: "project-1", prompt: "Analyze this shop", pollIntervalMs: 0,
			fetcher: async (_input, init) => {
				if (init?.method === "POST") {
					creates += 1;
					return { ok: true, status: 202, json: async () => ({ task: {
						id: "pat_0123456789ab", projectId: "project-1", prompt: "Analyze this shop",
						status: "running", createdAt: "", updatedAt: "",
					} }) };
				}
				polls += 1;
				if (polls === 1) throw new TypeError("Failed to fetch");
				return { ok: true, status: 200, json: async () => ({ task: {
					id: "pat_0123456789ab", projectId: "project-1", prompt: "Analyze this shop",
					status: "done", resultText: "Completed", createdAt: "", updatedAt: "",
				} }) };
			},
		});

		expect(creates).toBe(1);
		expect(polls).toBe(2);
		expect(task.status).toBe("done");
	});

	it("continues the selected conversation and reports task progress while polling", async () => {
		let requestBody: Record<string, unknown> | undefined;
		const progress: string[] = [];
		const setItem = vi.fn();
		let requestCount = 0;
		vi.stubGlobal("window", {
			localStorage: {
				getItem: () => "dify-conversation-1",
				setItem,
			},
			dispatchEvent: () => true,
		});
		const task = await runProjectAgentTaskFromClient({
			projectId: "project-1",
			prompt: "Continue the analysis",
			pollIntervalMs: 0,
			onProgress: (task) => { if (task.progress) progress.push(task.progress); },
			fetcher: async (_input, init) => {
				requestCount += 1;
				if (init?.method === "POST") requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
				const tasks = [
					{ id: "pat_0123456789ab", projectId: "project-1", conversationId: "dify-conversation-2", prompt: "Continue the analysis", status: "queued", progress: "Waiting for the Project Agent to start" },
					{ id: "pat_0123456789ab", projectId: "project-1", conversationId: "dify-conversation-2", prompt: "Continue the analysis", status: "running", progress: "Reviewing saved files (pass 1/4)" },
					{ id: "pat_0123456789ab", projectId: "project-1", conversationId: "dify-conversation-2", prompt: "Continue the analysis", status: "done", progress: "Finished reviewing the deliverables" },
				];
				return {
					ok: true,
					status: init?.method === "POST" ? 202 : 200,
					json: async () => ({ task: tasks[Math.min(requestCount - 1, tasks.length - 1)] }),
				};
			},
		});

		expect(requestBody).toEqual({ prompt: "Continue the analysis", conversationId: "dify-conversation-1" });
		expect(task.conversationId).toBe("dify-conversation-2");
		expect(setItem).toHaveBeenCalledWith("project-agent-conversation:project-1", "dify-conversation-2");
		expect(progress).toEqual([
			"Waiting for the Project Agent to start",
			"Reviewing saved files (pass 1/4)",
			"Finished reviewing the deliverables",
		]);
	});

	it("starts a fresh conversation when revising a file the viewer cannot continue", async () => {
		let requestBody: Record<string, unknown> | undefined;
		vi.stubGlobal("window", { localStorage: { getItem: () => "unrelated-conversation", setItem: vi.fn() }, dispatchEvent: () => true });
		await runProjectAgentTaskFromClient({
			projectId: "project-1", prompt: "Revise the shared file", conversationId: null, maxPolls: 0,
			fetcher: async (_input, init) => {
				requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
				return { ok: true, status: 202, json: async () => ({ task: {
					id: "pat_0123456789ab", projectId: "project-1", prompt: "Revise the shared file",
					status: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
				} }) };
			},
		});
		expect(requestBody).toEqual({ prompt: "Revise the shared file" });
	});

	it("streams each original attachment separately before creating the task", async () => {
		const requests: Array<{ url: string; init?: RequestInit }> = [];
		const file = new File(["Revenue: 42"], "report.txt", { type: "text/plain" });
		await runProjectAgentTaskFromClient({
			projectId: "project-1", prompt: "Analyze this file", files: [file], maxPolls: 0,
			fetcher: async (input, init) => {
				requests.push({ url: String(input), init });
				if (String(input).endsWith("/uploads")) {
					return { ok: true, status: 201, json: async () => ({ file: { id: "upload-id", name: "report.txt", mimeType: "text/plain", size: 11 } }) };
				}
				return {
					ok: true, status: 202,
					json: async () => ({ task: {
						id: "pat_0123456789ab", projectId: "project-1", prompt: "Analyze this file",
						status: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
					} }),
				};
			},
		});

		expect(requests).toHaveLength(2);
		expect(requests[0].url).toContain("/uploads");
		expect(requests[0].init?.body).toBe(file);
		expect((requests[0].init?.headers as Record<string, string>)["X-File-Name"]).toBe("report.txt");
		expect(JSON.parse(String(requests[1].init?.body))).toEqual({
			prompt: "Analyze this file", inputFiles: [{ id: "upload-id", name: "report.txt", mimeType: "text/plain", size: 11 }],
		});
	});

	it("sends the model selector only when one is chosen", async () => {
		const bodies: Array<Record<string, unknown>> = [];
		const fetcher = async (_url: string, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body ?? "{}")));
			return { ok: true, status: 202, json: async () => ({ task: { id: "pat_0123456789ab", projectId: "project-1", prompt: "p", status: "done", createdAt: "", updatedAt: "" } }) };
		};
		await runProjectAgentTaskFromClient({ projectId: "project-1", prompt: "p", conversationId: null, modelSelector: "openai/gpt-5.6-luna", fetcher });
		await runProjectAgentTaskFromClient({ projectId: "project-1", prompt: "p", conversationId: null, fetcher });
		expect(bodies[0].modelSelector).toBe("openai/gpt-5.6-luna");
		expect("modelSelector" in bodies[1]).toBe(false);
	});
});
