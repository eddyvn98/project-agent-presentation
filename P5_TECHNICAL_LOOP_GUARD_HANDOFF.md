# P5 technical anti-loop policy — QA handoff

Branch: `gpt/full-project-agent`. Do not merge into `main` or `staging`. No CI required.

## Decision
Company employee agents are not stopped by a monetary budget by default. USD pricing estimates remain observability-only unless a deployment explicitly configures a positive cost budget; no cost environment variables were enabled by this patch.

## Added
- `lib/project-agent/runtime/action-replay-guard.ts`: per-run hashes of recent action results; detects identical stale outcomes, alternating two-action cycles, excessive progress-only messages and duplicate known external mutations.
- `lib/project-agent/runtime/run-agent.ts`: checks the replay guard BEFORE dispatching individual actions, including multiple actions emitted in one model response. On denial it records a failed attempt and asks the model to change approach or provide a truthful partial answer.
- `tests/agent/p5-loop-protection.test.ts`: synthetic regression scenarios for loops, effectful calls and legitimate repeated reads with changing outputs.
- Existing `StallGuard` remains as backstop: repeated exact actions, consecutive failures, maximum steps, work time, and token-volume safety caps (technical resource constraints, not USD spending policy).

## Test locally
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
npx tsc --noEmit
npx vitest run --config vitest.agent.config.ts tests/agent/p5-loop-protection.test.ts
npx vitest run --config vitest.agent.config.ts
npx vitest run tests/presentation.test.tsx
```

## Important limitations for release review
- The new loop guard is scoped to one runtime invocation, not to separate retries/restarts or browser-side tool substeps.
- External mutation recognition is conservative: workspace apply, image generation, and non-read scheduling/workflow calls. Not every shell command or browser click is reliably classifiable. Do not assume this patch alone guarantees exactly-once external actions.
- An external mutation can fail after reaching the remote system. Review action receipts and persistent idempotency keys before allowing automatic retries.
- Large jobs legitimately revisiting the same result may encounter a false positive. Verify ordinary long-running tasks, subagents and user steering on real Chromium/Dify before accepting.
- No local execution, browser QA, Dify deployment or production soak testing has been performed in the GitHub authoring environment.
