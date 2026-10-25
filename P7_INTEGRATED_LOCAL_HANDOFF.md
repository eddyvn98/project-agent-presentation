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

## Local QA blockers identified on 2026-10-25

The clean-clone Node tests and in-memory Chromium preflight passed. **The authenticated host tests were
not run** because the isolated Next.js QA server at `127.0.0.1:3004` was unreachable / returned
an Internal Server Error, and the private QA `NEXTAUTH_URL` still pointed to `localhost:3002`.
These are two separate blockers. Neither is a confirmed Browser Agent failure.

Before generating any QA Project, exporting storage states or starting Playwright, run the
**anonymous, read-only** readiness probe (requires no authentication secrets):

```bash
export P7_HOST_BASE_URL=http://127.0.0.1:3004
npm run p7:qa:readiness
```

The probe reports a short status-only result: `HOST_UNREACHABLE` for connection/timeouts,
`HOST_SERVER_ERROR` for HTTP 5xx, and `AUTH_PROVIDERS_UNAVAILABLE` for a broken NextAuth
providers endpoint. It does not retrieve authenticated Project data or print page bodies. If
it fails, **stop here** and inspect the isolated Next.js server's stderr, start command,
bound interface/port and build logs. Do not guess that missing Chromium caused an HTTP 500.

Once the host responds, configure its private `.env.local` or QA process environment to use
`NEXTAUTH_URL=http://127.0.0.1:3004` (or `AUTH_URL` as appropriate), restart the
**QA process only**, and run `npm run p7:qa:sso` with `P7_HOST_ENV_FILE` pointing at the
actual QA config. Keep the main process on `3003` unchanged. Ensure the provider metadata
callback uses the QA origin. No repository default should override operator credentials or
quietly rewrite Microsoft Entra redirect URIs.

The development-only P7 synthetic fixture refuses `NODE_ENV=production`, even on localhost.
Use an isolated development/test instance with synthetic dev credentials, not a production
server with the QA flag enabled. Read-only GET requests can omit the Origin header; POST,
PATCH and DELETE still require a matching Origin to protect synthetic QA mutations.

## 2026-10-25 follow-up — auth providers OK, /assistant timed out

On QA PID `69667`, `/api/auth/providers` returned HTTP 200 while the anonymous
`/assistant` GET exceeded the old five-second deadline. **Port 3004 is reachable; only
chat route readiness remains unverified.** The probe now labels this as
`CHAT_ROUTE_TIMEOUT`, never as a blanket `HOST_UNREACHABLE`.
The new default is 15 seconds to accommodate first Next.js development compilation;
set `P7_READINESS_TIMEOUT_MS=30000` once for diagnostic purposes. Do not mark a slow
compile PASS or indefinitely increase timeout without server logs.

Read-only host triage (run on the local machine, **not** in the GitHub repo):

```bash
ps -p 69667 -o pid,ppid,etime,command
lsof -nP -a -p 69667 -d cwd,1,2
lsof -nP -iTCP:3004 -sTCP:LISTEN
curl --noproxy '*' -sS -o /dev/null -w 'providers HTTP %{http_code} in %{time_total}s\n' --max-time 10 http://127.0.0.1:3004/api/auth/providers
curl --noproxy '*' -sS -o /dev/null -w 'assistant HTTP %{http_code} in %{time_total}s\n' --max-time 30 http://127.0.0.1:3004/assistant
P7_READINESS_TIMEOUT_MS=30000 npm run p7:qa:readiness
```

Locate stdout/stderr from the shell or supervised process that started PID 69667,
using `lsof` to identify redirected log files if available. Read the relevant lines
for compilation, `GET /assistant`, NextAuth, hydration or database errors. **Do not
dump process environment, cookies, full authenticated pages or secrets.** A missing
log cannot prove any specific cause. Check whether `/assistant` cold-compiles slowly,
blocks on a database or session call, or throws a Next.js runtime error.

