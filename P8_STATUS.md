# P8 status and next acceptance gates — 2026-10-25

## Decision

**P8 SYNTHETIC LOCAL HOST ACCEPTANCE: CLOSED (operator-reported PASS).**
**P8 REAL MODEL/RUNTIME GOAL ACCEPTANCE: OPEN.**
**P8 MULTI-WORKER BROWSER RECOVERY: OPEN.**
**P8 PRODUCTION RELEASE: NOT APPROVED.**

This status supersedes the older "P8 host QA not accepted" wording in the
active-session handoff and roadmap. It is a bounded development QA decision,
not a production or end-to-end semantic-goal success claim.

## Evidence and provenance

- Source handoff: `eddyvn98/project-agent-presentation`, branch
  `gpt/full-project-agent`, source commit
  `8ae555e541cd2fc596b543ffb850254166f79e32`.
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
- Host-specific commit and test results above are **reported by the local
  agent**, not independently executed in this Presentation repository.
  The current GitHub connector could not read the private AI-WEB-CHAT
  commit/branch, so remote HEAD was not independently corroborated here.

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
| Successful goal completion by an actual model and task runner | OPEN |
| Ordinary Dify action dispatch/continuation under real model responses | OPEN |
| Real multi-Next-worker browser session ownership, failover and Stop fencing | OPEN |
| Real Entra, real Dify, security audit, staging and production rollout | OPEN, separately authorized |

## Next gates, in order

### G1 — Runtime task-goal E2E (next development acceptance)

**Implementation update:** deterministic G1 loopback SSE model, guarded
synthetic worker fixture, app-owned DOM checker and terminal receipt contract
are committed on this Presentation development branch. See
[G1 local runtime QA](G1_LOCAL_RUNTIME_QA.md). The host E2E suite must still
run in an isolated Next 14 host before this gate can be accepted.
No G1 host PASS, model execution or production approval is claimed here.

Run from a separate, disposable AI-WEB-CHAT QA clone. First use a local
Dify-shaped model mock with the **actual task/worker/tool continuation**
path and synthetic in-memory Chromium HTML. Confirm at least:

1. A queued HTTP task runs through the worker, model turn(s), browser action
   transport, maker/checker, durable task receipts and terminal `done`.
   Independently assert the desired DOM state; never equate `verified`
   activity with successful user-goal completion.
2. A changing DOM/ref requires a refreshed snapshot after handback; the
   stale model action must not execute. Test no-progress escalation and
   Stop/cancellation with zero later browser mutation.
3. Inject tool failure, malformed model action, timeout and model-declared
   success without goal evidence. None may be counted as independently
   completed goals. Confirm task-log metrics and owner-only observability.
4. Keep all test pages local/in-memory, all credentials synthetic and
   irreversible/external operations disabled. Report total tasks,
   goal assertions, retries, interventions, failures, tokens and latency.

Then, **only with separate explicit authorization**, run controlled
real-model/ordinary-Dify continuation and check tool dispatch, result
correlation, retry discipline, cost and task termination. A local mock
PASS does not close the real-model portion of G1.

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
