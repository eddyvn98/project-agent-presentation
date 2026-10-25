# P7.1 — Real host acceptance harness (local agent handoff)

Branch: `gpt/full-project-agent`. Baseline at start: `418a1f93cb0e890369f991e105873e06484b018b`.
No CI, production deployment, `main`, or `staging` changes were requested.

## Scope

This is **not** a Vite demo test. Run `playwright.host.config.ts` against a separately running, signed-in
AI-WEB-CHAT Next.js host with its configured authentication, MongoDB, Dify and browser runtime.
The neutral repository snapshot cannot start those host services.

Tests cover authenticated task history, invalid cursors, anonymous access, task lifecycle,
browser-owner boundaries, Origin rejection, optional takeover/release, file readback, PDF byte ranges,
cross-account isolation, Project Chat accessibility/responsiveness and a gated live calculator receipt.
Browser tests do not create user profiles or fetch secrets.

## Preparation

1. Have the local agent bring the verified P7 sources into the **isolated QA host checkout**; do not deploy to real employees.
2. Create a dedicated QA Project and two QA accounts: owner and an unrelated **non-member**.
3. Log in as each account through normal UI. Export Playwright storageState into a local private path
   (for example `playwright/.auth/p7-owner.json` and `playwright/.auth/p7-nonmember.json`).
   Never commit, print, attach, or upload cookie/session JSON. Files in `playwright/.auth/` are ignored.
4. Configure local environment variables (do not commit them):

```bash
export P7_HOST_BASE_URL=http://127.0.0.1:3004
export P7_OWNER_STORAGE_STATE=playwright/.auth/p7-owner.json
export P7_OTHER_STORAGE_STATE=playwright/.auth/p7-nonmember.json
export P7_PROJECT_ID=your-dedicated-qa-project-id
export P7_PROJECT_CHAT_PATH=/path-to-existing-signed-in-qa-project-chat
```

For remote staging/host QA only, explicitly add `P7_ALLOW_REMOTE_HOST=1`. Do not point the harness
at a production employee Project. Base URL must be a bare origin; chat path must begin with `/`.

## Run (read-only default)

```bash
npm ci
npx playwright install chromium
npm run check:host:p7
npm run test:host:p7 -- --project=host-api
npm run test:host:p7 -- --project=desktop-ui
npm run test:host:p7 -- --project=mobile-ui
```

Tests needing active task IDs or unsafe side effects **skip**, never self-enable.
Browser Watch UI can use `P7_RUNNING_BROWSER_TASK_ID` only while the active QA task is visible in
the configured conversation; otherwise skip its visual step.

## Explicit opt-ins

```bash
# Start only a benign synthetic task in the dedicated QA Project
export P7_ALLOW_TASK_CREATION=1

# Verify the calculator genuinely executed, not just an answer that happens to be correct
export P7_EXPECT_CALCULATOR=1

# Optional read-only artifact tests
export P7_EXISTING_FILE_TASK_ID=pat_qa_file_task_id
export P7_EXISTING_FILE_ID=qa_file_id
export P7_FILE_IS_PDF=1

# Optional manual browser owner handoff; only on a running isolated QA browser task
export P7_RUNNING_BROWSER_TASK_ID=pat_qa_browser_task_id
export P7_ALLOW_BROWSER_CONTROL=1
```

The takeover test watches a dedicated session, pauses the agent, verifies state, and **always**
attempts to release/unwatch in `finally`. It never clicks a page, submits a form or enters secrets.
Do not run with real employee accounts or customer data.

Use `P7_CAPTURE_EVIDENCE=1` to retain **failure-only** screenshot/trace, after confirming the QA
Project contains no personal or customer data. Playwright JSON reports go under ignored
`test-results/`; do not copy the entire report or traces into public issues.

## Required host acceptance evidence

| Area | Evidence required |
| --- | --- |
| Task lifecycle | 202 + task ID, polled terminal state, final answer or explicit failure |
| Dify | Actual `calculate` activity receipt and exact 98000 result; Dify workflow must consume current query |
| Browser | Frame visible, owner can watch/take over/hand back, latest revision returns to agent |
| Files | Nonempty downloadable output, valid PDF Range, correct access from QA owner |
| Security | Anonymous and nonmember requests denied; cross-origin control refused |
| UI | Desktop/mobile visible composer, focusable controls and no document overflow |
| Recovery | Stop/refresh/retry uncertainty verified manually; no duplicate external mutation |
| Isolation | Nothing from user A appears in user B's Project/task/browser access |

Run P6 full suite and P4 browser regression separately; P7 acceptance does not replace those tests.

## Status and limits

The host harness is source-authored and committed, not executed on a live host in this environment.
Test skips represent **not verified**, not successful capability delivery. Ordinary Dify and sandbox
runtime may differ; use the calculator opt-in only on a route intentionally supporting the bridge.
Manual authenticated browser workflows, real multi-user concurrency, MongoDB restart/fencing,
long-run load/soak and rollback remain additional production gates.

For a report, give commit SHA, host revision, exact commands, pass/fail/skip counts, route failures,
screenshots only from synthetic QA data, and remaining blockers. Keep failures actionable rather than
claiming production readiness from a green demo.
