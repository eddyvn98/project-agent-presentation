export { projectAgentMarkdownComponents, createProjectAgentMarkdownComponents, normalizeProjectAgentMarkdown } from "./components/ProjectAgentMarkdown";
export { ProjectAgentRichBlock } from "./components/ProjectAgentRichBlocks";
export { ProjectAgentSourceLink } from "./components/ProjectAgentSourceLink";
export { ProjectAgentZoomImage } from "./components/ProjectAgentZoomImage";
export { parseRichUiBlock, extractAskBlock, RICH_UI_INSTRUCTIONS, type RichUiBlock } from "./lib/project-agent/rich-ui";
export { inlinedImageNames, resolveInlineImage } from "./components/projectAgentInlineImages";
export type { ProjectAgentTaskFile, ProjectAgentTaskSource } from "./lib/project-agent/types";

export { ProjectAgentAnswer } from "./components/ProjectAgentAnswer";
export type { ImagePresentation } from "./components/ProjectAgentFigure";

export { planAgentAnswer } from "./lib/project-agent/answer-plan";
export type { AnswerPlan, AnswerIntent, AnswerVisual, AnswerAudience } from "./lib/project-agent/answer-plan";
export { validateAgentAnswer } from "./lib/project-agent/answer-validation";
export type { ValidationReport, ValidationIssue } from "./lib/project-agent/answer-validation";
export { parseInteractiveModel, evaluateExpression } from "./lib/project-agent/interactive-model";
export type { InteractiveModel, NumericExpression } from "./lib/project-agent/interactive-model";
export { splitPresentationSections, completedStreamingMarkdown } from "./lib/project-agent/presentation-mode";

export { containsMathMarkdown } from "./lib/project-agent/math-detection";
export { createAgentPresentationContext, reviewAgentPresentation } from "./lib/project-agent/agent-integration";
export type { AgentPresentationContext, AgentPresentationReview } from "./lib/project-agent/agent-integration";
