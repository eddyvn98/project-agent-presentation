# Shared Project Browser — Steel integration (feature gated)

This branch introduces a **Project-owned browser** alongside the older task-owned Browser Watch.

## Intent
- Open the browser from Project Agent chat **before** sending a prompt.
- Attach Agent Playwright/CDP to that **same** Chromium session; do not clone tabs or cookies.
- Keep the browser alive after Agent completion. Stop closes only the Agent task.
- Up to eight tabs within a session; user selection is reflected in the active Agent page.
- Desktop default (1280x800), mobile preset (390x844), and responsive viewport changes.
- Browser canvas is the Steel website viewer; app controls are outside the canvas.
- Take control / hand back to the Agent: the browser operation lock serializes tasks, and the Agent waits before its next action. A time-limited takeover expires after five minutes without a human heartbeat.

## Configuration

Server-side environment variables:

```dotenv
PROJECT_AGENT_RUNTIME=sandbox
PROJECT_AGENT_BROWSER_AGENT=1
PROJECT_AGENT_STEEL_BROWSER=1
PROJECT_AGENT_STEEL_API_URL=https://api.steel.dev
PROJECT_AGENT_STEEL_API_KEY=your-server-only-key
# 15 minutes by default; increase only if your Steel plan supports it
PROJECT_AGENT_STEEL_SESSION_TIMEOUT_MS=900000
# ONLY after deploying an access-controlled viewer proxy:
PROJECT_AGENT_STEEL_TRUSTED_VIEWER=1
PROJECT_AGENT_STEEL_VIEWER_ORIGIN=https://viewer.example.com
```

The browser feature is **off by default**. No Steel credentials belong in client bundles. The trusted viewer proxy must preserve the Steel player path `/v1/sessions/:id/player` and enforce authorization before forwarding requests.

**Critical security warning:** Steel `debugUrl` is a bearer capability that can grant visual access and remote input. An origin allowlist alone DOES NOT authenticate that capability. Do not set `PROJECT_AGENT_STEEL_TRUSTED_VIEWER=1` unless the viewer origin is behind a production-grade authenticated reverse proxy enforcing the same owner/project access checks, preventing URL leaks, disabling unauthorized access and preserving `no-store`. The API deliberately suppresses the viewer unless this flag and origin check pass. Returning a viewer URL to the authenticated Project owner is not equivalent to securing the remote endpoint.

The app still performs its existing guarded HTTP routing and site policy checks when Playwright attaches. Steel must run on a trusted service; do not connect untrusted CDP servers. The code does **not** enable CAPTCHA bypass, proxy identity spoofing, or extension-based access.

## Remaining deployment acceptance gates

1. Validate the deployed Steel provider version and `websocketUrl` / `debugUrl` response contract.
2. Deploy a private viewer proxy and validate iframe framing, WebRTC connection, click/keyboard takeover, and viewport-resize mapping with a real browser.
3. Test owner vs nonmember and cross-project isolation, including URL leakage, forged Origin, Stop, reconnect and process restart.
4. Test real multiworker routing: the current live Playwright session registry is **process-local**. Production requires routing browser API/Agent workers to the owning Browser Session Service; Mongo lease does not share an in-memory Playwright object.
5. Verify multi-session behavior of the deployed Steel edition. Some self-host builds use a singleton browser process.
6. Confirm end-of-task persistence, tab switching, session expiration, SSO behavior and cleanup after Steel or host crashes.
7. Verify the Steel hard session `timeout` allowance; creating a 60-minute session does not guarantee it is available on every service plan.

This is an **integration implementation, not a production sign-off**. Do not activate the viewer in a public deployment before the above gates.

## UI and API

The header Globe control opens the Project-owned right panel. It calls:
- `GET /api/projects/:projectId/agent/browser` — owner-scoped session status.
- `POST .../browser` — `start`, `takeover`, `release`, `heartbeat`, `navigate`, `new_tab`, `switch_tab`, `close_tab`, `viewport`.
- `DELETE .../browser` — explicitly release the Steel browser.

Control POST/DELETE calls require a same-origin Origin header. Sessions are per Project + authenticated caller email. Existing task-only browser routes remain available as fallback when Steel is disabled.

## Known limitations
- Browser tasks retain the existing 25-minute Agent run deadline and action safeguards; those are independent of the shared browser session.
- Steel enforces its own hard lifetime and may terminate the session while the UI is open.
- The viewport is shared for all tabs in one browser window.
- Sensitive logins require dedicated validation; this integration intentionally does not copy the personal Vault's storage state into a new Steel profile.
- The UI suppresses iframe pointer events when Agent has control, but a protected viewer proxy is still necessary to prevent anyone with the raw debug URL from controlling the session.
