# Human-assisted Browser Preview — 2026-10-24

Branch: gpt/full-project-agent. Builds on VISUAL_BROWSER_WATCH.md. This is a **stepwise Playwright screenshot and controlled handoff**, not WebRTC livestream, remote desktop, interactive DOM iframe or a user's already-signed-in Chrome.

## User workflow

1. In a running sandbox task, click "Open Browser Preview" in the Project Chat. A right-side panel (42vw on desktop; full-width on mobile) appears, with the chat repositioned alongside on desktop.
2. Click "Watch browser" to opt into private screenshots. If the agent is still navigating, the panel waits for its next completed browser action. Frames are captured from the same Playwright page that Agent is using.
3. When the Agent struggles, choose "Take control". This pauses Agent actions at the next safe action boundary, waits for in-flight Playwright operations to finish, and gives the user exclusive control. If Agent is currently awaiting a model response, the resulting planned actions are discarded after handoff.
4. Click directly on the latest screenshot, scroll, use Tab or Backspace, or type a short string into a focused **ordinary** input. Coordinate clicks are normalized to the Playwright 1280 x 800 viewport, so resizing the panel does not change target accuracy. The screenshot is masked for inputs.
5. Choose "Hand back to Agent". The app clears stale snapshot refs and releases the gate. At the next model turn Agent takes a **fresh snapshot**, sees the updated page and continues the same task. You may also send a steer message in chat if context/explanation helps.

Manual text entry is capped at 600 characters per operation. Manual browser actions are limited to 80 per takeover and do not consume the Agent's 60-action budget. Paused takeovers automatically expire after four minutes without an interaction; task cancellation also interrupts waiting.

The viewer is deliberately read-only unless the owner explicitly takes control. Automatic Playwright steps and manual operations use the same serial operation queue. This prevents independent simultaneous clicks during a handoff.

## Safety and privacy

- Browser control endpoints require current Project CHAT access **and the exact initiating user**, not merely Project membership. Same-origin POST requests and active task status are checked. This is not user-controlled computer access outside the Project Agent's isolated browser.
- Network requests are still protected by the existing browser guarded-fetch proxy; private/intranet URLs are blocked. There is no forwarding of Chrome cookies or sessions.
- Clicks on a known set of high-impact controls (payment, purchase, deletion, publishing, transfers, similar commands) are refused from assisted mode. Enter-key submission and arbitrary keyboard shortcuts are not exposed. Security credentials, one-time codes, bank/payment/secret fields cannot be typed through the assistant panel.
- User-typed text is used for one immediate Playwright input event; it is not included in the Project Agent activity log, task persistence or chat history. Screenshots mask text fields and marked private elements, but cannot guarantee redaction of unrelated page text.
- Only the initiating user can fetch the preview's images. Images live in ephemeral server RAM and are not stored as Project Knowledge artifacts. Closing Preview releases control and stops watching.
- Browser Control currently assumes the Next.js route, Browser Agent and UI frame transport run in **the same host process**. Distributed workers require a secure shared coordinator and frame transport before enabling this feature. Remote Dify mode does not support this app-hosted takeover.

## Known limitations

- This is not a full live DOM inspector, desktop mouse cursor livestream or real-time video. The user sees the latest image after each browser operation, refreshed on a short polling cadence.
- Most input values are hidden in the screenshot for privacy. Password/OTP/manual authenticated login is **not** supported in this first pass. The user can assist navigation and ordinary forms, but not complete high-risk purchases, transfers or protected sign-in flows.
- Manual click targeting uses visible screenshot coordinates; if a page animates or changes between screenshot and click, the target may have shifted. The app uses current DOM to block recognizable high-impact click targets, but coordinate interaction cannot guarantee perfect semantic targeting.
- An Agent action already in flight may finish while takeover is being acquired; takeover becomes exclusive at the next action boundary. In-memory state is lost on host process restart. Gate expiration avoids leaving an Agent stuck indefinitely.

## Source map

- lib/project-agent/runtime/browser-agent/control.ts: pause/handback/revision gate with TTL and 80 manual action limit
- lib/project-agent/runtime/browser-agent/handback.ts: refreshed snapshot and stale model action suppression
- lib/project-agent/runtime/browser-agent/manual.ts: validated manual commands against the active Playwright session
- lib/project-agent/runtime/browser-agent/session.ts: serialized browser operation queue
- app/api/projects/[projectId]/agent/tasks/[taskId]/browser/control/route.ts: task-owner-only control API
- components/features/projects/ProjectAgentBrowserPreview.tsx: right-side Preview panel
- components/features/projects/ProjectAgentBrowserWatch.tsx: opt-in screenshots and manual controls
- lib/project-agent/runtime/run-agent.ts: model/action gate and handback integration

## Deferred QA (explicit user instruction)

Added unit/API tests for handoff, abort, invalid input, same-origin, task ownership and running-task guards. No tests, typecheck, build, CI or browser QA were run. Must still verify on authenticated host with a real Chromium session and browser screenshots, multiple tabs, mobile layout, concurrent tabs for same user, cancellation, high-risk control recognition, locale accuracy and proxies before enabling in production.
