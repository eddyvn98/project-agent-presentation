# Project Agent P0–P2 Upgrade — implementation map and rollout gates

Branch: \`gpt/full-project-agent\`. The user requested no CI/build/browser testing during feature authoring. **Source integration is not production acceptance.**

## Modules implemented

| Level | Feature | Source and UI |
|---|---|---|
| P0 | Durable queue and explicit recovery receipts | lib/project-agent/durable-queue.ts, task-runner.ts, task-recovery.ts |
| P0 | Scheduler V2 and persisted claims | scheduled-store.ts, scheduled-worker.ts, schedule-tick route |
| P0 | Owner-only browser approval and permission center | agent-approvals.ts, browser-agent/index.ts, /account/agent-control |
| P1 | In-app notification center | /api/project-agent/notifications, ProjectAgentScheduleNotifications |
| P1 | Human approval inbox | /api/project-agent/approvals, AgentApprovalInbox |
| P1 | Per-user encrypted, optional memory | personal-agent-memory.ts, /api/project-agent/personal-memory |
| P1 | Browser session refresh and expired-login signal | browser-agent/browser-session-health.ts, personal-vault.ts |
| P1 | Proactive schedule suggestions | proactive-suggestions.ts, /api/project-agent/proactive |
| P2 | Workflow Builder with sequential steps + optional approval | workflow-{types,store,runner}.ts, /account/agent-workflows |
| P2 | Owner-scoped observability | agent-observability.ts, /account/agent-observability |
| P2 | Cross-project personal Skill Registry | personal-agent-skills.ts, /account/agent-skills |

## End-user workflows

- Account schedules: /account/scheduled-tasks; once/daily/weekly/interval/watch; optional trigger of a saved enabled Workflow.
- Agent may propose disabled workflows from chat. Account owner reviews, enables and runs. User-authored workflows can also be built with the UI.
- Each workflow step creates a real Project Agent task, carries a workflowRunId and stores a durable run receipt. A requiresApproval step waits until the authenticated owner approves it.
- Browser actions matching irreversible/sensitive labels produce one-time, task-and-action-bound approvals in Agent Control Center. Scheduled/unattended actions cannot self-approve.
- Notifications aggregate completed/failed schedule runs, pending browser approvals, and workflow completions/approval gates.
- Personal Agent memory defaults off, is AES-GCM encrypted and only user-approved facts enter the model context.
- Skills are disabled by default and are advisory instructions only. Existing Project skills remain separate.

## Required host configuration

Use a persistent Node server and an external process manager. Do not run the task worker inside an ephemeral request-only serverless function.

1. \`PROJECT_AGENT_RUNTIME=sandbox\` and the project's existing model/Dify/sandbox environment must be configured.
2. Set \`PROJECT_AGENT_DURABLE_QUEUE=1\`. In production set \`PROJECT_AGENT_DURABLE_QUEUE_DIR\` to a server-only **shared persistent** POSIX directory with atomic directory operations and restrictive ownership/ACLs.
3. Configure \`PROJECT_AGENT_SCHEDULES_DIR\` and \`PROJECT_AGENT_WORKFLOWS_DIR\` as private durable shared directories. The existing scheduler daemon \`node scripts/project-agent-scheduler.mjs\` calls \`POST /api/internal/project-agent/schedule-tick\` with \`Authorization: Bearer $PROJECT_AGENT_SCHEDULER_SECRET\`.
4. Set \`PROJECT_AGENT_SCHEDULER_SECRET\` (32+ secret chars), \`PROJECT_AGENT_SCHEDULER_URL\` (trusted host origin), \`PROJECT_AGENT_SCHEDULER_TICK_MS\` (default 60000). Keep secrets out of Git.
5. Set \`PROJECT_AGENT_APPROVALS_DIR\`, \`PROJECT_AGENT_PERSONAL_MEMORY_DIR\`, \`PROJECT_AGENT_PERSONAL_SKILLS_DIR\` to account-protected persistent directories, **never mounted** into /work and never shared to a model or sandbox shell.
6. \`PROJECT_AGENT_SESSION_VAULT_MASTER_KEY\` must be a stable 32-byte base64 secret to use encrypted personal memory and the saved browser login vault. \`PROJECT_AGENT_SESSION_VAULT_DIR\` also requires a protected persistent directory and explicit per-host user grants.
7. Enable browser automation only after signed-in security QA using \`PROJECT_AGENT_BROWSER_AGENT=1\`. Existing Vault grants and high-impact confirmation policies remain independent.

## Operational correctness

- Queue jobs first persist a receipt. Cooperative workers claim via an exclusive lease and heartbeat; after an indeterminate worker crash the job is placed in \`needs_review\`, not blindly retried. User review is required before reissuing potentially irreversible actions.
- Workflow steps persist \`dispatching\`, then their task ID, before starting the child Agent task. Interrupted dispatch is marked uncertain/failed instead of replaying potentially duplicated side effects.
- Workflow definitions are snapshotted into each run: editing future steps does not mutate steps already running.
- Scheduled workflow launches are reconciled from workflow run status. Pausing a schedule prevents future launches but does not cancel a workflow already started.
- SSO cookies and indexed storage are encrypted in Vault; expired sessions require the account owner to reauthenticate. Automated jobs do not have password access.
- Account memory and skills are user-controlled. Neither website content nor autonomous model output can silently approve a sensitive browser action.

## Limitations requiring deployment verification

- The file-backed adapter depends on coherent locks and atomic rename on every worker. It is **not** a globally transactional, multi-region queue. For exactly-once side effects replace it with Mongo unique idempotency keys and transactional claiming, and add destination-specific idempotency on external API requests.
- A worker killed after starting an external action can leave an indeterminate result. The implementation refuses unsafe automatic retry; review tools and host operational alerts are needed.
- Notification Center is in-app polling; no email, Telegram, APNs or push delivery is silently enabled.
- Proactive suggestions are deterministic (repeated requests), not unrestricted always-on background autonomous planning. The user must approve the scheduled automation.
- Workflow Builder supports an ordered sequence of 1–12 task steps with approval gates. It does not yet support arbitrary loops, graph branching, or third-party webhooks.
- Browser-session expiry is recognized heuristically; no site-independent guarantee of login renewal exists.

## Deferred QA / hard gate before real users

No CI, tests, typecheck, build, browser QA or deployment executed in this authoring pass, honoring user instruction. Before production: validate TypeScript against the actual AI-WEB-CHAT host and its external Mongo/Next.js imports; verify actual signed-in workflows, DST, cron recovery, lease/network partitions, duplicate task side effects, owner isolation, approval races, SSO handling, memory encryption, workflow resume after crash, and all UI controls.
