# P3 Autonomous Agent Reliability — Local Agent QA Handoff

Branch: \`gpt/full-project-agent\`. P0–P2 should remain untouched; do not merge into \`main\` or \`staging\` automatically.

## Scope delivered

- Browser Agent V2: owner-only opt-in MJPEG live view (max 22 frames per connection, ~650 ms cadence, capped frame size); existing step history, owner takeover and release remain. No extension and no direct credential streams to the model.
- Browser policy V2: account-wide exact-host read/interact/deny rules stored in Mongo; request-level safety check and optional strict audit; audit retains only host, operation, task, owner and a label digest for 30 days.
- One-time browser approvals: atomic MongoDB transitions per owner/project/task/host/intent and 15-minute expiry; old file-backed pending approvals are not automatically migrated.
- Benchmark Lab: 40 synthetic local Chromium interaction fixtures across 10 categories, and 5 optional paid model-planned fixtures; all network requests inside browser contexts are aborted. Model decisions are not a guarantee of success on real websites.
- Harness Lab optional deployment gate: \`PROJECT_AGENT_HARNESS_REALWORLD_GATE=1\` requires no browser regression plus passing results before canary promotion. Default off; expenses from Dify model calls are possible.
- Workflow Builder V2: forward-only conditional branches, previous-step context (untrusted), approval, bounded transitions and explicit failure continuation with unsafe-side-effect fail-closed.
- Self-verification: deterministic claim/evidence audit of a final response, in addition to existing artifact QA. This is not a substitute for independently checking arbitrary task outcomes.
- Cost insights: optional selector routing and configured model price estimates; explicit per-task token and estimated-dollar budgets. Unknown prices are shown as unknown, never $0.
- Telegram link: account-owned one-time deep link with hashed code, private-chat-only webhook, encrypted chat identifier and generic text-only notifications. Default off.
- Curated Skills: eight advisory skill templates imported **disabled**; no executable marketplace installations.

## Flags (all opt in)

| Key | Purpose |
|---|---|
| \`PROJECT_AGENT_REALWORLD_BENCHMARK=1\` | Enable isolated 40-case Chromium UI benchmark |
| \`PROJECT_AGENT_BENCHMARK_MODEL_OPT_IN=1\` | Enable charged model-guided local-page benchmark |
| \`PROJECT_AGENT_BENCHMARK_MODEL\` | Optional Dify model selector for model benchmark |
| \`PROJECT_AGENT_HARNESS_REALWORLD_GATE=1\` | Require passing model-browser evidence to promote a Harness revision |
| \`PROJECT_AGENT_STRICT_BROWSER_AUDIT=1\` | Block actions when audit persistence fails |
| \`PROJECT_AGENT_MODEL_ROUTING=1\` | Enable heuristic simple/complex model selector routing |
| \`PROJECT_AGENT_MODEL_SIMPLE_SELECTOR\` | Configured inexpensive Dify model-step selector |
| \`PROJECT_AGENT_MODEL_COMPLEX_SELECTOR\` | Configured advanced Dify model-step selector |
| \`PROJECT_AGENT_MODEL_PRICING_JSON\` | JSON map: \`{"default":{"inputPerMillion":1,"outputPerMillion":2}}\` (USD only if configured) |
| \`PROJECT_AGENT_TASK_MAX_TOKENS\` | Maximum estimated accumulated step tokens; 0 disables |
| \`PROJECT_AGENT_TASK_MAX_COST_USD\` | Maximum estimated task spend, enforced only when a model price is configured |
| \`PROJECT_AGENT_TELEGRAM_NOTICES=1\` | Opt-in generic Telegram notices |
| \`PROJECT_AGENT_TELEGRAM_BOT_TOKEN\` | Telegram bot token (server-side only) |
| \`PROJECT_AGENT_TELEGRAM_BOT_USERNAME\` | Bot username for link |
| \`PROJECT_AGENT_TELEGRAM_WEBHOOK_SECRET\` | At least 32 random characters |
| \`PROJECT_AGENT_SESSION_VAULT_MASTER_KEY\` | Existing stable base64 32-byte envelope-encryption key |

Register Telegram webhook URL \`/api/internal/project-agent/telegram-webhook\` using Telegram \`secret_token\` matching \`PROJECT_AGENT_TELEGRAM_WEBHOOK_SECRET\`. This does **not** happen automatically.

All new Mongo collections are owner-scoped. Ensure index creation rights, and never mount Mongo secrets or Vault keys inside Agent sandbox \`/work\`.

## Local test commands

\`\`\`bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
node tests/check-lines.mjs
node scripts/check-agent-routes.mjs
npx tsc --noEmit
npx vitest run tests/presentation.test.tsx
npx vitest run --config vitest.agent.config.ts
PROJECT_AGENT_P3_BROWSER_QA=1 npx vitest run --config vitest.agent.config.ts tests/agent/p3-browser-real.test.ts
\`\`\`

The Chromium test requires an installed browser executable and may not run inside a restricted runner. The browser benchmark API also requires the host MongoDB connection and Node server. Test host Next.js typecheck/build separately; the demo \`tsconfig.json\` does not check every \`app/\` source.

## Manual signed-in acceptance

1. **Owner isolation:** User A and User B create different website policy rules; deny and approval must not cross accounts. Open a browser task as a Project collaborator and confirm owner-only live view returns 404.
2. **Approval races:** Two workers attempt to consume one approval; only one proceeds. After 15 minutes it expires; rejected or used approvals must not grant further writes.
3. **Policy and redirect:** Deny a target host and confirm direct navigation, redirect navigation and state-changing network calls fail. Test read-only POST blocking. A missing Mongo/strict-audit error should not grant write rights.
4. **Live view:** Enable Browser Watch, switch to Live view, check bounded close/reconnect, blurred inputs, and a user takeover/release. Turn watch off and confirm stream stops. Check browser frame size, RSS and latency with 2–3 concurrent owners.
5. **Workflow branching:** Build 4 steps, route urgent to step 3, normal to step 2, test stop/reject, approval gates, edit while running, worker crash and no duplicated external side effect.
6. **Cost caps:** Set explicit selector prices and tiny budgets; verify task stops before another action and observability reports \`unknown\` for unpriced models.
7. **Telegram:** Link privately via one-time start code, use owner B's code and see denial, revoke and confirm no more notifications. Never transmit prompts, cookies, screenshots or passwords.
8. **Harness gate:** Compare baseline/candidate via isolated model-assisted browser fixture and ensure failing gate blocks canary/promotion, while an explicitly disabled gate preserves existing behavior.
9. **Skills:** Import a catalog entry; confirm it is disabled and cannot execute code or change granted permissions.
10. **Regression:** Test scheduler reconnect/restart, task receipts, conversation pagination, Dify continuation and Personal Vault session restoration against the host app.

## Presentation Lab screenshot acceptance (independent of P3)

For the reported \`64518cf\` screenshots (desktop width 1365, mobile 390, fullpage): verify actual rendered crop/overflow rather than inferring from passing tests. Check reference figure caption association, inline/display TeX and MathML alignment, 8-state interactive sequence buttons, Mermaid scaling/label clipping, citation popover keyboard tab/escape/focus return, chart malformed-data fallback, horizontal scrolling and image aspect ratios at 390 px. Screenshots alone cannot verify interaction or keyboard correctness; record short browser traces.

## Status

Source changes are a test candidate, not a production acceptance. No CI, local browser QA, production build, deployment or real-user security audit was executed by the authoring environment. The user-supplied 252/252 PASS report applies to \`64518cf\` **before** this P3 work.
