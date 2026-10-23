# Ordinary Dify calculator bridge (2026-10-24)

The ordinary Dify chat endpoint does not expose the app calculator as a registered remote tool. This branch adds an **app-hosted** continuation bridge around the existing ordinary Dify HTTP/SSE adapter. It does not change or register remote Dify tools. The selected Dify workflow must pass the newest incoming `query` into its model context; Dify conversation memory alone is not sufficient.

## Contract

When enabled, ordinary Project Agent guidance asks for a **whole-response** action tag:

```xml
<app_calculate>{"id":"calc-1","expression":"59*26*47000-72000000"}</app_calculate>
```

The app parses exactly this envelope, allows only `id` and `expression`, executes the existing exact-rational `calculateExact` evaluator, records the numeric result only after execution, and sends a follow-up Dify `chat-messages` request carrying `<app_calculate_results>` receipts alongside bounded initial context and original request. A final ordinary answer passes through unchanged. On failure the returned error is a receipt, not a fabricated success. It never runs a shell command. The same app-side adapter is used for classic source-read, lint, and visual-review Dify calls.

Safety: at most four distinct calculator executions, repeated-expression stop, explicit malformed-action refusal, AbortSignal propagation, 512-character expression syntax limit and existing parser depth/size limits. A Project with the `code` tool group disabled neither advertises nor executes the action. Only the action itself is suppressed from incremental text progress; ordinary prose and Dify thought/activity events are unaffected. File extraction still occurs inside `callDifyAgent`, with its inline/Office output preserved.

## Additional multi-domain gap

Source-read continuation now carries a bounded copy of the original request explicitly, instead of assuming that a previous Dify conversation turn is in the remote LLM context. The retrieved file excerpt remains clearly marked as reference data.

## Checks and limits

An isolated TypeScript compile and Node HTTP/SSE simulation passed: exact result 98000 in the second request with no remote memory, ordinary SSE text, disabled `code` group, duplicate-action stop, four-calculation cap, and early abort. Focused Vitest regressions were added for real call adapter + streamed Dify events, inline exporter bytes, and source-read continuation. **The full repository host test suite and real remote Dify deployment have not been run here**; run `pnpm exec vitest run __tests__/project-agent/dify-agent.test.ts` together with the added host tests, typecheck and browser replay before production.

The remote workflow must expose `sys.query` (or its app input equivalent) to the model on each turn. If it discards incoming query context, the app cannot force the model to see results. A successful app receipt and correct final answer on actual deployed Dify remain required for acceptance.
