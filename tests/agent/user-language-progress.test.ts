import { describe, expect, it } from "vitest";
import { activityLabel, activityText, projectAgentLanguage } from "../../lib/project-agent/activity-language";
import { taskActivity, toPublicProjectAgentTask } from "../../lib/project-agent/public-task";
import { parseRuntimeActions } from "../../lib/project-agent/runtime/actions";
import type { ProjectAgentTask } from "../../lib/project-agent/types";

function task(prompt: string, log: string[]): ProjectAgentTask {
  return { id: "pat_test", projectId: "project-a", ownerEmail: "u@example.test",
    prompt, status: "running", createdAt: "2026-10-24T00:00:00Z",
    updatedAt: "2026-10-24T00:01:00Z", log };
}
describe("live progress matches the language of the current request", () => {
  it("detects language per request instead of forcing one UI locale", () => {
    expect(projectAgentLanguage("Tôi muốn kiểm tra tài liệu và lập báo cáo")).toBe("vi");
    expect(projectAgentLanguage("Please review the project files")).toBe("en");
    expect(projectAgentLanguage("Por favor, necesito revisar este proyecto")).toBe("es");
    expect(projectAgentLanguage("Bonjour, comment vérifier ce projet ?")).toBe("fr");
    expect(projectAgentLanguage("資料を確認して報告してください")).toBe("ja");
    expect(projectAgentLanguage("Please answer in Vietnamese")).toBe("vi");
  });
  it("shows readable, localized tool labels without exposing a raw command as the progress headline", () => {
    const lines = [
      "2026-10-24T00:00:00Z using tool sandbox_shell :: rm -rf /work/tmp && python build.py",
      "2026-10-24T00:00:01Z progress_message :: Tôi đang đối chiếu các số liệu đã đọc.",
      "2026-10-24T00:00:02Z using tool web_fetch :: https://example.test/report",
    ];
    const localized = toPublicProjectAgentTask(task("Tôi muốn kiểm tra báo cáo", lines));
    expect(localized.activityLanguage).toBe("vi");
    expect(localized.activity?.map((item) => item.kind)).toEqual(["other", "update", "read"]);
    expect(localized.activity?.[0].label).toBe(activityLabel("sandbox_shell", "vi"));
    expect(localized.activity?.[1].label).toContain("đối chiếu");
    expect(localized.progress).toContain(activityLabel("web_fetch", "vi"));
    expect(localized.progress).not.toContain("rm -rf");
    expect(localized).not.toHaveProperty("log");
    expect(activityText("en").working).not.toBe(activityText("vi").working);
  });
  it("preserves chronological narrative updates and existing English activity counts", () => {
    const log = [
      "t1 using tool duckduckgo_search #a1 :: first source",
      "t2 using tool duckduckgo_search #b2 :: second source",
      "t3 progress_message :: I found relevant candidate sources; next I will inspect the pages.",
      "t4 using tool webscraper #c3 :: https://example.test",
    ];
    const activity = taskActivity(log);
    expect(activity.map((item) => item.kind)).toEqual(["search", "update", "read"]);
    expect(activity[0].count).toBe(2);
    expect(activity[1].details).toEqual([]);
    expect(activity[1].label).toContain("candidate sources");
    expect(activity[2].label).toBe("Reading a web page");
  });
  it("accepts a bounded progress action and rejects malformed commentary", () => {
    const good = parseRuntimeActions('{"action":"progress","message":"I am checking the saved document before making changes."}');
    expect(Array.isArray(good)).toBe(true);
    expect(parseRuntimeActions('{"action":"progress","message":"hi"}')).toHaveProperty("error");
  });
});
