# XERJ Project Search Adapter (2026-10-24)

Source: https://github.com/xerj-org/xerj (Apache-2.0). This is an original REST integration, not vendored XERJ code. The repo already has MongoDB Project data, BM25/vector knowledge search, Hindsight memory and Context Manager; XERJ is an opt-in supplemental search engine, not a new default database.

## What this branch implements

- Read-only host adapter using documented XERJ Elasticsearch-compatible endpoints:
  GET /{project-prefix}-*/_search?q=...&size=N and GET /{concrete-index}/_doc/{id}.
- Two bounded sandbox actions:
  {"action":"xerj_search","query":"symbol or topic","count":5} (count 1–6)
  and {"action":"xerj_read","index":"pa-<hash>-code","id":"returned-id"}.
  Reading index must match the current Project's derived prefix; the model cannot choose a search index.
- Ordinary Dify cannot invoke app-hosted runtime tools directly. For code, repository, log and indexed-Project-document questions, the app conditionally prefetches up to four hits into the Dify prompt, before the user's current request, as untrusted reference data. If XERJ is disabled, empty, stale, or down, existing Project knowledge and tools stay available.
- The action dispatcher checks Project membership at execution time, not only when the task starts.
- Results provide source excerpts with file:line where XERJ returns it. A search hit is not a freshly inspected file or a public citation. Read current originals for exact or current claims.
- No indexing or third-party feedback is initiated automatically. No MCP daemon is installed, no new npm dependency, no Dify workflow is changed.

## Required operator setup

XERJ must be separately installed with persistent storage and reachable from the Next.js application host, not merely from a model sandbox. Do not use the project's one-line developer command with --insecure on a shared host. Keep server authentication enabled and create an XERJ API key with read access limited to the selected Project's indexes (or use a tightly protected host-only connection during provisioning).

Configure the Next.js server environment:

    PROJECT_AGENT_XERJ_ENABLED=1
    PROJECT_AGENT_XERJ_URL=http://127.0.0.1:9200
    PROJECT_AGENT_XERJ_API_KEY=<read-only scoped XERJ API key>
    PROJECT_AGENT_XERJ_INDEX_SALT=<stable random secret of at least 16 characters>

For XERJ in a separate Docker service, set PROJECT_AGENT_XERJ_URL=http://xerj:9200 and explicitly enable PROJECT_AGENT_XERJ_ALLOW_REMOTE=1 plus PROJECT_AGENT_XERJ_ALLOW_HTTP=1 on a secured private network. For HTTPS remote XERJ, use ALLOW_REMOTE=1. Never expose the XERJ service or API key to the browser. An unprotected loopback node is supported only if PROJECT_AGENT_XERJ_ALLOW_INSECURE_LOCAL=1 is set deliberately for single-user development.

For each Project you explicitly choose to index, stage only source files that Project members may read on a host-visible directory. Exclude secrets, .env, customer records, and any sources that should not be retained in the separate index.

Run on the host with the same PROJECT_AGENT_XERJ_INDEX_SALT as the Next.js app:

    PROJECT_ID="<the-Project-URL-id>"
    PREFIX="$(node scripts/xerj-project-prefix.mjs "$PROJECT_ID")"
    export XERJ_API_KEY="<XERJ index-writer credential>"
    xerj autoindex --prefix "$PREFIX" /absolute/path/to/authorized/project-corpus

XERJ autoindex creates separate indexes such as pa-<hash>-code and pa-<hash>-txtprose. The app searches only pa-<hash>-*, where <hash> is SHA-256 of stable salt + Project ID. The index does not appear by merely enabling the adapter. Verify autoindex results and XERJ's generated field map separately. To pick up edits, run the incremental autoindex process on the staged corpus.

For code intelligence, index an authorized source checkout. For reports/Project knowledge, index an authorized export/copy; the adapter does not silently export MongoDB, shared Project files or chat history.

## Privacy, security and operations

- Every Project receives a derived, private prefix. The application sends only searches and bounded excerpts to the configured XERJ host. It never accepts arbitrary index patterns from the model, and never uses XERJ's field-report / Corpus Hub upload methods.
- The API key is server-only. Authentication is mandatory by default; redirects are forbidden, response capture is capped at 256 KiB and transport times out after five seconds. Returned source data is secret-redacted and HTML-escaped before entering the model prompt.
- The adapter is read-only. Project deletion, chat deletion, changes to Project sharing and source removal do NOT automatically erase separately managed XERJ indexes. Operators must re-index after source changes and delete Project-owned indexes and backups when revoking access or deleting the Project. Until full indexing lifecycle integration is built and verified, do not index regulated or highly confidential data into XERJ.
- An indexed copy may be stale or incomplete. XERJ's default offline lexical embedder does not guarantee neural semantic retrieval; this adapter uses the documented q full-text search and does not silently enable external rerankers.
- Changing PROJECT_AGENT_XERJ_INDEX_SALT makes previously indexed prefixes unreachable from the app and complicates cleanup. Store it durably.

## Pending QA (per user's instruction, no test/CI in this turn)

Added tests/agent/xerj-search.test.ts and tests/agent/xerj-runtime.test.ts: opt-in, isolation, auth/remote guards, bounded responses, data escaping, read enforcement, runtime authorization and model action parsing.

Before enabling in a real deployment: run focused tests, host typecheck, app build, signed-in Dify and sandbox browser cases, large/empty index responses, timeout/cancellation, Project permission changes, source freshness and Project deletion index-cleanup procedure. Compare relevant-hit quality and token usage against existing BM25/vector search. Neither real XERJ service nor Project Agent deployment has been started in this pass.
