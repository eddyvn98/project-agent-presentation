# Personal Vault — scheduler integration note

The encrypted Personal Session Vault is account-scoped, independent of Projects and sandbox lifetimes. `PROJECT_AGENT_SESSION_VAULT_MASTER_KEY` must be supplied securely, and `PROJECT_AGENT_SESSION_VAULT_DIR` must be a protected persistent host directory outside sandbox mounts.

Scheduled Agent tasks now use explicit schedule-run metadata. Only websites with account-owner-approved unattended access can restore saved browser state. Agent-created schedules and changes must also be approved in the Scheduled Tasks UI. Grant revocation invalidates versioned browser sessions and triggers periodic closure on each connected host worker that shares the Vault files.

The login storage captures cookies, localStorage and IndexedDB. SSO flows are website-specific; related identity domains need explicit consent, and browser sessions can expire.

A separate scheduler daemon (`scripts/project-agent-scheduler.mjs`) and host/MongoDB runtime are required for offline execution. Read `SCHEDULED_AGENT_TASKS.md` for configuration, limitations and future QA. These features are source-complete for this branch but untested; do not treat them as production security certification.