Do not kill/restart a long-running dirty QA checkout without determining who owns it.
The safest fallback is to start a **separate, clean QA checkout with its own Next.js
build output, synthetic-only database and development credentials** on an unused
loopback port (for example `3006`), leaving ports `3003` and `3004` alone.
Use a single consistent origin for that isolated run, e.g.
`NEXTAUTH_URL=http://127.0.0.1:3006` and
`P7_HOST_BASE_URL=http://127.0.0.1:3006`, plus separate QA login states.
Do not copy the existing `localhost:3002` callback or reuse production secrets.
Configure the matching Entra redirect only if real Microsoft SSO will be tested;
synthetic dev credentials **do not** verify Entra sign-in.
Keep `PROJECT_AGENT_P7_QA_FIXTURE=1` restricted to non-production QA.
No QA bootstrap or browser mutations until this host's readiness and synthetic
auth prerequisites pass.

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
npm run p7:qa:readiness
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

## AI-WEB-CHAT host acceptance reported on 2026-10-25

Local agent reported **30/30 Playwright PASS, 0 FAIL and 0 SKIP** on an isolated
AI-WEB-CHAT QA worktree (host branch `feat/project-agent-local-business`, pre-test
HEAD `352abde4`; two independent QA hosts at ports 3005/3006). It also reported
10/10 Browser Watch/Takeover, 2/2 browser preview desktop/mobile, 7/7 focused
Vitest, 6/6 auth/preflight Node, TypeScript and diff-check PASS. This is
**reported host acceptance**, not a fresh execution of those tests against the
subsequent standalone Presentation branch commit. Do not conflate the two runs.

Two host-observed issues were propagated to this repository:

- Watch-off **must purge private frames in RAM**. Do not change this privacy
  behavior to keep tests green. The Playwright synthetic fixtures now call
  an explicitly gated `PATCH p7-qa {kind:"recover"}` to reconstruct the
  in-memory Chromium fixture and fresh masked JPEG before dependent tests.
  Bootstrap exports `P7_SYNTHETIC_BROWSER_TASK=1` to prevent recovery calls
  against ordinary employee Browser Agent tasks.
- A restarted host can mark the previous synthetic browser task `failed`.
  The QA-only recovery endpoint now verifies owner, exact synthetic browser
  prompt, non-cancelled non-completed task, and absence of active manual
  takeover. It restores Chromium and captures a real frame first, then marks
  the **synthetic task only** `running` with the current process boot ID.
  It must never revive a user's explicitly stopped task.

The host report was kept in `P7_HOST_E2E_TEST_REPORT.md` within the
AI-WEB-CHAT worktree and was **not committed** at the time of the report.
Likewise, host-specific NextAuth hydration and QA Project/chat selection UI
edits remain host-repository changes; they are not automatically imported
into this portable Presentation repo. Commit them on the appropriate host
development branch after its own review, not on `main`/`staging`.

**Remaining acceptance limits:** Synthetic dev credentials and provider/callback
metadata do not demonstrate real Microsoft Entra sign-in. A local in-memory
fixture does not prove unrestricted autonomous browsing on public websites.
SSRF/public-address protections and production authentication remain unchanged.

## P7 post-prepare recovery race regression (follow-up)

Local QA identified a race in the originally pushed `p7-qa` recovery route: it
checked Stop/takeover **before** awaiting Chromium preparation, then wrote
`running` from a stale task snapshot. The recovered fixture now fetches the task
again after a real JPEG frame exists and checks ownership, Project identity,
exact synthetic browser prompt, current status/cancelled state, and live human
takeover immediately before the `running` update. If Stop, deletion, task
completion or takeover wins **during preparation**, the recovery returns 409
without changing task status. Stop must not be undone by setting `cancelled:false`.

The focused regression `tests/agent/p7-qa-recovery-race.test.ts` delays
Chromium preparation while simulating concurrent Stop, owner/Project change,
deletion, completion and takeover. It also verifies a successful unchanged
recovery and takeover during task re-read.

This protection closes the observed async preparation window. It is not a
MongoDB compare-and-swap: a separate Stop exactly **after** the final read and
while the task update is in flight still requires a conditional database write
in the host integration to provide a strict linearizable guarantee. Do not
interpret a passing in-memory regression as proof of that stronger property.

Run the focused check before the host suite:

```bash
npx vitest run --config vitest.agent.config.ts tests/agent/p7-qa-recovery-race.test.ts
```

## P7.5 post-acceptance hardening: never replay uncertain running tasks

