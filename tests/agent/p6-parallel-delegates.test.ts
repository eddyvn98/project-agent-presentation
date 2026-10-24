import { describe, expect, it } from "vitest";
import { uniqueParallelJobs } from "../../lib/project-agent/runtime/delegate-batch";
describe("P6 parallel subagent coordination", () => {
  it("does not launch duplicate exact jobs in one grouped response", () => {
    const work = [{ task: "Read A" }, { task: "Read  A" }, { task: "Read B" }];
    const unique = uniqueParallelJobs(work);
    expect(unique.map(item => item.index)).toEqual([0, 2]);
  });
  it("keeps independent reviewer and worker assignments", () => {
    const unique = uniqueParallelJobs([
      { task: "Check results", role: "worker" },
      { task: "Check results", role: "reviewer" },
    ]);
    expect(unique).toHaveLength(2);
  });
  it("does not collapse merely similar descriptions", () => {
    expect(uniqueParallelJobs([{ task: "Read A" }, { task: "Read B" }])).toHaveLength(2);
  });
});
