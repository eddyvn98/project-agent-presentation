# P8 status and next acceptance gates — 2026-10-25

## Decision

**P8 SYNTHETIC LOCAL HOST ACCEPTANCE: CLOSED (operator-reported PASS).**
**G1 SINGLE-WORKER + LOOPBACK MOCK MODEL + SYNTHETIC DOM: ACCEPTED
(operator-reported PASS).**
**REAL DIFY/MODEL SEMANTIC GOAL ACCEPTANCE: OPEN.**
**G2 MULTI-WORKER BROWSER RECOVERY: OPEN — CRASH E2E HARNESS READY FOR HOST QA, NOT RUN.**
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
  source test has since been corrected on `gpt/full-project-agent`:
  public `G1_VERIFIED_RECEIPT` must contain numeric `p8Verified > 0`.
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
| G2 browser ownership CAS source and deterministic Node tests | IMPLEMENTED, unit 4/4 PASS |
| G2 real Mongo/two-process ownership and Next+Chromium takeover/Stop | Operator-reported 5/5 and 1/1 PASS |
| G2 Next-host crash/quarantine/reviewed browser restart | OPEN, E2E NOT RUN |
| Real Entra, real Dify, security audit, staging and production rollout | OPEN, separately authorized |

## Next gates, in order

### G1 — Synthetic runtime task-goal E2E: ACCEPTED (bounded)

The isolated AI-WEB-CHAT host closed the **single-worker / localhost
mock-model / synthetic DOM** G1 acceptance on the operator's report.
See [G1 local runtime QA](G1_LOCAL_RUNTIME_QA.md) for exact scenario
and reproducible setup. The positive and premature-final negative tests
both PASS; four localhost model POSTs were counted. The original source
test's public `task.log` assertion is now removed in **both** the
integrated host and Presentation test source. Both check the public
receipt's numeric `p8Verified > 0` (host observed 2); no runtime guard
was weakened.

**Still outside this G1 acceptance:** production-like tool failure,
malformed responses, timeout and Stop race matrices; handback/stale-plan
behavior remains covered separately by P8 synthetic takeover QA.
A local mock cannot establish success with a real model or ordinary Dify;
that belongs to authorized integration/security acceptance (G3).
No additional external Dify/Entra/model calls are authorized here.

### G2 — Two-process ownership/takeover/Stop: PASS; recovery OPEN

Local operator reports running the original G2 source from Presentation
`ba89dfdd6d36226f1553c3a3091879d830195069` in a separate
AI-WEB-CHAT QA worktree based on host HEAD `1e2f5c4a`
(Next.js **14.2.16**). Do not treat the base host SHA as a new
integration-commit SHA. Host results have not been independently rerun
in this Presentation source checkout.

- **G2 deterministic unit: 4/4 PASS.**
- **Two real Node workers + authenticated isolated Mongo: 5/5 PASS**:
  atomic lease race, human takeover, worker crash/quarantine/explicit
  reviewed restart, post-effect no-replay and Stop fencing.
- **Two independent Next.js processes + Chromium: `test:host:g2`
  1/1 PASS** with isolated Mongo/Postgres and synthetic owner/nonmember:
  worker B denied duplicate browser ownership; nonmember denied Watch;
  worker A performed Agent click, takeover/manual action/handback;
  remote Stop from B fenced further A actions; cleanup returned HTTP 200.
- Host regression after the local correction: P7 **40/40**, P8
  **40/40**, P8 QA **8/8**, G1 **8/8** PASS; TypeScript and
  `git diff --check` PASS. Ported files <=299 lines (max **276**).
  These figures are separate reported suites; do not infer CI PASS.
- Local host cleanup reported: synthetic Project/tasks, both Mongo run
  databases, PostgreSQL run DB, QA authentication states/environment
  files, and both Next servers removed or stopped; ports 3005/3006
  released. No real Dify/Entra or outside browser action was used.

**Host root-cause correction now ported upstream:** `withBrowserOp`
previously used `countAgentAction=false` as a proxy for human ownership.
P7 synthetic page setup is deliberately uncounted **Agent** work, so
the inferred human lease incorrectly denied and closed its Chromium
session. `session.ts` now accepts independent `ownershipMode`
(default `agent`); human takeover/manual/personal-auth callers pass
`human` explicitly. The source adds focused regression tests; this
follow-up source commit has **not** rerun the full host suite.

**Host origin/build caution:** Next 14 may canonicalize
`req.nextUrl.origin` to `http://localhost:<port>` even when the
server binds `127.0.0.1`. G2 preflight and API test now allow a
consistent **same-hostname** loopback pair (`localhost` preferred)
on ports 3005/3006 with exact `P8_QA_ALLOWED_ORIGIN`; never relax
Origin checks to arbitrary cross-origin requests. Each independent
Next dev server must use a separate checkout/build directory;
sharing `.next` creates build artifacts/race interference.

**New crash/recovery harness authored (NOT RUN on host):**
`npm run test:host:g2:crash` launches two independent marked Next
checkouts, records Node PIDs, kills owner A's process group after a
verified synthetic click, checks B's lease quarantine/no-replay,
demands post-crash operator review and explicit ticket, then opens
a new Chromium session on B with a higher lease epoch.
The source now allocates disjoint epoch-scoped DOM refs and records
only synthetic verified-click receipts in a QA-scoped Mongo ledger;
old refs must fail through the real browser action path.
The harness closes only its own processes and marked synthetic
task/lease/receipt; QA DBs/auth files remain explicitly operator-owned.
See [G2 crash/recovery runbook](G2_CRASH_RECOVERY_QA.md).

**G2 REMAINS OPEN:** no Next-host worker SIGKILL/restart with
browser lease expiry -> quarantine -> explicit reviewed **fresh
session** recovery has passed E2E. Five Mongo/Node tests prove the
ledger behavior, not Chromium restoration. Multi-worker task queue
recovery, old-reference invalidation across host restart,
exactly-once side effects and production readiness also remain
unproven. See [G2 host QA handoff](G2_MULTIWORKER_QA.md).
G3 and G4 remain open.

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
