# P7.2–P7.5 integrated Git handoff

Branch: `gpt/full-project-agent`. No merge to `main`/`staging`. Do not run CI.

## Scope and root causes

- **Browser:** `PROJECT_AGENT_BROWSER_AGENT=1` is absent in the local QA host environment. The existing Browser Action and Watch/Control routes fail closed when the flag is off. `playwright-core` runs Chromium **in the Next.js host process**, not automatically in the two running Docker sandbox containers. `browser-launcher.ts` now uses Playwright's installed binary or `PROJECT_AGENT_CHROMIUM_EXECUTABLE`, with an explicit host preflight. Browser QA uses an in-memory Chromium HTML fixture and a JPEG frame. **SSRF/private-network rules are unchanged.**
- **SSO:** NextAuth callback incorrectly points to `localhost:3002` instead of the isolated QA host origin. `p7-sso-preflight.mjs` compares `NEXTAUTH_URL`/`AUTH_URL` to the requested origin, reports the expected Entra redirect URI and checks for missing settings **without logging secrets**. Actual Azure registration and valid credentials remain operator-controlled.
- **QA bootstrap:** `scripts/p7-qa-bootstrap.mjs` creates only a synthetic disposable Project, PDF, browser task, and a local manifest; owner and non-member dev-only identities must already exist. Cleanup checks manifest origin, owner, runId, Project name, and task IDs and removes only the tracked resources.
- **Recovery:** HTTP task creation accepts optional UUID `Idempotency-Key` and fingerprints task content. Concurrent retries return one task identity, while different payloads with the same key yield 409. Durable task lease, Stop/Retry and Chromium disconnect/recovery remain covered by focused and host tests.

## Isolated host preparation

Use a separate Next.js QA instance, not the main employee server. Dev-only synthetic identities must have emails ending in `@project-agent.test`. Do not create Microsoft identities or copy production user data.

```bash
# In QA host process environment, not in this repository:
PROJECT_AGENT_RUNTIME=sandbox
PROJECT_AGENT_BROWSER_AGENT=1
PROJECT_AGENT_P7_QA_FIXTURE=1
NEXTAUTH_URL=http://127.0.0.1:3004
# Optional only in a disposable QA process:
PROJECT_AGENT_P7_QA_CRASH=1
```

Install the matching Playwright Chromium browser for the **host process** or set `PROJECT_AGENT_CHROMIUM_EXECUTABLE` to a local Chrome/Chromium executable. The browser URL policy continues to block loopback/private ranges for ordinary navigation. The fixture is loaded via `page.setContent()`, without HTTP or WebSocket navigation.

For real Entra SSO, the operator must separately ensure that `http://127.0.0.1:3004/api/auth/callback/azure-ad` (or the actual provider ID) is registered as a supported redirect URI and that the NextAuth secret/client ID/client secret/tenant and public origin are configured for this QA host. Dev credentials are **not** evidence of Entra login.

## Single integrated QA sequence for the local agent

```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npm run p7:qa:auth-tests
npx vitest run --config vitest.agent.config.ts
npm run p7:qa:browser
```

Set `P7_HOST_BASE_URL=http://127.0.0.1:3004`, `P7_HOST_ENV_FILE` (private host env path), `P7_OWNER_EMAIL`, `P7_OTHER_EMAIL`, and the two Playwright login-state paths:
`P7_OWNER_STORAGE_STATE` and `P7_OTHER_STORAGE_STATE`. Never print or commit storage state. Run:

```bash
npm run p7:qa:sso
export P7_ISOLATED_QA=1
npm run p7:qa:create
. .p7-auth/p7-vars.sh
npm run check:host:p7
npm run test:host:p7 -- --project=host-api
npm run test:host:p7 -- --project=desktop-ui
npm run test:host:p7 -- --project=mobile-ui
# Only if this process contains no other browser tasks:
export P7_ALLOW_BROWSER_CRASH=1
npm run test:host:p7 -- --project=host-api -g "crashed isolated Chromium"
# Always remove tracked QA resources afterward:
npm run p7:qa:cleanup
```

To run calculator and real HTTP task creation scenarios, use the previously documented explicit
`P7_ALLOW_TASK_CREATION=1`, `P7_EXPECT_CALCULATOR=1` and `P7_TEST_IDEMPOTENCY=1` options **only** for synthetic QA prompts. Enable `P7_ALLOW_QA_STOP=1` for the synthetic Stop test. **SKIP is not PASS.**

## Acceptance evidence

1. Browser preflight produces JPEG and reports Chromium connected; synthetic browser task exposes a private Watch frame.
2. Owner takeover pauses control, synthetic click changes counter, release returns control; unrelated non-member receives 403/404.
3. Isolated Chromium failure can be recovered into a new frame without broadening SSRF guards. Do not kill a browser with employee sessions.
4. Anonymous/session-expired requests are rejected, and SSO callback points to QA origin. Real Entra sign-in remains unverified until exercised with operator-managed credentials.
5. Three concurrent requests with the same key return the same task ID; changed payload yields 409.
6. Stop/Retry and PDF Range/owner isolation remain correct; safe manifest cleanup removes **only** this run's synthetic assets.

## Known limitations

The development-only fixture tests Chromium/watch/handback mechanics; it does not demonstrate an AI model autonomously selecting a browser tool on a real public site. Ordinary Dify workflow and production Entra sign-in require separate integration verification. All new tests must be run in the actual Next.js QA host, not just the neutral demo. Source-level edits made through GitHub alone do not prove host PASS. Respect the 300-line file policy and never include credentials in logs or reports.
