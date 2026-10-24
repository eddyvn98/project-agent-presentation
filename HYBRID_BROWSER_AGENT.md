# Hybrid Browser Agent implementation (2026-10-24)

Branch: `gpt/full-project-agent`. This is a code-only delivery; real Chromium testing, CI, full app build, signed-in QA and deployment are intentionally deferred at the user's request.

## Browser strategy

- DOM-first: current Playwright snapshots and refs remain the default fast path. Failed element lookups/locators now return both a refreshed DOM snapshot and an image observation for recovery, where possible.
- Visual fallback: `visual_observe` attaches a fresh viewport image and one-time frame ID. The model may inspect the image and issue `visual_click` with normalized x/y bound to that exact frame. `visual_type` enters text into a focused ordinary non-sensitive input; it cannot submit.
- A visual frame is short-lived (30 seconds), page/URL/scroll-bound, invalidated by the next non-visual browser action and consumed by visual clicks. The model must observe again after changes.
- Captcha, sensitive fields and recognizable high-impact controls are not eligible for coordinate fallback. DOM-based authorized flows and human assistance are still distinct. There is no pixel-click bypass of confirmation policy.
- A visual model observation consumes a model round; automatic means the fallback observation is produced after eligible locator failures, not that the app predicts click coordinates without a model. No fake mouse animation is added.

## Browser Watch

- Opt-in viewer now retains a bounded RAM-only history of up to 12 masked step images and 4 MiB total. Images can be fetched with `?image=1&sequence=N` only by the initiating authenticated user. Sequence validation rejects negative/noninteger values.
- The latest shot, selected prior screenshot, action label and normalized click marker display in the existing right-side Browser Preview. Agent DOM clicks, visual clicks and human clicks can include markers. Screenshots are not videos.
- History is deleted on stop-watching and subject to the existing five-minute inactivity expiration. No changes were made to the existing Live Preview used for generated apps.
- Existing owner takeover and handback mechanics are retained. User control works only on the most recent page state, not a prior history frame.

## Validation explicitly deferred

Do not describe these changes as verified in a real browser until completing a signed-in sandbox smoke test, unit and API regressions, Next.js typecheck/build, UI desktop/mobile test, CAPTCHA/sensitive-control rejection, frame expiry/scroll mismatch, same-user takeover, and multiworker deployment topology checks. The in-memory preview requires the host request route and task runner to share a process. Ordinary Dify mode does not have the app-hosted Playwright browser.

No main/staging merge, no CI runs, no host deployment.
