# Arithmetic action transport review

Follow-up to `4ae8f40` on `gpt/full-project-agent`, 2026-10-23.

## What the source establishes

| Path | Source and transport | Calculator availability |
| --- | --- | --- |
| App-hosted runtime | `dify-agent.ts` selects `runRuntimeAgent` when `isRuntimeEnabled()` sees `PROJECT_AGENT_RUNTIME=sandbox`. `runtime/model.ts` POSTs `query`, `inputs.model_selector`, conversation/user/files to the model-step Dify app. The app parses JSON actions from the returned text and executes them locally. | `calculate` is an app action interpreted by `runtime/actions.ts` and dispatched by `runtime/run-agent.ts`. It is not a native tool registered in Dify. |
| Ordinary Dify agent | Otherwise `dify-agent.ts` calls `callDifyAgent`. `dify-call.ts` POSTs `inputs: {}`, query and conversation/files to the configured Dify agent app, reads its SSE answer, handles rich-file specs and Office downloads. | There is no calculate registration, runtime-action dispatcher or calculator-result continuation in this path. Which tools the remote Dify workflow actually has is not specified here. |

The reported `sandbox_shell` activity label maps to “Running a command in the sandbox” in `public-task.ts`. `stall_stop` is emitted by the app runtime's stall guard. These markers strongly identify the reported replay as the runtime path, rather than demonstrating a missing ordinary-Dify tool. The trace contains shell requests, not evidence of an executed `calculate` action.

Before this change, each runtime continuation sent only the latest bare output string in the next query, for example `shell result (exit 0): ...`. The original task and calculator action protocol were left to the remote conversation's memory. A conversation ID alone does not establish that the remote workflow enables memory or forwards the latest query into its model prompt. Existing mocked-loop tests asserted local function calls; they did not test that whole HTTP/SSE boundary without memory.

**Diagnosis limit:** the UI trace does not establish whether the production Python command printed anything, whether Dify bound `sys.query` correctly, whether memory was enabled, or why the model selected repeated probes. No remote Dify workflow/export or host request capture is available in this snapshot. This patch addresses a concrete app-side transport weakness; it does not assert a proven production Dify misconfiguration.

## Small runtime fix

- Added `RuntimeTurnContext`. Every runtime model-step request explicitly describes the app action protocol, including calculate. Continuations carry the original task and recent action/argument/output receipts. The latest four receipts are retained with bounded argument/output excerpts; pending output, user steering, policy failures and stop instructions are preserved.
- Both normal model calls and the lost-conversation retry use this framing. Normal actions and parallel-delegate results are recorded after execution. The existing repeat/stall guard stays in place; repeated commands are not silently replayed or hidden.
- Empty shell output and `ok` are not labelled numeric evidence. The calculator is offered as the side-effect-free arithmetic path instead of repeated shell transport probes.
- `runCalculationStep` logs a result only after the actual calculator returns. Successful activity starts with `Exact result: 98000; expression: ...`; failure activity carries the actual error. The public task progress and expandable activity details preserve that numeric receipt. This is execution evidence for one expression, not a badge certifying the final answer.
- No endpoint, key, provider, authentication, storage, sandbox permission, model selector or public task schema was replaced. The new receipt context uses ES2018-compatible syntax and is included in the focused target check.

The short protocol and bounded recent receipts add prompt context per turn. The original task context still matters: this is not a replacement for all project knowledge/history, and it cannot make a remote workflow consume a query it ignores.

## Ordinary-Dify transport blocker

Ordinary Dify still **does not have an app-hosted calculator bridge** after this commit. The neutral repository cannot register a tool in the remote workflow: the workflow DSL/tool configuration and deployment are absent. Merely adding a tool name to query guidance is not registration. Sending a runtime calculate JSON object to this path will not execute it in this app.

