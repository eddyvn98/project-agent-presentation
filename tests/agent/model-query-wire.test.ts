import { afterEach, expect, it, vi } from "vitest";
import { callRuntimeModel } from "../../lib/project-agent/runtime/model";
import { runtimeTaskInstructions } from "../../lib/project-agent/runtime/instructions";
import { RICH_UI_INSTRUCTIONS } from "../../lib/project-agent/rich-ui";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("only omits the stable block on an opted-in existing conversation", async () => {
  const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(
    'data: {"event":"message","answer":"ok"}\n\ndata: {"event":"message_end"}\n\n', { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("PROJECT_AGENT_TRIM_REPEATED_INSTRUCTIONS", "1");
  const block = runtimeTaskInstructions("project-a");
  const query = `${block}\n${RICH_UI_INSTRUCTIONS}\nCurrent instruction and user correction`;
  const call = async (conversationId?: string) => {
    await callRuntimeModel({ query, user: "test", projectId: "project-a", conversationId });
    return JSON.parse(fetcher.mock.calls.at(-1)![1]!.body as string).query as string;
  };
  expect(await call()).toContain(block);
  const reused = await call("existing-conversation");
  expect(reused).not.toContain(block);
  expect(reused).not.toContain(RICH_UI_INSTRUCTIONS);
  expect(reused).toContain("Current instruction and user correction");
  vi.stubEnv("PROJECT_AGENT_TRIM_REPEATED_INSTRUCTIONS", "0");
  expect(await call("existing-conversation")).toContain(block);
});

it("preserves instructions when the project identity is absent", async () => {
  const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(
    'data: {"event":"message","answer":"ok"}\n\ndata: {"event":"message_end"}\n\n', { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("PROJECT_AGENT_TRIM_REPEATED_INSTRUCTIONS", "1");
  const query = runtimeTaskInstructions();
  await callRuntimeModel({ query, user: "test", conversationId: "existing" });
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).query).toBe(query);
});
