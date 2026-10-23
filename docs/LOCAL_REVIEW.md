# Local review handoff

## Status and scope

The current presentation UX upgrade is on `gpt/presentation-upgrade` in `eddyvn98/project-agent-presentation`.

**No tests, typecheck, browser run, build, dependency installation, or CI were executed for this task.** This checklist is pending work for the local agent. Source review and implementation are not evidence that these checks pass. Historical test/audit results in repository history apply only to their original commits.

Stay within this repository and branch. Do not merge into `main` or change another application's backend as part of this handoff. Commit with `[skip ci]` if the user's no-CI instruction remains active. Record the exact commit reviewed, environment, commands actually run, failures, repairs, and remaining limits.

## Local commands

Use Node 24 or newer and the committed lockfile:

```sh
git switch gpt/presentation-upgrade
git pull --ff-only
npm ci
npm run typecheck
npm run check:lines
npm test
npm run build:demo
npm run report:bundle
```

Then run the browser suite with a compatible Chromium:

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

If Chromium is already available, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium`. If port 4173 is occupied, choose an unused port, for example:

```sh
PLAYWRIGHT_PORT=4181 npm run test:e2e
```

Playwright starts its own Vite server with `--strictPort` and does not reuse an existing server. Do not accidentally review a different application on an occupied port. The existing line check covers `src`, `demo`, and `tests`, and requires each matching source file to remain below 300 lines.

An audit is appropriate if dependencies are changed locally. Report its current results separately from historical audit results. Do not weaken tests solely to hide an error; update outdated expectations when the intended presentation contract has changed, then cover the new behavior.

## Demo routes

Run `npm run demo` and use the URL Vite prints:

| Route | Review purpose |
| --- | --- |
| `/` | Rich answer, hierarchy, media, citations, math, diagrams and presentation controls |
| `/?chat=1` | User/assistant messages, synthetic streaming replay, stopped/error states, progress, quote action, version navigation and demo callbacks |
| `/?plain=1` | Plain answer and deferred math/chart loading |
| `/?chart=1` | Synthetic chart, table view and exports |

All fixtures are synthetic. The conversation replay slices a fixed answer; its status controls do not test an actual provider or backend. Demo callback state is local. The conversation includes a JSON card preview implemented with escaped React text, plus local writing/code saves; review other preview adapters separately in the host.

The existing delayed-math browser scenario was updated to assert that controls remain usable and keep their selection while math plugins load. The older `inert` expectation no longer represents the intended behavior. This updated scenario has not been executed.

## Acceptance coverage

### A. Prose, links and theme

- Read a short answer and a long answer in both light and dark themes. Check heading hierarchy, lists, nested blockquotes, footnotes, line length, whitespace, inline code and literal currency.
- Inspect at narrow mobile width, normal desktop width and 200% browser zoom. The page must not overflow horizontally because of an image, long URL, code line, table or formula.
- Confirm descriptive external links remain ordinary links in `links="auto"`, while matching source links expose citation controls. Review the legacy `links="citations"` mode separately.
- Check repeated headings and multiple answers: outline links must identify the correct answer and heading. Headings inside fenced code must not enter the outline.
- Check custom theme variables and portal content, including dialogs/popovers opened while presentation fullscreen is active.

### B. Streaming and conversation scrolling

- Replay the conversation fixture. Ordinary prose and ordinary code should become readable incrementally; incomplete structured JSON/document/diagram fences should not flash as broken widgets.
- Stop and fail the response in the middle of prose, code, a structured fence, and its opening line. Keep the readable prefix; show the real supplied status; do not leave an endless loading state.
- Scroll upward during replay and while an image/math block changes height. The viewport should stay under reader control. **Jump to latest** should resume following.
- Change `conversationKey` and check initial scroll behavior. Confirm the transcript has a bounded parent height and keyboard scrolling works.
- Check that status announcements remain concise rather than reading every streamed token. No fake tool events or model activity should appear.

### C. Response and message actions

- Copy a user message, response, code block and writing block. Check actual clipboard text, success feedback, blocked clipboard APIs and denied permissions.
- With callbacks absent, only built-in actions should be offered. No retry/branch/share/save/read-aloud/feedback action may pretend it has a backend.
- For each callback-backed action, review resolve, reject and slow-promise states. Prevent accidental duplicate submissions and surface errors.
- Edit a user message; cancel and save; reject a save; use Ctrl/Cmd+Enter and an IME composition sequence. The host must update the source only when accepted.
- Navigate valid response versions, check disabled ends and rejected/slow version callbacks. Labels are one-based for readers; callbacks receive zero-based indices.
- Switch between response versions with identical text but different identities. Drafts, form answers and pending actions must stay associated with the selected version rather than leaking into another one.
- Select text in an answer and use the quote action. Check keyboard focus, viewport edges and dismissal. Selection should not automatically send a message or capture unrelated fields.

### D. Sources, images and dialogs

- Open source chips with keyboard and touch. Confirm title, domain, supplied excerpt/date, source navigation, Escape, focus return and collision handling at viewport edges.
- Hover a chip using a mouse, cross the gap into the preview and leave it again. Check delayed open/close, no passive focus movement, click-to-pin, and cancellation when the source URL changes or the component unmounts.
- Expand/collapse the source list. Review duplicates, unsafe URLs, empty metadata and long excerpts. No network-generated excerpt or date should be invented.
- Inspect inline/reference images with and without dimensions, captions and attribution. Break an image URL and confirm meaningful fallback text survives.
- Enlarge images and diagrams, zoom/reset, pan by scrolling and use keyboard controls. All labels and image edges must remain reachable.
- Tab through each dialog; focus must remain inside and return sensibly on close. Open nested overlays from enlarged content and from browser fullscreen.

### E. Tables and charts

- Review a wide table on mobile, horizontal scroll hints/buttons, enlarged view, alignment, headings and long cell text.
- Copy TSV and download CSV. Inspect delimiters, quotes, embedded newlines, Unicode, empty cells, negative numbers and values starting like spreadsheet formulas. Preserve actual values; formula-like strings should remain text on import.
- Switch charts to their supplied data table. Check zero values, negative observations, mismatched lengths, non-finite/extreme values and invalid pie data. Do not silently replace missing values with zero.
- Copy/download a chart PNG where supported; inspect the actual image, title and legend. Review unsupported clipboard/image-export paths and errors.

### F. Code blocks and host previews

- Review highlighted code, unknown languages, plain text/logs, long lines and long snippets. Wrapping, line numbers, disclosure and enlargement must retain the original code text.
- Inspect downloaded filenames/extensions and clipboard contents. Streaming code must not offer premature saving/preview actions.
- Supply an `onSave` adapter and exercise unchanged, changed, rejected, slow and conflicting code edits. Confirm discard handling and source preservation.
- Supply a trusted `renderPreview` adapter. Review Code/Preview keyboard tab navigation, null/unsupported returns, thrown render errors and suspended/loading previews. Returning to Code must always be possible.
- Confirm this package never executes supplied HTML, JavaScript or Python by itself. A host preview must apply the host's own isolation and permissions.

### G. Writing blocks

- Check visible titles, untitled drafts, heading-derived titles, empty input, long text and the expanded reader. Inline prose should not become a small nested scrolling box.
- Without `onSave`, no edit action should appear. With an adapter, review title/body editing, Markdown preview, save/cancel/reset and keyboard shortcuts.
- Reject and delay saves. Keep the draft retryable and report success only after acceptance. Change the source while editing; retain the draft and identify the conflict.
- Close and reopen an unsaved writing draft while it remains mounted; review focus return and clear state. Confirm nothing claims persistence after unmount or page refresh.
- Save an empty title and a body with code fences, links and raw HTML. Raw HTML must not execute. Omit an empty optional `title:` header when the host serializes a replacement.
- Open the same writing content inline, expanded and in preview. Heading and footnote IDs must stay scoped; nested writing/code fences must not receive outer save callbacks.

### H. Interactive blocks and failure isolation

- Exercise explorer steps, slider bounds, previous/next controls, all fixture states and enlarged labels on mobile.
- Review forms, optional questions, cleared choices, copy fallback without a reply provider, successful submission, rejection and duplicate-submit handling.
- Review suggested follow-ups with and without `ProjectAgentReplyProvider`. Controls must truthfully reflect unavailable, pending, sent and failed states.
- Review quiz feedback and reset behavior. Check bounded numeric models with invalid expressions and non-finite output.
- Force an optional renderer/preview failure. The surrounding explanation and original source must remain available; avoid a stuck loader or a blank answer.

### I. Performance, accessibility and presentation mode

- Inspect initial and on-demand network chunks for plain, math, chart and Mermaid routes; run the bundle report after building. Record measured sizes rather than quoting an old baseline.
- Change source metadata/callback identities while streaming and introduce the first math expression after interacting with an earlier widget. Check that the stable Markdown renderer preserves existing widget state. Reject a math-plugin load and exercise its retry action.
- Use keyboard-only navigation, reduced motion, touch interaction and a screen reader where available. Check labels, focus indicators, live feedback, disabled controls and readable contrast.
- Enter presentation mode, navigate sections, use fullscreen, exit and print. Printing should include the complete answer rather than only the selected section.
- Confirm presentation shortcuts do not steal arrows from inputs, code regions, dialogs or interactive sliders.

## Record the result

Report the exact commit, what actually passed, failures repaired, and any scenario not exercised. Include useful screenshots only after running the UI, and link them to the relevant scenario. Distinguish renderer verification from a host integration test and a real model/tool workflow. Do not report pixel-perfect ChatGPT parity or an unmeasured percentage.
