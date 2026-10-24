# P6.2–P6.5 capability upgrade — local handoff

Branch: `gpt/full-project-agent`. The requester deferred tests/CI until local-agent QA; never merge `main` or `staging`.

## Implemented
- **Explicit continuation:** `retryOfTaskId` is validated against the authenticated caller's owner and Project and restricted to finished task records. The task stores only its validated retry provenance; it can still reuse staged inputs when requested.
- **Evidence-oriented continuation:** `retry-context.ts` derives up to 4,000 characters of previous partial results, output file names and relevant activity notes. The new attempt is clearly instructed to verify remote state before repeating state-changing operations. Context never grants permissions or silently launches an external action.
- **Skill relevance:** `skill-ranking.ts` ranks *enabled* project skills using terms from the current request, prioritizing descriptions and titles over irrelevant skills. All explicitly enabled skills remain listed; owner-defined on-demand reads and access checks are unchanged.
- **Subagent coordination:** `delegate-batch.ts` removes *identical* parallel assignments within one grouped response; worker and reviewer roles remain distinct. Delegation ceilings and existing sandbox policies remain unchanged.
- New synthetic tests: `p6-retry-skill-ranking.test.ts` and `p6-parallel-delegates.test.ts`.

## Local QA later
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run --config vitest.agent.config.ts tests/agent/p6-retry-skill-ranking.test.ts tests/agent/p6-parallel-delegates.test.ts tests/agent/p6-recovery-guidance.test.ts
npx vitest run --config vitest.agent.config.ts
npx vitest run tests/presentation.test.tsx
```

## Scenario acceptance
1. Retry task with/without attachments; verify previous task context is included only for the exact same owner and Project, never for active tasks or cross-owner ids.
2. Retry after an uncertain form submission: inspect external state first; no blind replay.
3. Test many enabled skills, including long instructions: no skill disappears, relevance order changes for different user requests, on-demand skill reads still enforce allowlist.
4. Issue two identical parallel delegate jobs: one runs. Assign a reviewer to the same text: both distinct roles run. Confirm returned receipts refer to original action positions.
5. Recheck all P5 failure/handoff cases and evidence-backed deliverable verification with signed-in local agent.

## Unfinished or requiring verification
- Persistent exactly-once receipts for arbitrary browser form submissions, shell commands and external services.
- Multi-user load/soak, Dify-Mongo failures, permission revocation during active work, visual regression.
- Context selection and skill relevance currently use deterministic lightweight token overlap, not measured retrieval accuracy; richer ranking should be benchmarked against actual employee requests before swapping in semantic models.
- These source changes were committed through the GitHub connector. No TypeScript, unit, browser or CI runs were performed in this session.
