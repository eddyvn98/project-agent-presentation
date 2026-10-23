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
