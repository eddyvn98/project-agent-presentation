# P7 acceptance status — 2026-10-25

## Final milestone decision — 2026-10-25

**P7 DEVELOPMENT / ISOLATED LOCAL QA: CLOSED. P8 DEVELOPMENT: OPEN.**
**P7 PRODUCTION RELEASE: NOT APPROVED.**

The user authorized moving to P8 after local QA on a separate AI-WEB-CHAT clone:

- P7 integrated regression **67/67 PASS**, TypeScript **PASS**, diff check **PASS**.
- Host Mongo contract **1/1 PASS** (collection `project_agent_tasks`).
- CAS/Stop and Chromium cleanup E2E **2/2 PASS**.
- Project owner received HTTP **200**; nonmember received **404**.
- Initial blocker was mismatched credentials for the QA Mongo instance.
  The operator used isolated Mongo/PostgreSQL and synthetic accounts,
  cleaned the created Project, tasks, database and login-state files;
  ports 3000–3006 were reported closed after QA.
- Main AI-WEB-CHAT checkout and its dirty edits were preserved; the
  dedicated QA clone remained uncommitted. No external Entra/Dify or staging
  tests were run. These are **operator-reported**, not freshly run here.

Scope boundary: P7 closure means the agreed local development/QA work is
accepted. Release gates (Entra SSO, real Dify, production-like staging,
full security review, two full Next.js Agent workers) stay in a separate
release backlog. No production deployment is authorized by this decision.
See [P8 roadmap](P8_ROADMAP.md).

## Decision

**P7 synthetic integration QA: ACCEPTED with documented skips.**
**P7 production readiness: NOT ACCEPTED; this is a release gate, not a blocker to starting P8 development.**

Evidence comes from the local AI-WEB-CHAT integration worktree on branch
`feat/project-agent-local-business`. The worktree is **dirty/uncommitted**;
the reported tests do not represent an exact clean-clone acceptance of
`eddyvn98/project-agent-presentation` at a specific SHA. The Presentation
branch remains a separately versioned source handoff.

## Verified in isolated local host (reported by local QA)

- Dedicated QA host: `http://localhost:3005`, separate MongoDB on 27019,
  PostgreSQL on 55433, and separate data directory; synthetic owner and
  nonmember identities. The existing development host on port 3004 was left
  untouched. Chromium launched and produced an in-memory JPEG.
- Host Playwright API: **21 PASS, 6 SKIP of 27**. Skipped scenarios require
  deliberately disabled services/flags: real Entra login, Dify calculator,
  task creation/retry actions and crash injection. Skips are **not passes**.
- Desktop Project Agent UI: **3/3 PASS**; mobile UI: **3/3 PASS**.
  Browser Preview open/close was exercised.
- Isolated host CAS/Stop closeout: **2/2 PASS** (including JPEG/session
  cleanup after Stop and refusing recovery of the stopped synthetic task).
- Host Mongo source contract: **1/1 PASS**; actual collection name
  `project_agent_tasks` and shared CAS collection constant.
- Focused P7 closeout Agent tests: **37/37 PASS**.
  Node QA/auth preflight: **12/12 PASS**.
- Full Agent suite: **391 PASS, 1 SKIP**.
  TypeScript, protected-route checks, and `git diff --check`: **PASS**.
- One initial empty Preview occurred during cold Next.js route compilation.
  Retried closeout was **2/2 PASS**, and the API suite subsequently reached
  **21 PASS / 6 SKIP**. Not reproduced in later reported runs.
  Do not label the cold-compile observation a fixed defect without a repro.

These are **operator-reported results**, not tests freshly run from this
GitHub branch or proof of production behavior. No real Entra credentials,
real Chrome user profile, or external Dify actions were exercised.
At the time of the report, QA port 3005 was intentionally left running for
review; do not stop or delete its resources without operator approval.

## Follow-up: safe per-gate local checks (operator-reported)

