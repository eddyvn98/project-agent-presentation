# Calculation reliability and model-selector compatibility

Follow-up to `c5748cb` on `gpt/full-project-agent`, 2026-10-23.

## Finding and scope

The reported host run is user-supplied evidence: a real Dify-backed task completed and displayed a readable answer, but its rounded break-even scenario contained an arithmetic error. That signed-in host run was not repeated in this neutral workspace.

For the supplied synthetic inputs:

- Daily unrounded target: `72000000 / (47000 * 26) = 36000/611` bills/day.
- Same integer target every open day: `ceil(36000/611) = 59` bills/day.
- Period bills: `59 * 26 = 1534`.
- Contribution: `1534 * 47000 = 72098000` VND.
- Surplus after the stated fixed costs: `72098000 - 72000000 = 98000` VND, **not 94000**.
- The whole-period minimum is a different target: `ceil(72000000 / 47000) = 1532` bills, yielding 4000 VND. Do not conflate this with an even 59-bill daily target.

These are exact calculations under the given model; they do not establish that other real operating costs have been included.

## Concrete neutral integration

The source map leads to two execution paths in `dify-agent.ts`:

1. With `PROJECT_AGENT_RUNTIME=sandbox`, `runRuntimeAgent` parses model-proposed actions and returns their results to the next model round. This is a concrete place for deterministic arithmetic.
2. Otherwise, the Dify agent owns its tools. This repository supplies its query, but cannot invent a calculator in a remote Dify workflow.

Implemented:

- `runtime/calculate.ts`: a bounded, side-effect-free exact rational calculator using BigInt. It does not evaluate JavaScript, run shell code, read files, contact services or use floating-point arithmetic.
- A runtime action: `{"action":"calculate","expression":"ceil(72000000/(47000*26))*26*47000-72000000"}` returns `exact: "98000"` with an explicit statement of its limited verification scope.
- Grammar: ungrouped integer/decimal literals (dot radix), `+ - * /`, unary signs, parentheses, `ceil(...)`, `floor(...)`. No variables, currency/grouping separators, percentages, scientific notation or arbitrary functions. Non-integer results are reduced fractions, not silently rounded decimals.
- Limits: 512 input characters, 128 tokens, 80 characters per literal, 24 levels of recursive nesting, and 512-digit intermediate numerators/denominators. Invalid expressions/division by zero return a failed tool result; the existing loop stops the remaining action batch.
- `calculation-guidance.ts`: require exact money arithmetic where tools are available, preserve unrounded intermediates, recompute period totals/surplus from rounded operational targets, and copy computed values consistently into prose/tables.
- Runtime instructions advertise only the new runtime action. The ordinary Dify query asks for an actually available calculator/code tool and requires disclosure when no tool verification was possible. It does not advertise the runtime action in the ordinary Dify path.
- The existing code-tool group's advisory restriction now names `calculate`; no permission or sandbox policy is relaxed. Read-only reviewer contexts can use this side-effect-free operation.
- Activity says “Calculating an expression”; no renderer, verification badge, automatic prose correction or arithmetic scanner was added.

**Limit:** this validates only a supplied arithmetic expression. A model may choose wrong inputs/formulas, skip a tool, or miscopy a result. The app still cannot certify arbitrary model prose, business assumptions or reasoning. A regression of the calculator is not proof that a future Dify response will be numerically correct. Larger statistical/financial models still belong in the existing sandbox/code tools.

## Host compatibility restored

The earlier request validator was stricter than the existing HTTP route/task-store contract for `modelSelector`.

- The route intentionally omits non-string selectors, including a numeric selector, before calling task creation.
- String hints still reach `normalizeProjectAgentModelSelector` through `task-store.ts`, which drops empty, unknown or oversized strings to the default model.
- The validator now leaves this optional hint to that existing normalization path. Conversation/retry identifiers and prompt/goal validation remain unchanged.
- No host integration change is required to preserve numeric-selector behavior. Do not stringify numeric selectors into model names.

Tests call the real HTTP POST handler with mocked host capabilities, asserting 202 and no selector passed to task creation for non-strings. They also assert that string hints are forwarded. They do not claim to test the unavailable real host model catalog.

## Exact local verification

Commands executed from the repository root:

| Command | Result |
| --- | --- |
| `npm run test:agent` | **20 test files passed; 175 tests passed, 1 skipped (176 total)** |
| `npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck lib/project-agent/runtime/calculate.ts lib/project-agent/calculation-guidance.ts lib/project-agent/request-validation.ts` | Exit 0; strict typecheck of the three independent calculation/guidance/validation modules |
| `node tests/check-agent-source.mjs c5748cb` | Exit 0; **13 changed/new source files** under 300 lines, TypeScript syntax passed; largest `runtime/run-agent.ts`, **293 lines** |
| `git diff --check` | Exit 0; no whitespace errors |

The calculator tests cover the supplied regression, the whole-period/daily distinction, decimal exactness, integers above Number.MAX_SAFE_INTEGER, precedence, signed rounding, invalid syntax, division by zero and resource limits. Real runtime-loop tests verify that exact receipts reach the next model round, calculation failures stop a batch, no shell is executed for the calculator, and arbitrary final prose remains unverified. Dify/model/file/service dependencies are mocked in those loop tests.

The single skipped existing test requires the unavailable Docker sandbox image/runtime. Full host TypeScript/Next builds, signed-in UI flows and live Dify execution were not run here. Presentation UI code is unchanged, so its demo/browser suite was not rerun for this follow-up. No dependency, provider configuration, credential, real user/business data or Work task was added. Publish only to the existing branch; use `[skip ci]` and leave main/staging untouched.

## Suggested host retest

In the original host, verify a numeric selector still produces a 202 task with the default model. Repeat the synthetic calculation prompt and inspect the actual tool log and final answer. In sandbox-runtime mode, a calculate receipt should show 59 bills/day, 1534 bills and 98000 VND using the corresponding expressions. In ordinary Dify mode, inspect which calculator/code tool is actually available; query guidance alone does not create one. Check both result consistency and the chosen units/period/assumptions before accepting the answer.
