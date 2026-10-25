import { createServer, type Server } from "node:http";
import { test, expect, request as http } from "@playwright/test";
import { projectId, taskBase, waitTask } from "./qa-helpers";

/** Local SSE model only. Host still runs its real task worker, action parser,
 * Chromium browser tool, P8 maker/checker and terminal Mongo CAS. */
const conversations = new Map<string, { scenario: "success" | "premature"; round: number }>();
const modelPort = 3998;
let server: Server;
let requests = 0, modelCalls = 0;
function answer(query: string, conversationId: string): { text: string; id: string } {
  let record = conversations.get(conversationId);
  let id = conversationId;
  if (!record) {
    const scenario = query.includes("scenario=premature") ? "premature" : "success";
    id = "g1-local-" + ++requests;
    record = { scenario, round: 0 };
    conversations.set(id, record);
  }
  const round = record.round++;
  if (record.scenario === "premature")
    return { text: JSON.stringify({ action: "final",
      answer: "The synthetic counter goal is complete." }), id };
  if (round === 0)
    return { text: JSON.stringify({ action: "browser", op: "snapshot" }), id };
  if (round === 1) {
    const ref = query.match(/\[ref=(e\d+)\]\s+button\s+"Increase counter"/)?.[1];
    if (!ref) return { text: JSON.stringify({ action: "final",
      answer: "Missing clickable DOM reference; cannot verify goal." }), id };
    return { text: JSON.stringify({ action: "browser", op: "click", ref }), id };
  }
  return { text: JSON.stringify({ action: "final", answer: "Synthetic counter incremented." }), id };
}
test.beforeAll(async () => {
  if (process.env.G1_QA_ALLOW_CLOSEOUT !== "1")
    throw new Error("Set G1_QA_ALLOW_CLOSEOUT=1 after synthetic session preflight");
  server = createServer(async (req, res) => {
    if (req.socket.remoteAddress !== "127.0.0.1" &&
        req.socket.remoteAddress !== "::ffff:127.0.0.1") {
      res.writeHead(403).end(); return;
    }
    if (req.method !== "POST" || !["/chat-messages", "/v1/chat-messages"].includes(req.url ?? "")) {
      res.writeHead(404).end(); return;
    }
    if (req.headers.authorization !== "Bearer g1-local-only") {
      res.writeHead(403).end(); return;
    }
    let data = "";
    for await (const part of req) {
      data += part.toString();
      if (data.length > 200_000) { res.writeHead(413).end(); return; }
    }
    modelCalls++;
    const body = JSON.parse(data) as { query?: string; conversation_id?: string };
    const output = answer(body.query ?? "", body.conversation_id ?? "");
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    res.write("data: " + JSON.stringify({ event: "agent_message",
      conversation_id: output.id, answer: output.text }) + "\n\n");
    res.end("data: " + JSON.stringify({ event: "message_end", conversation_id: output.id,
      metadata: { usage: { prompt_tokens: 80, completion_tokens: 20 } } }) + "\n\n");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(modelPort, "127.0.0.1", resolve);
  });
});
test.afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (requests === 2) expect(modelCalls).toBe(4);
  conversations.clear();
});

for (const scenario of ["success", "premature"] as const) {
  test("G1 real worker -> model SSE -> browser continuation -> " + scenario, async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const endpoint = `/api/projects/${encodeURIComponent(projectId())}/agent/g1-qa`;
    const headers = { Origin: origin };
    const created = await request.post(endpoint, {
      headers, data: { scenario }, failOnStatusCode: false,
    });
    expect(created.status(), await created.text()).toBe(201);
    const { taskId, prepared } = await created.json() as { taskId: string; prepared: boolean };
    expect(prepared).toBe(true);
    const outsider = await http.newContext({ baseURL: origin,
      storageState: process.env.P7_NONMEMBER_STORAGE_STATE });
    try {
      expect((await outsider.get(`${taskBase()}/${taskId}`,
        { failOnStatusCode: false })).status()).toBe(404);
      expect((await outsider.post(endpoint, { headers, data: { scenario },
        failOnStatusCode: false })).status()).toBe(403);
    } finally { await outsider.dispose(); }
    try {
      const result = await waitTask(request, taskId, 100_000);
      if (scenario === "success") {
        expect(result.status).toBe("done");
        expect(result.resultText).toContain("G1_VERIFIED_RECEIPT");
        expect(result.resultText).toContain('"observed":1');
        expect(result.resultText).toContain('"checker":"chromium_dom"');
        expect(result.resultText).not.toContain("not independently verified");
      } else {
        expect(result.status).toBe("failed");
        expect(result.error).toMatch(/G1 goal checker: counter target not independently verified/);
        expect(result.resultText ?? "").not.toContain("G1_VERIFIED_RECEIPT");
      }
      const audit = await request.get(`${taskBase()}/${taskId}`);
      const { task } = await audit.json() as { task: { log: string[] } };
      expect(task.log.some(line => line.includes("p8_loop_metrics"))).toBe(true);
    } finally {
      const removed = await request.delete(endpoint, { headers,
        data: { taskId }, failOnStatusCode: false });
      expect(removed.status(), await removed.text()).toBe(200);
    }
  });
}
