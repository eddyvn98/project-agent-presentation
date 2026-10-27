import { describe, expect, it } from "vitest";
import { coordinateMemorySources } from "../../lib/project-agent/memory-coordination";
const sources = {
  sameChat: "User: Keep source A\nYou: Saved decision A",
  projectAgentHistory: "Other Project Agent history",
  projectChats: "Shared Project history",
  personalChats: "Default memory from other chats",
  hindsightMemory: "<project_long_term_memory>\n- [m1] Historical fact\n</project_long_term_memory>",
  xerjContext: "<project_xerj_search>\nIndexed document\n</project_xerj_search>",
};
describe("coordinated existing memory", () => {
  it("prioritizes recent turns while retaining independent scope labels", () => {
    const found = coordinateMemorySources(sources);
    expect(found.projectAgentHistory.indexOf("Saved decision A")).toBeLessThan(
      found.projectAgentHistory.indexOf("Other Project Agent history"));
    expect(found.projectAgentHistory).toContain("<same_chat_history>");
    expect(found.hindsightMemory).toContain("project_long_term_memory");
    expect(found.xerjContext).toContain("project_xerj_search");
    expect(found.personalChats).toBe(sources.personalChats);
  });
  it("bounds each source and retains recent information from long histories", () => {
    const found = coordinateMemorySources({
      ...sources, projectAgentHistory: "Title\n" + "x".repeat(20_000) + "LATEST",
      projectChats: "Shared\n" + "y".repeat(12_000) + "LATEST",
      personalChats: "z".repeat(9_000) + "LATEST",
    }, true);
    expect(found.projectAgentHistory).toContain("LATEST");
    expect(found.projectChats).toContain("LATEST");
    expect(found.personalChats).toContain("LATEST");
    expect(found.projectAgentHistory.length).toBeLessThan(12_000);
    expect(found.projectChats.length).toBeLessThanOrEqual(4_500);
    expect(found.personalChats.length).toBeLessThanOrEqual(1_500);
  });
  it("does not invent memory when optional stores are disabled", () => {
    const empty = Object.fromEntries(Object.keys(sources).map(key => [key, ""])) as typeof sources;
    expect(coordinateMemorySources(empty)).toEqual({
      projectAgentHistory: "", projectChats: "", personalChats: "",
      hindsightMemory: "", xerjContext: "",
    });
  });
});