A future ordinary-Dify integration must either expose a calculator tool in the real workflow, or add and test an explicit app-side request/result continuation protocol (similar in principle to the existing project source-read continuation). It must include bounded execution, actual result delivery, activity reporting and authorization/tool-restriction handling. That separate bridge is not claimed by this runtime patch. Keep the ordinary guidance truthful about tools actually available there.

## Regression and evidence

`tests/agent/calculation-runtime.test.ts` now exercises the real runtime loop **and the real `callRuntimeModel` SSE/HTTP transport**, with only the remote fetch/model service and sandbox execution simulated. The fake model-step service retains no conversation memory. It starts with a synthetic Python expression whose simulated shell output is empty; if it receives only bare observations it falls back to repeated `echo ok` probes. With the explicit transport context it selects calculate, reads the actual exact result `98000` from the next HTTP query, then returns a final answer.

Assertions cover three wire requests, unchanged conversation/user identity, one shell execution, an actual calculator receipt, no stall-stop, and the result surviving the real public progress/activity projection. A separate regression retains a calculation receipt when a later shell probe returns only `ok`; another verifies bounded receipt retention and preservation of stop/user-steering text.

Negative control: temporarily replacing the two `query: turnContext.query(query)` call-site arguments with the original shorthand `query` made the wire regression fail with **“The agent was stopped because the same action was sent 5 times”**. The source was restored immediately before final checks. This establishes that the test detects the missing framing; it is not a replay of the user's real model or proof of live Dify behavior.

Exact negative-control test command, against that temporary old-transport mutation:

```sh
./node_modules/.bin/vitest run --config vitest.agent.config.ts tests/agent/calculation-runtime.test.ts -t 'carries real SSE wire'
```

Result: exit 1 as expected, 1 failed and 3 skipped. The mutation driver returned exit 0 only after confirming the expected same-action-five-times error and restoring the source.

## Neutral verification

| Command | Result |
| --- | --- |
| `npm run test:agent` | **21 files passed; 178 tests passed, 1 Docker-dependent test skipped** |
| `npm test` | **1 file passed; 25 tests passed** |
| `npm run typecheck` | Exit 0; neutral presentation scope plus focused ES2018-target modules |
| `npm run typecheck:calculator` | Exit 0; calculator, receipt context, guidance and validator at ES2018 target |
| `npm run check:lines` | Exit 0 |
| `node tests/check-agent-source.mjs 4ae8f40` | Exit 0; **7 changed/new source files**, all under 300 lines; largest **295 lines**, `runtime/run-agent.ts`; syntax check passed |
| `npm run build:demo` | Exit 0; existing large-chunk warning remains |
| `git diff --check` | Exit 0 |

The existing host-only `runtime-model-selector.test.ts` assertion was updated to retain the original query while allowing the explicit transport frame; it is not in the neutral suite because it needs the host model catalog. Full host typechecking, host tests, signed-in browser flows, live Dify behavior and actual Docker execution were not run here. The previously reported host checks/replay are user-provided evidence, not substitute results for this commit. No Work task, main merge or staging push is part of the change.

## Exact-SHA host retest

1. Confirm the selected path and configured model-step app. In runtime mode, inspect the actual Dify request query on successive steps: it must contain `APP ACTION TRANSPORT` and, after execution, `<app_action_results>` with the corresponding action and output. Confirm that the remote workflow feeds the latest query to the LLM; a conversation ID by itself is insufficient.
2. Repeat the synthetic arithmetic prompt. Look for a **calculate** step with an actual `Exact result: 98000` detail, and check its result is in the next wire request. A correct final answer, a shell request, `ok`, or a manual recomputation disclaimer alone is not evidence that calculate executed.
3. If the workflow still repeats shell probes despite receiving the framed query, inspect its prompt bindings, memory setting and raw model answer. The app cannot correct ignored input remotely; capture that transport evidence before claiming a calculator-path pass.
4. If the host uses ordinary Dify instead, treat calculate as unavailable until the explicit bridge/tool registration above is implemented and tested. Do not accept the runtime tests as coverage of that path.
