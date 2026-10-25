# P8 status and next acceptance gates — 2026-10-25

## Decision

**P8 SYNTHETIC LOCAL HOST ACCEPTANCE: CLOSED (operator-reported PASS).**
**G1 SINGLE-WORKER + LOOPBACK MOCK MODEL + SYNTHETIC DOM: ACCEPTED
(operator-reported PASS).**
**REAL DIFY/MODEL SEMANTIC GOAL ACCEPTANCE: OPEN.**
**G2 MULTI-WORKER BROWSER RECOVERY: OPEN.**
**G3 SECURITY/AUTHORIZED INTEGRATION: OPEN.**
**G4 PRODUCTION RELEASE: NOT APPROVED.**

This status supersedes the older "P8 host QA not accepted" wording in the
active-session handoff and roadmap. It is a bounded development QA decision,
not a production or end-to-end semantic-goal success claim.

## Evidence and provenance

- Source handoff: `eddyvn98/project-agent-presentation`, branch
  `gpt/full-project-agent`, source commit
  `8ae555e541cd2fc596b543ffb850254166f79e32` for P8 browser
  fixture, and `dbf91fc2fd2f7b54d0308e418869723b6273aa79` for
  the G1 source implementation/test handoff.
- Host target: `AI-WEB-CHAT`, Next.js **14.2.16**, QA worktree based on
  `fbefcd2c`; integration branch `feat/project-agent-local-business`.
- Host P8 implementation commit **`4aec99a4`**; status/index commit
  **`ca65a8e104664536216183d8bfd102f730ea9376`** (reported remote HEAD).
  No PR, merge, staging release or production deployment was reported.
  Subsequent AI-WEB-CHAT evidence-precision correction was reported pushed
  at host commit `3351ae4c`: the fixture `pid` is Node/Next
  `process.pid`, not Chromium's process ID; `networkAttempts=0`
  covers the fixture's route counter only, not machine-wide egress.
- Local QA operator reports: P7+P8 focused **115 PASS, 1 SKIP**;
  P8 session/guard **8/8 PASS**; TypeScript **PASS**;
  Mongo host-schema **1/1 PASS**; 35 modified/new files below 300 lines
  (maximum 299), no trailing whitespace. Do not count the focused
  session/guard subset as independent extra passes without a separate ledger.
- Authenticated host closeout: **L2 enforcement 1/1 PASS** and
  **L1 report-only 1/1 PASS**. Both modes ran with two NextAuth synthetic
  sessions preflighted. Owner received the expected Watch/preview/loop,
  nonmember was denied. The browser session was retained across routes,
  and the actual control route exercised
  `takeover -> manual click -> handback -> agent continues`.
  Verified DOM click versus intentional no-progress was distinguished;
  the L2 fourth no-progress action was blocked while L1 remained report-only.
- Process continuity evidence includes a stable **`process.pid` for the
  Next.js/Node process**, returned by the fixture's `pid` field.
  It is **not a Chromium OS-process PID** measurement. The test also
  observed a connected Chromium session across the requests.
- Fixture recorded **`networkAttempts=0`** for its page-context request
  interceptor. It used in-memory synthetic HTML, not real websites. This
  is not, by itself, a machine-wide network-egress audit.
- Operator reports cleanup of the synthetic Project/task, two separate
  Mongo databases, QA NextAuth storage states and QA environment files;
  QA server stopped. No real Dify/Entra or external actions were used.
- G1 host integration was reported committed/pushed as `580ab334`,
  followed by status/index documentation at `1e2f5c4a`, on
  `feat/project-agent-local-business`. Those are the operator-reported
  G1 host commits, not Presentation commits. No PR/merge was reported.
- Host-specific commit and test results above and below are **reported
  by the local agent**, not independently executed in this Presentation repository.
  The current GitHub connector could not read the private AI-WEB-CHAT
  commit/branch, so remote HEAD was not independently corroborated here.

## G1 local host goal acceptance (operator-reported, 2026-10-25)

**ACCEPTED only for one Next.js 14.2.16 worker, a local mock model
and an in-memory synthetic Chromium DOM goal.** Host used a dedicated
synthetic Project, Mongo/PostgreSQL run databases and NextAuth states.
The Dify-shaped SSE mock listened only on `127.0.0.1:3998`.
`PROJECT_AGENT_DURABLE_QUEUE=0` excludes durable multi-worker lease QA.

- `npm run test:host:g1`: **2/2 PASS**, **0 FAIL, 0 SKIP reported**.
  Positive case: real worker and runtime model transport performed three
  SSE turns (`snapshot`, `click`, `final`), followed by P8 verification
  and independent Chromium DOM checker; the persisted task became `done`
  and the final answer contained the application-authored receipt.
- Negative case: model claimed completion before any qualifying DOM change.
  Checker rejected the claim; persisted task became `failed`, with
  **no trusted receipt**. The test independently counted **4 total HTTP
  model POSTs** across both cases (three positive, one negative).
- On the integrated host checkout: G1 unit **8/8 PASS**, P8 unit
  **40/40 PASS**, P8 QA guard/session **8/8 PASS**, host TypeScript
  **PASS**, `git diff --check` **PASS**; all source files **<=299 lines**.
  Do not add overlapping suite subsets as independent pass totals.
