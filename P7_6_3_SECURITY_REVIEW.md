# P7.6.3 — focused local security review (2026-10-25)

**Status: source hardening and regressions implemented; host QA pending.**
This is **not** a penetration test, production approval or real-user security
certification. No real Entra/Dify API or external website is contacted.

## Findings and changes

| Area | Source evidence / change | Residual gate |
| --- | --- | --- |
| SSRF | `runtime/web-security.ts` checks resolved addresses and refuses loopback, metadata, private and non-HTTP URLs; now also rejects embedded URL credentials | DNS rebinding / address pinning, redirects, proxies, nested browser resource loads, IPv4/IPv6 variants |
| Authorization | `tasks/[taskId]/browser/route.ts` checks the Project and task owner; `p7-qa/route.ts` requires owner permission, synthetic project and exact Origin | Host API integration: nonmember, mismatched task, expired sessions and cross-origin mutations |
| QA production guard | `p7-qa-guard.ts` now requires explicit `NODE_ENV=development/test`, flags, loopback HTTP, Project prefix and exact browser/pdf fixture prompt | Production build smoke proving POST/PATCH/DELETE/GET denied even if QA flags are accidentally enabled |
| Secrets / frames | Screenshot masks cover sensitive inputs; Browser Watch history is RAM-only, opt-in and purged on Watch-off; Watch/traffic URL display now hides paths, queries and fragments | Browser session cookies/vault grants, screenshots of sensitive non-input page text, retention and destruction review |
| Console / network logs | Untrusted browser console message text is replaced by severity-only message; network diagnostics store origin, not path or URL query | End-to-end redaction of other runtime logs, headers, stack traces, Dify prompts and downloadable evidence |
| Browser audit | `browser-security-policy.ts` hashes high-impact labels and writes 30-day TTL records; production audit failures now throw (fail closed) | DB failure integration, audit ACL, retention deployment policy and security monitoring |
| Terminal write / Stop | `task-terminal-guard.ts` conditionally writes to host collection `project_agent_tasks` and refuses stale `done` after Stop; queue Stop revokes Mongo lease | Integrated host typing, two-worker runtime with bounded loopback mock and proof that all tool sites honor the fence |

## Focused code and regression changes

- `tests/agent/p7-terminal-write-stop-race.test.ts`: Stop-first,
  completion-first, lease loss, owner mismatch, aborted error and queued
  failure are checked against a CAS-capable Mongo fake.
- `tests/agent/p7-security-review.test.ts`: credential URL, mixed DNS,
  metadata/loopback addresses, QA owner/Origin/production flags, Watch
  URL/console redaction and audit failures.
- `tests/agent/p7-qa-safety.test.ts`: rejects unknown NODE_ENV and
  forged synthetic task markers.
- `tests/agent/p7-qa-stop-cleanup.test.ts`: Stop calls guarded terminal
  update, records its receipt, revokes durable lease and does not close
  unrelated employee browsers.

Run **without remote services** on the local AI-WEB-CHAT QA clone:

```bash
npm run test:p7:terminal
npm run test:p7:security
npm run test:p7:multiworker:unit
npx tsc --noEmit
npm run check:lines
git diff --check
```

Host code may require adapting the Mongo `StringDoc` type to the
string `_id` before it compiles; do not bypass CAS or convert IDs.
The true host-owned repository is `services/mongodb/projectAgentTasks.repo.ts`
(`project_agent_tasks`). Report the **exact integrated worktree SHA**
and whether local modifications remain uncommitted.

## Mandatory later host security gates

1. **SSRF:** local stub DNS/redirect harness with redirects to loopback,
   link-local, metadata IP and DNS-rebinding variants. No real private
   destination must receive a request.
2. **Authz:** owner, nonmember, expired session and cross-origin requests
   across preview JPEG, takeover, task, files, audit and QA mutation routes.
3. **Secrets:** inject synthetic tokens in URL path/query, page console,
   form input, request failure and generated artifacts; prove none leave
   server logs, response text, screenshots or streaming tool traces.
4. **Audit:** DB read/write failure must deny high-impact browser action in
   production mode. Verify TTL/index and per-owner audit access.
5. **Production guard:** with QA fixture flags set in a production-mode
   test build, synthetic QA endpoints must return access denied for all
   methods. Do not enable fixture mode on a running production instance.
6. **Stop/recovery:** explicitly test old worker finalization after Stop on
   the integrated host, including two workers and durable Mongo queue.

**Remaining caveat:** A prior lease check is not a transaction around an
already dispatched irreversible external action. Commit-based fencing
prevents stale terminal result publication; it cannot undo an action sent
before Stop. External mutations must retain explicit confirmation and
idempotency receipts. Entra and real Dify are not exercised by P7.6.3.

No CI, no staging and no merge into `main`/`staging`.
