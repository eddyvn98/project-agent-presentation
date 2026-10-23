# Full Project Agent upgrade

Base: `c6165f5` on `gpt/full-project-agent`. No merge, staging push, host deployment, new provider, credential, customer data, or storage replacement.

## Review and changes

Started from `PROJECT_AGENT_SOURCE_MAP.md`, then inspected the conversation pane, composer, submit/queue/search hooks, task HTTP routes, task client/store/recovery, runtime action/wait/engine code, MCP handoff adapter, and existing focused tests.

| Observed behavior | Implemented change | Evidence |
| --- | --- | --- |
| Enter could bypass disabled/busy send controls; menu lacked arrow navigation | Guard keyboard submission, retain IME/Shift+Enter, add menu focus/navigation/return, ignore disabled file ingestion | `tests/agent/composer.test.tsx` |
| Two submissions before React rendered busy could start duplicate work | Synchronous submit guard; preserve programmatic prompt refs and busy-message queue | `tests/agent/submission.test.tsx` |
| Goal-control HTTP errors silently cleared the request | Preserve failed command and surface status; clear only after success | submission tests |
| Stop treated HTTP failures as success; feedback stayed optimistic after rejection | Check response status, report failure, roll feedback back, lock concurrent feedback writes | `tests/agent/task-controls.test.tsx` |
| Interval refresh could overlap; identical recovered payload left stale error; requests survived view changes | Single-flight refresh hook, abort/ignore old scope, reset old tasks, clear errors on every valid response, bypass browser cache | `tests/agent/conversation-sync.test.tsx` |
| Search could publish stale responses and disguise HTTP failure as no chats | Scope results by project/query, ignore aborted response, expose error/retry (including when no chats exist) | `tests/agent/conversation-search.test.tsx` and workspace integration |
| Polling retried network failures but stopped on transient HTTP status; task response identity was trusted | Bounded retry for 408/429/500/502/503/504 reads, validate status/task/project identity, optional local AbortSignal | `tests/agent/client-recovery.test.ts` and existing client tests |
| HTTP body could be null or malformed; internal prompt/goal had no request bounds | Shared request validator for HTTP/MCP; 64,000-character internal prompt, 12,000-character display message/goal fields, bounded identifiers | request validation and real route handler tests |
| Invalid source ID silently became a direct upload; duplicate attachments accepted | Explicit rejection of invalid/duplicate IDs; retain existing file/count/byte/large-PDF limits | `tests/agent/attachment-validation.test.ts` |
| MCP coerced objects into request strings and returned internal task objects | Strict inputs, existing project access check, public task projection | `tests/agent/public-mcp.test.ts` |
| MCP created tasks without a module allowlist, which invokes legacy unrestricted behavior | Explicit empty module-engine allowlist until a host-aware adapter supplies permissions | MCP tests and existing engine tests |
| Public task spread exposed project owner/provider/process identifiers | Remove those internal fields; preserve continuation behavior, attachments, activity, and displayed follow-up notes | public/MCP tests |
| Runtime accepted invalid page/count/timeout/offset values; wait accumulated abort listeners | Reject invalid numeric arguments before execution; remove listeners/timers on completed/cancelled waits | runtime validation and existing action/wait tests |
| Module guards were called repeatedly for the same module | Resolve each distinct module once per task request (two checks instead of five) | real route handler test |

Uploads and task creation are never automatically replayed. Poll retries perform only status reads. Aborting client observation does not send a server stop request. The existing host XHR adapter remains responsible for an in-flight XHR upload; local abort checkpoints prevent subsequent task creation.

## Exact local verification

Executed from the repository root on 2026-10-23:

| Command | Result |
| --- | --- |
| `npm run test:agent` | **18 files passed; 99 tests passed, 1 skipped (100 total)** |
| `npm test` | **1 file passed; 25 presentation component tests passed** |
| `npm run typecheck` | Exit 0; existing presentation/demo/test TypeScript scope only |
| `npm run build:demo` | Exit 0; production presentation demo built; existing chunks-over-500-kB warning remains |
| `npm run check:lines` | Exit 0; all source/demo/test files in existing checker scope under 300 lines |
| `node tests/check-agent-source.mjs` | Exit 0; **39 changed/new source files** under 300 lines and TypeScript syntax passed; largest **249 lines**, `ProjectWorkspaceHome.tsx` |
| `git diff --check` | Exit 0; no whitespace errors |

`vitest.agent.config.ts` resolves `@/` to the actual snapshot root. It runs the new regressions plus existing client, conversation/session, pagination, engine, action, and wait tests. The original presentation test config still resolves `@/` to `src/` and excludes the separate agent tests. No runtime dependency was added.

The real HTTP POST handler, MCP handler, public projection, hooks, and runtime parsers are exercised. Host authentication/capabilities, task persistence/runner, and Dify are explicitly mocked where needed. `tests/agent-host/` contains test-only, fail-closed resolution targets, not replacements for host code. The PDF execution boundary is mocked; parsing and wait behavior remain real.

The skipped existing test is the read-only sandbox execution test in `runtime-engines.test.ts`: the required Docker image/runtime is unavailable. Existing focused tests outside this selected suite were not claimed as passing. No CI run was requested; the implementation commit uses `[skip ci]`.

## Original-host verification still required

The neutral snapshot is not a standalone app. The following were **not run** here:

- Full host TypeScript/Next build and lint. The changed-source checker verifies syntax, not cross-module host types.
- Signed-in desktop/mobile browser flows: queue, regenerate, file revision, compact, goal controls, stop, feedback, search retry, switching project/chat during requests.
- Real authentication/sharing matrix (owner, shared CHAT member, removed member, unrelated user) and host module entitlement checks.
- Real MongoDB persistence, source ownership/storage reads, XHR progress, large-PDF staging, restart recovery and concurrent server requests.
- Dify execution/streaming, MCP host identity, sandbox read-only enforcement, PDF service/container execution, and artifact read-back/rendering.

Bring the changed `components/`, `app/api/`, and `lib/` files into the original host together. Keep the neutral test configs and `tests/agent-host/` out of production alias configuration. MCP module actions are deliberately unavailable until the host adapter provides a verified permission context; sandbox actions retain their existing policy checks. Internal fields removed from public responses remain available on stored server tasks.

## Remaining inspected limitations

Conversation refresh still uses the existing newest-20-task endpoint; older-chat pagination needs the host repository's storage/query support and a separate history design. The neutral tests do not establish visual parity for the full signed-in app, service restart correctness, or end-to-end backend behavior. The presentation demo's bundle-size warning is unchanged.

## Arithmetic/compatibility follow-up

`CALCULATION_RELIABILITY.md` supersedes the optional `modelSelector` validation behavior above: non-string hints are ignored by the existing route, and string hints use the existing host normalizer. It documents the bounded exact runtime calculator, its limited verification scope, and the newer focused test results.
