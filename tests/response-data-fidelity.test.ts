import { describe, expect, it } from "vitest";
import { parseRichUiBlock } from "../src/lib/project-agent/rich-ui";

const mk = (kind: string, series: unknown) => JSON.stringify({
  type: "chart", kind, categories: ["Jan", "Feb"], series,
});
describe("full response data fidelity", () => {
  it("does not silently replace duplicate chart series names", () => {
    expect(parseRichUiBlock(mk("line", [
      { name: "Revenue", values: [1, 2] },
      { name: "REVENUE", values: [3, 4] },
    ]))).toBeNull();
    expect(parseRichUiBlock(mk("bar", [
      { name: "Sales", values: [1, 2] },
      { name: "Sales", values: [3, 4] },
    ]))).toBeNull();
  });
  it("does not discard additional pie series, negative values or zero-only data", () => {
    expect(parseRichUiBlock(mk("pie", [
      { name: "Revenue", values: [40, 60] },
      { name: "Cost", values: [35, 65] },
    ]))).toBeNull();
    expect(parseRichUiBlock(mk("pie", [{ name: "Share", values: [10, -5] }]))).toBeNull();
    expect(parseRichUiBlock(mk("pie", [{ name: "Share", values: [0, 0] }]))).toBeNull();
  });
  it("preserves zero observations and the original data for multi-series plots", () => {
    expect(parseRichUiBlock(mk("line", [
      { name: "Revenue", values: [0, 100] },
      { name: "Cost", values: [20, 0] },
    ]))).toMatchObject({ kind: "line", series: [
      { values: [0, 100] }, { values: [20, 0] },
    ] });
    expect(parseRichUiBlock(mk("pie", [{ name: "Share", values: [0, 100] }]))).toMatchObject({
      kind: "pie", series: [{ values: [0, 100] }],
    });
  });
  it("rejects oversized visual payloads and incomplete datasets without fake zeros", () => {
    expect(parseRichUiBlock(" ".repeat(40001))).toBeNull();
    expect(parseRichUiBlock(mk("line", [
      { name: "Revenue", values: [100] },
    ]))).toBeNull();
  });
});
