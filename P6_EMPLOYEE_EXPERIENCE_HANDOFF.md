# P6 employee usability and diagnostics — local QA handoff

Branch: `gpt/full-project-agent`. P5 infrastructure QA is deferred as requested. No CI; do not merge main/staging.

## Changes
- `lib/project-agent/task-issue.ts`: deterministic recovery classifications (review, access, loop, browser, service, timeout, network). Unknown errors remain unclassified. English by default; Vietnamese for Vietnamese tasks; other locales fall back to English instead of hardcoded Vietnamese.
- `components/features/projects/ProjectAgentErrorNotice.tsx`: explicit review-before-retry warning when remote effects are uncertain; collapsible technical error; original text remains visible.
- `components/features/projects/ProjectAgentConversationPane.tsx`: passes per-turn language to error notices.
- `lib/project-agent/insights-store.ts`: retains bounded loop/stall audit entries so they survive short-lived task cleanup.
- `lib/project-agent/agent-observability.ts`: owner-scoped loop-stop, uncertain-review and failed-tool counts.
- `components/features/projects/AgentObservabilityDashboard.tsx`: visible quality and intervention cards, without new spending limits.
- `tests/agent/p6-recovery-guidance.test.ts`: classification and language regression.

## Local QA to execute later
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run --config vitest.agent.config.ts tests/agent/p6-recovery-guidance.test.ts
npx vitest run --config vitest.agent.config.ts
npx vitest run __tests__/project-agent/task-error-notice.test.tsx
npx vitest run tests/presentation.test.tsx
```
Verify a failed task that may have committed an external mutation displays review-before-retry; verify non-sensitive errors and English/Vietnamese labels; ensure owner A's dashboard never contains owner B's records; verify dashboard counts from synthetic historical runs.

## Remaining work
- Real Mongo/Dify/Chromium fault injection, signed-in multi-user QA, workload soak and rollback remain unverified.
- Do not treat regex classification as proof of side effects. It's a user-facing advisory; durable receipts/idempotency are still needed for exactly-once external writes.
- No CI, local repository build, TypeScript run or browser QA was executed from this GitHub-only authoring environment.
