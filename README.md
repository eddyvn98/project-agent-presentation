# Project Agent Presentation Lab

Portable React presentation components plus a neutral source snapshot of a full Project Agent integration. This branch adds the host UI, API routes, agent runtime, and focused tests; see [the source map](PROJECT_AGENT_SOURCE_MAP.md). Host authentication, database, storage, Dify, and sandbox services remain integration boundaries. No credentials or customer data belong in this repository. All content in `demo/` and `public/demo/` is synthetic.

**P7 acceptance:** [QA status / production gates](P7_STATUS.md) · [Closeout runbook](P7_CLOSEOUT_QA.md) · [P7.6.2 multi-worker QA](P7_6_2_MULTIWORKER_QA.md) · [P7.6.3 security review](P7_6_3_SECURITY_REVIEW.md). P7 local integration closed with operator-reported 67/67 regression PASS; production release gates remain open.

**P8 development:** [Implementation, scope and feature flags](P8_ROADMAP.md) ·
[isolated QA commands](P8_LOCAL_QA.md). Browser loop checker, hard budget,
human escalation/handback timeline, owner-only Watch telemetry and 30-day
numeric metrics are opt-in; the 40-case Chromium benchmark is opt-in too.
These source changes require local host QA. No P8 production acceptance is
implied.

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

## P7 signed-in host acceptance (separate from demo)

Run the optional `npm run check:host:p7` and `npm run test:host:p7` commands only against an isolated AI-WEB-CHAT QA host with explicitly supplied Playwright login state. See [P7_HOST_E2E_HANDOFF.md](P7_HOST_E2E_HANDOFF.md) for environment flags and expected evidence. Read-only security/UI assertions run by default; synthetic task creation, calculator execution and browser takeover require separate opt-ins. The neutral snapshot does not provide host authentication or Dify/Mongo services. Never commit QA cookies or screenshots containing personal data.

## P7.2–P7.5 integrated QA

See [P7_INTEGRATED_LOCAL_HANDOFF.md](P7_INTEGRATED_LOCAL_HANDOFF.md) for authenticated synthetic Chromium Watch/Takeover, host SSO preflight, QA bootstrap/cleanup, and concurrent task idempotency. These test endpoints require nonproduction synthetic credentials and do not enable localhost navigation in the browser's public-network guard.
