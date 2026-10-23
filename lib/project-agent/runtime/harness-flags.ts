/** PROJECT_AGENT_HARNESS_OFF="evaluator,verify,reference,plan": switches harness parts off for ablation runs in the benchmark. Never set in production. */
export function harnessOff(part: "evaluator" | "verify" | "reference" | "plan"): boolean {
	return (process.env.PROJECT_AGENT_HARNESS_OFF ?? "").split(",").map((item) => item.trim()).includes(part);
}
