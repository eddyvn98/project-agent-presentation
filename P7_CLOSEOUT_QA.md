# P7 closeout acceptance — CAS and Stop cleanup

Scope: `gpt/full-project-agent`, isolated AI-WEB-CHAT QA host only. Do **not**
merge to `main`/`staging`, run CI, reuse employee sessions, or enable QA
fixture mode in a production process.

## What changed since the 31/31 local synthetic QA report

- Explicit Stop of an orphan synthetic browser task now cleans its Watch JPEG,
  control entry, and Chromium session immediately after marking the task
  cancelled. This is limited to a non-production host with
  `PROJECT_AGENT_P7_QA_FIXTURE=1`, an exact synthetic browser prompt and
  a `@project-agent.test` task owner. Employee tasks are not affected.
- Synthetic Mongo recovery CAS now **requires `updatedAt`**. A missing
  version is a conflict, never an unconditional write.
- Both CAS and the read-only mapping probe use the host-declared
  `COLLECTION = "project_agent_tasks"` (snake_case), not the obsolete
  `projectAgentTasks`. The host-schema contract compares the **actual**
  `services/mongodb/projectAgentTasks.repo.ts` declaration to the adapter.
- Owner-only `GET /api/projects/:projectId/agent/p7-qa?taskId=...&verifyCas=1`
  compares the stored synthetic task with the expected collection, `_id`,
  owner, Project, prompt, status and timestamp. It returns
  `{casMappingVerified:true}` (200), otherwise 409. No DB writes.
- Focused host test creates a disposable browser fixture, calls the normal
  Stop route, checks task `cancelled`, verifies the frame is gone and
  Chromium is disconnected, then rejects `recover`. Cleanup is in
  `finally`.

## Preconditions

Use a clean, isolated QA host and two synthetic dev identities. Do not
use real Entra credentials or customer data. Start its host with:

```bash
PROJECT_AGENT_RUNTIME=sandbox
PROJECT_AGENT_BROWSER_AGENT=1
PROJECT_AGENT_P7_QA_FIXTURE=1
# Set NEXTAUTH_URL to the actual isolated QA origin.
```

Chromium must be installed for the **host process**. Keep the established
SSRF/private-network guards unchanged.

**Status update (25 Oct 2026):** The earlier missing/empty synthetic
NextAuth sessions and isolated QA-host blocker were resolved locally in an
AI-WEB-CHAT integration worktree. The operator reported isolated QA on port
3005 with separate Mongo/PostgreSQL/data and synthetic owner/nonmember
identities. **CAS/Stop closeout 2/2 PASS**, while host API still has
**21 PASS, 6 intentional SKIP**; this is not production acceptance.
See [P7_STATUS.md](P7_STATUS.md) for exact evidence and remaining gates.
Port 3004 remains a non-isolated dev host: do not run Stop or destructive QA
fixtures there. When rebuilding isolated QA, use the documented login-state
preflight; never fabricate cookies, copy real Chrome profiles or use
production identities.

```bash
export P7_ISOLATED_QA=1
export P7_HOST_BASE_URL=http://127.0.0.1:3005 # match the isolated host
# Also set P7_OWNER_EMAIL, P7_OTHER_EMAIL, and BOTH Playwright storage-state paths.
npm run p7:qa:session # live, read-only check of both signed-in identities
```

After confirming isolation and auth, explicitly permit mutations on this exact
host only:

```bash
export P7_QA_MUTATION_ALLOWED_ORIGIN=$P7_HOST_BASE_URL
export P7_ALLOW_QA_STOP=1
```

The `test:host:p7:closeout` command runs the session preflight in mutation
mode **before** Playwright; any missing session, wrong identity, or mismatched
approved origin aborts before fixture creation or Stop.

## Single local-agent QA pass

```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
git diff --check
npm ci
npm run check:lines
npm run check:agent-routes
npm run test:p7:closeout
npm run test:agent
npx tsc --noEmit
```

**Required host-schema gate** (run after pulling into the AI-WEB-CHAT host
checkout, where `services/mongodb/projectAgentTasks.repo.ts` exists):

```bash
npm run test:p7:host-schema
# Or from standalone Presentation checkout, point to the real host source:
P7_HOST_TASK_REPO_PATH=/absolute/path/to/AI-WEB-CHAT/services/mongodb/projectAgentTasks.repo.ts npm run test:p7:host-schema
```

The contract **fails** when the host repository file is missing; no synthetic
fallback/skip is treated as a PASS. It must confirm `project_agent_tasks`
before the authenticated `verifyCas=1` E2E check. Never change Mongo data
to satisfy this source-level check.

Set the same authenticated QA variables documented in
`P7_INTEGRATED_LOCAL_HANDOFF.md`. In particular, provide
`P7_HOST_BASE_URL`, `P7_OWNER_STORAGE_STATE`, `P7_OTHER_STORAGE_STATE`,
and `P7_PROJECT_ID`. If synthetic fixtures have not been created, run the
QA bootstrap on the **isolated host** only and source its private variables:

```bash
export P7_ISOLATED_QA=1
npm run p7:qa:create
. .p7-auth/p7-vars.sh
export P7_ALLOW_QA_STOP=1
npm run test:host:p7:closeout
npm run test:host:p7 -- --project=host-api
npm run test:host:p7 -- --project=desktop-ui
npm run test:host:p7 -- --project=mobile-ui
```

If the fixture was created for this run, invoke
`npm run p7:qa:cleanup` once testing finishes, including after a failure.
Never delete an untracked Project or reuse a production database.

## Acceptance gates

1. Source-level host-schema contract PASS, then host schema probe returns
   HTTP 200 and `casMappingVerified:true`.
   If it returns 409, check the **host-owned** task repository's collection
   name, `_id` type and `updatedAt` representation. There is no fallback
   to an unconditional `markRunning` update.
2. Stop synthetic browser test confirms no saved Watch frame, no live
   browser context and recovery 409 after Stop.
3. Race tests preserve active human takeover; rejected Chromium preparation
   clears resources and a stale Mongo version cannot update state.
4. All focused tests and existing Agent tests PASS without new unexpected
   SKIPs; report exact counts, current Git SHA and QA host SHA.
5. Entra login with a real account is a **separate acceptance gate**.
   NextAuth provider/callback metadata and synthetic login do not count.

The earlier 31/31 Playwright result belongs to the previously tested host
worktree, not to this later Git commit. P7 can be marked complete for
**synthetic QA** only after the new host regression passes. Do not claim
production readiness or begin a dependent P8 rollout from source-only checks.
