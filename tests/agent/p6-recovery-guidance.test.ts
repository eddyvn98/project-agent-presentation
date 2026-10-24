import { describe, expect, it } from "vitest";
import { taskIssue } from "../../lib/project-agent/task-issue";
describe("P6 employee-facing recovery guidance", () => {
  it("requires inspection for uncertain remote changes", () => {
    const result = taskIssue("MongoDB worker lease was lost", "vi");
    expect(result).toMatchObject({ kind: "review", needsReview: true, canRetryWithoutInspection: false });
    expect(result?.message).toMatch(/kiểm tra/);
  });
  it("does not recommend blindly retrying an incomplete model stream", () => {
    expect(taskIssue("Dify model stream ended without completion")?.needsReview).toBe(true);
  });
  it("separates ordinary retry guidance from uncertain changes", () => {
    expect(taskIssue("The same action was sent 5 times")).toMatchObject({ kind: "loop", needsReview: false });
    expect(taskIssue("Browser session is closed")).toMatchObject({ kind: "browser", needsReview: false });
    expect(taskIssue("Model step failed (HTTP 503)")?.kind).toBe("service");
  });
  it("does not pretend an unrecognized error has been classified", () => {
    expect(taskIssue("Unknown error")).toBeNull();
  });
  it("defaults non-Vietnamese messages to English", () => {
    expect(taskIssue("The same action was sent 5 times", "es")?.message).toMatch(/assistant/i);
  });
});
