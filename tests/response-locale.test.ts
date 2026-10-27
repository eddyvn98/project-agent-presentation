import { describe, expect, it } from "vitest";
import { responseLabels, responseNumber } from "../shared/project-agent/response-locale";
describe("Response locale mapping", () => {
  it("supports every Agent UI language and regional number formats", () => {
    const all = ["en","vi","es","fr","de","pt","ja","ko","zh","ru","ar","hi"];
    for (const language of all) {
      expect(responseLabels(language).chart.length).toBeGreaterThan(0);
      expect(responseLabels(language).chooseAnswer.length).toBeGreaterThan(0);
      expect(responseNumber(1234.5, language)).toBeTruthy();
    }
    expect(responseNumber(1234.5, "en")).toBe("1,234.5");
    expect(responseNumber(1234.5, "vi")).toBe("1.234,5");
    expect(responseLabels("vi-VN").chart).toBe("Biểu đồ");
    expect(responseLabels("ja-JP").correct).toBe("正解");
  });
  it("falls back to English for unknown language rather than assuming Vietnamese", () => {
    expect(responseLabels("nonsense").chart).toBe("Chart");
    expect(responseLabels("").table).toBe("Table");
  });
});
