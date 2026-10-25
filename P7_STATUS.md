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

## Acceptance gates remaining before production

| Priority | Gate | Required proof |
| --- | --- | --- |
| P0 | Microsoft Entra authentication and authorization | Authorized test-tenant sign-in/out, callback URI, session expiry/refresh, owner/nonmember isolation and expired/revoked session denial |
| P0 | Real Dify / app calculator transport | End-to-end tool dispatch, exact results and receipts, error/timeouts, access restrictions and controlled cost with explicitly enabled integration |
| P0 | Task creation, retry, Stop and idempotency | Authorized nonproduction task creation/retry, concurrent requests, no double execution after restart, durable lease and CAS observed in real DB |
| P0 | Chromium crash and multi-worker recovery | Controlled process/browser failure, frame/session cleanup, takeover ownership, restart handling, explicit approval to retry uncertain external actions |
| P0 | Security and data isolation | SSRF/private-network denial, file/history/frame ACLs, synthetic/QA endpoints disabled in production, secret handling, audit traces and retention |
| P1 | Operational release controls | Production-like staging smoke, build/typecheck, rollback, monitoring/alerts, resource ceilings and failure recovery runbook |

Do not merge to `main`/`staging` or enable production tasks until these gates
are measured in a controlled environment. The six skipped API tests should
be reported individually with `PASS / FAIL / SKIP`, prerequisites and
whether an external provider was contacted.

## Proposed next development sequence

**P7.6 — Production gate closure (first).** Build a repeatable opt-in
acceptance matrix with precise test flags, synthetic/staging credentials,
read-only preflight, and receipts showing which actions actually ran. Start
with controlled task creation/retry + Dify calculator, followed by isolated
crash injection. Real Entra login requires an authorized test tenant and must
never be silently replaced with a fabricated session.

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
