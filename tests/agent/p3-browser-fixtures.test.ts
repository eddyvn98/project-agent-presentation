import { describe, expect, it } from "vitest";
import { browserBenchmarkFixtures } from "../../lib/project-agent/benchmark/fixtures";
import { policyHost } from "../../lib/project-agent/browser-security-policy";
describe("P3 real-world browser benchmark fixtures", () => {
  it("has 40 unique, bounded, no-network benchmark cases", () => {
    const cases = browserBenchmarkFixtures();
    expect(cases).toHaveLength(40);
    expect(new Set(cases.map(c => c.id)).size).toBe(40);
    expect(new Set(cases.map(c => c.category)).size).toBe(10);
    for (const fixture of cases) {
      expect(fixture.html.length).toBeLessThan(2200);
      expect(fixture.actions.length).toBeGreaterThan(0);
      expect(fixture.actions.length).toBeLessThanOrEqual(2);
      expect(fixture.actions.every(a => /^#[a-z]+$/i.test(a.selector))).toBe(true);
      expect(fixture.html).not.toMatch(/https?:\/\/|fetch\(|XMLHttpRequest|WebSocket/);
    }
  });
  it("rejects credential URLs and non-HTTPS policy domains", () => {
    expect(policyHost("https://example.com")).toBe("example.com");
    expect(() => policyHost("https://user:pass@example.com")).toThrow();
    expect(() => policyHost("http://example.com")).toThrow();
    expect(() => policyHost("example.com:8080")).toThrow();
  });
});