The latest local AI-WEB-CHAT report for isolated synthetic QA is **31/31 host Playwright
PASS (0 FAIL, 0 SKIP)**, focused P7 Vitest **9/9** and preflight Node **6/6**.
These are local-agent results for its QA host checkout, not freshly rerun results
for every subsequent Presentation commit.

The previous non-durable `recoverProjectAgentTask` path restarted a running
task with an old server boot ID once. Because a browser, upload or other external
tool may have already acted before the crash, that automatic replay was unsafe.
The P7.5 recovery policy now:

- Defaults to waiting for **Mongo durable lease** when `PROJECT_AGENT_DURABLE_QUEUE`
  is unspecified, matching `task-runner.ts`; explicit `0` uses legacy handling.
- Re-dispatches only never-started `queued` tasks that are not cancelled.
- Marks an orphaned, previously running legacy task `failed` with a
  **manual-review-required** message, without executing its tools again.
- Preserves terminal tasks and never dispatches an explicitly cancelled task.
- Leaves live non-durable tasks alone even if their last update is old.

Focused regressions:
`tests/agent/p7-task-recovery-policy.test.ts` and
`tests/agent/p7-task-recovery-integration.test.ts`. On the local agent, run:

```bash
npx vitest run --config vitest.agent.config.ts tests/agent/p7-task-recovery-policy.test.ts tests/agent/p7-task-recovery-integration.test.ts
npm run test:agent
```

**Operational tradeoff:** A task interrupted mid-execution requires inspection
and an explicit retry rather than silent continuation. This policy does not
replace host-side Mongo compare-and-swap for concurrent Stop versus status
writes, nor does it validate real Entra SSO. Do not claim production approval
on synthetic QA alone.

## P7 synthetic cleanup and conditional Stop fence (follow-up)

When recovery loses the Stop/delete/status race after Chromium preparation, the
route must not leave a Watch frame or Chromium context alive. Recovery now
uses `finally` to discard the prepared session via `closeBrowserSession`,
`setBrowserWatch(false)` and `clearBrowserControl` on all unsuccessful
post-prepare paths, including missing JPEG, task changed, Mongo failure and
CAS mismatch. It deliberately **does not discard a human-owned takeover**.
Same-process recoveries are single-flight per task; a concurrent recovery
returns 409 rather than tearing down the first request's browser.

The final running-status write is a **conditional Mongo update**, not a
read-then-unconditional-write. It requires matching task ID, Project, owner,
exact synthetic browser prompt, previous status and timestamp, and
`cancelled != true`. Thus Stop winning first prevents the recovery write;
Stop winning second leaves the stopped state authoritative.

**Host integration check:** `markP7BrowserRunningIfCurrent` uses Mongo
collection `projectAgentTasks` with string `_id`. The neutral repository
does not contain the host-owned `projectAgentTasks.repo.ts` implementation.
Local QA must verify the host task repository uses this exact collection/key.
If not, the conditional update fails closed; align with the host's actual
Mongo collection rather than relaxing the guard or falling back to an
unconditional update. No production data should be modified for that check.

Focused tests:

```bash
npx vitest run --config vitest.agent.config.ts \
  tests/agent/p7-qa-recovery-race.test.ts \
  tests/agent/p7-qa-conditional-update.test.ts
npx tsc --noEmit
node tests/check-lines.mjs
```

Re-run the synthetic Stop-during-prepare, takeover-during-prepare,
crash/recover and Watch JPEG scenarios on the isolated QA host. Prior host
31/31 results do **not** certify this new commit.

For the final post-\`a6f84864\` conditional Mongo CAS / Stop resource cleanup acceptance, use [P7_CLOSEOUT_QA.md](P7_CLOSEOUT_QA.md) and its isolated-host regression commands. These checks have not been executed on the remote branch by ChatGPT.

## Known limitations

The development-only fixture tests Chromium/watch/handback mechanics; it does not demonstrate an AI model autonomously selecting a browser tool on a real public site. Ordinary Dify workflow and production Entra sign-in require separate integration verification. All new tests must be run in the actual Next.js QA host, not just the neutral demo. Source-level edits made through GitHub alone do not prove host PASS. Respect the 300-line file policy and never include credentials in logs or reports.
