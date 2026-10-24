# Personal Session Vault: deployment and security gates

## Architecture

A saved login is attached to the authenticated **user**, never a project. Each saved host has an independently encrypted storageState. The host application owns all keys, browser state and consent metadata. No keys are mounted under /work or sent to an Agent model. A sandbox deletion destroys borrowed browser state, **not** the user's saved Vault entry. Account-level revocation removes the saved entry.

Browser Watch supports a private user-driven password/OTP flow. Website permissions are read/interact and unattended reuse is independently opt-in. **No extension** is used.

- Management UI: /account/browser-sessions
- Management API: /api/project-agent/personal-vault (GET, PATCH, DELETE)
- Private Browser Preview login API: /api/projects/{projectId}/agent/tasks/{taskId}/browser/control

## Configuration

A stable, secret 32-byte base64 PROJECT_AGENT_SESSION_VAULT_MASTER_KEY is mandatory. Store in a secrets manager, not Git or .env committed to source. PROJECT_AGENT_SESSION_VAULT_PREVIOUS_KEYS can hold a JSON array of up to four old base64 keys so wrapped per-user keys rotate lazily. PROJECT_AGENT_SESSION_VAULT_DIR must point at a private host directory; for multiple workers it must refer to a **shared durable mount** whose operations/permissions are correct on every worker. If each worker has private files, cross-worker grants and revocation cannot work.

## Security limitations / production blockers

**This branch has not been built, tested or security audited. Do not enable real-account sessions in production yet.**

- Shared browser process/context operation and user takeover are managed in host RAM. Cross-worker agent operations cannot migrate a live session. Grant revocation gets noticed by the worker on its **next browser action** when it reads the persistent Vault; it does not immediately interrupt an already running request on another worker.
- A full worker coordinator/lease with a push revocation channel (e.g. Redis) is still needed for strict immediate revocation across distributed workers.
- SSO sign-in often involves cookies on an identity-provider domain and related cross-site origins. Persist these **only** when the user separately grants those precise hosts. This first version does not provide a full sign-in host approval UI.
- Logging of API request bodies, screenshot or tracing at the infrastructure ingress can leak typed secrets; configure ingress/APM to omit those request bodies. Browser Watch masks text inputs; authenticated page text may still contain private data. The model can see page contents in snapshots, so stricter privacy isolation is needed before handling sensitive accounts.
- Logging in once is not a promise of indefinite authentication. Refresh tokens may expire or be revoked server-side.
- The settings screen is English-first; product localization and navigation links must be integrated into the host app.
- A proper automation scheduler and app account connection authorization must be audited in the host repository. This presentation branch does not itself implement a cron worker or durable job queue.

## Deferred QA (user request)

No CI, tests, Next.js host build, real Chromium/SSO QA or production deploy was run. Verify: no cross-account access, same account across projects, initial login and refresh, SSO with related domains, IndexedDB, cancellation and revoke during navigation, multiworker revocation, key rotation, malformed vault envelopes, user takeover and confirmation gates.
