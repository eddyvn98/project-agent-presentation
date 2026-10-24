# P5 Production Readiness — local QA handoff

Branch: `gpt/full-project-agent`; baseline P4 `5c27fd436f77bbbb1b3a43daae249bced0f3a400`.
No automatic deployment or merge into `main` / `staging`.

## Implemented
- Browser session admission now uses `BrowserSlotPool`, a FIFO, abortable, 30-second bounded queue with a hard limit of three active contexts. Closing or failed setup releases each slot once.
- Browser console and failed/request-response telemetry is bounded to 100 sanitized records of at most 500 characters per session.
- Closed pages cannot be reused, and a timed-out browser operation triggers session closure, to quarantine an action with uncertain completion rather than immediately dispatch another browser operation.
- New optional `PROJECT_AGENT_STRICT_COST_BUDGET=1` prevents further actions when a positive USD task budget is configured but the selected model is unpriced. Invalid/nonfinite token counts are rejected.
- Focused deterministic regression tests cover capacity, FIFO, release idempotence, cancellation, timeout, malformed usage and strict vs legacy cost policy.

## Local acceptance commands
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run --config vitest.agent.config.ts tests/agent/p5-resource-guards.test.ts
npx vitest run --config vitest.agent.config.ts
npx vitest run tests/presentation.test.tsx
npx playwright test tests/browser/p4-interaction-regression.spec.ts --project=desktop
npx playwright test tests/browser/p4-interaction-regression.spec.ts --project=mobile
PROJECT_AGENT_P3_BROWSER_QA=1 npx vitest run --config vitest.agent.config.ts tests/agent/p3-browser-real.test.ts
```
Do not run CI.

## Live signed-in / infrastructure readiness (NOT yet verified)
1. Run 4+ concurrent browser users/tasks. Ensure fourth request queues, 30s admission deadline fails visibly, cancellation removes waiter, and RAM/browser process count returns to baseline after closure. Test worker crash during an in-flight irreversible action: do not automatically replay it.
2. Inject Dify connection refusal, HTTP 502/503 and stalled streaming calls. Confirm bounded retries and cancellation, no duplicate paid/side-effect action, accurate failure state and safe continuation.
3. Stop MongoDB during lease renewal and restart it. Confirm old lease never receives parallel duplicate execution; require manual review for uncertain side effects. Confirm owner access and indexes on restart.
4. Test Browser Watch and Personal Vault with two accounts; revoke grants mid-task and confirm context closure and absence of sensitive screenshots, cookies, tokens or passwords in logs.
5. With a positive USD cap, test both priced and unpriced selectors. Enable `PROJECT_AGENT_STRICT_COST_BUDGET=1` to fail closed on unknown prices; leave it off to preserve P4 backward compatibility. Compare provider invoice with estimates before enabling billing enforcement.
6. Load and soak: measure process RSS, heap, open Chromium contexts, queued requests, 95th-percentile latency, error rate and Mongo connections for several hours. No performance thresholds can be certified without a representative deployment and traffic profile.
7. Verify rollback using the prior P4 commit, environment flags and staged deployment; check that queued or in-progress tasks remain safe during rollback.

## Limits of this handoff
This P5 pass provides code and tests for browser admission/resource bounds and strict cost policy. It does not claim complete production security, Dify/Mongo outage resilience or long-duration soak validation. The remote authoring environment cannot execute local Chromium, the host Next.js app or connected MongoDB/Dify; local agent must complete the acceptance checklist before production promotion.
