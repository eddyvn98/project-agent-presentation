import { describe, expect, it } from "vitest";
import { parseScheduleSpec, nextScheduledRun } from "../../lib/project-agent/scheduled-time";
describe("L19 scheduled run clock, watch and replay guard", () => {
  it("calculates stable due UTC instants across timezone and DST gap", () => {
    const daily = parseScheduleSpec({ kind: "daily", timezone: "Asia/Ho_Chi_Minh",
      localTime: "08:00" });
    expect(nextScheduledRun(daily, Date.parse("2026-10-27T00:00:00Z")))
      .toBe("2026-10-27T01:00:00.000Z");
    const next = nextScheduledRun(daily, Date.parse("2026-10-27T02:00:00Z"));
    expect(next).toBe("2026-10-28T01:00:00.000Z");
    const gap = parseScheduleSpec({ kind: "daily", timezone: "America/New_York",
      localTime: "02:30" });
    const target = nextScheduledRun(gap, Date.parse("2026-03-08T05:00:00Z"));
    expect(target).toBe("2026-03-09T06:30:00.000Z");
  });
  it("refuses unsupported schedule intervals and secret-bearing URLs", () => {
    for (const everyMinutes of [0, 1, 14, 1441, -50])
      expect(() => parseScheduleSpec({ kind: "interval", timezone: "UTC", everyMinutes })).toThrow();
    for (const url of ["http://example.com", "https://u:p@example.com", "file:///etc/passwd"])
      expect(() => parseScheduleSpec({ kind: "watch", timezone: "UTC",
        everyMinutes: 15, url })).toThrow();
  });
});
