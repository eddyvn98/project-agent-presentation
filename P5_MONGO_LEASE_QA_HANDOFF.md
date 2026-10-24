# P5 Mongo lease-fencing QA

Branch `gpt/full-project-agent`; no CI, main/staging untouched.

## Added
- `lib/project-agent/lease-fence.ts`: AsyncLocalStorage of task+lease token; Mongo check before every runtime action with current token, running state and unexpired lease. Mongo unavailable fails closed.
- `lib/project-agent/durable-mongo-queue.ts`: execute leased work inside its lease scope.
- `lib/project-agent/runtime/run-agent.ts`: validate lease before dispatch to tools.
- `tests/agent/p5-mongo-lease-fence.test.ts`: synthetic lease ownership, replacement, expiration and Mongo outage tests.

## Local commands
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run --config vitest.agent.config.ts tests/agent/p5-mongo-lease-fence.test.ts
npx vitest run --config vitest.agent.config.ts
npx vitest run tests/presentation.test.tsx
```

## Fault injection and production release blockers
1. Begin a worker tool call and simulate MongoDB becoming unavailable. Ensure next action is blocked; after lease expiry scan must quarantine uncertain work.
2. Kill the worker during an irreversible operation. Confirm manual review, no automatic rerun, and correct task state.
3. Check two concurrent workers: only the matching lease holder is admitted; retry after lease expiry must not resubmit side effects.
4. Validate Dify/Mongo/Chromium outage and recovery, two-user isolation, approval revocation, memory and process count under sustained parallel load, and rollback rehearsal.

## Important limitations
This is per-action lease verification, **not atomic exactly-once external delivery**. A lease can expire after the check and before a remote side effect; require downstream idempotency keys and durable action receipts for that guarantee. Existing background work started outside the runtime action loop must be audited separately. There has been no live Mongo/Dify/Chromium or soak test from this authoring environment. Employee agents do not have default USD budget enforcement.
