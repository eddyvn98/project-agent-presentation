import { callRuntimeModel } from "../runtime/model";
import { validateHarnessGuidance, parseHarnessDimension, parseHarnessDomain } from "./guard";
import { createHarnessVariant, listHarnessVariants, getHarnessVariant } from "./store";
import type { HarnessDimension } from "./types";
import { buildTrace, isWasteful } from "../learning/reflect";
import type { ProjectAgentTask } from "../types";
import { classifyHarnessDomain } from "./rollout";
import { scrubText } from "../insights-public";

type Proposal = { title: string; dimension: HarnessDimension; guidance: string; rationale?: string };
const MAX_REFINEMENTS_PER_DAY = 2;
const parse = (answer: string): Proposal => {
  const raw = answer.match(/\{[\s\S]*\}/)?.[0];
  if (!raw || raw.length > 3600) throw new Error("No valid bounded harness proposal");
  const obj = JSON.parse(raw) as Record<string, unknown>;
  return { title: typeof obj.title === "string" ? obj.title.slice(0,90) : "Efficiency improvement",
    dimension: parseHarnessDimension(obj.dimension), guidance: validateHarnessGuidance(obj.guidance),
    rationale: typeof obj.rationale === "string" ? obj.rationale.slice(0,300) : "" };
};
export async function proposeHarnessFromTrace(owner: string, domain: string, trace: string) {
  const normalized = parseHarnessDomain(domain), safe = scrubText(trace).slice(0,2500);
  const now = Date.now();
  const existing = await listHarnessVariants(owner);
  if (existing.filter(v => Date.parse(v.createdAt) > now - 86400000).length >= MAX_REFINEMENTS_PER_DAY)
    throw new Error("Daily proposal budget exceeded (2 per account)");
  const message = [
    "You improve a general-purpose AI agent harness. Propose exactly ONE short, generally reusable",
    "approach, tools, delegation or skills hint based on anonymized failures. Do not change permissions,",
    "security, Vault, identity, browser access or system prompts. Never emit commands, code or URLs.",
    "Output ONLY JSON with title, dimension, guidance, rationale.",
    "The guidance must be 40–1800 characters, concrete, and avoid task-specific/private facts.",
    "Domain: " + normalized, "Anonymized trace:\n" + safe,
  ].join("\n");
  const output = await callRuntimeModel({ query: message, user: "harness-improver-" + owner,
    modelSelector: process.env.PROJECT_AGENT_HARNESS_IMPROVER_MODEL || undefined,
    signal: AbortSignal.timeout(45_000) });
  const suggestion = parse(output.answer);
  return createHarnessVariant(owner, { ...suggestion, domain: normalized });
}
/** Opt-in, bounded self-improvement from real task metadata. No automatic deployment. */
export async function autoProposeHarness(task: ProjectAgentTask) {
  if (process.env.PROJECT_AGENT_HARNESS_AUTO_PROPOSE !== "1" ||
    !isWasteful(task) || task.scheduleRunId || task.workflowRunId ||
    task.status === "failed" && /stopped by you/i.test(task.error??"")) return;
  const trace = buildTrace(task);
  if (!trace || task.log.some(v => v.includes("harness_variant ::"))) return;
  await proposeHarnessFromTrace(task.ownerEmail,
    classifyHarnessDomain(task.userPrompt??task.prompt), trace).catch(() => {});
}

/** Sequential Propose–Probe–Compose: refine an earlier tested variant from concrete evidence. */
export async function refineHarnessFromEvidence(owner: string, id: string) {
  const parent = await getHarnessVariant(owner,id);
  if (!parent || !parent.evidence)
    throw new Error("Evaluate an earlier candidate before refining it");
  const evidence = parent.evidence;
  const trace = [
    "Improve the earlier generic hint, without changing security policies.",
    "Current dimension: "+parent.dimension, "Current hint:\n"+parent.guidance,
    "Evidence: "+JSON.stringify({ reason: evidence.reason,
      cases: evidence.cases.map(c=>({id:c.caseId, pass:c.candidatePass, before:c.basePass})) }),
  ].join("\n").slice(0,2500);
  const existing = await listHarnessVariants(owner);
  if (existing.filter(v=>Date.parse(v.createdAt)>Date.now()-86400000).length>=MAX_REFINEMENTS_PER_DAY)
    throw new Error("Daily improvement budget exceeded");
  const output = await callRuntimeModel({query:
    "Reply ONLY with JSON {title,dimension,guidance,rationale}. Keep dimension="+parent.dimension+
    ". Propose a safer, more effective bounded hint for synthetic, read-only comparisons."+
    " No permissions, credentials, scripts, system prompt overrides or URLs.\n"+trace,
    user: "harness-refiner-"+parent.id, signal:AbortSignal.timeout(45_000),
    modelSelector:process.env.PROJECT_AGENT_HARNESS_IMPROVER_MODEL || undefined});
  const proposal = parse(output.answer);
  if(proposal.dimension!==parent.dimension) throw new Error("Refinement cannot change component type");
  return createHarnessVariant(owner,{ ...proposal, domain:parent.domain, baselineId:parent.id});
}
