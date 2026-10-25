# P8 — Assisted autonomous browser loops (development track)

## Status / scope

**P7: CLOSED for isolated synthetic/local QA, NOT approved for production.**
Evidence: 67/67 P7 regressions, 1/1 Mongo contract, 2/2 host CAS/Stop,
owner 200 / nonmember 404, typecheck PASS, as reported by the local operator.

**P8: synthetic Next 14 host L1/L2 + takeover/handback QA ACCEPTED
(operator-reported, 2026-10-25); real-model, multi-worker and release gates OPEN.**
Host branch `feat/project-agent-local-business`: P8 code `4aec99a4`,
status/index `ca65a8e104664536216183d8bfd102f730ea9376`.
Reported host focused 115 PASS / 1 SKIP; P8 guard/session 8/8 PASS;
L1 and L2 each 1/1 PASS. Host evidence precision correction: `3351ae4c`.
**G1 synthetic task-goal E2E is also ACCEPTED for one Next 14.2.16 worker,
loopback mock SSE and synthetic Chromium DOM only** (operator-reported):
host code `580ab334`, status/index `1e2f5c4a`.
G1 host `test:host:g1` **2/2 PASS** (positive and premature-final
negative); G1 unit **8/8**, P8 unit **40/40**, P8 guard/session **8/8**,
TypeScript and diff checks PASS, all files <=299 lines.
See [P8 status](P8_STATUS.md) for evidence limitations and G2–G4 gates.
The baseline DOM-first browser, visual fallback, Browser Watch,
takeover/handback, approvals, per-task leases, runtime StallGuard,
ActionReplayGuard and token/cost accounting already existed before P8.
We extend those, not replace the app harness or install the
Loop Engineering CLI in the production runtime.

