export interface SkillCatalogEntry { id: string; name: string; category: string;
  description: string; instructions: string }
export const SAFE_AGENT_SKILL_CATALOG: SkillCatalogEntry[] = [
  { id: "source-audit", name: "Source verification", category: "Research",
    description: "Cross-check changing facts and cite primary sources.",
    instructions: "Use official primary sources for time-sensitive claims. Distinguish confirmed facts, assumptions and unavailable evidence. Cite each externally verified claim; never invent a URL or claim a page was opened when no tool read it." },
  { id: "document-qa", name: "Document delivery QA", category: "Documents",
    description: "Verify rendered pages before reporting success.",
    instructions: "For a created document, confirm the output file exists and is nonempty, render representative pages, inspect overflow and font substitution, and check explicit user requirements. If tooling is unavailable, disclose unverified portions." },
  { id: "browser-resilience", name: "Browser task recovery", category: "Browser",
    description: "Prefer stable DOM refs and bounded retries.",
    instructions: "For websites, use a fresh DOM snapshot before selecting targets; on stale locators inspect the current DOM and use visual fallback only when needed. Never retry uncertain irreversible actions automatically. Ask the user to take over for CAPTCHA or login." },
  { id: "coding-review", name: "Code change review", category: "Development",
    description: "Minimal diffs, tests and explainable changes.",
    instructions: "Inspect relevant code and existing tests before modifying. Keep each changed source file under project size limits. Verify code paths with focused tests, include failure cases, and state clearly what was not executed." },
  { id: "scheduled-work", name: "Scheduled task safety", category: "Automation",
    description: "Schedule work with explicit permission.",
    instructions: "For recurring tasks confirm frequency, timezone, destination and consent. Never create a schedule only because a request looks repeatable. Keep external actions restricted by owner website grants and approval policies." },
  { id: "project-recap", name: "Project status reports", category: "Business",
    description: "Separate outcomes, blockers, risks and next actions.",
    instructions: "Summarize completed work with verifiable evidence, pending decisions and assigned next steps. Avoid invented progress metrics. Show unresolved assumptions and state when status comes from a report rather than direct inspection." },
  { id: "presentation-qa", name: "Presentation visual QA", category: "Presentation",
    description: "Check slide storytelling and layout.",
    instructions: "Build a clear narrative from objective to evidence to decision. Inspect slide renderings for clipping, alignment, readability, consistent typography and source notes. Do not claim the slide deck was tested without an actual rendering." },
  { id: "workflow-handoff", name: "Workflow handoff", category: "Workflow",
    description: "Make multi-step automation auditable.",
    instructions: "Define success criteria and intermediate outputs for each step. Send only necessary context to downstream steps, require owner approval before high-impact actions and stop when execution state is uncertain." },
];
export function skillCatalogEntry(id: string) {
  return SAFE_AGENT_SKILL_CATALOG.find(skill => skill.id === id) ?? null;
}
