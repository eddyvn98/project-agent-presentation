# P6 QA follow-up: full-suite hang isolation

Branch: `gpt/full-project-agent`; main/staging untouched, no CI run.

## Source changes
- The existing `ProjectAgentErrorNotice.tsx` and its test both exist in this repository. Added `__tests__/project-agent/task-error-notice.test.tsx` to the explicit standalone Vitest Agent include list so it is exercised in the correct config. The reported host-module resolution error may be caused by invoking the default Vitest config instead of the Agent config; do not add a fake host component.
- `scripts/diagnose-agent-tests.mjs` executes each Agent suite file in a fresh child process with a 45-second default deadline. A timeout or failed file is reported with a bounded log tail, and the script returns nonzero. This is a diagnostic, not a replacement for the full combined suite.

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
npx vitest run --config vitest.agent.config.ts --pool=forks --maxWorkers=1 --minWorkers=1 --reporter=verbose
```
Use an external 120-second watchdog for the combined run and capture the last completed test and active process handles. Do not claim full-suite PASS from a partial reporter output.

## Report back
Provide the failing or timed-out file names, last 100 lines of logs, Node and Vitest versions, exit status, duration, process handles if available, and whether the single-file error notice test passed. If only the combined suite hangs, isolate pairs of tests sharing mocks, timers or server listeners; fix the actual leaked handle before changing global test timeouts.

## Status
These edits were committed through the GitHub connector. No local test execution or full-suite PASS is claimed in this authoring session.