- Host test correction only: the public task API intentionally strips
  `task.log`; the original Presentation E2E source incorrectly asserted
  on that field. The local host test removed that assertion and instead
  asserted a positive numeric `p8Verified` inside the trusted final
  receipt (**observed 2**). **No runtime guard changed.** The original
  source test therefore needs parity correction before reuse unchanged.
  Public task access does NOT prove task-log visibility or persistence.
- Local operator reports cleanup of QA Project/tasks, synthetic run
  Mongo/PostgreSQL databases, auth storage states and `.env.local`;
  the isolated server was stopped. No real Dify/Entra traffic or external
  mutations were performed. No machine-wide network audit was done.

This evidence proves bounded **mock-model task-goal completion through
the real single-worker/tool-continuation path**, not semantic completion
on arbitrary websites, external model performance, exactly-once
transactions, cross-worker recovery, full security or deployment readiness.

**Recorded SKIP:** one focused-suite skip remains a SKIP, not a PASS.
Obtain its test name/reason in the next closeout report; do not silently
convert it into an accepted production scenario. Preserve actual console
outputs, SHA and redacted fixture receipts with the local QA handoff.

## What is accepted / not accepted

| Boundary | Decision |
| --- | --- |
| P8 synthetic Next 14 host L1 report-only behavior | CLOSED, operator-reported |
| P8 synthetic Next 14 host L2 no-progress escalation | CLOSED, operator-reported |
| Owner/nonmember Watch access and same-process takeover/handback | CLOSED, operator-reported |
| Synthetic fixture cleanup and page-context zero-request check | CLOSED, operator-reported |
| G1 goal completion: real single worker + local mock SSE + synthetic Chromium DOM | CLOSED, operator-reported 2/2 |
| G1 premature model-final rejection / trusted receipt gate | CLOSED, operator-reported |
| Real provider / ordinary Dify goal completion and tool continuation | OPEN, requires separate authorization |
| Real multi-Next-worker browser session ownership, failover and Stop fencing | OPEN |
| Real Entra, real Dify, security audit, staging and production rollout | OPEN, separately authorized |

## Next gates, in order

### G1 — Synthetic runtime task-goal E2E: ACCEPTED (bounded)

The isolated AI-WEB-CHAT host closed the **single-worker / localhost
mock-model / synthetic DOM** G1 acceptance on the operator's report.
See [G1 local runtime QA](G1_LOCAL_RUNTIME_QA.md) for exact scenario
and reproducible setup. The positive and premature-final negative tests
both PASS; four localhost model POSTs were counted. The original source
test's public `task.log` assertion was removed **only in the integrated
host test** and replaced with a trusted receipt `p8Verified > 0` check
(observed 2). No G1 runtime guard was weakened.

**Still outside this G1 acceptance:** production-like tool failure,
malformed responses, timeout and Stop race matrices; handback/stale-plan
behavior remains covered separately by P8 synthetic takeover QA.
A local mock cannot establish success with a real model or ordinary Dify;
that belongs to authorized integration/security acceptance (G3).
No additional external Dify/Entra/model calls are authorized here.

### G2 — Two genuine Next.js workers and session recovery

Use two OS processes with shared QA Mongo and a controlled routing topology.
Validate single session ownership or an explicit affinity/coordinator
strategy: concurrent takeovers, remote Stop, lease expiry, worker crash and
restart, stale worker fencing, task/control revision, Watch visibility,
cleanup and no duplicate irreversible action. A process-local global Map
must fail closed; it cannot be described as cross-process persistence.
Report pass/fail separately for browser continuity and durable task leases.

### G3 — Security and authorized integration

Review QA-only routes/flags disabled in production, owner access controls,
Origin/CSRF, SSRF/DNS rebinding/WebSocket paths, screenshot redaction,
storage-state and secret boundaries, high-impact approval gates, network
egress and audit/retention behavior. Test real Entra and Dify **only in
an authorized test tenant/environment** with explicit credentials/access
approval. No real external mutations are implicitly authorized by QA.

### G4 — Release readiness

Use a production-like staging build, versioned migrations, rollback,
resource/cost/latency metrics, failure alerts, monitoring, bounded
concurrency and feature-flag rollback. Regress P7 with P8 flags disabled
and both P8 L1/L2 modes. Record independent success/failure counts and
document any SKIPs. PR/merge/deployment require a separate decision.

## Handoff discipline

- Keep source work on `gpt/full-project-agent`; host QA work belongs to
  `feat/project-agent-local-business` until explicitly reviewed.
- Do not alter `main`/`staging`, create a PR or trigger CI as part of this
  status-only closeout.
- For each future gate record **source SHA, host SHA, exact commands,
  Next/Chromium versions, PASS/FAIL/SKIP, test prerequisites, anonymized
  receipts and cleanup results**. Never commit NextAuth cookies or QA secrets.
- See [active-session closeout](P8_ACTIVE_SESSION_CLOSEOUT.md),
  [local QA handoff](P8_LOCAL_QA.md) and [roadmap](P8_ROADMAP.md).
