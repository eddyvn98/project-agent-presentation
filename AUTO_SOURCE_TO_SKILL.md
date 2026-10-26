# Automatic Source-to-Skill (experimental)

This is an app-hosted adaptation of the *book-to-skill* workflow:
https://github.com/virgiliojr94/book-to-skill (MIT).
It is NOT a vendored copy of that Python extractor and does not claim feature parity.

## Product behavior

The existing Project knowledge upload UI is the only user interaction.
- On upload, the host reconciles eligible text knowledge into a durable conversion queue.
- The existing authorized scheduler tick processes pending entries.
- A generated reference becomes available on the next Project Agent chat turn.
- Skills are scoped to the Project owner and Project ID; no automatic public or cross-Project publishing.
- On source deletion, reconciliation revokes the corresponding skill.
- Source content and synthesized skill text are untrusted. They must not override higher-priority instructions.

No new end-user Skill management screen or explicit command is needed. A model invocation is
a background operation, not a user chat turn. This does not run autonomous jobs when the
scheduler is not active.

## Host configuration

- PROJECT_AGENT_AUTO_SKILLS=1 (disabled by default)
- PROJECT_AGENT_AUTO_SKILLS_DIR=/persistent/private/auto-skills (required in production)
- PROJECT_AGENT_RUNTIME_DIFY_API_URL=https://.../v1
- PROJECT_AGENT_RUNTIME_DIFY_API_KEY=...
- PROJECT_AGENT_SCHEDULER_SECRET and running scheduler worker (see existing scheduler docs)

Model app must support Dify blocking chat messages with a JSON-only answer.
If it does not, jobs fail and retry; they must not invent a skill.
The JSON schema is title, description, instructions, files.

The JSON registry uses local exclusive directory locks and atomic writes; it is appropriate
only for workers sharing the same persistent filesystem. Multiple hosts with independent
filesystems MUST NOT enable this feature without replacing the registry with a shared
transactional data store. Crashed workers are retried when their lease expires.

## Known limits / acceptance gates

- Existing text extraction is reused. This first increment only converts knowledge whose
  complete extracted text is available through readKnowledgeText. Large-source originals,
  scans without OCR, image-heavy books and binary ebook paths are not yet supported end to end.
- It reads up to 42,000 characters per conversion. It DOES NOT implement the original
  chapter-by-chapter deep extraction. Do not represent this as whole-book fidelity.
- A source edit that does not change size/upload metadata is not yet detected. An explicit
  source-version/content fingerprint and an edit-route hook are required.
- No independent source-grounding verification for generated claims yet; generated text must
  be treated as a hint, and source retrieval is authoritative.
- Production readiness is not claimed. Complete isolated host QA: upload, queue,
  synthetic model conversion, next-turn auto-use, source revocation, worker crash/restart,
  read authorization, Dify standard/runtime pathways, model failure, and cross-worker locking.
- Do not enable on shared/regulated projects without an authorization and injection review.
