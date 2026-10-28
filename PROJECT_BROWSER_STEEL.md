# Shared Project Browser — Steel integration (review fixes)

The shared Project Browser is **feature gated** and is separate from the legacy per-task Browser Watch.

## Fixed in this revision

- Project browser records now live in MongoDB, keyed by Project + normalized owner.
- Mongo compare-and-swap prevents competing Next workers from creating separate Steel sessions.
- Each Next worker attaches its own CDP connection to the **same remote Steel session ID**, rather than relying on process-global Playwright objects.
- User-first and Agent-first workflows now use the same browser when `PROJECT_AGENT_STEEL_BROWSER=1`.
- A distributed control row prevents two Agent tasks and human/Agent actions from executing concurrently. Takeover waits for an active operation to finish; handback does not close the browser.
- The selected tab is stored with the session so newly attached workers recover the same active tab.
- Agent completion releases only the Agent's task lease; it does **not** terminate the Steel session.
- Remote Steel release is issued on explicit user close. A worker disconnect only closes its CDP connection.
- Existing guarded HTTP request and website policy protections remain enabled.
- Viewer remains disabled by default because the Steel debug player URL is an unauthenticated bearer capability.

## Configuration

Set on your server (not in client-side env):

```dotenv
PROJECT_AGENT_RUNTIME=sandbox
PROJECT_AGENT_BROWSER_AGENT=1
PROJECT_AGENT_STEEL_BROWSER=1
PROJECT_AGENT_STEEL_API_URL=https://api.steel.dev
PROJECT_AGENT_STEEL_API_KEY=YOUR_SERVER_SIDE_KEY
PROJECT_AGENT_STEEL_SESSION_TIMEOUT_MS=900000
```

The Steel Cloud hard session timeout depends on the account plan. No local timer can override Steel's hard expiry.

### Local development only

You can opt into the directly embedded local Steel player for isolated development:

```dotenv
PROJECT_AGENT_STEEL_API_URL=http://127.0.0.1:3000
PROJECT_AGENT_STEEL_LOCAL_VIEWER=1
```

The local-player exception is disabled in production. Never expose this development Steel endpoint to an untrusted network.

### Production viewer — requires a gateway

```dotenv
PROJECT_AGENT_STEEL_PRIVATE_VIEWER=1
PROJECT_AGENT_STEEL_VIEWER_PREFIX=/private-steel-viewer
```

**Do not set these until an independent reverse proxy is installed and verified.** The path is an integration hook, not an implemented Next.js route. Your gateway must authenticate the same user, check Project membership and Steel session ownership, forward the WebRTC player and signaling transport, reject attempts to change `interactive=false` without takeover, and keep the Steel service inaccessible from untrusted clients. The Steel player is **not self-authenticating**. A UI-only `pointer-events: none` gate is NOT a security boundary.

The selected iframe viewer uses Steel's `interactive=false` while the Agent controls it and `interactive=true` after takeover. This is UI defense-in-depth only; a production deployment still needs transport-level authorization and fencing.


### Optional pre-reserved Steel session UUIDs (requires provider compatibility)

Steel Cloud's documented Sessions API can accept a caller-generated UUID as
`sessionId` on session creation. To improve crash forensics, the Project Browser
can store the chosen UUID in Mongo **before** sending the create request.

```dotenv
PROJECT_AGENT_STEEL_RESERVED_SESSION_IDS=1
```

This flag defaults **off**. Enable it only after confirming the exact deployed
Steel Cloud or self-hosted server supports and preserves the requested
`sessionId`. With the flag on, a mismatched returned ID is rejected and the
unexpected remote ID is released; a response timeout retains the reserved UUID
and fails closed pending operator reconciliation. An in-flight reservation blocks
explicit reopen after Stop until the remote outcome is known.

The UUID is an identifier, **not proof a remote session exists**. This change
improves diagnosis, but it does not make network POST retries automatically safe
or replace the signed-in two-Next-worker Steel live acceptance.

