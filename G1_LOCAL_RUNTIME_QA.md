# G1 — Real worker + loopback model mock + independent browser goal checker

**Development implementation only. G1 acceptance is NOT CLOSED.**
The source branch contains an executable host closeout test, but it needs
to be ported to the actual Next.js 14.2.16 AI-WEB-CHAT QA host and run.
Neither a source review nor G1 unit tests prove worker/model E2E.

## Intent and exact boundaries

- Positive: real `startProjectAgentTask` -> `runProjectAgentTask` ->
  actual `runRuntimeAgent` -> `callRuntimeModel` (HTTP SSE loopback mock)
  -> JSON browser tool parsing -> real `runBrowserAction` -> P8 verifier ->
  model final -> independent Chromium DOM goal checker -> terminal Mongo CAS
  `done`; final answer must contain `G1_VERIFIED_RECEIPT`.
- Negative: the local model immediately declares final success without any
  DOM change. The checker rejects it; terminal Mongo task must be `failed`
  with **no** verified receipt or `done` transition.
- Goal checker is synthetic-only, bound to the exact G1 QA task marker,
  synthetic owner, flags, original task ID, in-memory P7 Chromium page,
  DOM `#qa-output === "1"`, P8 verified event and zero fixture
  browser-context network requests. A model-provided string cannot
  construct the callback receipt. The app checks this callback before
  calling `commitTaskTerminalIfActive(..., "done")`.
- A synthetic G1 task permits model-issued `browser.snapshot` and
  `browser.click` only; other actions (shell, web, navigation, upload,
  login, scheduling and other external work) fail at the actual runtime
  dispatch before execution. This is a QA-specific restriction.
- Both model endpoints must be `http://127.0.0.1:3998` with disposable
  value `g1-local-only` as token; no real Dify or Entra is used.
- The source fixture uses P8's existing process-local Chromium registry.
  It does not provide multi-worker session recovery. The queue is
  intentionally set to `PROJECT_AGENT_DURABLE_QUEUE=0` for this G1
  single-worker acceptance, not to simulate Mongo lease failover.
- This is **not** an unrestricted goal verification feature for real user
  requests: outside the exact synthetic marker/flags it is a no-op.
  A visible DOM counter equals 1 is narrower than semantic completion.
- The worker uses the application's usual task setup, workspace and task
  store; an isolated host with its normal local dependencies and sandbox
  image is required. A missing Docker image, database or Chromium install
  is a **BLOCKED** environment prerequisite, not a passing G1 test.
- Disable external connectors and Hindsight; use a disposable QA project,
  dedicated Mongo/PostgreSQL and network-isolated development environment.
  Keep this suite on the sole QA process, not main/staging.

## Host setup (dedicated loopback 3006)

Port the G1 files listed below into the isolated AI-WEB-CHAT QA worktree
without overwriting its Next/Auth/Mongo host adapters:

- `lib/project-agent/runtime/g1-goal-check.ts`
- `lib/project-agent/runtime/run-agent-types.ts`
- `lib/project-agent/runtime/run-agent.ts`
- `lib/project-agent/dify-agent.ts`
- `app/api/projects/[projectId]/agent/g1-qa/route.ts`
- `tests/agent/g1-goal-check.test.ts`
- `tests/host-browser/g1-goal-runtime.api.spec.ts`
- `scripts/g1-host-preflight.mjs`, two package scripts and this handoff.

The P8 host fixture/session bridge from the accepted P8 closeout must
already be ported. Warm routes before the live test and do not hot-reload.

Use real synthetic NextAuth owner/nonmember storage states. Server and
test terminal both need the following environment, adjusted only to the
isolated synthetic Project/account created for this QA:

```bash
export P7_ISOLATED_QA=1
export P7_HOST_BASE_URL=http://127.0.0.1:3006
export P7_PROJECT_ID=YOUR_SYNTHETIC_QA_PROJECT_ID
export PROJECT_AGENT_P7_QA_PROJECT_ID=$P7_PROJECT_ID
export P7_OWNER_STORAGE_STATE=/secure/path/owner.json
export P7_OWNER_EMAIL=owner@project-agent.test
export P7_NONMEMBER_STORAGE_STATE=/secure/path/nonmember.json
export P7_OTHER_EMAIL=nonmember@project-agent.test
export P8_QA_ISOLATED_HOST=1
export P8_QA_ALLOW_CLOSEOUT=1
export P8_QA_ALLOWED_ORIGIN=$P7_HOST_BASE_URL
export P8_QA_EXPECT_REPORT_ONLY=0
export G1_QA_ALLOW_CLOSEOUT=1
export PROJECT_AGENT_G1_QA=1
export PROJECT_AGENT_RUNTIME=sandbox
export PROJECT_AGENT_BROWSER_AGENT=1
export PROJECT_AGENT_P7_QA_FIXTURE=1
export PROJECT_AGENT_P8_QA_SESSION=1
export PROJECT_AGENT_P8_LOOP=1
export PROJECT_AGENT_P8_LOOP_REPORT_ONLY=0
export PROJECT_AGENT_DURABLE_QUEUE=0
export PROJECT_AGENT_AI_TITLES=0
export PROJECT_AGENT_DIFY_API_URL=http://127.0.0.1:3998
export PROJECT_AGENT_RUNTIME_DIFY_API_URL=http://127.0.0.1:3998
export PROJECT_AGENT_DIFY_API_KEY=g1-local-only
export PROJECT_AGENT_RUNTIME_DIFY_API_KEY=g1-local-only
```

Run **one Next.js dev server** on port 3006 with these environment
variables; the Playwright test creates its local model HTTP listener on
3998 in the test process. Do not start a remote Dify or external worker.

```bash
npm run test:g1:unit
npm run test:p8:unit
npm run test:p8:qa:unit
npx tsc --noEmit
npm run check:lines
git diff --check
npm run test:host:g1
```

The preflight checks two NextAuth synthetic logins, origin and mock
transport before Playwright mutates anything. The positive model script
uses exactly three SSE turns (snapshot, click, final); the negative uses
one forged-final turn. Expected total: **four localhost model POSTs**. The Playwright spec checks
terminal task receipts in the real task route and cleans both tasks.
Afterward delete **only** the synthetic QA Project/database/auth files
under the recorded QA manifest and stop the QA server.

## Gate decision checklist

| Check | Passing evidence |
| --- | --- |
| Worker | The task is queued, started by the real `startProjectAgentTask`, and terminal CAS is observed |
| Model continuation | Three model SSE turns: snapshot, click, final, through real HTTP model client |
| Action | Browser runtime changes the synthetic counter from 0 to 1 |
| Independent checker | Reads live Chromium DOM and P8 verification; not the model reply |
| Terminal positive | Task `done`, independent receipt attached to `resultText` |
| Terminal negative | Premature final is rejected, task `failed`, no receipt |
| Safety | Only synthetic owner/Project, no outside browser requests; no real Dify/Entra |
| Cleanup | QA browser/session/task/DB/auth removed; no other QA data touched |

**If any step is unrun, fails, or skipped, G1 remains OPEN.**
Report exact host/source SHA, Next and Chromium versions, passed/failed/
skipped counts, model mock request count, anonymized task receipts and
cleanup outcome. Do not count this as verified production goal completion,
staging, multi-worker or real-provider acceptance.
