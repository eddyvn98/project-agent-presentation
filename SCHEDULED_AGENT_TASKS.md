# Scheduled Agent Tasks — account-wide scheduler

Branch: gpt/full-project-agent. Code delivered without CI, typecheck, browser QA or production deployment (per user request).

## User interface
- /account/scheduled-tasks: Create (once/daily/weekly), edit, pause/resume, run immediately, delete, and view the last 20 run receipts.
- The Project Agent composer plus-menu links to this page.
- Schedules belong to the authenticated **user**, not the Project; projectId selects only where results are filed. Ownership is validated when created and again on dispatch.
- User scheduling through chat is supported by app-hosted runtime action: \`{"action":"schedule","op":"create","title":"...","prompt":"...","kind":"daily","localTime":"08:00","timezone":"Asia/Ho_Chi_Minh"}\`.
- The Agent can list, pause, resume and delete account schedules using its \`schedule\` action. Agent suggestions without an explicit request are **not automatically activated**.

## Server configuration
1. Ensure PROJECT_AGENT_RUNTIME=sandbox, configure the model provider and sandbox runtime as normal.
2. Set PROJECT_AGENT_SCHEDULES_DIR to a persistent, private directory on a **shared filesystem** accessible to the cron route and task workers. It must not be mounted to the user shell sandbox at /work.
3. Set PROJECT_AGENT_SCHEDULER_SECRET to a securely generated 32+ character value (do not commit it). Deploy an authenticated scheduler that invokes \`POST /api/internal/project-agent/schedule-tick\` with \`Authorization: Bearer $PROJECT_AGENT_SCHEDULER_SECRET\` every minute. **Nothing runs in the background until that external scheduler is actually configured.**
4. Deploy on a persistent Node.js worker host: \`startProjectAgentTask\` runs in the web-server process. A serverless request that shuts down immediately after dispatch is insufficient.
5. Keep server clocks synchronized. Schedule times use IANA timezones and local calendar days; nonexistent DST wall times are skipped. Repeated DST times select the earlier candidate.

## Run safety and limitations
- Due scans are bounded (20 entries per request). Folder locks protect one schedule across cooperative workers; no parallel runs of the same schedule are allowed.
- A dispatch receipt is written before task creation; interruption in that interval is reported as uncertain/failed, never blindly retried into an unintended duplicate.
- State is eventually reconciled by subsequent due dispatch or cron calls. Users can inspect each child task in its destination Project.
- Any browser login is restored only when the account owner explicitly enabled unattended use in Personal Vault. The browser's action policy remains in force.
- The program uses host filesystem atomic-directory locking. This is not a transaction-grade queue: for high volume, multi-region or strong exactly-once semantics, replace with MongoDB/Redis job claims and a durable worker, and implement task-run reconciliation with idempotency keys.
- The one-time datetime-local UI interprets the input in the user's **device timezone**; the timezone field is metadata in that mode. Daily and weekly schedules use the chosen IANA timezone.
- There is no push/email delivery of completed results and no built-in natural-language time parser. The Agent model forms the supported structured action; the backend validates the schedule.
- Automated agent runs need fully scoped website permissions and must still honor confirmation requirements for high-impact actions. Vault grant is not a universal consent to post or pay.

## Deferred verification
Never call this production-ready without tests of recurrence/DST, owner isolation, duplicate cron calls, crashes between task creation and receipt, revocation, pause/resume and repeated dates; then run typecheck and a live authenticated browser test.
