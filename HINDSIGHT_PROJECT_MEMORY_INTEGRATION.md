# Hindsight long-term Project memory integration

Reference: [vectorize-io/hindsight](https://github.com/vectorize-io/hindsight) (MIT license), [REST API](https://hindsight.vectorize.io/api-reference), and [Dify plugin](https://github.com/vectorize-io/hindsight/tree/main/hindsight-integrations/dify).

This is an **original, app-hosted REST adapter** with no new Project Agent dependency or remote Dify workflow change. It complements existing MongoDB Project history, Project knowledge search, runbook, global lessons, Context Manager and sandbox checkpoints.

## Server configuration (default OFF)

| Variable | Value |
| --- | --- |
| PROJECT_AGENT_HINDSIGHT_ENABLED | Set to 1 to enable memory reads/writes |
| PROJECT_AGENT_HINDSIGHT_API_URL | Example http://localhost:8888; no /v1 suffix |
| PROJECT_AGENT_HINDSIGHT_API_KEY | Optional for local unprotected Hindsight; required by protected providers |
| PROJECT_AGENT_HINDSIGHT_BANK_SALT | Stable secret for opaque Project bank naming |
| PROJECT_AGENT_HINDSIGHT_REFLECT | Set to 1 to enable Reflect for explicit retrospective/learning queries |
| PROJECT_AGENT_HINDSIGHT_ALLOW_REMOTE | Set to 1 to authorize non-loopback Hindsight endpoints |
| PROJECT_AGENT_HINDSIGHT_ALLOW_HTTP | Set to 1 for non-loopback HTTP (private, secured networks only) |

For Docker-internal http://hindsight:8888, both ALLOW_REMOTE and ALLOW_HTTP must be 1. For Hindsight Cloud use HTTPS, its credential, and ALLOW_REMOTE=1; the application does not contact the Cloud automatically. Review privacy before enabling outbound processing for confidential Projects.

Hindsight requires a **separately deployed server, persistent storage, embedding/reranker setup and an LLM provider**. The existing Dify model subscription does not automatically provide these to Hindsight. This change does not provision services or credentials.

## Memory flow

1. After Project access is authorized, app-side Recall uses POST /v1/default/banks/{bank_id}/memories/recall, low budget, maximum 1,200 memory tokens, source tag filter. It injects at most eight escaped facts and 5,000 characters before the latest user request, labeled untrusted historical reference. Empty bank, 404 or service failure falls back to existing Project memory.
2. For explicitly historical learning/review requests only, opt-in Reflect calls POST /v1/default/banks/{bank_id}/reflect once, low budget, maximum 600 output tokens. Its synthesized answer is clearly labeled inference, not evidence of current truth.
3. After a successful completed task, synchronous Retain uses POST /v1/default/banks/{bank_id}/memories, with a stable document_id derived from task ID for idempotency. Only redacted, capped request/result excerpts are sent; **no** binary attachments, whole logs, failed or cancelled tasks are automatically retained. A failure of Hindsight does not undo the completed Project task.
4. Both normal Dify and sandbox runtime receive the same injected memory through the existing query builder. No Dify workflow/plugin edit is required; remote Dify tools themselves are not intercepted.

## Isolation and deletion

- Banks are deterministically hashed per Project on the server. Users/models cannot supply arbitrary bank IDs. Shared-Project collaborators are expected to see Project-scoped memory consistent with current Project access.
- Chat DELETE and cross-Project move first purge that user's associated task documents from the *old* Project memory bank. On failure, the API returns 503 before mutating the chat. Enumeration is bounded to 100 pages of 20 tasks; a dedicated Mongo conversation lookup is preferable for unusually long histories.
- Project DELETE purges the entire bank before removing the Project, failing closed on cleanup errors.
- No automatic migration of old Project memories to the destination Project when a conversation is moved. Its normal chat history remains available via existing mechanisms.
- Keep the Hindsight URL and credentials configured even when writes/recall are disabled, so deletion can still purge old data. Keep BANK_SALT stable, or previous banks will become inaccessible through derived IDs. Operator backup/delete requirements remain.
- After source documents change, older memory may be stale. Current authenticated Project files and user corrections should take precedence.

## Limits and acceptance

Recall timeout 6s, Reflect 9s, synchronous Retain 20s. Maximum request excerpt 1,500 chars, result excerpt 3,000 chars. Memory is not independent evidence. No UI for curating/correcting individual memories, no auto-knowledge-file retention and no cross-Project learning in this patch.

Focused regression source added under tests/agent/hindsight-memory.test.ts for opt-in, bank isolation, redaction, idempotency, retrieval, reflect, fallback and deletion. **Tests/build/CI/browser QA intentionally not run**. Real self-hosted Hindsight deployment, authenticated host, multi-user permissions, memory correction, source-provenance and performance still require QA before production enablement.
