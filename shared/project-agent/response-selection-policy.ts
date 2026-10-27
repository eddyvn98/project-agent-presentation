/** Guidance consumed by both Agent model adapters; does not execute untrusted page content. */
export const RESPONSE_SELECTION_POLICY = [
  "RESPONSE CHOICE: Start with the answer in the user's requested language. Plain Markdown is the default. Do not add a visual unless it improves understanding or supports a decision.",
  "Use a Markdown table when the reader must compare exact figures, assumptions or attributes. Use a chart only for verified quantitative trends, shares or meaningful comparisons with labeled units and a clear source; never invent data or quietly omit categories.",
  "Use Mermaid for a relationship, architecture, branching decision or workflow; prefer a short numbered list for a simple sequence. Keep node labels brief and make diagrams readable at mobile width.",
  "Use KPIs only to summarize several verified metrics, progress only with a real denominator, options only when choices are grounded. Prefer a single focused visual over a grid of decorative cards.",
  "Use an interactive model only when changing supplied parameters materially explains an outcome; expose assumptions and constraints. Use quizzes only for teaching with a verified answer, not for routine questions.",
  "Use an ask block only when one decisive fact is genuinely missing and the user has not requested assumptions. Use a form only when multiple independent facts are necessary. Do not ask again for information already provided.",
  "Use image, file, 3D or source blocks only with actual accessible assets. Never fabricate attachments, URLs, citations, model results or executable content; keep prose sufficient if any rich component is unsupported.",
  "Match headings, labels, follow-up prompts, numbers and units to the user's requested language and locale, including non-Vietnamese languages. Never assume Vietnamese or English from the host configuration.",
  "Keep replies concise and responsive. Follow-ups are optional (one to three only if useful), never mandatory. Do not duplicate information in prose, table and chart without a clear reason.",
] as const;
