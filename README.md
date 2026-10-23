# Project Agent Presentation Lab

Portable React components for presenting agent conversations and rich answers. The package provides answer typography, message surfaces, streaming presentation, citations, images, tables, code, writing blocks, and optional interactive content.

This repository is **presentation-only**. The host owns conversations, model calls, tools, storage, authentication, permissions, and external actions. The upgrade stays on `gpt/presentation-upgrade`; it does not implement a full Project app or modify another repository. All content in `demo/` and `public/demo/` is synthetic.

**Verification status:** the current UX upgrade has not been tested or built in this task. No typecheck, test suite, browser tests, build, dependency installation, or CI was run. A local agent will perform the handoff in [docs/LOCAL_REVIEW.md](docs/LOCAL_REVIEW.md). Earlier test results do not establish the status of these changes.

## Start here

- [Presentation behavior, integration examples, and host contracts](docs/PRESENTATION_UX.md)
- [Local verification handoff and acceptance scenarios](docs/LOCAL_REVIEW.md)
- [Public exports](src/index.ts)

The UX target is the observable response experience described in current public ChatGPT documentation: readable prose, useful visuals near their explanation, compact sources, progressive rendering, and interactive writing/code surfaces. It is an independent implementation, with no claim of exact visual equivalence or a measured parity percentage.

## Minimal integration

```tsx
import { ProjectAgentAnswer } from "./src";

<ProjectAgentAnswer
  id="answer-42"
  markdown={answerMarkdown}
  status={responseState}
  sources={verifiedSources}
  actions
  showSources
  outline
  resolveImage={resolveImage}
  images={{
    "outputs/figure.png": {
      size: "inline",
      caption: "A short explanation of what to notice.",
      width: 900,
      height: 500,
      source: { url: "https://example.com/figure", label: "Supplied source" },
    },
  }}
/>
```

The variables above come from the host. `status` is `complete`, `streaming`, `stopped`, or `error`; the default is `complete`. `actions` enables built-in copying. Regeneration, branching, saving, sharing, read-aloud, feedback, quoting, and editing appear only when their required host callbacks are supplied. See the integration guide before connecting these effects.

`ProjectAgentMessage` adds user/assistant presentation, optional user-message editing and response-version navigation. `ProjectAgentTranscript` supplies a bounded scroll surface that follows new output while the reader stays near the bottom, with a **Jump to latest** action after the reader scrolls upward. Neither component creates or stores a conversation.

## Included surfaces

| Surface | Behavior |
| --- | --- |
| Prose and Markdown | GFM, headings, lists, blockquotes, readable line length, optional outline, descriptive links, safe raw-HTML handling |
| Streaming | Ordinary code remains readable as it arrives; incomplete structured visuals and writing fences wait for closure; host-supplied stopped/error states preserve available prose |
| Sources | Delayed desktop hover previews, click/keyboard/touch citation popovers, supplied publication dates/excerpts, and an optional expandable source list |
| Images and diagrams | Inline/reference sizing, captions, attribution, enlarged views, zoom/reset, native-size diagram exploration and graceful unavailable states |
| Math | Lazy inline/display KaTeX, scrollable wide formulas, literal currency/code handling, source notation fallback |
| Tables and charts | Table enlargement, horizontal navigation, TSV copy, CSV download; charts can show their supplied data and export a PNG where supported |
| Code | Language label, plain-text handling, wrapping, line numbers, long-snippet disclosure, copy/download, enlargement, optional host-confirmed edits and host-rendered previews |
| Writing | Visible document title, complete inline text, expanded reader, copy/download, optional host-confirmed Markdown editing and preview |
| Actions and interaction | Copy, callback-backed response actions, selected-text quoting, forms, follow-ups, quizzes, bounded numeric explorers |
| Presentation mode | Optional H2-based sections, keyboard navigation, browser fullscreen and printing of the complete answer |

The renderer preserves content order. It does not summarize the answer, invent chart observations, retrieve citations, or generate missing explanatory prose. Keep the explanation complete in ordinary Markdown when adding optional visuals.

