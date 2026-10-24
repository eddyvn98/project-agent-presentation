# P4 Polish, Security Hardening & Regression — Local QA Handoff

Branch: `gpt/full-project-agent`. Baseline P3: `71090a443a1d97c86e2197a07f1f52aed74ebb28`.

## Changes
- `tests/browser/p4-interaction-regression.spec.ts`: forward/reverse traversal of all eight Sequence Explorer states; selection and keyboard slider synchronization; Mermaid resize/zoom/reset and horizontal page overflow at 390 px; citation Enter, Tab, Escape and focus restoration; malformed chart fallback and adjacent prose.
- `tests/agent/p4-cost-audit-recovery.test.ts`: configured and unknown model prices; malformed price configuration; independent token/USD limits; model routing opt-in; crash queue decision table; evidence-backed final-answer audit.

These tests deliberately use synthetic data. They are regression assertions, not claims of production readiness.

## Local verification
```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run tests/presentation.test.tsx
npx vitest run --config vitest.agent.config.ts
npx playwright test tests/browser/p4-interaction-regression.spec.ts --project=desktop
npx playwright test tests/browser/p4-interaction-regression.spec.ts --project=mobile
PROJECT_AGENT_P3_BROWSER_QA=1 npx vitest run --config vitest.agent.config.ts tests/agent/p3-browser-real.test.ts
```

If the new Playwright tests fail, capture a trace and screenshot before modifying assertions. Run `npx playwright install chromium` only if Chromium is missing. Existing P3 browser QA and owner/approval tests remain mandatory.

## Final signed-in verification checklist
1. Verify a 390px physical viewport with actual text bounds for Mermaid and each explorer scene; screenshot alone cannot prove the click paths.
2. Check the citation's Tab order in Chromium and dismiss by both Escape and close button; confirm focus returns to the invoking citation.
3. Verify pricing both with a configured selector and without a price entry. Unknown pricing must be labeled unknown, not as zero or an enforcement guarantee; assess whether cost budgets should fail closed for unknown models before enabling charged production execution.
4. Check unit totals against actual provider billing; model price estimates are not invoices.
5. Restart an active worker at safe and unsafe side-effect boundaries. Confirm only queued safe tasks are redispatched, uncertain actions require review and no external side effect is repeated.
6. Audit claim-evidence behavior with real browser and shell traces. The current heuristic audit does not certify arbitrary factual claims.
7. Repeat P3 cross-owner isolation, security policies, approval race, Telegram secrecy, browser watch and Dify continuation tests.

## Status
Two P4 regression suites were committed remotely, but this authoring environment could not clone GitHub over network, launch the project or execute these suites. They require local-agent execution and any necessary fixes before final acceptance. No CI, `main`, or `staging` operations were performed.
