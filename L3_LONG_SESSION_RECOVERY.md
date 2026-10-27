# L3 recovery: real MongoDB and three worker processes

This opt-in QA uses a fresh isolated Mongo database on 127.0.0.1:27019.
It inserts 1,000 synthetic turns in one conversation, 180 unrelated turns, four model-compact markers, and a corrected design decision.

Covered: kill an OS worker after a committed effect; resume from another process; verify history and latest Dify conversation ID; quarantine expired browser ownership using the production G2 lease module; reject wrong-user/unreviewed handoff; avoid replay of the original effect; recover after Mongo client disconnect using a third process; and block a new claim after Stop.

Run: L3_ISOLATED_QA=1 L3_MONGO_URI=mongodb://127.0.0.1:27019 npm run test:l3:recovery

CI stores the output as l3-recovery-report. The worker action is an idempotent synthetic Mongo write, not an external side effect. The harness uses the production G2 browser lease core, but does not boot Next.js, call an LLM, or validate different server hosts.

Remaining acceptance gate: live two-Next restart and shared-host output/checkpoint storage. The current runtime context checkpoint is host-local. Migrating between machines without a shared volume cannot guarantee that it survives; do not report this part as passed.