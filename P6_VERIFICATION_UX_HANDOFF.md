# P6.6–P6.7 evidence and employee UX handoff

Branch: `gpt/full-project-agent`.

## New code
- `lib/project-agent/runtime/verify.ts`: records each Office file actually rendered after the latest mutation. Path normalization accepts `/work/outputs/example.docx` and `outputs/example.docx` as equivalent. Older callers that record an unqualified render remain supported. No visual-quality claim is made solely from rendering.
- `lib/project-agent/runtime/run-agent.ts`: passes the render action's file path to the gate.
- `components/features/projects/ProjectAgentConversationPane.tsx`: labels failed tasks with saved files/text as unverified drafts, and removes one-click Retry when the last error indicates uncertain remote effects. Users can inspect saved state and submit a new, explicit request.
- `tests/agent/p6-file-verification.test.ts`: distinct outputs, mutation invalidation, text-only bypass.
- Standalone test harness: the SSE reader mock now implements the Web Streams reader methods used by runtime cleanup; Mongo lease tests use the configured host-module aliases.

## Local verification
- TypeScript checks passed: `npx tsc --noEmit` and `npx tsc --project tsconfig.calculator.json`.
- 19 tests passed across five focused P5/P6/runtime files; 8 runtime-action tests and 25 presentation tests also passed.
- Demo production build, 300-line check, agent route check and `git diff --check` passed.
- The full `vitest.agent` run did not complete: it remained idle after partial results with both the default pool and one worker. It was stopped; no full-suite pass is claimed.
- `__tests__/project-agent/task-error-notice.test.tsx` could not resolve `ProjectAgentErrorNotice`, which is not present in this standalone repository. Its host integration remains unverified here.

## Remaining risks
- Gate checks that a render action succeeded for a path, not that a reviewer inspected the correct version or every page. Human/automated visual QA of the final bytes remains required.
- Shell mutations are conservative: any reported shell action can invalidate renders even when it only reads data.
- In-memory action replay, subagent coordination, live browser takeover, persistent external idempotency and tenant isolation still require integrated local-agent QA.
- No signed-in browser acceptance was performed; these results do not establish production readiness.
