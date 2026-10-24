# Visual Browser Watch for Project Agent — 2026-10-24

Branch: gpt/full-project-agent. This adds an opt-in, read-only, near-live browser view to the existing sandbox Chromium/Playwright Browser Agent. It is NOT full video/screen sharing, a remote desktop, or control of the user's own Chrome session.

## User experience

While an eligible Sandbox Runtime task is queued/running, its Project Chat shows "Watch browser" (localized to the current request language). The initiating user can press it at any time. If the agent has already opened a Playwright session, one initial frame is taken immediately; otherwise the viewer waits for the first browser action.

The server captures an image after each actual browser operation, with an action label. The chat polls the protected status endpoint every 1.6 seconds only while watching and the tab is visible; the image updates when its sequence changes. Users can enlarge the image or "Stop watching". Stopping deletes all captured bytes immediately, but does not stop the Agent. Existing Project Agent Stop remains responsible for cancellation.

Images and metadata live only in Next.js process memory, scoped to the task ID, with a five-minute inactivity expiry. No browser video, cookies, credentials, DOM trees or images are stored in MongoDB, Project Knowledge or generated file lists. The screenshot is not sent to the model as a new observation; existing browser screenshot actions still use their original tool path.

## Authorization and privacy

- The read-only GET/status/image and POST/watch endpoints require existing Project CHAT authentication and exact task-initiating account, not any Project collaborator. Cross-origin POSTs are refused. Responses have private no-store caching.
- Screenshot capture is OFF unless its user opts in. It masks all form input/select/textarea/contenteditable areas and marked sensitive regions, but cannot guarantee that all private text elsewhere on a website is hidden. Only the task initiator should opt in when visiting private dashboards.
- The UI exposes the public origin and path but omits query parameters and fragments, where tokens can appear.
- No persistent authentication transfer from a user's local Chrome is implemented. Browser Agent uses its own ephemeral isolated browser context. CAPTCHA/OTP/password and payment fields still require user involvement; protections remain intact.
- Browser frame state is stored in one Next.js host process. If the task executor and HTTP routes run on different workers/replicas, this in-memory viewer will not show their frames. Production multi-node deployments need secure shared transient frame transport, not a public WebSocket or blind iframe of a remote site.

## Additional Browser Agent operations

The sandbox action vocabulary now includes: tabs, new_tab, switch_tab, close_tab (at most four tabs), drag with two current snapshot refs, and upload from a staged /work/inputs/ path. Upload requires PROJECT_AGENT_ALLOW_UPLOADS=1, explicit user authorization for the destination host and verified realpaths within the current workspace input directory (25 MB limit). Reviewer mode still forbids drag/upload and other writes.

Stale Playwright element refs now produce a fresh accessibility snapshot for the Agent to reorient; they are not automatically re-clicked, because that could execute a different action after DOM changes. Browser actions remain limited to 60 per task with a 30-second operation guard.

## Required host setup

The feature requires the existing Browser Agent:

    PROJECT_AGENT_RUNTIME=sandbox
    PROJECT_AGENT_BROWSER_AGENT=1

Install compatible Chromium for Playwright on the application host and keep its network egress protections. The viewer is dormant in ordinary Dify mode because app-hosted Playwright is not invoked there. No proxy of the user's signed-in Chrome tab was added.

The UI surfaces the Browser Watch control only for the initiating user during an eligible runtime task (or a task that previously used browser actions).

## Regressions queued, not run

New sources: __tests__/project-agent/browser-watch.test.ts and __tests__/project-agent/browser-watch-route.test.ts. They cover opt-in/opt-out, masked screenshots, URL query stripping, cross-collaborator protection, same-origin toggle, bounded tab/drag/upload actions and reviewer restrictions. No tests, CI, build, signed-in browser or multi-host deployment validation were executed, per the user's request.

Before production: verify host Playwright binaries, logged-in browser flow, mobile rendering, stop/close/refresh, proxy Origin headers, image masking, user privacy and single-host runtime. The current implementation should be described as stepwise browser watching, not live video.
