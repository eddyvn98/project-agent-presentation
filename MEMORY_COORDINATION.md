# Existing memory coordination

The app keeps all memory stores separate and does not add a new database.

1. Current user instructions, Project instructions and exact verified Project files take priority.
2. Same conversation: recent completed turns (last eight), bounded paged scan, excluding /compact markers.
3. Other Project Agent tasks: relevance ranked, now excluding the active chat to avoid duplicate turns.
4. Linked Project chats, authenticated private default memory, opt-in Hindsight and opt-in XERJ keep their own scopes and retrieval policies.
5. Encrypted personal memory, skills and runbook remain in existing pipelines. Runtime action receipts, checkpoints and archived tool outputs remain operational evidence, not new long-term facts.

The read-side coordinator lib/project-agent/memory-coordination.ts caps historical source budgets separately for classic Dify and sandbox runtime. It does not change any source deletion, permissions, enablement or retention.

Runtime still compacts intra-task at its configured token threshold; ordinary Dify still supports automatic and /compact transitions. Same-chat recap augments both routes on new turns.

Remaining work: 500+ turn browser performance QA and list virtualization, persisted shared checkpoints for multi-replica hosts, and end-to-end lost-context recovery in a deployed environment.