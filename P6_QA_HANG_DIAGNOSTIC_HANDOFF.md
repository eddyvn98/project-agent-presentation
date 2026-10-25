# P6 QA follow-up: full-suite hang isolation

Branch: `gpt/full-project-agent`; main/staging untouched, no CI run.

## Source changes
- The existing `ProjectAgentErrorNotice.tsx` and its test both exist in this repository. Added `__tests__/project-agent/task-error-notice.test.tsx` to the explicit standalone Vitest Agent include list so it is exercised in the correct config. The reported host-module resolution error may be caused by invoking the default Vitest config instead of the Agent config; do not add a fake host component.
- `scripts/diagnose-agent-tests.mjs` executes each Agent suite file in a fresh child process with a 45-second default deadline. A timeout or failed file is reported with a bounded log tail, and the script returns nonzero. This is a diagnostic, not a replacement for the full combined suite.
- Vitest 5.0.5 does not accept `--minWorkers`; removed that unsupported option from the diagnostic invocation and the serial-suite example. It had caused the first diagnostic attempt to report every file as failed before Vitest started.

## Local agent commands
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run --config vitest.agent.config.ts __tests__/project-agent/task-error-notice.test.tsx
node scripts/diagnose-agent-tests.mjs > agent-qa-diagnostic.log 2>&1
```
If all isolated files pass, investigate cross-file state and open handles in the combined suite:
```bash
npx vitest run --config vitest.agent.config.ts --pool=forks --maxWorkers=1 --reporter=verbose
```
Use an external 120-second watchdog for the combined run and capture the last completed test and active process handles. Do not claim full-suite PASS from a partial reporter output.

## Report back
Provide the failing or timed-out file names, last 100 lines of logs, Node and Vitest versions, exit status, duration, process handles if available, and whether the single-file error notice test passed. If only the combined suite hangs, isolate pairs of tests sharing mocks, timers or server listeners; fix the actual leaked handle before changing global test timeouts.

## QA results (2026-10-25)
- `node tests/check-lines.mjs`: PASS; all source, demo and test files are under 300 lines.
- `node scripts/check-agent-routes.mjs`: PASS; 8 protected pages.
- `npx tsc --noEmit`: PASS.
- `npx vitest run --config vitest.agent.config.ts __tests__/project-agent/task-error-notice.test.tsx`: PASS; 1 file, 2 tests, 548 ms.
- `node scripts/diagnose-agent-tests.mjs`: PASS; 50 files, 50 child runs, 0 failures, 29.0 seconds summed test-run durations. The gated P3 Chromium test was enabled and passed separately: 1 test, 40 synthetic browser interactions, 9.92 seconds.
- `npx vitest run --config vitest.agent.config.ts`: PASS; 50 files, 315 passed, 1 skipped, 4.93 seconds. The skipped test is the opt-in P3 Chromium benchmark.
- `PROJECT_AGENT_P3_BROWSER_QA=1 npx vitest run --config vitest.agent.config.ts`: PASS; 50 files, 316 tests passed, 10.69 seconds.
- Combined serial regression (`--pool=forks --maxWorkers=1 --reporter=verbose`): PASS; 50 files, 315 passed, 1 skipped, 18.93 seconds.
- `npm run build:demo`: PASS; Vite build completed in 609 ms. Vite reported the existing >500 kB chunk-size advisory.

## Hang investigation
- No test file timed out in the 50 isolated runs. Both combined suite runs completed, including the single-worker run; no persistent timer, process, browser or stream leak reproduced.
- Therefore the earlier full-suite stall is not attributable to a specific test or open handle from current evidence. The first diagnostic failures were a separate CLI incompatibility (`--minWorkers`), not test failures. The earlier `task-error-notice` resolution failure also came from using a temporary config without the Agent aliases; the requested Agent config passes.
- No source runtime change was needed. Main and staging were not changed, and no CI was run.
