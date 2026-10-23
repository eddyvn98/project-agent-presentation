import type { ProjectAgentTaskSource } from "../src/lib/project-agent/types";

export const chatSources: ProjectAgentTaskSource[] = [{
  url: "https://example.com/presentation-guide", title: "Synthetic presentation guide",
  sourceType: "page", fetchedAt: "2026-10-23T00:00:00Z", publishedAt: "2026-10-23",
  excerpt: "This example metadata exists solely to demonstrate source presentation. It is not evidence for a real claim.",
}];

export const documentFixture = "title: Review note\n## Presentation review\n\nThe example response is ready for a local review.\n\n- Read the complete explanation.\n- Inspect the table and code.\n- Check the original source before reusing a claim.";

export const chatAnswer = `The answer is easier to use when the explanation stays readable and the extra controls appear beside the content they affect. This conversation uses **synthetic content** to demonstrate that behavior.

## Keep the explanation together

The user can scan the result, open a source, or select a passage to ask a follow-up. The [synthetic reference](https://example.com/presentation-guide) includes a supplied excerpt. An ordinary [descriptive link](https://example.com/navigation) keeps its readable label.[^demo]

![A synthetic reference figure](/demo/reference.svg)

## Compare the supplied values

The following numbers are invented for this UI demonstration. They are not benchmark results.

| Example | Before | After | Note |
|:---|---:|---:|:---|
| First scenario | 12 | 18 | A short cell |
| Second scenario | 8 | 11 | A longer explanation that can wrap naturally |
| Third scenario | 20 | 24 | Open the table to inspect every column |

## Inspect and preview the code

The JSON describes a small card. This demo's trusted host preview reads its text fields; it does not execute source. Edit the title, save, and open Preview to inspect the accepted change. Copy and download preserve the source.

\`\`\`json
{
  "title": "Presentation review",
  "status": "Ready for local review",
  "items": ["Read the response", "Inspect the data", "Check the source"]
}
\`\`\`

## Reuse the draft

This draft has a separate copy action. In this demo, saving an edit changes only the local fixture.

\`\`\`agent-doc
${documentFixture}
\`\`\`

## Choose a next step

\`\`\`agent-ui
{"type":"ask","title":"What should this example show next?","questions":[{"question":"Choose a display to inspect","options":["Code","Table","Image"],"multi":false}]}
\`\`\`

[^demo]: This is a synthetic footnote for keyboard navigation. A second message can use the same label without sharing its target.
`;

export const alternativeAnswer = "Here is a shorter **synthetic response variant**. The host owns the selected version and supplies its Markdown.\n\n- Use the controls below to return to the detailed answer.\n- Regenerate replays the fixture; it does not call a model.\n- Feedback is stored only while this demo is open.";
