# Project Agent: user-language live activity (2026-10-24)

Branch: gpt/full-project-agent. This patch improves the **presentation** of actual Agent activities. It does not disclose chain-of-thought, invent progress, or stream raw shell commands as the default UI.

## Behavior

- Every task gets a language hint from the **current user's request**, with explicit response-language requests taking precedence. The hint is per turn, not a global Vietnamese setting. Fallback activity labels support English, Vietnamese, Spanish, French, German, Portuguese, Japanese, Korean, Chinese, Russian, Arabic and Hindi.
- Runtime instructions direct the model to write short, user-language "note" fields on real tool calls and optionally a structured progress action with a 240-character message. Notes are logged only when the corresponding action actually starts; they indicate intent rather than fabricated results. The dedicated progress action is rendered as an authored update, not a claim of verified tool completion. It can be included in the same model reply as a tool action without extra model calls.
- The same public task converter reads the real Dify/tool logs and turns them into human-readable translated fallback activity labels when model-authored progress is unavailable.
- Running conversations **expand their activity timeline by default**. Progress notes and verified action starts appear as sequential lines. Long raw command strings, tool arguments and HTTP details are hidden from the normal timeline; a separate, initially collapsed details control preserves those details when useful for debugging.
- Project Plan and the assistant's working indicator use the current turn's activity-language hint.

## Trust and design constraints

- Tool names, steps, image thumbnails and sources still originate from existing runtime/Dify events, not artificial timers. A display label describes the kind of action, not a guarantee it succeeded.
- A progress message is model-authored **commentary**, not an execution receipt. The runtime prompt explicitly prohibits saying a tool, inspection or file verification succeeded before receiving its actual result.
- Capped progress messages are rendered as React text and do not execute markup. Internal logs remain excluded from public task JSON. Source details may be inspected separately.
- Detection is heuristic for Latin-alphabet languages; multilingual or romanized prompts can be ambiguous. For languages outside built-in fallback dictionaries, the runtime model can still write native-language notes when following its instructions; a universal translation service is **not** implemented in this patch.
- The normal Dify adapter cannot manufacture model-authored progress for workflows that only stream final prose; it can still localize recorded tool events. To achieve full progress parity the remote workflow would need an explicit structured progress event/channel.

## QA deferred

New test source `tests/agent/user-language-progress.test.ts` covers Vietnamese, English, Spanish, French, Japanese, explicit language requests, raw command avoidance, narrative ordering, existing English tool grouping and action validation. **Tests/build/CI/browser QA were not run in this pass**, as requested. Before production, check logged-in Dify SSE, runtime, slow actions, mobile timeline expansion/collapse, accessibility announcements, stale task reload and each supported language.

## Upgrade: app-hosted ordinary-Dify live progress

The ordinary-Dify SSE parser now preserves two **evidence-backed** phases for each agent_thought id: "started" (a tool call was announced) and "returned" (Dify supplied an observation). Observations can arrive separately from their tool inputs; the parser merges those events so rich Office bytes and metadata remain available. Returned is **not** interpreted as a successful verification.

The calculator continuation forwards these phases to Project Agent instead of dropping step metadata. Server-side task logs record a matching "using tool" and "tool returned" event for the same id. The public activity selector deduplicates by id and shows the tool's localized description, with a returned indicator only after the observation arrives. Normal message-type SSE text continues to update partial responses without changing its final-answer semantics.

App-owned phases are emitted only at real execution boundaries: loading authorized Project context, preparing uploaded files, starting the model request, checking outputs and saving results. The timeline translates those phase identifiers for the current turn's language; it does not fabricate model thoughts or discoveries. Explicit output-language instructions take priority over heuristic language detection, and recognition no longer relies on ASCII word boundaries for Vietnamese diacritics.

The timeline is expanded initially while a task is running; raw commands and parameters remain collapsed under technical details. When the remote Dify workflow does not expose agent_thought, the UI can show app-owned phases but cannot invent step-by-step model reasoning or unseen tool outcomes.

### Regression source, not executed

- tests/agent/dify-sse-progress.test.ts: split SSE tool observations, duplicate events, retained Office bytes, regular SSE and per-turn language
- tests/agent/dify-calculator-bridge.test.ts: end-to-end forwarding of SSE phases through the calculator bridge
- tests/agent/user-language-progress.test.ts: narrative action protocol remains bounded and language-sensitive

No tests, build, CI or logged-in browser QA were executed during this change (user-requested hold).

SSE partial/log writes are now sequenced before completing or failing a task, so a late tool-return event cannot appear after the final task status. Exposed Dify tool-input details are secret-redacted before task-log persistence; ordinary response bodies and Office file bytes retain their existing handling.
