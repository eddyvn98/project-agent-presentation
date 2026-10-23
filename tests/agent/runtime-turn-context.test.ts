import { expect, it } from "vitest";
import { RuntimeTurnContext } from "../../lib/project-agent/runtime/turn-context";

it("keeps calculation results identifiable when later probes return only ok", () => {
  const context = new RuntimeTurnContext("Compute synthetic costs");
  context.record({ action: "calculate" }, { text: '{"exact":"98000"}' });
  context.record({ action: "shell" }, { text: "shell result (exit 0):\nok" });
  const query = context.query("Use the latest observations to continue");
  expect(query).toContain("98000");
  expect(query).toContain("Compute synthetic costs");
  expect(query).toContain("APP ACTION TRANSPORT");
  expect(query).toContain("not a calculator result");
});
it("bounds old receipts and retains failure/stop/steering instructions", () => {
  const context = new RuntimeTurnContext("Task");
  for (let id = 0; id < 7; id++) context.record({ action: `action-${id}` }, { text: "x".repeat(10000), failed: true });
  const query = context.query("STOP: final only. User steering: report the failure.");
  const receipts = JSON.parse(query.match(/<app_action_results>\n([\s\S]*?)\n<\/app_action_results>/)![1]);
  expect(receipts).toHaveLength(4);
  expect(receipts[0].id).toBe(4);
  expect(receipts.every((receipt: { failed: boolean; output: string }) => receipt.failed && receipt.output.length < 4100)).toBe(true);
  expect(query).toContain("STOP: final only. User steering: report the failure.");
  expect(query).toContain("receipt excerpt truncated");
});