## Host setup

- Configure the existing `@/` alias to point to `src/` when consuming these source files.
- Supply the existing React/React DOM/Next peer environment and Tailwind processing. Include this package's `src/` files in Tailwind source scanning. The demo uses Tailwind 4; the components retain the existing host utility-class integration.
- `ProjectAgentAnswer` imports its presentation styles. Direct component users should include `src/components/presentation.css`; component-specific styles are imported by their components.
- Custom ReactMarkdown hosts should use `ProjectAgentMarkdownProvider` with the stable `projectAgentMarkdownComponents` map. Metadata and callback updates then do not replace every Markdown component type. Memoize the legacy factory's result when retaining that integration.
- Math loads its own renderer and KaTeX CSS on demand. A host that uses its own ReactMarkdown pipeline must configure `remark-math`, `rehype-katex`, and the KaTeX stylesheet itself.
- Image metadata is keyed by the original Markdown path, before `resolveImage` runs. The host resolves authenticated/local file URLs and controls access.
- Existing component maps, file/source interfaces, `agent-ui` and `agent-doc` fences remain available. The optional fourth argument of `createProjectAgentMarkdownComponents` configures newer presentation behavior; existing calls remain supported.

## Local demo

Use Node 24 or newer for the demo and existing verification tools.

```sh
npm ci
npm run demo
```

These are instructions for the local agent; they were not executed for this upgrade.

| Route | Fixture |
| --- | --- |
| `/` | Rich answer with prose, math, figures, sources, diagrams, and presentation controls |
| `/?chat=1` | Conversation presentation with explicit synthetic complete/streaming/stopped/error controls and local callback examples |
| `/?plain=1` | Prose-only answer for checking ordinary rendering and deferred math loading |
| `/?chart=1` | Rich answer plus a synthetic chart and data/export controls |

The conversation replay reveals supplied text incrementally. It is not a model response or a network workflow. Demo edits and interactions are local examples, not persistence guarantees.

## Optional agent integration

`createAgentPresentationContext(prompt, { audience, includeVisualSchema })` returns deterministic presentation hints for a host's own agent. `reviewAgentPresentation(markdown, sources, streaming)` and `validateAgentAnswer` check supported structure. They do **not** verify facts, source authenticity, numerical assumptions, or actual link contents.

`agent-ui` includes callouts, comparisons, steps, charts, KPIs, progress, explorers, forms, follow-ups, quizzes, and bounded numeric interactive models. Interactive expressions use a constrained JSON expression tree; this package does not execute arbitrary JavaScript or Python. See the exported schema/instructions in [rich-ui.ts](src/lib/project-agent/rich-ui.ts).

## Performance and dependency history

Charts, math formatting, Mermaid, and syntax highlighting use deferred modules. Math adds plugins to the existing Markdown tree; readable notation remains available while those plugins load, with retry on a loading failure. Mermaid waits until a diagram approaches the viewport before rendering; the enlarged view can activate it immediately. `npm run report:bundle` inspects a previously built demo and detects the chart renderer returning to the entry bundle. Current bundle sizes have not been measured in this task.

The earlier README recorded dependency remediation at commit `65275ff`, including 39 unit tests, 18 browser tests, and a production audit with zero reported vulnerabilities. Those results are historical. The current lockfile retains the scoped KaTeX overrides and dependency versions; review the present checkout using the local handoff rather than treating historical results as current verification.

## Public UX references

- [GPT-6 and Intelligent UI for everyone](https://openai.com/index/gpt-6-for-everyone/) — question-dependent text, visuals, interactive elements, and progressive presentation.
- [Writing blocks and code blocks in ChatGPT](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt) — reusable drafts, copying, editing, supported previews, and expanded views.
- [Searching the web with ChatGPT](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt) — citations, source previews, and source lists.
- [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) — inline images near relevant prose, enlargement, and attribution.

These references inform interaction choices. They do not imply access to ChatGPT's private renderer, models, persistence, or runtime.
