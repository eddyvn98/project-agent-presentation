# P5 extended production hardening — handoff

Branch: `gpt/full-project-agent`. Do not touch `main` / `staging`, and do not run CI.

## Committed changes
1. Classic Dify SSE (`dify-stream.ts`) now limits inbound bytes (64 MiB), single events (32 MiB), answers (8 MiB), and unique tool observations (200). A malformed JSON SSE event is an error instead of silently disappearing; early rejection cancels the reader. Synthetic tests: `p5-classic-stream-faults.test.ts`.
2. Browser resource lifecycle (`runtime/browser-agent/session.ts`) avoids deleting a replacement session when an older session closes, checks connection health before operations, and only executes the idle browser shutdown after confirming there are no contexts or pending session creations.
3. The per-action Mongo lease fence now runs before the in-memory replay reservation, so a failed fence does not incorrectly mark an external effect as attempted.
4. `browserResourceSnapshot()` and `processAgentResources()` expose aggregate resource counts without user identifiers, URLs, images or cookies.
5. `GET /api/internal/project-agent/resources` requires a dedicated secret in the `x-project-agent-operator-secret` header. Configure `PROJECT_AGENT_OPERATOR_DIAGNOSTICS_SECRET` to a strong secret of at least 32 bytes and allow the route only from trusted operator networks. It is disabled without the secret.

## Local QA (no CI)
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run --config vitest.agent.config.ts tests/agent/p5-classic-stream-faults.test.ts tests/agent/p5-operations-boundary.test.ts
npx vitest run --config vitest.agent.config.ts
npx vitest run tests/presentation.test.tsx
PROJECT_AGENT_P3_BROWSER_QA=1 npx vitest run --config vitest.agent.config.ts tests/agent/p3-browser-real.test.ts
```

## Live operations gates
- Inject interrupted Dify classic/runtime streams and compare provider completion semantics against synthetic tests.
- Run 4+ concurrent owners: kill Chromium mid-request and verify all dead contexts eventually release slots. Exercise idle-shutdown vs session-creation race.
- Force MongoDB lease renewal failure, expiry, and delayed side effect; verify that remaining actions are fenced. Atomic exactly-once external side effects remain out of scope without downstream idempotency.
- Perform multi-owner authorization and Vault revocation checks, 4-hour resource soak, rollback rehearsal, and signed-in UI acceptance.
- Run diagnostics with and without a valid secret; verify no sensitive fields and that HTTP responses are never cached.

## Limits
Github connector editing and source inspection were available in this environment. Direct clone from GitHub failed because the container cannot resolve github.com; TypeScript, Vitest, Chromium, MongoDB and Dify could not be executed on the target repository here. No new production readiness claim should be made until local QA passes.
