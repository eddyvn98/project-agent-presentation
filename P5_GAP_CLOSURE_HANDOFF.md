# P5 gap closure — local QA handoff

Branch: `gpt/full-project-agent`. Do not run CI or merge into `main`/`staging`.

## Verified from source
- P5.1: technical loop protection, progress-aware milestones, task leases and model retries existed. Missing Dify response-size and stream-completion validation.
- P5.2: browser context pool, owner policy and watch memory caps existed. Missing disconnected shared-Chromium detection.
- P5.3: account observability existed; resilience scenarios, operational probes, long-duration soak and rollback still require host-side acceptance.
- P5.4: no real Dify/Mongo/multi-owner deployment acceptance evidence.

## Changes in this patch
- `lib/project-agent/runtime/model-stream-guard.ts`: bounded SSE decoder with strict message_end requirement, response and event limits, error handling, and validated usage counts.
- `lib/project-agent/runtime/model.ts`: no blind retry for partial streams, abort-aware bounded backoff only for pre-stream HTTP 502/503/504 responses.
- `lib/project-agent/runtime/browser-agent/session.ts`: reconnect shared Chromium when disconnected; close stale sessions instead of handing them to another operation.
- `tests/agent/p5-dify-faults.test.ts`: truncated/large/malformed SSE, real-byte chunk boundaries, and no-blind-retry regression.

## Local execution
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run --config vitest.agent.config.ts tests/agent/p5-dify-faults.test.ts
npx vitest run --config vitest.agent.config.ts
npx vitest run tests/presentation.test.tsx
npx playwright test tests/browser/p4-interaction-regression.spec.ts --project=desktop
npx playwright test tests/browser/p4-interaction-regression.spec.ts --project=mobile
```
P3 Chromium isolation regression and real signed-in browser checks should be repeated before promoting.

## Production gates not completed here
1. Stop MongoDB during heartbeat and verify fencing, manual review, and no duplicate side effects.
2. Interrupt real Dify connections at HTTP headers, mid-stream and completion; confirm provider-specific SSE behavior and saved conversation continuity.
3. Kill Chromium in flight across concurrent owners and verify session recreation, policy enforcement and no stale authentication.
4. Run multi-owner security/permission revocation, fault-injection, workload soak, process RSS/open-context metrics, and a full rollback rehearsal.
5. Roll out canary only after host QA. Do not assert production readiness from these synthetic regressions.

No host browser, MongoDB, or Dify invocation was performed in this authoring environment.
