# Local Agent QA Handoff — Mongo Scheduled Agent + Proactive Discovery

**Branch:** `gpt/full-project-agent`
**Scope:** This branch now contains source code changes for the previously remaining Stage 1 and Stage 3 gaps. **Tests, CI, build, browser QA, migration execution and production deployment were intentionally not run here.** The local QA agent owns those checks.

## Architecture delivered

- `lib/project-agent/scheduled-mongo-store.ts` is the primary schedule ledger, using the host's `@/services/mongodb/client` database. Mongo records are account-owned. Per-occurrence compare-and-swap (revision) claims prevent normal double dispatch across workers, and a unique owner+dedupe index limits repeated create requests.
- `lib/project-agent/durable-mongo-queue.ts` replaces filesystem task-queue claims, tracks owner-independent task IDs with a unique Mongo `_id`, renews a lease during work, requests task abort if the lease is lost, and marks uncertain side effects `needs_review` instead of blindly retrying.
- `lib/project-agent/task-idempotency.ts` derives deterministic task IDs from account + logical occurrence. `createProjectAgentTask` checks the persisted task before creating another. Scheduler and Workflow recovery can relink an already-created task after a crash.
- `lib/project-agent/scheduled-migration.ts` and `lib/project-agent/durable-queue-migration.ts` move old JSON schedule and queue receipts to Mongo through idempotent inserts, archiving each source file after success.
- `lib/project-agent/proactive-signals.ts` records limited, owner-scoped completed-task signals in Mongo with a 90-day TTL. `lib/project-agent/proactive-store.ts` discovers repeated work under a distributed six-hour discovery lease, with durable dismiss/snooze decisions. Suggestions appear in chat and link to the schedule form via an opaque ID, never by embedding the user's raw prompt in the URL.
- `lib/project-agent/proactive-migration.ts` imports older local insight records on opt-in.
- User approval remains mandatory for Agent-originated schedules and proposed modifications; the account owner can create a schedule directly in the authenticated UI. The task's scheduled-run marker prevents the model from modifying schedules while unattended.

## Deployment and migration

1. Deploy with the host's existing MongoDB `getMongoAiDb` connector and Project Agent runtime. The new collections are `projectAgentSchedules`, `projectAgentDurableTasks`, `projectAgentProactiveSignals`, `projectAgentProactiveOpportunities`, and `projectAgentProactiveLeases`.
2. **Back up** earlier files first. Set `PROJECT_AGENT_LEGACY_SCHEDULES_DIR` and `PROJECT_AGENT_LEGACY_QUEUE_DIR` to the earlier private directories if necessary.
3. Temporarily enable `PROJECT_AGENT_MIGRATE_FILE_SCHEDULES=1`, `PROJECT_AGENT_MIGRATE_FILE_QUEUE=1`, and `PROJECT_AGENT_MIGRATE_INSIGHT_HISTORY=1` on the trusted host; run the authenticated scheduler tick until the migration summary reaches zero new imports. Remove all three flags afterward. Previously migrated JSON files are renamed `.migrated` and retained for audit/rollback.
4. Configure `PROJECT_AGENT_SCHEDULER_SECRET` (32+ random chars), `PROJECT_AGENT_SCHEDULER_URL` (HTTPS, or HTTP localhost for development), and run `node scripts/project-agent-scheduler.mjs` under a persistent process manager. Queue backend now defaults to Mongo; `PROJECT_AGENT_DURABLE_QUEUE=0` disables the durable queue only for explicit local debugging.
5. For Browser Agent login reuse, configure the independent encrypted Personal Vault and ensure all unattended per-site grants are owner-approved. No cookie, token or encryption key should enter a sandbox-mounted `/work` directory.

## Acceptance checks for local agent

- **Type/build:** TypeScript host build, Next.js route integration, unit tests, project-agent tests and the 300-line guard. These were not run in the source-authoring environment.
- **Mongo CAS:** Simultaneously invoke two cron ticks and two manual Run Now requests for the same schedule. Exactly one should claim the active occurrence; the other should report skipped. Confirm different schedules can run independently.
- **Owner isolation:** Two authenticated users with matching schedule titles and website domains may see, modify or run only their own schedules, suggestions and notifications. Force cross-owner ID probes against API read/write routes.
- **Crash recovery:** Simulate crashes (a) before schedule claim, (b) after claim but before creating task, (c) after task insert but before saving schedule receipt, (d) during task execution, (e) after completion but before marking receipt. Ensure no duplicate external side effects and that uncertain running tasks go to needs_review.
- **Workflow replay:** For each Workflow step, verify deterministic task ID, stable owner+step identity, release of approval gates, and reconnection after a dispatching-state restart.
- **Migrations:** Import legacy active, pending, paused and completed schedules; queued/running/terminal queue receipts; repeated migrations must not restore deleted Mongo records or enqueue completed tasks. Verify every imported file was archived only after DB persistence.
- **Proactive:** Repeated successful ordinary tasks should propose automation in the correct account only; scheduled/background tasks, passwords/OTP/payment prompts and dismissed suggestions should not create recurring alerts. Test snooze expiry and suggestion prefill without raw query-string content.
- **UI:** `/account/scheduled-tasks`, owner approval cards in chat, notification bell, proactive suggestions, workflow picker, IANA timezone and DST, interval and website-watch baseline. Test desktop/mobile keyboard operation.
- **Security:** Vault encryption and rotation, IndexedDB restore, browser session revocation, sandbox deletion, read-only POST request blocking, owner-driven one-time sensitive-click confirmation and APM/log redaction.

## Remaining environment-dependent items (not claims of completion)

- The code still needs host integration QA. A short-lived serverless Next.js worker cannot reliably run browser automation merely because cron reaches the route.
- Mongo queue supplies atomic claims, **not transactional exactly-once external side effects**. Human review remains required for indeterminate external writes.
- A website watch based on textual hashes can be noisy if the HTML changes dynamically; add normalization or semantic checks based on actual user requirements.
- Sender connectors for email, push or Telegram notifications were not set up automatically. The in-app bell is implemented.
- For deployment on Windows or multiple servers, validate file permissions for encrypted session Vault and isolation of Docker workspace mounts; the new schedule and task queue ledgers themselves no longer need a shared POSIX filesystem.
