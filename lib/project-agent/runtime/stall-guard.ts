const intEnv = (name: string, fallback: number) => Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback;

export interface StallLimits {
	/** Same action (name and arguments) sent this many times: nudge, then stop at the second number. */
	repeatNudge: number; repeatStop: number;
	/** Failed actions in a row. */
	failNudge: number; failStop: number;
	/** Working time (waits for background jobs excluded), prompt tokens summed over all model calls, and steps. */
	softMs: number; hardMs: number; softTokens: number; hardTokens: number; softSteps: number;
	/** Cost backstop on the prompt tokens re-sent every step, summed over the run. */
	hardResentTokens: number;
}

export const stallLimits = (): StallLimits => ({
	repeatNudge: 3, repeatStop: 5, failNudge: 3, failStop: 6,
	softMs: intEnv("PROJECT_AGENT_SOFT_MINUTES", 8) * 60_000, hardMs: intEnv("PROJECT_AGENT_HARD_MINUTES", 15) * 60_000,
	softTokens: intEnv("PROJECT_AGENT_SOFT_TOKENS", 250_000), hardTokens: intEnv("PROJECT_AGENT_HARD_TOKENS", 450_000),
	softSteps: intEnv("PROJECT_AGENT_SOFT_STEPS", 30),
	hardResentTokens: intEnv("PROJECT_AGENT_HARD_RESENT_TOKENS", 6_000_000),
});

/** `tokens`: fresh tokens only (first prompt, context growth, output). `resentTokens`: every prompt token sent, the same context counted again each step. */
export interface StallState { step: number; elapsedMs: number; waitedMs: number; tokens: number; resentTokens?: number }
export interface StallVerdict { nudge?: string; stop?: string }

/**
 * Watches one agent run for going round in circles. A nudge is one short message in the next model query; a stop asks for a final
 * answer that says what is done and what is blocked (the caller gives the model a couple of steps to write it).
 */
export class StallGuard {
	private readonly seen = new Map<string, number>();
	private failStreak = 0;
	private nudged = new Set<string>();

	constructor(private readonly limits: StallLimits = stallLimits()) {}

	noteAction(key: string, failed: boolean): void {
		this.seen.set(key, (this.seen.get(key) ?? 0) + 1);
		this.failStreak = failed ? this.failStreak + 1 : 0;
	}

	check(state: StallState): StallVerdict {
		const { limits } = this;
		const worked = state.elapsedMs - state.waitedMs;
		const maxRepeat = Math.max(0, ...this.seen.values());
		if (maxRepeat >= limits.repeatStop) return { stop: `the same action was sent ${maxRepeat} times` };
		if (this.failStreak >= limits.failStop) return { stop: `${this.failStreak} actions failed in a row` };
		if (worked >= limits.hardMs) return { stop: `${Math.round(worked / 60_000)} minutes of work` };
		if (state.tokens >= limits.hardTokens) return { stop: `${Math.round(state.tokens / 1000)}k new tokens used` };
		if ((state.resentTokens ?? 0) >= limits.hardResentTokens) return { stop: `${(state.resentTokens! / 1e6).toFixed(1)}M prompt tokens sent in total` };
		if (maxRepeat >= limits.repeatNudge) return { nudge: this.once("repeat", `You have sent the same action ${maxRepeat} times. Repeating it will not change the result: use a different approach, or send final saying what is blocked.`) };
		if (this.failStreak >= limits.failNudge) return { nudge: this.once("fail", `${this.failStreak} actions in a row failed. Read the errors again and change the approach (a different tool, smaller steps, or check the input), or send final saying what is blocked.`) };
		if (worked >= limits.softMs || state.tokens >= limits.softTokens || state.step >= limits.softSteps) {
			return { nudge: this.once("budget", `You have used ${state.step} steps and ${Math.round(worked / 60_000)} minutes. Unless the goal is within reach, deliver what you have now and state plainly what is not done. Do not polish or retry variants of what already works.`) };
		}
		return {};
	}

	/** Each message is sent once per kind until its counter moves on, so the model is not nagged every step. */
	private once(kind: string, text: string): string | undefined {
		const key = `${kind}:${kind === "repeat" ? Math.max(...this.seen.values()) : kind === "fail" ? this.failStreak : 0}`;
		if (this.nudged.has(key)) return undefined;
		this.nudged.add(key);
		return text;
	}
}

export const wrapUpQuery = (reason: string): string =>
	`STOP: this run is being ended because ${reason}. Send {"action":"final",...} now. In answer say what is done (with file names under outputs/), what is not done, and why. Do not start any other action.`;