These checks were run after the isolated host acceptance above on the dirty
AI-WEB-CHAT integration worktree. They are **additional evidence**, not a
replacement for the earlier 21-PASS/6-SKIP host API suite or proof of
production readiness.

- **Task creation/retry/idempotency API: 7/7 PASS** using a Dify stub restricted
  to loopback, with no external network requests. **Three synthetic tasks
  ended `failed`** because the real model/runtime was not configured.
  These API passes establish request routing, retry and idempotency behavior
  only; they **do not prove successful Agent execution**.
- **Chromium crash/recovery: 1/1 PASS**, confined to a single synthetic
  browser session. No multi-worker, concurrent-lease or distributed crash
  recovery validation was performed.
- **QA/SSRF guards: 10 safety checks PASS**. Prior host checks also passed
  scoped access, Origin and artifact controls. This is **focused security
  evidence**, not a completed security audit or penetration test.
- **External Dify/API-key access: NOT AUTHORIZED / NOT RUN.** A separate
  explicit confirmation was requested but **not received**. Do not send any
  external Dify request, expose credentials or imply the real calculator ran.
- No production/Entra identity was used. The three intentionally failed
  synthetic tasks are QA artifacts, not successful model results. Preserve
  their provenance and clean up only under the isolated QA manifest policy.

## P7.6.1 — local mock runtime E2E (operator-reported PASS)

**PASS within synthetic/local scope**, not production acceptance. The local
AI-WEB-CHAT QA clone started an isolated temporary host on port 3006, issued
an HTTP 202 task, and completed the task end-to-end using a single worker
with `PROJECT_AGENT_RUNTIME=sandbox` and **`PROJECT_AGENT_DURABLE_QUEUE=0`**.
A Dify-shaped SSE mock listening exclusively on `127.0.0.1:3999` received
exactly **one** streaming request, responded with `agent_message` and
`message_end`, and returned a valid final model action. Task receipt:
`pat_7b4f9d029c42`, `status=done`, nonempty conversation ID, coherent
creation/completion timestamps, zero artifacts, and result text:

`P7.6.1 local mock runtime succeeded: task completed end-to-end.`

Post-completion auto-title attempted a **dummy** loopback endpoint on
`127.0.0.1:9` and logged `fetch failed`; the completed task remained
`done`. No non-loopback Dify request was sent. Port 3006/mock were
stopped; QA 3005 was left untouched.

**Not proven by P7.6.1:** Mongo lease ownership, heartbeat, expiry,
Stop races, restart, cross-worker idempotency or real Dify/Entra. Its
runtime success does not retroactively turn the earlier three failed
synthetic tasks into successes.

## P7.6.2 — Multi-worker Mongo recovery (implementation in progress)

Added cross-worker Stop lease revocation in `durable-mongo-queue.ts`
and `task-stop.ts`, with a mock-backed source-module regression and
a separate disposable real-Mongo smoke harness spawning two OS workers.
The harness checks one claim/one action, crash/expiry quarantine and
remote Stop blocking the next action. It is restricted to a fresh
`p7_multiworker_qa_*` database on `127.0.0.1:27019`.

**Local QA on exact source SHA `602f8cca`: partial PASS.**
Focused source-module/unit tests **10/10 PASS** with atomic Mongo fake.
Two real Node child processes and QA Mongo `127.0.0.1:27019`:
**3/3 PASS** (one claim/one action; crash+expiry quarantine with zero replay;
remote Stop fences old/new workers and zero action). Temporary
`p7_multiworker_qa_*` database was deleted after the run; existing
`p7qa_project` was preserved. TypeScript/diff check passed.
The first run used `node --input-type=module` and a fork inherited the flag;
the supported direct script entrypoint subsequently passed 3/3.
This is **Mongo/process smoke acceptance only**, not two Next.js
workers using the real Agent runtime. The source-module unit tests
and process harness cover complementary boundaries.

