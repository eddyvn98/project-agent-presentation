# Scheduled Agent — deployment, permissions and operations

Branch: `gpt/full-project-agent`. This is source-level implementation. User requested that **CI, build, test and browser acceptance are postponed**. Do not enable account cookies or unattended third-party writes in production without those checks.

## User-facing features
- `/account/scheduled-tasks`: account-wide one-time, daily, weekly, interval and website-change schedules; create, edit, pause, resume, delete, run now, view history and pending Agent proposals.
- Project Agent composer (+) links to Scheduled Tasks.
- Agent runtime `schedule` action: `list`, `create` (only when directly authorized by the user's request), `propose` (always inactive until approved), `pause`, `resume`, `delete`. The primary Agent can suggest proactive monitoring; the chat displays an Approve/Dismiss card. Scheduled runs cannot schedule or modify other schedules.
- Header bell shows completed/failed results, with dismiss/read acknowledgment stored in the owner's schedule.
- `watch` frequency: website fetched server-side over guarded HTTPS; initial version stored as baseline, subsequent runs invoke Agent only on a detected text change. Unchanged checks stay quiet. Content hashes are a heuristic; sites with dynamic timestamps can trigger false positives.

## Start the daemon
1. Deploy the host application on a **persistent** Node.js server with MongoDB task storage; do not use serverless workers that terminate after HTTP responses.
2. Give every worker an access-controlled shared POSIX filesystem (or replace schedule files with durable DB records). Set `PROJECT_AGENT_SCHEDULES_DIR` to a shared directory **outside sandbox mounts** and owned by the server account. Worker leases and account records assume atomic mkdir and rename on this mount.
3. Generate a random 32+ character `PROJECT_AGENT_SCHEDULER_SECRET`, store outside source control. Set `PROJECT_AGENT_SCHEDULER_URL=https://your-host.example` and `PROJECT_AGENT_SCHEDULER_TICK_MS=60000`.
4. Run `node scripts/project-agent-scheduler.mjs` under a restart-capable process manager or container health policy. It calls `POST /api/internal/project-agent/schedule-tick` with Bearer authentication, without an open user browser.
5. Set `PROJECT_AGENT_RUNTIME=sandbox` and `PROJECT_AGENT_BROWSER_AGENT=1` only after the Browser Agent security gates are accepted. Set `PROJECT_AGENT_SESSION_VAULT_MASTER_KEY` to a stable 32-byte base64 key stored in a secrets service. Configure `PROJECT_AGENT_SESSION_VAULT_DIR` on a protected shared directory.
6. Run a deployment smoke test: one-time, recurring and watch schedules, server restart while queued/running, account cross-over isolation, approve/dismiss, revocation and notification acknowledgment.

## Limits and failure semantics
- Claim-before-dispatch and one-owner cron tick lease prevent ordinary concurrent duplicates on a cooperating shared filesystem.
- A crash *between* the MongoDB task write and writing the schedule receipt leaves an uncertain dispatch. It is marked failed after a grace period, **not blindly retried**. Strong exactly-once needs a DB transaction or unique idempotency key supported by the host's Mongo task repository.
- The worker periodically reconciles queued/running tasks, including one-time schedules, even after their next-run timestamp disappears. A task stale for six minutes can go through existing Project Agent recovery.
- Scheduling guarantees depend on a running daemon, healthy host and durable storage. Do not claim zero downtime or multi-region exactly-once delivery. Cross-region deployment should use a real distributed lease/queue, preferably Mongo unique scheduled-run IDs or Redis Streams with leases.
- On sensitive or irreversible browser actions the runtime still requests confirmation. An unattended user prompt is never treated as a new confirmation. Personal Vault has its own per-site read/interact and unattended approval.
- Email, Telegram or push alerts are **not silently enabled**; only the in-app notification bell is implemented.
- Website authentication can expire and need a private re-login; the scheduler does not retrieve a user's raw passwords.

## Later validation (requested)
Review host imports, static types, tests, browser login flow, DST and timezone edge cases, monitor false positives, worker restart and duplicate cron requests, secret leakage in logs, the 300-line policy, and multi-tenant authorization before moving the branch to production.
