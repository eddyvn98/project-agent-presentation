import { describe, expect, it } from "vitest";
import { calculateExact, runCalculation } from "../../lib/project-agent/runtime/calculate";
import { parseRuntimeAction, parseRuntimeActions } from "../../lib/project-agent/runtime/actions";
import { denyReason } from "../../lib/project-agent/runtime/policy";
import { formatDisabledToolGroups } from "../../lib/project-agent/tool-groups";
import { calculationGuidance } from "../../lib/project-agent/calculation-guidance";
import { runtimeTaskInstructions } from "../../lib/project-agent/runtime/instructions";

describe("exact arithmetic regression: rounded daily break-even", () => {
  it("recomputes bills and profit using the rounded operational target", () => {
    expect(calculateExact("72000000 / (47000 * 26)")).toBe("36000/611");
    expect(calculateExact("ceil(72000000 / (47000 * 26))")).toBe("59");
    expect(calculateExact("59 * 26")).toBe("1534");
    expect(calculateExact("1534 * 47000")).toBe("72098000");
    expect(calculateExact("1534 * 47000 - 72000000")).toBe("98000");
    expect(calculateExact("ceil(72000000 / (47000 * 26)) * 26 * 47000 - 72000000")).toBe("98000");
  });
  it("distinguishes a whole-period minimum from the same daily target every open day", () => {
    expect(calculateExact("ceil(72000000 / 47000)")).toBe("1532");
    expect(calculateExact("1532 * 47000 - 72000000")).toBe("4000");
    expect(calculateExact("58 * 26 * 47000 - 72000000")).toBe("-1124000");
  });
});

it.each([
  ["0.1 + 0.2", "3/10"], ["(0.1 + 0.2) * 10", "3"],
  ["9007199254740993 + 1", "9007199254740994"], ["1/3 + 1/6", "1/2"],
  ["2 + 3 * 4", "14"], ["(2 + 3) * 4", "20"], ["8 / 4 / 2", "1"],
  ["8 - 4 - 2", "2"], ["-(-2) / +4", "1/2"], ["1/-3", "-1/3"],
  ["ceil(-1/3)", "0"], ["floor(-1/3)", "-1"], ["ceil(1/3)", "1"], ["floor(1/3)", "0"],
  ["ceil(-2)", "-2"], ["floor(2)", "2"], ["0/2", "0"], [" 2.50 / 0.5 ", "5"],
])("evaluates %s exactly", (expression, expected) => {
  expect(calculateExact(expression)).toBe(expected);
});

it.each([
  "", " ", "1/0", "0/0", "1/(2-2)", "NaN", "Infinity", "1e3", "2**3", "1,534", "1.534.000",
  "47_000", "47000 VND", "2(3)", "1 2", "2+", "ceil()", "floor(1,2)", "(1+2", "1+2)",
  "Math.ceil(1)", "process.exit()", "globalThis.fetch('https://example.com')", "1;2", "1%2",
  "1".repeat(81), "1".repeat(513), "(".repeat(25) + "1" + ")".repeat(25),
  "-".repeat(25) + "1", Array(66).fill("1").join("+"), Array(8).fill("9".repeat(80)).join("*"),
])("rejects unsupported, dangerous or excessive input: %s", (expression) => {
  expect(() => calculateExact(expression)).toThrow();
  expect(runCalculation(expression).failed).toBe(true);
});

it("returns a bounded tool receipt with explicit verification scope", () => {
  const parsed = parseRuntimeAction('{"action":"calculate","expression":"1534 * 47000 - 72000000"}');
  expect(parsed).toMatchObject({ action: "calculate" });
  if (!("expression" in parsed)) throw new Error("Expected calculate action");
  const receipt = runCalculation(parsed.expression);
  expect(receipt.failed).toBeUndefined();
  expect(JSON.parse(receipt.text)).toMatchObject({ expression: parsed.expression, exact: "98000", scope: expect.stringContaining("prose are not verified") });
  expect(denyReason({ readOnly: true }, parsed)).toBeNull();
});

it.each([{}, { expression: 123 }, { expression: " " }, { expression: "1".repeat(513) }])("rejects malformed calculate actions %j", (fields) => {
  expect(parseRuntimeActions(JSON.stringify({ action: "calculate", ...fields }))).toHaveProperty("error");
});

it("retains normal batching and exposes runtime instructions without advertising a nonexistent Dify tool", () => {
  expect(parseRuntimeActions('{"action":"calculate","expression":"59*26"}\n{"action":"calculate","expression":"1534*47000-72000000"}')).toHaveLength(2);
  expect(runtimeTaskInstructions()).toContain('"action":"calculate"');
  expect(calculationGuidance(false)).not.toContain('"action":"calculate"');
  expect(calculationGuidance(false)).toContain("has not been tool-checked");
  expect(calculationGuidance(true)).toContain("recompute the period total");
});

it("includes calculate in the existing owner-configured code-tool restriction", () => {
  expect(formatDisabledToolGroups(["code"])).toContain("calculate");
});
