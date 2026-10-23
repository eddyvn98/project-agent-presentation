import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { contextOutputAction, externalizeActionOutput } from "../../lib/project-agent/runtime/context-output-manager";
import { deleteContextScope, readContextOutput, saveContextOutput, searchContextOutput } from "../../lib/project-agent/runtime/context-output-store";
import { readContextCheckpoint, recordContextCheckpoint } from "../../lib/project-agent/runtime/context-checkpoint";
import { parseRuntimeActions } from "../../lib/project-agent/runtime/actions";
import { withPolicy } from "../../lib/project-agent/runtime/policy";

const scopes: Array<{ projectId: string; chatId: string }> = [];
function scope() {
  const next = { projectId: "project-" + randomUUID(), chatId: "chat-" + randomUUID() };
  scopes.push(next);
  return next;
}
afterEach(async () => {
  await Promise.all(scopes.splice(0).map((item) => deleteContextScope(item)));
});

it("retains searchable output beyond the shell preview without adding it to the model context", async () => {
  const input = scope();
  const activity = vi.fn();
  const tail = "IMPORTANT_SIGNATURE_AT_END";
  const raw = "shell result (exit 0):\n" + "lots of log rows\n".repeat(2_000) + tail;
  const output = await externalizeActionOutput({ ...input, onStep: activity }, "shell", { text: raw.slice(0, 400), rawOutput: raw });
  expect(output.text.length).toBeLessThan(3_000);
  expect(output.text).toContain("search_output");
  expect(output.text).not.toContain("lots of log rows\n".repeat(100));
  const id = output.text.match(/out_[a-f0-9]{20}/)?.[0]!;
  const match = await searchContextOutput(input, id, tail);
  expect(match.failed).toBe(false);
  expect(match.text).toContain(tail);
  const at = Number(match.text.match(/offset=(\d+)/)?.[1]);
  const read = await readContextOutput(input, id, at, 180);
  expect(read.text).toContain(tail);
  expect(activity).toHaveBeenCalledWith(expect.objectContaining({ tool: "context_saved" }));
});

it("scopes observations to a Project and chat and enforces identifier validation", async () => {
  const first = scope();
  const second = scope();
  const { id } = await saveContextOutput(first, "private output for Project A");
  expect((await readContextOutput(first, id)).text).toContain("private output");
  expect((await readContextOutput(second, id)).failed).toBe(true);
  expect((await readContextOutput(first, "../../package.json")).failed).toBe(true);
  expect((await searchContextOutput(first, id, "private")).failed).toBe(false);
});

it("redacts secrets BEFORE writing a large output even when a delegate bypasses the normal policy wrapper", async () => {
  const input = scope();
  const secret = "Bearer abcdefghijklmnopqrstuvwxyz0123456789";
  const output = await externalizeActionOutput(input, "delegate", {
    text: "header " + secret + "\n" + "many rows\n".repeat(2_000),
  });
  const id = output.text.match(/out_[a-f0-9]{20}/)?.[0]!;
  expect(output.text).not.toContain(secret);
  const matches = await searchContextOutput(input, id, secret);
  expect(matches.text).toContain("No matches");
  expect((await searchContextOutput(input, id, "[redacted]")).text).toContain("offset=");
});

it("stores tool checkpoints and restores them independently of model conversation memory", async () => {
  const input = scope();
  await recordContextCheckpoint(input, { taskId: "task-1", step: 2, action: "shell", failed: false, observation: "Saved output out_00000000000000000000" });
  await recordContextCheckpoint(input, { taskId: "task-2", step: 3, action: "calculate", failed: false, observation: "2+2=4" });
  const data = await readContextCheckpoint(input, "task-1");
  expect(data).toContain("out_00000000000000000000");
  expect(data).not.toContain("2+2=4");
  await deleteContextScope(input);
  expect(await readContextCheckpoint(input)).toBe("");
});

it("validates bounded retrieval actions and exposes them without shell execution", async () => {
  const input = scope();
  const { id } = await saveContextOutput(input, "line one\nerror at 19\nline three");
  const good = parseRuntimeActions(JSON.stringify({ action: "search_output", id, query: "error", limit: 2 }));
  expect(Array.isArray(good)).toBe(true);
  if (!Array.isArray(good)) throw new Error("parser rejected a valid action");
  expect((await contextOutputAction(input, good[0] as Extract<typeof good[number], {action:"search_output"}>)).text).toContain("error");
  for (const action of [
    { action: "search_output", id: "../../passwd", query: "error" },
    { action: "read_output", id, offset: -1 },
    { action: "read_output", id, length: Infinity },
    { action: "read_output", id, length: 9000 },
    { action: "search_output", id, query: "e", limit: 2 },
  ]) expect(parseRuntimeActions(JSON.stringify(action))).toHaveProperty("error");
});

it("applies post-action redaction to the full shell capture, not only the preview", async () => {
  const token = "Bearer abcdefghijklmnopqrstuvwxyz0123456789";
  const result = await withPolicy({}, { action: "shell", command: "echo safe" }, async () => ({
    text: "preview " + token, rawOutput: "long full result " + token,
  }));
  expect(result.text).not.toContain(token);
  expect(result.rawOutput).not.toContain(token);
  expect(result.rawOutput).toContain("[redacted]");
});
