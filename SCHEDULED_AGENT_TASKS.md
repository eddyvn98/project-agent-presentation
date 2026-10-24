# Scheduled Agent Tasks — implementation and operations

Branch: `gpt/full-project-agent`.

## Delivered source
- Account-wide UI at `/account/scheduled-tasks`: one-off, daily, weekly, every-N-minutes, and watch-a-website schedules. Create, edit, pause, resume, delete, run now and inspect up to 20 run receipts.
- Project Agent composer (+) links to schedules; the chat displays the pending Approve / Dismiss control and a bell for completed or failed runs.
- App-hosted Agent `schedule` actions: `list`, `create`, `propose`, `pause`, `resume`, `delete`. **Every Agent-originated creation/change is a pending proposal**; only an authenticated account owner can approve it. Changes are never authorized through keyword regex, model text, or web page content.
- A task run by the scheduler has an explicit `scheduleRunId` and a runtime `scheduledRun` marker, preventing schedule tool mutations and suppressing direct-user-confirmation shortcuts for risky browser actions.
- Scheduler cron endpoint `POST /api/internal/project-agent/schedule-tick` uses a constant-time-checked Bearer secret.
- Durable schedule records and per-occurrence run receipts stored in an owner-scoped directory outside sandbox mounts. A cooperative per-schedule lock and global tick lease reduce duplicate claims; task records themselves persist in the host's MongoDB task repository.
- Reconciliation runs even for one-time schedules. Stale queued/running tasks use existing Project Agent recovery, and dispatch receipts interrupted before task creation are marked uncertain/failed rather than blindly retried.
- Website watch: guarded HTTPS source → SHA-256 fingerprint → baseline saved first run → unchanged checks silent → changed checks launch Agent and notify on completion. This is a text-change heuristic; dynamic pages can produce false positives.
- Account-scoped in-app notification endpoint `/api/project-agent/schedules/notifications` with persistent read receipts. No automatic external email or messaging delivery.

## Required production configuration
1. Deploy the Project Agent host with Next.js + MongoDB task records + persistent Node.js workers. Do **not** rely on short-lived serverless workers that disappear after returning an HTTP response.
2. Configure a protected, shared durable filesystem with atomic directory creation and rename. Set `PROJECT_AGENT_SCHEDULES_DIR` outside any user shell workspace or mounted sandbox. For real multi-host/multi-region exactly-once guarantees, replace this adapter with a transactional MongoDB/Redis queue and unique occurrence keys.
3. Generate a random 32+ character `PROJECT_AGENT_SCHEDULER_SECRET` and set `PROJECT_AGENT_SCHEDULER_URL` to the host origin. Run `node scripts/project-agent-scheduler.mjs` under a process manager that restarts crashed workers. Default check cadence is one minute; `PROJECT_AGENT_SCHEDULER_TICK_MS` overrides this.
4. To reuse login sessions, set `PROJECT_AGENT_RUNTIME=sandbox`, `PROJECT_AGENT_BROWSER_AGENT=1`, `PROJECT_AGENT_SESSION_VAULT_MASTER_KEY` (stable 32-byte base64 key) and `PROJECT_AGENT_SESSION_VAULT_DIR`. Every site also needs the account owner's explicit unattended-browser permission.
5. Secure API origin checks, task ownership, secret storage, ingress redaction and host directory ACLs. Host filesystem permission bits alone do not enforce Windows ACLs.
6. Do not enable protected account automation before complete signed-in tests and security review.

## Reliability and permission model
- UI-created schedules are activated by the user's authenticated POST; Agent-proposed schedules are pending until approved.
- Existing schedules can be paused or changed directly in the authenticated UI. The Agent cannot directly commit these changes; it creates an approval request.
- The worker does not create child schedules or silently upgrade website access.
- Scheduler delivery is **at-least-attempted**, not proven exactly-once. A crash after Mongo task creation and before schedule receipt remains an indeterminate state; no unsafe automatic retry is attempted.
- Pausing/deleting a schedule stops future dispatch, but does not cancel a task that is already running.
- One-time schedule inputs are interpreted in the selected IANA timezone, with DST validation. Weekly/daily use calendar-local recurrences; `watch` and `interval` run at elapsed-minute intervals.
- Browser sessions may expire and require the user to reauthenticate. Revoking a grant invalidates its version and closes affected contexts when a worker notices the change.

## Deferred acceptance (requested by user)
No CI, test suite, typecheck, Next.js build, live Chromium or production deployment was run. Later QA must check: type safety, Windows and Linux mounts, owner isolation, persistence after host restarts, busy/stale locks, duplicate cron ticks, Mongo write/recovery race, intervals and DST, multilingual proposals, approval/rejection, website-change baseline, authenticated browser session, revocation, notification read receipts, host lifecycle and multi-worker failover. Always perform these checks before claiming production readiness.

## User-owned browser confirmation (source integration)
A human who takes over Browser Watch can click a potentially high-impact control only after a second explicit confirmation. The confirmation ticket expires after 45 seconds and is bound to the current screenshot sequence and click coordinates. This permission is not available to unattended Agent actions. Read-only saved sessions additionally block HTTP mutations at the browser request boundary. Deleting a sandbox closes its borrowed task browser contexts, without deleting the encrypted account Vault.
