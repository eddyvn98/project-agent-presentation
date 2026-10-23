# Response UI scope: ChatGPT-web-inspired reading experience

## Scope agreed with the user

Work only in `eddyvn98/project-agent-presentation`, on `gpt/presentation-upgrade`.
The target is the **assistant response**, not ChatGPT Projects as a whole.
Do not change Project Home, sidebar, composer, authentication, agent harness,
provider integration, workspace persistence, or any other repository.
Keep `main` unchanged. Do not run CI; commits in this pass carry `[skip ci]`.

The public reference is a response-reading and interaction model, not a claim
of pixel-for-pixel parity with every ChatGPT release or an OpenAI affiliation.
OpenAI describes inline citation previews and a Sources control at the end of
responses in its public help documentation:
https://help.openai.com/en/articles/9237897-chatgpt-search
Reference consulted: 2026-10-23.

## Reading and interaction rules

- Keep the explanation as ordinary readable prose. Preserve headings, code,
  tables, inline/display math, figures and captions in their original order.
- Do not display a presentation or document-editor toolbar by default.
  Slides remain opt-in through the existing `presentation` prop. The answer
  demo now requires `/?presentation=1`; `/` is the normal reading view.
- Keep Copy, feedback, read-aloud and retry close to the response when supported.
  Put secondary branch/save/share actions in More rather than a long icon row.
- Never invent a working retry, share, feedback or save integration. Existing
  callbacks remain the sole authority for external actions; unsupported actions
  and empty More disclosures remain absent.
- Keep Copy and Expand in code headers. Move wrap, line numbers and download
  into More code actions. Preserve existing Edit/Preview callbacks and code
  state; this is not a new editor implementation.
- Collapse Sources into a small pill. Host initials are derived locally from
  safe supplied URLs; they are not publisher logos. Do not fetch remote favicons.
- Preserve hover citation previews, keyboard focus behavior, full source text,
  link safety, dark theme and fullscreen support already present on the branch.
- All layout styles stay within response/component selectors. No global shell
  styling and no forced auto-scroll are introduced.

## Changed component contract

Public `ProjectAgentAnswer`, `AnswerActionHandlers`, code save/preview and source
props remain compatible. Their opt-in flags and callback signatures are unchanged.
`ProjectAgentMoreActions` is an internal accessible disclosure using the already
installed Radix Popover. It supports normal Tab navigation, arrow/Home/End focus
movement, Escape dismissal, and native disabled controls. It retains host color
tokens when rendered in a portal. No new production dependencies are introduced.

## Acceptance checks for a local agent

1. In `/`, response text, images, math and citations render without a slide bar.
   In `/?presentation=1`, existing slide navigation remains available.
2. With no host callbacks, Copy is available but fake retry/save/share buttons
   and an empty More button are absent.
3. Open More by keyboard. Arrow keys skip disabled entries; Escape closes the
   disclosure and returns focus. Open it on mobile without pointer hover.
4. Save/share errors are shown as errors, not successful actions. Replacing an
   answer must not apply stale callback results to the new response.
5. Code copy, expansion, Edit/Preview, wrap and line numbers still work; streaming
   code cannot be downloaded as though it were complete.
6. Sources remain collapsed initially. Opening them preserves supplied titles,
   URLs, dates and excerpts, with no additional remote icon requests.
7. Check 320px/393px/mobile and desktop widths, light/dark themes, keyboard-only
   use and fullscreen code dialogs; no page-wide horizontal overflow.
8. Run typecheck, unit tests, browser tests and line limits locally before merge.
   Do not reuse earlier green runs as verification of this change.

## Verification status

This pass adds `tests/response-controls.test.tsx` and updates browser acceptance
for the default reply view. CI, full typecheck, unit tests, build and browser
regression were **not run** in this pass. An isolated TypeScript syntax check of
the new disclosure source is not a substitute for those checks or a visual review.
No measured performance change or complete ChatGPT feature parity is claimed.
