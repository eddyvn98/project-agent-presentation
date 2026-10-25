# P7 acceptance status — 2026-10-25

## Decision

**P7 synthetic integration QA: ACCEPTED with documented skips.**
**P7 production readiness: NOT ACCEPTED.**

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

## Acceptance gates remaining before production

| Priority | Gate | Evidence so far | Remaining to close |
| --- | --- | --- | --- |
| P0 | Microsoft Entra authentication and authorization | Dev synthetic session/metadata only | Authorized test-tenant sign-in/out, callback URI, expiry/revocation and owner/nonmember isolation |
| P0 | Real Dify / app calculator transport | Loopback stub API flow only; 3 model tasks `failed` | **Wait for explicit API-key/external Dify approval**, then controlled real tool dispatch, exact receipt, timeouts, permissions and cost |
| P0 | Task creation, retry, Stop and idempotency | **7/7 API PASS** with loopback stub; CAS/Stop synthetic closeout **2/2 PASS** | Successful end-to-end Agent completion, durable lease, no duplicate external action after restart |
| P0 | Chromium crash and multi-worker recovery | **1/1 PASS** for one isolated synthetic session | Multiple workers, concurrent takeover, lease fencing, restart and resource ownership |
| P0 | Security and data isolation | **10 safety PASS** plus host ACL/Origin/artifact checks | Full threat review, SSRF/ACL regression breadth, audit/secrets/retention, QA route disabled in production |
| P1 | Operational release controls | Isolated development QA only | Production-like staging smoke, build, rollback, monitoring, capacity and failure-response runbook |

Do not merge to `main`/`staging` or enable production tasks until these gates
are measured in a controlled environment. The six skipped API tests should
be reported individually with `PASS / FAIL / SKIP`, prerequisites and
whether an external provider was contacted.

## Proposed next development sequence

**P7.6 — Production gate closure (first).** The loopback API and
single-session crash tests now have focused PASS evidence. Next prioritize
successful end-to-end Agent completion with a controlled mock/local runtime,
then multi-worker lease/restart testing and a security threat review.
The external Dify calculator remains **blocked pending explicit user approval**
for API-key use and non-loopback traffic. Real Entra login requires an
authorized test tenant and must not be replaced by synthetic session evidence.
For every gate retain SHA, environment, PASS/FAIL/SKIP and a redacted receipt.

**P8 — Assisted autonomous browser workflows (after P7.6 gates).**
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
