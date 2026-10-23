# Project Agent source map

This branch contains a source snapshot for reviewing changes across the Project Agent, beyond the presentation components in `src/`.

## Main areas

- `components/features/projects/` — project chat, task answers, sources, attachments, previews, forms, and controls.
- `app/api/projects/` — project chat, knowledge, sharing, task, file, render, and live-preview endpoints.
- `app/api/internal/project-agent/` — internal reference-refresh route.
- `lib/project-agent/` — orchestration, Dify transport, task state, file handling, sandbox runtime, browser tools, and built-in skills.
- `lib/mcp/tools/project-agent-tools.ts` — MCP tool adapter.
- `__tests__/project-agent/` — focused behavior, policy, runtime, and API tests.
- `components/ui/` and `lib/utils.ts` — shared UI primitives imported by the extracted components.

## Host boundaries

The snapshot preserves the host's import paths so changes can be reviewed in context. It is not a standalone deployment. Authentication, database access, file storage, Dify, and sandbox/container services are supplied by the host application. Keep those boundaries explicit when changing behavior; test the final patch in the host checkout.

The Dify chat endpoint is configured with `PROJECT_AGENT_DIFY_API_BASE`, defaulting to a local placeholder. Credentials must be supplied by the host environment and must never be committed. This branch contains no real tenant URL, credential, or customer/demo asset.

## Scope for follow-up work

Review and improve the complete agent experience: project chat lifecycle, task streaming and recovery, attachments and deliverables, source handling, knowledge ingestion, runtime/tool behavior, accessibility, responsive presentation, errors, and performance. Preserve existing adapters and authorization boundaries. Do not treat presentation demos as proof of backend behavior.

## Full-agent upgrade and verification

See `FULL_AGENT_UPGRADE.md` for the reviewed defects, implemented changes, exact neutral test results, compatibility notes, and original-host verification still required. Run `npm run test:agent` for the separate full-agent regression suite; `npm test` retains the presentation suite.

For the arithmetic and optional model-selector compatibility follow-up, see `CALCULATION_RELIABILITY.md`. Exact arithmetic is a runtime action; ordinary Dify receives guidance for tools that actually exist, and no UI reasoning verifier is introduced.

See `ACTION_TRANSPORT_REVIEW.md` for the historical standard-Dify/runtime distinction and runtime transport review. `DIFY_CALCULATOR_BRIDGE.md` describes the later app-hosted ordinary Dify calculator bridge and its remote workflow requirement.

See `PROJECT_AGENT_PARITY_AUDIT.md` for the newer ChatGPT Projects feature audit, relevant-history retrieval, cursor-based older chat loading, intent-adaptive answer guidance and remaining host QA.

## Context-output management

See `CONTEXT_MANAGER_INTEGRATION.md` for the new bounded host-side tool-output store, scoped search/read actions, checkpoint-based continuation, retention and security boundaries, pending QA, and why ordinary remote Dify tool output still cannot be intercepted automatically.
