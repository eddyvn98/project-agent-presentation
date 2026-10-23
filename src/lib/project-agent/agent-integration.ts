import { planAgentAnswer, type AnswerAudience, type AnswerPlan } from "./answer-plan";
import { validateAgentAnswer, type ValidationReport } from "./answer-validation";
import { completedStreamingMarkdown } from "./presentation-mode";
import { RICH_UI_INSTRUCTIONS } from "./rich-ui";
import type { ProjectAgentTaskSource } from "./types";

export interface AgentPresentationContext {
  plan: AnswerPlan;
  /** Host can add this to its own model instructions. It makes no model calls. */
  instructions: string;
}
export interface AgentPresentationReview {
  readyToPublish: boolean;
  report: ValidationReport;
  /** In streaming mode, only fully closed Markdown fences are published. */
  completedMarkdown: string;
  pending: boolean;
}

/** Provider-agnostic handoff: a chat host decides whether to enable visual guidance. */
export function createAgentPresentationContext(prompt: string, options: {
  audience?: AnswerAudience;
  includeVisualSchema?: boolean;
} = {}): AgentPresentationContext {
  const plan = planAgentAnswer(prompt, options.audience);
  const instructions = [
    ...plan.instructions,
    "Use the user's language and be accurate about assumptions and missing information.",
    "Visuals never replace explanatory prose. Do not invent numbers, sources or images.",
    ...(options.includeVisualSchema && plan.visual !== "none" ? [RICH_UI_INSTRUCTIONS] : []),
  ].join("\n");
  return { plan, instructions };
}

/**
 * Structural review for the host's final answer. This never certifies factual
 * correctness, citation support, external links, or source authenticity.
 */
export function reviewAgentPresentation(markdown: string,
  sources: ProjectAgentTaskSource[] = [], streaming = false): AgentPresentationReview {
  const completion = streaming
    ? completedStreamingMarkdown(markdown) : { text: markdown, pending: false };
  const report = validateAgentAnswer(completion.text, sources);
  return {
    readyToPublish: report.valid && !completion.pending && completion.text.trim().length > 0,
    report, completedMarkdown: completion.text, pending: completion.pending,
  };
}
