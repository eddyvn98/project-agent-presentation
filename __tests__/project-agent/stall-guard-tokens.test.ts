import { describe, expect, it } from "vitest";
import { StallGuard, type StallLimits } from "@/lib/project-agent/runtime/stall-guard";

const limits: StallLimits = { repeatNudge: 3, repeatStop: 5, failNudge: 3, failStop: 6, softMs: 8 * 60_000, hardMs: 15 * 60_000, softTokens: 250_000, hardTokens: 450_000, softSteps: 30, hardResentTokens: 6_000_000 };
const state = { step: 10, elapsedMs: 60_000, waitedMs: 0 };

describe("stall guard token budget", () => {
	it("does not nudge a long run whose context is only re-sent, not growing", () => {
		expect(new StallGuard(limits).check({ ...state, tokens: 160_000, resentTokens: 1_800_000 })).toEqual({});
	});
	it("nudges and then stops on fresh tokens", () => {
		expect(new StallGuard(limits).check({ ...state, tokens: 260_000, resentTokens: 1_000_000 }).nudge).toMatch(/deliver what you have/);
		expect(new StallGuard(limits).check({ ...state, tokens: 460_000, resentTokens: 1_000_000 }).stop).toMatch(/new tokens/);
	});
	it("keeps a cost backstop on the tokens sent in total", () => {
		expect(new StallGuard(limits).check({ ...state, tokens: 100_000, resentTokens: 6_100_000 }).stop).toMatch(/prompt tokens sent in total/);
	});
});
