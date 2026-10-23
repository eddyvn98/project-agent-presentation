# Project Agent Presentation Lab

Portable React presentation components for agent chat responses. This is a presentation-only extraction: no model/provider integrations, runtime, credentials, private prompts, or customer data. All content in `demo/` and `public/demo/` is synthetic.

## Integration

The optional `ProjectAgentAnswer` entry point supplies Markdown, GFM, inline/display KaTeX and presentation styles:

```tsx
import { ProjectAgentAnswer } from "./src";

<ProjectAgentAnswer
  markdown={answer}
  sources={sources}
  resolveImage={resolveImage}
  images={{
    "outputs/figure.png": {
      size: "inline", // or "reference" (default)
      caption: "A short explanation of what to notice.",
      source: { url: "https://example.com/figure", label: "Supplied source" },
    },
  }}
/>
```

Existing component-map exports, source/file interfaces, reply/form contexts and `agent-ui`/`agent-doc` fences remain supported. The third argument to `createProjectAgentMarkdownComponents(sources, resolveImage, images)` is optional. Existing hosts that keep their own ReactMarkdown instance should import `src/components/presentation.css`, apply `agent-answer` to the surrounding element, and configure `remark-math` plus `rehype-katex` as in `ProjectAgentAnswer.tsx`. Import `katex/dist/katex.min.css` once. The host still supplies Tailwind CSS; include `src/` in its source scanning. The demo uses Tailwind 4; the existing component utilities also work in Tailwind 3 hosts.

The `@/` alias maps to `src/`, as before. Next/React peer dependencies and the existing file URL resolver remain unchanged. Relative task images can resolve through the host's authenticated file adapter. Metadata keys use the original Markdown image path, before resolution. Size metadata is supplied by the host; the renderer never guesses a source or scientific meaning from an image.

## Presentation behavior

- Short opening paragraph, readable line length, heading hierarchy and whitespace. The renderer preserves paragraph/visual order rather than moving figures into a gallery.
- Inline illustrations cap at 18rem wide / 12rem tall; reference figures cap at 42rem / 24rem. Both shrink within the chat column. Captions and attribution stay beneath their figure. Broken images retain captions and explanatory alt text.
- Image dialogs provide 100–400% zoom, reset, scroll, Escape, focus containment and focus return. Linked Markdown images use the enlargement action without nested links/buttons.
- Explorer previews fit the column with readable HTML labels below the scene instead of tiny SVG text; enlargement restores spatial text labels on a 1000px canvas and 50–400% zoom. Selector, keyboard slider and previous/next controls work across all eight demo states. Mermaid retains native-width previews and its own zoom dialog; render failures expose an optional source disclosure.
- `$...$` inline and `$$` on separate lines for display math; escape literal currency signs as `\$`. Code spans/fences remain literal. Display math scrolls in a focusable region. Unsupported TeX stays visible; trusted HTML/URL macros are disabled, with expansion and size limits.
- Citation chips open compact, collision-aware popovers. Keyboard activation focuses the source link; Escape/close restores trigger focus. No favicon request or remote image dependency is required.
- Raw HTML is skipped; ReactMarkdown's default URL filtering is retained, with an additional URL check for supplied image/source metadata. No raw-HTML plugin is enabled. Mermaid uses strict security mode.
- Invalid optional blocks and render errors show a quiet failure state instead of an endless loader. Surrounding Markdown remains available. Charts reject mismatched, missing or invalid numeric observations rather than filling them with zero. Genuine zero values are preserved.

`RICH_UI_INSTRUCTIONS` adds guidance for complete surrounding prose, concise captions, optional visuals and avoiding duplicate representations or invented data. Presentation cannot reconstruct an explanation omitted by the author: supply the full explanation in ordinary Markdown. Streaming hosts may defer incomplete fences until closed. No automatic content summarization, data generation, or provider calls are added.

## Run and verify

Requires Node 24+ for the demo/test tools.

```sh
npm ci
npm run demo
npm run typecheck
npm run check:lines
npm test
npm run build:demo
npx playwright install --with-deps chromium
npm run test:e2e
```

The synthetic demo is served at the URL printed by Vite. Browser tests run at desktop (1280×720) and Pixel 7 (393×727) viewports, covering figure sizes, actual zoom dimensions, math, eight-state navigation, Mermaid, citation positioning/focus and failure fallbacks. Component tests cover safe Markdown/TeX, image adapters and strict chart data validation. Every source/demo/test file stays under 300 lines.

For environments with a preinstalled compatible Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium` when running browser tests. The production demo may emit a large-chunk warning from existing rendering dependencies; it is a review fixture, not a deployment bundle. Real content accuracy, source validity and image rights remain the host author's responsibility.

## Agent orchestration and interactive extensions

The rendering package is still **presentation-only**: it does not make model calls, browse sources, fact-check claims, or execute arbitrary code. Host applications may call `planAgentAnswer(userPrompt, audience?)` to obtain deterministic, optional presentation hints, then give those hints to their own agent. Use `validateAgentAnswer(markdown, sources)` before publishing to detect malformed `agent-ui` blocks, unsafe source URLs and unclosed fences. This is **structural validation**, not verification of factual claims or evidence.

The `interactive` block accepts 1–4 labeled numeric sliders and 1–4 outputs. Expressions are a bounded JSON tree of numbers, `{"var":"parameter_id"}`, or `{"op":"add|sub|mul|div|pow|min|max","args":[...]}`. No JavaScript, eval, HTML, URL, arbitrary callback or network access is supported. An optional `plot` declares an x-axis parameter and expression. The UI supports a responsive graph and accessible data table; invalid expressions and non-finite results fall back gracefully. Supply all model assumptions explicitly, and do not invent values.

```tsx
import { ProjectAgentAnswer, planAgentAnswer, validateAgentAnswer } from "./src";
const hints = planAgentAnswer("Explain phases of the Moon to a sixth grader");
const report = validateAgentAnswer(answerMarkdown, sources);
// Only publish once your host has independently checked facts and citations.
<ProjectAgentAnswer markdown={answerMarkdown} presentation streaming={isStreaming} />
```

`presentation` is opt-in: readers can switch between a complete answer and sections split at H2 headings, navigate with ArrowLeft/ArrowRight/PageUp/PageDown, enlarge fullscreen, and print the entire answer (browser Print → Save as PDF). The non-presentation view and existing component exports remain the default. `streaming` prevents partially received fenced visuals from corrupting the readable answer. No automatic PPTX export is provided.

## Security and quality gates

The exact runtime dependency upgrades are held in `.github/workflows/upgrade-deps-once.yml`, which should regenerate `package-lock.json` with npm on a networked Node 24 runner and commit the lockfile **only if** production audit, typecheck, unit tests, demo build, and Chromium browser tests pass. This workflow is one-time infrastructure, not proof the security upgrade has completed. Do not merge until the branch includes a verified lockfile and the CI results are green.

Run `npm audit --omit=dev`, `npm run typecheck`, `npm run check:lines`, `npm test`, `npm run build:demo` and `npm run test:e2e` after dependency changes. Test equations, Mermaid diagrams, Prism highlighting, responsive visual sizing and stream fallback on mobile and desktop.
