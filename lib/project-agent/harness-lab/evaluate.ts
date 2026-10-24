import { callRuntimeModel } from "../runtime/model";
import { runModelBrowserBenchmark } from "../benchmark/model-runner";
import { validateHarnessGuidance, harnessAddendum } from "./guard";
import { probeSet, scoreProbe } from "./probes";
import type { HarnessEvidence, HarnessVariant, HarnessCaseResult } from "./types";
import { claimHarnessEvaluation, completeHarnessEvaluation, failHarnessEvaluation, getHarnessVariant } from "./store";

const MAX_SECONDS = 45;
const MAX_TESTS = 5;
async function ask(variant: HarnessVariant, caseId: string, prompt: string,
  guidance: string, user: string): Promise<{ answer: string; tokens: number; ms: number }> {
  const started = Date.now();
  const query = [
    "You are solving a synthetic, read-only QA fixture. You have no browser, shell, files, credentials or tools.",
    "For action-selection fixtures, output ONE JSON action without executing it.",
    "For ordinary fixtures, answer the task directly. Never claim external access.",
    guidance ? harnessAddendum(variant.domain, variant.dimension, guidance) : "",
    "Synthetic case: " + caseId, "Task: " + prompt,
  ].filter(Boolean).join("\n\n");
  const result = await callRuntimeModel({ query, user,
    modelSelector: process.env.PROJECT_AGENT_HARNESS_EVAL_MODEL || undefined,
    signal: AbortSignal.timeout(MAX_SECONDS * 1000) });
  return { answer: result.answer.slice(0, 6000),
    tokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0),
    ms: Date.now() - started };
}
export async function evaluateHarnessVariant(variant: HarnessVariant): Promise<HarnessEvidence> {
  const guidance = validateHarnessGuidance(variant.guidance);
  const parent = variant.baselineId
    ? await getHarnessVariant(variant.ownerEmail,variant.baselineId) : null;
  if (variant.baselineId && (!parent || parent.domain !== variant.domain ||
    parent.dimension !== variant.dimension || !parent.evidence))
    throw new Error("A sequential comparison requires an evaluated parent revision");
  const baselineGuidance = parent?.guidance ?? "";
  const cases = probeSet(variant.domain).slice(0, MAX_TESTS);
  if (cases.length < 3) throw new Error("Harness domain lacks enough synthetic probes");
  const results: HarnessCaseResult[] = [];
  // All trials use identical fixtures and the same model selector; separate model conversations.
  const user = "harness-lab-" + variant.id;
  for (const fixture of cases) {
    const baseline = await ask(variant, fixture.id, fixture.prompt, baselineGuidance, user);
    const candidate = await ask(variant, fixture.id, fixture.prompt, guidance, user);
    const baseScore = scoreProbe(fixture, baseline.answer);
    const trialScore = scoreProbe(fixture, candidate.answer);
    results.push({ caseId: fixture.id, basePass: baseScore.pass,
      candidatePass: trialScore.pass, baseTokens: baseline.tokens,
      candidateTokens: candidate.tokens, baseMs: baseline.ms, candidateMs: candidate.ms,
      reason: trialScore.pass ? "" : "Missing expected facts or violated a negative requirement",
    });
  }
  const basePass = results.filter(r => r.basePass).length;
  const candidatePass = results.filter(r => r.candidatePass).length;
  const baseTokens = results.reduce((sum,r) => sum+r.baseTokens,0);
  const candidateTokens = results.reduce((sum,r) => sum+r.candidateTokens,0);
  const noRegression = candidatePass >= basePass && candidatePass >= cases.length-1;
  const improvement = candidatePass > basePass ||
    (baseTokens > 0 && candidateTokens > 0 && candidateTokens <= baseTokens*0.9);
  let browserBench: HarnessEvidence["browserBench"] | undefined;
  if (process.env.PROJECT_AGENT_HARNESS_REALWORLD_GATE === "1" && noRegression && improvement) {
    const [baseline, candidate] = await Promise.all([
      runModelBrowserBenchmark(3, baselineGuidance),
      runModelBrowserBenchmark(3, guidance),
    ]);
    const baselinePassed = baseline.filter(row => row.passed).length;
    const candidatePassed = candidate.filter(row => row.passed).length;
    browserBench = { baselinePassed, candidatePassed, count: baseline.length,
      baselineTokens: baseline.reduce((n,row)=>n+row.inputTokens+row.outputTokens,0),
      candidateTokens: candidate.reduce((n,row)=>n+row.inputTokens+row.outputTokens,0),
      passedGate: candidatePassed >= baselinePassed && candidatePassed >= 2 };
  }
  const improved = noRegression && improvement && (!browserBench || browserBench.passedGate);
  return { cases: results, basePass, candidatePass, baseTokens, candidateTokens,
    ...(browserBench ? { browserBench } : {}),
    ...(parent ? { baselineReference: parent.id } : {}),
    improved, completedAt: new Date().toISOString(),
    reason: !noRegression ? "Regression or insufficient correctness on the fixed synthetic fixtures"
      : improvement ? "Candidate improved correctness or reduced tokens without correctness regression"
      : "No measured improvement; keep baseline",
    modelSelector: process.env.PROJECT_AGENT_HARNESS_EVAL_MODEL || "default",
  };
}
/** Cron-driven evaluator; no replay of user data, browser actions or sandbox. */
export async function tickHarnessLab(maxJobs = 1) {
  if (process.env.PROJECT_AGENT_HARNESS_LAB !== "1") return { evaluated: 0, rejected: 0 };
  let evaluated = 0, rejected = 0;
  for (let i=0;i<Math.min(maxJobs,2);i++) {
    const claim = await claimHarnessEvaluation();
    if (!claim) break;
    try {
      const result = await evaluateHarnessVariant(claim.variant);
      await completeHarnessEvaluation(claim.variant.id, claim.token, result);
      if (!result.improved) rejected++;
      evaluated++;
    } catch (error) {
      await failHarnessEvaluation(claim.variant.id, claim.token,
        error instanceof Error ? error.message : "Model-backed evaluation failed");
      rejected++;
    }
  }
  return { evaluated, rejected };
}
