# G1 — Real worker + loopback model mock + independent browser goal checker

**G1 ACCEPTED for isolated single-worker + local SSE mock model +
synthetic Chromium DOM only (operator-reported 2026-10-25).**
The real Next.js 14.2.16 AI-WEB-CHAT host test completed positive and
premature-final negative cases. This acceptance does **not** include
real Dify/Entra, multi-worker recovery, internet website tasks or
production readiness. The results were reported by the local agent,
not rerun or independently verified in this Presentation checkout.

## Recorded acceptance and host code provenance

- Source G1 handoff: `eddyvn98/project-agent-presentation`, branch
  `gpt/full-project-agent`, implementation HEAD at handoff
  `dbf91fc2fd2f7b54d0308e418869723b6273aa79`.
- Integrated host `AI-WEB-CHAT`, branch
  `feat/project-agent-local-business`: G1 code `580ab334`;
  later status/index docs `1e2f5c4a` (both operator-reported).
- `npm run test:host:g1`: **2 PASS, 0 FAIL, 0 SKIP**.
  The positive case traversed real worker and tool continuation, three
  localhost SSE steps (`snapshot/click/final`), P8 verification and an
  independent Chromium DOM goal check. It stored `done` and the
  application-authored final-answer receipt; `p8Verified=2`.
- The negative case deliberately returned a model final too early;
  checker rejected the model claim, task stored `failed` with no trusted
  receipt. Test asserted **4 total localhost mock model POSTs**.
- Integrated checkout: G1 unit **8/8 PASS**, P8 unit **40/40 PASS**,
  P8 QA guard/session **8/8 PASS**, TypeScript **PASS**,
  `git diff --check` **PASS** and all files **<=299 lines**.
  Suite totals are not blindly additive where subsets overlap.
- Host test fixed a **test-only mismatch**: public task response
  intentionally omits `task.log`, so checking this field through
  the public task API was invalid. The host E2E removed that assertion
  and checked the receipt's positive numeric `p8Verified` instead
  (observed 2). **No runtime guard changed.** This upstream
  Presentation test file still contains the old `task.log` assertion
  and requires the same test-only parity fix before direct reuse.
  Neither the corrected E2E nor the public task route proves task-log
  contents or persistence.
- Cleanup reported complete: isolated QA Project/tasks, Mongo/PostgreSQL
  run databases, synthetic auth state and `.env.local` removed;
  host stopped. No real provider or outside browser actions took place.

**Evidence limits:** one worker with
`PROJECT_AGENT_DURABLE_QUEUE=0`, model mock only on
`127.0.0.1:3998`, one synthetic DOM counter goal. `pid` from
the fixture is Node/Next `process.pid` (not a Chromium PID);
`networkAttempts=0` is a fixture browser-route counter (not
a host-wide network egress audit). See [P8_STATUS.md](P8_STATUS.md)
for still-open G2–G4 gates.

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

## Reproduce host acceptance (dedicated loopback 3006)

For a new clean run, port the G1 files listed below into the isolated
AI-WEB-CHAT QA worktree
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
one forged-final turn. The recorded run confirmed **four localhost model
POSTs**. **Test source parity note:** the public task API omits
`task.log`. Before rerunning the original Presentation-host test
unchanged, remove the public `task.log` assertion and instead assert
that the application-authored `G1_VERIFIED_RECEIPT` contains numeric
`p8Verified > 0`. This was fixed in the integrated host test only;
do not change the runtime guard or expose private logs publicly.
The test checks terminal task status/receipt through the authenticated
task route and cleans both tasks.
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

**Decision:** G1 is CLOSED only for the reported single-worker/mock
model/synthetic DOM scope above. A subsequent independent run that fails
or skips a required assertion does not inherit this PASS. Record exact
host/source SHA, Next/Chromium versions, PASS/FAIL/SKIP, the local model
request count, anonymized goal receipt and cleanup outcome.
G2 multi-worker, G3 authorized providers/security and G4 production
release are **OPEN**. No real-provider or deployment acceptance is implied.
