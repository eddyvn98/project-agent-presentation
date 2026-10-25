# P8 local QA and integration handoff (no external services)

This document is for a **clean isolated test clone**, not the dirty main
AI-WEB-CHAT checkout. P7's 67/67 local QA remains accepted; every new P8
code path needs a fresh local test result before P8 acceptance.

## 1. Source-only checks

```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
npm run test:p8:unit
npm run test:agent
npx tsc --noEmit
npm run check:lines
git diff --check
```

No GitHub Actions/CI, external Dify/Entra, remote sites, staging or merge.
Do not call `npm run test:host:p7:closeout` without its isolated synthetic
login-state and QA host prerequisites. The new P8 tests are deterministic,
use fake sessions/DOM and do not launch Chromium by default.

## 2. Real isolated Chromium benchmark

On the QA machine with Playwright Chromium already installed:

```bash
PROJECT_AGENT_P8_REAL_BROWSER_QA=1 npm run test:p8:browser
```

Expected: 40 independent local HTML fixtures checked on a real Chromium
instance, all 40 verified, max 4 total retries, none taking >10 seconds.
The smoke suite blocks external requests via Playwright route interception.
A skipped benchmark without the env flag is **NOT PASS**.

Report exact count, average actions/duration, retries and failing categories.
No login state, Dify API key or real website is necessary.

## 3. Host integration — Next.js 14.2.16

AI-WEB-CHAT has a separate app root, tsconfig and dependencies; it is
not equivalent to running the Presentation snapshot as a Next 16 host.
Port *only* these additions/modifications using the host's existing
`lib/`, `components/`, `app/api/` and Vitest configuration:

- New `runtime/browser-agent/loop-state.ts`, `progress-checker.ts`,
  `loop-step.ts`, `loop-finalize.ts`; `browser-loop-labels.ts` and
  `p8-loop-metrics.ts`.
- Small edits in `browser-agent/index.ts`, `control.ts`,
  `runtime/run-agent.ts`, authenticated `browser/route.ts`.
- UI edits in `ProjectAgentBrowserWatch.tsx`,
  account `AgentObservabilityDashboard.tsx` and
  `agent-observability.ts`.
- Isolated benchmark `benchmark/p8-scorecard.ts`, P8 tests and two
  npm script entries only; **do not replace** host `package.json`,
  Next version, layout, tsconfig alias, module paths or DB adapter.

Resolve conflicts against the **host checkout** before applying to the
main worktree. Keep existing host behavior and P7 regressions. All files
remain under 300 lines on the Presentation branch; verify the merged host
files independently rather than trusting source-only line counts.

## 4. Owner-only functional QA

Use a disposable Project, synthetic owner/nonmember identities, a local-only
mock model runtime and a QA database. In a dedicated QA host process:

- With both P8 flags OFF: existing P7 Browser Watch and takeover still PASS.
- With `PROJECT_AGENT_P8_LOOP=1` and
  `PROJECT_AGENT_P8_LOOP_REPORT_ONLY=1`: owner sees a loop timeline,
  **no action is blocked** by P8.
- With `PROJECT_AGENT_P8_LOOP=1` and report-only OFF: repeated identical
  no-progress browser actions prompt human assistance; stale model plans
  are rejected after takeover; user handback obtains a fresh DOM snapshot.
  The hard cap is 48 browser actions or 12 active-work minutes. Human wait
  time is excluded but spent action budget cannot reset itself.
- Owner GET `/browser` includes numeric `loop` fields; nonmember gets
  **404** for preview, screenshot and telemetry. API responses have
  `Cache-Control: private, no-store`.
- Watch disabled cleans image history; task Stop keeps the P7 CAS/cleanup
  regression green. Browser loop receipts do not contain URL path, query,
  typed values or credentials.
- Account Observability shows P8 counts only for the authorized account;
  the counters are distinct from goal-completion success rate.

Collect anonymized screenshots of UI only if opted in. Avoid exporting
real tokens or browser storage state. After test, delete only QA data
listed in the synthetic manifest; leave any dirty development checkout alone.

## 5. Exit condition

**P8 local functional acceptance** requires source tests + Chromium benchmark
+ owner/nonmember host QA above, with exact current SHA evidence.
P8 production release remains a separate gate: real Entra, real Dify,
staging, multi-host shared state and security review. Do not imply the
synthetic browser proves goal-level correctness or production readiness.
