# Personal Session Vault (cross-project, no extension)

## Scope

Implemented foundation on gpt/full-project-agent. **No CI, build, typecheck, live-browser QA or production security audit has been performed.** Do not enable for real customers before those checks. The user's login credentials are not sent to the model and are not stored in this Vault: only selected browser cookies and same-origin storage state are encrypted.

## Configuration

- Set PROJECT_AGENT_SESSION_VAULT_MASTER_KEY to a **stable, securely generated 32-byte base64 key**, held outside the repo and away from Docker sandboxes. Never auto-generate the master key during runtime. Losing this key makes stored sessions unrecoverable.
- Optionally set PROJECT_AGENT_SESSION_VAULT_DIR to a private persistent host directory (not under any /work mount), and PROJECT_AGENT_SESSION_VAULT_DAYS (default 90, maximum 365).
- PROJECT_AGENT_RUNTIME=sandbox and PROJECT_AGENT_BROWSER_AGENT=1 must both be enabled. Use HTTPS for the application and all eligible target websites.
- For production replace host-local encrypted files with a durable encrypted store and KMS-wrapped, rotated account keys. Worker and API state currently assume a single host process.

## End user flow

1. Agent opens an HTTPS site and the account owner takes browser control in Browser Preview.
2. In **Personal website login**, choose **Start private login**. Click to focus the password/OTP field in the screenshot; enter credentials in the dedicated password control. Use **Submit login field** to press Enter after protected field entry. The ordinary Agent typing action cannot enter protected secrets.
3. After the user has **actually authenticated** on the original host, choose read-only or interact permission, independently choose **Allow reuse by unattended tasks**, then **Save encrypted browser login**. Save does not itself prove identity: actual authentication and service-side login status must be verified during QA.
4. On future tasks in any project, opening the same exact host transparently restores owner-scoped cookies and localStorage only when unattended reuse was explicitly granted. When unattended is not granted, automatic restoration is disabled.
5. **Revoke this site** deletes its encrypted snapshot and shuts down active same-owner sessions for the host. Browser deletion and task cleanup do not destroy the account-scoped Vault; deleting the Vault entry requires explicit revocation.

## Security design

- Each user identity maps to its own account encryption key, wrapped using AES-256-GCM with the server master key; each host is separately AES-256-GCM encrypted with owner + hostname authenticated as AAD.
- Vault metadata and session payloads live outside the mounted /work sandbox and are never attached to model prompts or shared with subagents.
- The browser action path uses the trusted task owner's identity. It does **not** trust a model- or client-supplied owner ID.
- The private login endpoint accepts secrets only during explicit owner takeover and an expiring ten-minute consent window. The browser runs that input event directly; it must not be included in application request logs or monitoring traces.
- Cross-origin SSO identity-provider state and IndexedDB restoration are **not** fully supported by the current host-side restore path. Sites using them may need login again.
- User-permitted high-impact actions (financial transfers, posting and deletion) remain separately gated by existing browser policies. Vault access is not authorization for arbitrary side effects.

## Known follow-ups before production

- Browser Watch human-click code should be extended with a robust login-mode navigation overlay and full keyboard control; this initial dedicated secret-entry UI depends on the user focusing the correct field.
- Add account-wide vault management outside a running Project task, revocation that propagates across distributed workers, durable concurrency leases, auth failure detection, automatic rotation of refreshed session state (without overriding revoked grants), and key rotation.
- Session scope must be verified against login flows using redirecting OAuth/SSO, IndexedDB, and cookies on multiple hosts.
- Run tests for owner isolation, cross-project reuse, background permission opt-in/out, deletion/revocation races, stale state, process crash, sensitive screenshot masking and logging, and malformed key/envelope handling.