**Terminal-write hardening (later locally regressed):** Stop and late
model success/failure now compete on the same Mongo task document using
conditional status writes; old workers cannot overwrite Stop's
`failed/cancelled` state with `done`. Added regression for both
race orders, lost lease and ownership. A complete two-Next.js-worker
run with loopback mock is still required; the production gate remains OPEN.
See [P7.6.2 QA runbook](P7_6_2_MULTIWORKER_QA.md).

## P7.6.3 — Focused local security review

Focused source hardening adds credential-bearing URL rejection,
fail-closed production browser audit logging, origin-only Browser Watch
location/diagnostics, redacted page console text, and strict dev/test-only
synthetic QA fixture identity checks. New SSRF/authz/secrets/audit/production
guard tests have been committed, but **not yet run in the operator's
integrated host clone**. This is not a complete security audit.
See [P7.6.3 security review](P7_6_3_SECURITY_REVIEW.md) for
remaining DNS rebinding, authenticated route and retention gates.

## Acceptance gates remaining before production

| Priority | Gate | Evidence so far | Remaining to close |
| --- | --- | --- | --- |
| P0 | Microsoft Entra authentication and authorization | Dev synthetic session/metadata only | Authorized test-tenant sign-in/out, callback URI, expiry/revocation and owner/nonmember isolation |
| P0 | Real Dify / app calculator transport | Loopback stub API flow only; 3 model tasks `failed` | **Wait for explicit API-key/external Dify approval**, then controlled real tool dispatch, exact receipt, timeouts, permissions and cost |
| P0 | Task creation, retry, Stop and idempotency | **7/7 API PASS**, **P7.6.1 one-worker mock E2E PASS**, CAS/Stop closeout **2/2 PASS** | Durable cross-worker lease, Stop fencing, no duplicate external action after restart |
| P0 | Chromium crash and multi-worker recovery | **1/1 single-session PASS**, **10/10 source unit PASS**, **3/3 two-OS-process Mongo smoke PASS** | Two Next.js workers with loopback mock, terminal CAS regression on integrated host, heartbeat/Stop/takeover resource ownership |
| P0 | Security and data isolation | **10 safety PASS** plus host ACL/Origin/artifact checks | Full threat review, SSRF/ACL regression breadth, audit/secrets/retention, QA route disabled in production |
| P1 | Operational release controls | Isolated development QA only | Production-like staging smoke, build, rollback, monitoring, capacity and failure-response runbook |

Do not merge to `main`/`staging` or enable production tasks until these gates
are measured in a controlled environment. The six skipped API tests should
be reported individually with `PASS / FAIL / SKIP`, prerequisites and
whether an external provider was contacted.

## Proposed next development sequence

**P7.6 — Production gate closure (first).** The loopback API and
single-session crash tests now have focused PASS evidence. Next prioritize
multi-worker lease/restart testing as P7.6.2, then a security
threat review; the one-worker mock/local runtime E2E is now accepted only
within its explicitly disabled durable-queue configuration.
The external Dify calculator remains **blocked pending explicit user approval**
for API-key use and non-loopback traffic. Real Entra login requires an
authorized test tenant and must not be replaced by synthetic session evidence.
For every gate retain SHA, environment, PASS/FAIL/SKIP and a redacted receipt.

**P8 — Assisted autonomous browser workflows (development now authorized).**
Use a small benchmark of authorized real-world web tasks to select DOM-first
automation, screenshot/computer-use fallback, live Watch timeline, human
takeover/handback and safe retry policy. Track completion, intervention,
duplicate actions, latency, tool failures and browser cost. Treat external
mutations as confirmation-gated, auditable steps rather than blindly replayed
browser actions.

## Handoff discipline

- Develop on `gpt/full-project-agent`; commit/push Git only, no ZIP.
- Keep files under 300 lines, with focused tests and exact SHA evidence.
- Do not auto-run CI or merge `main`/`staging`.
- Host-specific QA data and uncommitted AI-WEB-CHAT changes must not be
  described as GitHub changes or clean-clone acceptance.
- See [P7 closeout runbook](P7_CLOSEOUT_QA.md) for isolated host controls.
