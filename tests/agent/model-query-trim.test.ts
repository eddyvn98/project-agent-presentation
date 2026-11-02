import { expect, it } from "vitest";
import { trimRepeatedRuntimeInstructions } from "../../lib/project-agent/runtime/model-query";

it("omits only the known stable instructions while preserving live context and user corrections", () => {
  const instructions = "stable sandbox protocol and safety rules";
  const query = `${instructions}\nProject instructions: latest\nUser: corrected requirement`;
  const result = trimRepeatedRuntimeInstructions(query, instructions);
  expect(result).not.toContain(instructions);
  expect(result).toContain("Project instructions: latest");
  expect(result).toContain("User: corrected requirement");
  expect(result).toContain("safety instructions from this conversation");
});

it("preserves unknown or absent instructions unchanged", () => {
  expect(trimRepeatedRuntimeInstructions("current task", "other prefix")).toBe("current task");
  expect(trimRepeatedRuntimeInstructions("current task", "")).toBe("current task");
});

it("omits an additional exact stable block only with the primary block present", () => {
  expect(trimRepeatedRuntimeInstructions("primary\nui\nlatest", "primary", ["ui"])).not.toContain("\nui\n");
  expect(trimRepeatedRuntimeInstructions("ui\nlatest", "primary", ["ui"])).toBe("ui\nlatest");
});
