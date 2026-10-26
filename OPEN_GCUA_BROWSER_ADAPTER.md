# OpenGCUA browser compatibility: same-session first

This increment is **not a native OpenGCUA SDK installation**. The upstream
OpenGCUA browser worker currently launches a separate browser/context during
initialization. Its public API lists `connect_url`, but that alone does not
demonstrate safe attachment to an existing Steel page.

## Implemented

- Task Browser Watch resolves an active persistent Steel browser as well as the
  legacy task-local browser, without creating a second browser.
- Right panel switches between bounded MJPEG live frames (view-only) and
  sequence-bound saved screenshots (manual interaction). Stream errors fall
  back to saved frames.
- Project-wide Steel takeover/handback passes through project-control DB; task
  manual actions now find the same session and use serialized browser operations.
- `PROJECT_AGENT_OPEN_GCUA_OBSERVATION=1` enables OpenGCUA-inspired delivered
  observation ref validation. Default remains off. This does not use the SDK.

## Next gate

Pin and audit a version of OpenGCUA supporting attachment to **the same**
browser context and controlled page; maintain G2 lease/CAS, Stop fencing,
SSRF routing, approval, owner scoping, and no independent sidecar writer.
Run authenticated two-worker Steel/browser QA, tab/viewport/takeover tests,
stream fallback, restart recovery and stop tests before production rollout.

No local runtime, TypeScript, Chromium or signed-in E2E QA has been run.
