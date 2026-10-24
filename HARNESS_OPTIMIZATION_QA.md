# Harness²-inspired Harness Optimization Engine — implementation handoff

**Repository:** `eddyvn98/project-agent-presentation` · **Branch:** `gpt/full-project-agent`.

This is a **TypeScript adaptation of concepts**, not a copy of the Google Research Python framework, and it is **not equivalent to reproducing the paper's benchmark results**. Reference: https://github.com/google-research/harness2 (Apache-2.0). The aim is safe, versioned **Propose → Probe → Compose → evidence → rollout → rollback** within the existing Dify-backed Project Agent.

## Components and boundaries

- `lib/project-agent/harness-lab/types.ts`: version, run evidence and revision status.
- `guard.ts`: constrained dimensions (approach, tool guidance, delegation, skill guidance), domain validation and risky instruction rejection. **Never** edits system prompt, actual tool schemas, `runtime/policy.ts`, Vault, browser permissions, credential stores or scheduler authorization.
- `propose.ts`: optional model-generated draft from a manually supplied anonymous failure trace or automatic wasteful-task reflection; up to two proposals per account per day. Refine another evaluated variant using its evidence. No automatic deployment.
- `probes.ts` / `evaluate.ts`: small deterministic, *synthetic* read-only factual and JSON-action selection test suite. Baseline and candidate use the same Dify model and identical prompts; no real browser, file tools, user files or tokens are passed. The candidate must not regress correctness and must improve pass count or reduce measured tokens by at least 10%. Results and evidence are saved in MongoDB. **This is a proxy check, not a full tool-executing replay benchmark.**
- `store.ts`: owner-scoped immutable guidance revisions and evaluation receipts. `deployment.ts`: Mongo unique deployment slot per owner/domain/component, preventing competing canary activation. `rollout.ts`: deterministic 20% trial/control assignment; active revisions apply to new, eligible tasks only. A 15/15 sample without failure regression is required before manually promoting; a statistically obvious failure regression triggers automatic rollback.
- UI: `/account/agent-harness`; API: `/api/project-agent/harness-lab` (GET/POST). See account navigation.

## Configuration

1. Deploy the host app with the existing MongoDB connector and Dify model-step endpoint.
2. Set `PROJECT_AGENT_HARNESS_LAB=1` to allow evaluation and model-generated proposals. It remains disabled otherwise.
3. Set `PROJECT_AGENT_HARNESS_LIVE=1` **only after offline security review** to enable owner-controlled 20% canary and promotion. Without it, the Lab can create drafts and record comparison evidence but no user-facing optimization is injected.
4. Optional `PROJECT_AGENT_HARNESS_IMPROVER_MODEL` and `PROJECT_AGENT_HARNESS_EVAL_MODEL` choose model-step selectors; otherwise use configured default Dify model.
5. Optional `PROJECT_AGENT_HARNESS_AUTO_PROPOSE=1` enables background draft suggestions for costly/wasteful task metadata; **off by default**. Drafts require explicit evaluation and deployment; no infinite self-optimizing loops.
6. Existing scheduler daemon must call `POST /api/internal/project-agent/schedule-tick` using `PROJECT_AGENT_SCHEDULER_SECRET`. The tick evaluates **at most one candidate** and can entail 6–10 charged model calls; scheduler HTTP timeout should exceed probe duration.

## Durable collections

- `projectAgentHarnessVariants`: owner-scoped immutable revision content, status, evidence, lease token, attempts.
- `projectAgentHarnessDeployments`: one slot per owner/domain/dimension.
- `projectAgentHarnessOutcomes`: one record per real task, trial/control, completion status, steps and token counts. No sensitive task content or model responses are stored in this collection.

## Acceptance for local QA agent

1. Verify host TypeScript build, imports, Next.js API compilation and component rendering. No CI/build/tests were run by this author.
2. On two separate accounts, create equal domain/title variants; make sure access, evaluation and promotion cannot cross owners.
3. Call two concurrent evaluate requests; Mongo must claim one evaluation per revision. Kill worker after claim; confirm lease expiry behavior, no unauthorized deployment.
4. Send a draft containing attempts to bypass permission/Vault or embed URLs/commands. It must be rejected; approved bounded guidance must remain subordinate to deterministic runtime policies.
5. Compare synthetic baseline/candidate on a fixed Dify selector. Verify case-level pass/fail and token evidence, meaningful non-regression gates and no real tool execution. Test LLM JSON output failures/timeouts.
6. Verify active canary and control sampling remain stable for a task ID and that only new tasks are affected after rollback. Check no more than one deployment slot per owner/domain/dimension.
7. Confirm 15 trial / 15 control gate before promotion and automatic rollback when live trial failure rate exceeds control by more than ten percentage points. These small samples are operational guards, not statistically definitive proof.
8. Confirm no BrowserContext, login cookies, private files or secrets enter any improvement prompt or probe. Inspect logged model request data and error messages.
9. Verify every source file meets project line limits; manual checks plus local Vitest/Chrome QA are necessary before enabling `HARNESS_LIVE`.
10. Simulate worker restart during evaluation, concurrent deployment and failure to access MongoDB. All uncertain states should fail closed.

## Limitations requiring host verification

This source implementation does **not** execute the full original Harness² recursive benchmark harness, modify arbitrary skill source or launch actual tool-running benchmark tasks. The fixed synthetic probes are only a screening gate. Real output quality requires larger, isolated held-out suites and human/specialized graders before production-wide rollout. Actual real-world actions are never automatically replayed.

The main Agent runtime is not changed in its safety rules, and scheduled unattended tasks do not receive trial guidance. The code is ready for **agent local to test**; no claim of production readiness is made without those results.
