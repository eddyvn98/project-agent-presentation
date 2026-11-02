# AI-WEB-CHAT source sync — 2026-11-02

This branch is based on `eddyvn98/project-agent-presentation`'s `gpt/full-project-agent` at `4217bade`. It selectively syncs reviewed Project Agent changes from `ONGONGDT/AI-WEB-CHAT` branch `codex/project-agent-sync-20261029` at `41eb9170`.

The source branch was committed and pushed without changing `origin/staging` or the dirty Docs Lab checkout. This sync preserves GPT-specific implementations where both branches changed the same code; only clean three-way merges and reviewed source additions are included. In particular, the split repo's Composer and Dify auto-skill/context implementations remain intact.

The sync includes runtime query trimming behind its feature flag, optional same-conversation serialization with lease fencing, selected workflow and queue fixes, current Project Browser preview behavior, and related focused tests. Runtime changes remain opt-in where guarded by environment flags.

This is a source handoff for GPT Web review, not deployment or host acceptance. No test suite was run for this sync; validate it in the host checkout before relying on runtime behavior.
