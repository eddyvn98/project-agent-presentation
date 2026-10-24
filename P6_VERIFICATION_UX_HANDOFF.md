# P6.6–P6.7 evidence and employee UX handoff

Branch: `gpt/full-project-agent`. No CI or test execution at the user's request.

## New code
- `lib/project-agent/runtime/verify.ts`: records each Office file actually rendered after the latest mutation. Path normalization accepts `/work/outputs/example.docx` and `outputs/example.docx` as equivalent. Older callers that record an unqualified render remain supported. No visual-quality claim is made solely from rendering.
- `lib/project-agent/runtime/run-agent.ts`: passes the render action's file path to the gate.
- `components/features/projects/ProjectAgentConversationPane.tsx`: labels failed tasks with saved files/text as unverified drafts, and removes one-click Retry when the last error indicates uncertain remote effects. Users can inspect saved state and submit a new, explicit request.
- `tests/agent/p6-file-verification.test.ts`: distinct outputs, mutation invalidation, text-only bypass.

## Deferred acceptance commands
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run --config vitest.agent.config.ts tests/agent/p6-file-verification.test.ts tests/agent/p6-retry-skill-ranking.test.ts tests/agent/p6-parallel-delegates.test.ts
npx vitest run --config vitest.agent.config.ts
npx vitest run __tests__/project-agent/runtime-actions.test.ts __tests__/project-agent/task-error-notice.test.tsx
npx vitest run tests/presentation.test.tsx
```

## Remaining risks
- Gate checks that a render action succeeded for a path, not that a reviewer inspected the correct version or every page. Human/automated visual QA of the final bytes remains required.
- Shell mutations are conservative: any reported shell action can invalidate renders even when it only reads data.
- In-memory action replay, subagent coordination, live browser takeover, persistent external idempotency and tenant isolation still require integrated local-agent QA.
- No repository clone, typecheck, Vitest or browser run was performed here. No production-readiness claim.