## Architecture

- `project-registry.ts`: Mongo-backed session ID, creation CAS, expiry and selected tab.
- `project-control-db.ts`: distributed task ownership, exclusive operation lock and human handback.
- `project-sessions.ts`: attach/detach, tab control and API lifecycle.
- `steel-session.ts`: Steel REST session creation/release, remote CDP attach.
- `session.ts`: Playwright runtime with existing security guard and a shared-session operation gate.
- `ProjectAgentProjectBrowser.tsx`: right panel, responsive viewport, tabs and takeover controls.

## Acceptance tests that still require the actual host

1. Run TypeScript and focused unit tests in the host checkout, then browser E2E signed in as owner and nonmember.
2. Verify Steel Cloud or self-host version supports `GET /v1/sessions/:id` returning the needed CDP details, and remote CDP reconnect.
3. Open browser manually; navigate and authenticate; command Agent; see same live tab; manually take over; hand back; stop the Agent without losing the page.
4. Repeat with two Next workers using one MongoDB and one Steel service. Test two simultaneous open calls and overlapping Agent actions.
5. Test browser restart, Steel session hard timeout, reconnect and cleanup.
6. Test custom viewer gateway auth for player HTML, WebRTC signaling and all input paths. Never publish a naked Steel `debugUrl`.
7. Check fullscreen/browser-chrome requirements versus Steel's fixed fullscreen dimensions and inspect mobile identity behavior.
8. Assess website WebSocket support: the existing safety router currently closes remote WebSockets, so some live apps can fail.

**Not production ready until the viewer gateway and real-host tests pass.** The browser's lifecycle and distributed locking are implemented in the repo, but the protected WebRTC gateway is deployment infrastructure and is not included.

## Review-2 focused repair (October 2026)

- Replaced the dangling `routeGuard()` reference in the restored-personal-session path with `installBrowserRouteGuard()`.
- Viewer URL normalization now accepts same-origin relative paths and rejects unexpected external origins.
- Agent action execution carries an immutable caller `taskId` into the distributed operation gate, instead of trusting a mutable session field.
- Browser tasks refresh ownership every 20 seconds during long model turns; Mongo operation locks refresh every eight seconds, disconnecting CDP on loss.
- An explicit user close persists the `closed` record. Agent actions cannot silently reopen it; the right-panel Start action is explicitly authorized to reopen.
- Stale worker connections are disconnected when their Steel ID no longer matches the active Mongo registry record.
- Resizing the viewer cannot change the real viewport while an Agent still controls the browser; take over first.
- Added focused Mongo lock regression tests in `tests/agent/project-browser-control-db.test.ts` (not executed here).

### Not yet production-verified

The authenticated WebRTC viewer gateway is still **not implemented** in the repository; never enable a public player endpoint without an authorization-enforcing gateway. Agent actions run through guarded HTTP/CDP; direct remote viewer traffic is a separate security boundary. Multi-worker Steel browser E2E, TypeScript on the real Next host, and actual replay/cancellation races still require QA before release. Do not claim E2E pass from this commit.

## Crash safety: expired remote creation claims

An expired Mongo `creating` claim is an **unknown external outcome**, not proof that
Steel never created a remote browser. Likewise, a failed or timed-out Steel create
HTTP response does not prove the POST had no effect: when no remote ID was returned,
the claim is retained in an immediately review-required state rather than reset
to `vacant`. The registry now refuses automatic takeover
(including an explicit right-panel Start) rather than opening an accidental second
session. A stale-creation failure needs an operator to inspect the isolated Steel
account and Mongo record, confirm whether a remote session exists, and reconcile
it before resetting the claim. Do **not** simply delete the Mongo record or retry
opening repeatedly: that can leave an orphaned Steel session.

This is a deliberate fail-closed availability tradeoff, not automatic recovery.
The QA job exercises the fence using real Mongo; the external Steel API and live
two-Next SIGKILL acceptance are still separate requirements.
