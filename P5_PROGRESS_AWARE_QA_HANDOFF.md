# P5 progress-aware autonomy — local QA handoff

Branch: `gpt/full-project-agent`. Do not merge `main` or `staging`. CI disabled.

## Implemented
- `StallGuard` tracks unchanged results for repeated actions rather than counting changed results as unproductive. Successful and distinct verified milestones (saved local file, committed Workspace batch, rendered media) permit up to 30 extra turns beyond the normal 60-step lead limit, but never more than 90; extra turns expire after 12 steps without another milestone.
- Soft time warnings are delayed for recent verified milestones. Hard safety limits for token volume and inactive/no-progress work remain. This is technical safety, not an organizational USD cap.
- `ActionReplayGuard` reserves recognized state-changing operations before dispatch, including the uncertain timeout/error case, so an identical mutation in the same run cannot be replayed blindly.
- A replay blocked twice triggers forced wrap-up; no more tool actions should be sent once wrap-up begins.
- New pure evidence classifier avoids granting more steps based on model-generated progress prose or arbitrary shell output.
- Regression coverage in `tests/agent/p5-progress-aware.test.ts` plus the prior `p5-loop-protection.test.ts`.

## Local QA commands
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run --config vitest.agent.config.ts tests/agent/p5-loop-protection.test.ts tests/agent/p5-progress-aware.test.ts
npx vitest run --config vitest.agent.config.ts
npx vitest run tests/presentation.test.tsx
```

## Mandatory scenarios before release
1. Repeat an identical observation that stays unchanged: ensure stop/wrap-up instead of consuming more browser/model calls.
2. Repeat a read that returns fresh data: verify it does not count as unchanged-loop failure.
3. Create more than six distinct successful files or verified Workspace edits: confirm the lead cannot exceed 90 steps and extensions expire when work stalls.
4. Force a remote Workspace timeout after a potential commit: retrying the exact mutation in the same run must not dispatch it. Inspect the board and prefer a new conditional/idempotent action.
5. Exercise parallel delegates, user steering and browser takeover. A subagent must not inherit free extended turns; the owner must be able to cancel.
6. Confirm runtime completed work is preserved when forced to wrap up and failure is reported transparently.

## Limitations
This in-memory mechanism does not provide exactly-once behavior across process restarts, separate runs, or arbitrary browser/shell side effects. Production-grade replay prevention still requires durable receipts, verified state and idempotency keys around consequential remote operations. The GitHub authoring environment did not execute a local/Chromium/Dify/Mongo QA run.