Inspired by [loop-engineering](https://github.com/cobusgreyling/loop-engineering)
(Loop Design Checklist, Failure Modes, Safety, Maker/Checker and L1 → L2).
It is a methodology/pattern reference, not a Playwright replacement.

## Implemented behavior (all feature-flagged)

| Feature | P8 contract |
| --- | --- |
| Maker → checker | Browser action executes, then a separate read-only checker compares input value, URL or DOM snapshot; tool return alone is not treated as verified progress |
| L1 reporting | `PROJECT_AGENT_P8_LOOP=1` and `PROJECT_AGENT_P8_LOOP_REPORT_ONLY=1`: record evidence and warnings, do not block existing P7 operations |
| L2 assisted safety | `PROJECT_AGENT_P8_LOOP=1` without report-only: cap at 48 active browser actions and 12 minutes of active work; repeated no-progress attempts recommend human help |
| Stalled DOM operations | Same failed ref+page+snapshot cannot be retried indefinitely; a fresh snapshot/changed ref offers a different approach; existing `ActionReplayGuard` also protects external mutations |
| Human takeover | Existing Watch control pauses the Agent and invalidates stale refs; P8 logs takeover/handback, resets the no-progress streak but does NOT refund its action budget |
| Loop timeline | Owner-only GET Browser Watch includes bounded numeric/event metadata; React Watch panel shows progress, unverified steps and assistance status in current UI language |
| Privacy | No raw DOM, form values, full URL or secrets in P8 telemetry; SHA-256 fingerprints live only in memory for the stall detector |
| Run receipt | At run finalization emit `p8_loop_metrics` with numeric counts into existing task logs; 30-day account observability aggregates actions, progress and interventions |
| Quality benchmark | Existing 40 isolated synthetic Chromium fixtures have independent DOM assertions; P8 scorecard only accepts complete 40/40 verified cases with bounded retries |
| G1 app-owned goal receipt (synthetic QA only) | Real single-worker model SSE continuation drives Chromium; independent checker requires the fixture DOM target and P8 evidence before terminal `done`; final answer contains an app-authored receipt. Outside exact QA identity/flags, this goal checker is disabled |

Limits: an observed DOM/value change is **not** proof the user's overall
task or external transaction succeeded. Do not let a model declare its own
goal verified. High-impact actions still require approval in the existing
browser safety pipeline. No auto-submit, auto-merge or unattended production
actions are authorized by P8 flags alone.

## Opt-in rollout

Everything remains off by default; P7 behavior is unchanged without flags.

```bash
# L1: report-only while local QA collects evidence
PROJECT_AGENT_P8_LOOP=1
PROJECT_AGENT_P8_LOOP_REPORT_ONLY=1

# L2: only after the isolated QA acceptance below
PROJECT_AGENT_P8_LOOP=1
PROJECT_AGENT_P8_LOOP_REPORT_ONLY=0
```

Existing `PROJECT_AGENT_P8_STALL_GUARD=1` can explicitly enable the
old DOM retry guard independently; assisted P8 enables it automatically.
The same root task continues through Watch and takeover. No new AI API key,
scheduler, dependency or network access is needed.

## Active session QA extension

A dedicated [Next 14 P8 synthetic Chromium fixture](P8_ACTIVE_SESSION_CLOSEOUT.md)
creates a QA task without a worker and then launches the **real browser
session in the authenticated browser control route** to test Watch,
independent DOM checking, takeover/handback and owner/nonmember isolation.
It is strictly limited to a disposable loopback host at port 3005 or 3006,
with exact Origin, synthetic owner/Project and explicit flags.
The fixture/session bridge stays within one OS process; cross-process
browser session persistence remains a separate release gate.

## G1 single-worker synthetic goal acceptance — CLOSED (operator-reported)

On isolated AI-WEB-CHAT Next.js 14.2.16, the local SSE mock
(`127.0.0.1:3998`) executed three positive turns
(`snapshot -> click -> final`) through the real worker/browser runtime,
then one negative premature-final turn. **Four POSTs in total.**
Real Chromium DOM and P8 verification independently accepted the positive
goal; the task ended `done` with a trusted receipt (`p8Verified=2`).
The premature-final model claim ended `failed` with no trusted receipt.
The host closeout is **2/2 PASS**; all synthetic QA resources were removed.

**Host test adaptation:** the public task API deliberately omits
`task.log`. The integrated host test removed the source-only assertion
on this field and instead checked the trusted receipt's numeric
`p8Verified > 0`. The runtime checker and terminal guard were unchanged.
The original Presentation E2E source test still needs parity adjustment
before being reused unchanged. These are **operator-reported** results.

This does not authorize or prove real Dify/Entra, genuine internet tasks,
multi-worker takeover recovery, machine-wide network egress audit,
production security or release readiness. **G2 multi-worker browser
recovery: OPEN; G3 authorized real Dify/Entra integration and security
review: OPEN; G4 staging and production readiness: OPEN.** See
[P8 status](P8_STATUS.md) and [G1 runbook](G1_LOCAL_RUNTIME_QA.md).

## Local acceptance gates

1. Focused P8 Vitest tests PASS for checker, owner isolation, budget,
   report-only parity, escalation, takeover, TTL, metrics and scorecard.
2. TypeScript, per-file limit (<300), diff check, P7 regression suite PASS.
3. Opt-in 40-fixture real Chromium benchmark PASS using local in-memory HTML.
4. On the **isolated AI-WEB-CHAT QA host**: owner gets loop status, nonmember
   404; report-only does not block baseline; assisted pauses after no-progress;
   real user takeover/handback works with fresh snapshot, never replays a
   stale click; Stop and screenshot cleanup still pass.
5. Benchmark report must capture exact Presentation SHA, host checkout SHA,
   Next version, browser version, PASS/FAIL/SKIP, retry count and elapsed time.
   The report must distinguish *observed progress* from *goal completion*.

## G2 — Two-worker ownership QA PASSED; recovery remains OPEN

G2 introduces the **off-by-default, synthetic-only** Mongo browser
ownership CAS ledger (token/epoch/revision, lease heartbeat, Stop
fencing and human control), without pretending that live Chromium,
Watch screenshots or tab references are shared across processes.

Local agent reports QA on AI-WEB-CHAT Next.js 14.2.16,
based on host HEAD `1e2f5c4a` with Presentation source
`ba89dfdd`: G2 unit **4/4 PASS**, two Node workers + isolated
Mongo **5/5 PASS**, two independent Next workers + real Chromium
`test:host:g2` **1/1 PASS** for owner contention, nonmember isolation,
Agent click, takeover/manual/handback and remote Stop fencing.
Post-fix host regressions: P7 **40/40**, P8 **40/40**, P8 QA **8/8**,
G1 **8/8**, TypeScript and diff check PASS (local-agent reported).
Two Mongo and one Postgres run DB, synthetic tasks/auth/env were
cleaned; Next servers stopped and ports freed.

**Root-cause correction ported to Presentation:** `withBrowserOp`
no longer infers human ownership from `countAgentAction=false`.
Uncounted fixture setup uses `agent`; takeover/manual/personal-auth
uses explicit `human`. Regression coverage added.
The Next 14 host canonicalizes `req.nextUrl.origin` to `localhost`
on some setups; G2 preflight and host test accept strictly matched
loopback hostnames on 3005/3006. Use **separate Next checkout/build
directories**; never share `.next` across both dev servers.
The origin policy's new Node tests ran **4/4 PASS** in source-authoring
environment. The new browser-mode Vitest test and post-port full host
regression are **NOT RUN here**, requiring local agent validation.

**Remaining G2 host gate is now executable, not yet accepted:**
`npm run test:host:g2:crash` is a new guarded interactive orchestration
suite. It starts two real Next process groups from distinct QA checkouts
and build directories; SIGKILLs A after one verified Chromium click;
tests old lease isolation, forced synthetic expiry/quarantine,
post-crash operator-reviewed restart on B, epoch-scoped stale-ref denial
and no automatic replay using a QA-only action ledger.
Requires real isolated host Mongo/Postgres/NextAuth and a terminal;
**host PASS/FAIL/SKIP NOT RUN in the authoring environment**.
See [G2 crash/recovery handoff](G2_CRASH_RECOVERY_QA.md).

**G2 remains OPEN:** No *two-Next-host* worker crash -> lease
quarantine -> owner-reviewed fresh browser restart -> old-action
fencing/no-replay E2E has passed. Existing 5/5 Mongo/Node QA
cannot replace that acceptance. G3 real Dify/Entra/security and G4
staging/production release are also OPEN. See
[G2 multi-worker handoff](G2_MULTIWORKER_QA.md)
and [P8 status](P8_STATUS.md).

## Release gates remaining after P8 + bounded G1 synthetic acceptance

- P8 loop budgets, Watch frames, Chromium tab and local browser controls
  remain process-local. G2 shares Mongo *ownership/revision*, not the
  live page or UI frames. Multi-host browser-worker crash/recovery still
  requires dedicated host E2E and a reviewed fresh-session design.
- Read-only checker is deterministic, **not a separate independent model**.
  Complex semantic goals need explicit acceptance assertions or human
  verification before declaring task success.
- Screenshot UI does not show a native streamed Chromium window; Watch
  uses masked opt-in frames/live previews, not uncontrolled OS remote desktop.
- Hard budgets are local guardrails, not proof of exactly-once transactions.
  Already-dispatched external mutations cannot be rolled back.
- Production-grade Entra, real Dify, staging, threat review, multi-worker
  browser sessions, cost alerts and rollback remain separate release gates.

See [P8 status and next gates](P8_STATUS.md) and [P8 local QA](P8_LOCAL_QA.md) for executable commands. Do not run CI,
access real external Dify/Entra, touch `main/staging`, or merge during P8 QA.
