# P7.6.2 — isolated two-worker lease/recovery acceptance

**Status: IMPLEMENTED / NOT YET EXECUTED AGAINST REAL QA MONGO.**
The preceding [P7.6.1 local mock E2E](P7_STATUS.md) **PASS** used a
single-process runner with `PROJECT_AGENT_DURABLE_QUEUE=0`. That result
does **not** prove cross-worker lease ownership or recovery.

## What is under test

1. **Two workers claim one queued task:** exactly one Mongo
   `findOneAndUpdate` token wins; exactly one synthetic action is recorded.
2. **Crash / expired lease / restart:** kill the winning OS process,
   fast-forward its lease deadline, quarantine as `needs_review`.
   A second worker must not reclaim or repeat the action.
3. **Remote Stop:** mark the synthetic task `failed/cancelled`,
   atomically revoke the durable queue lease, and prove the old and
   the replacement workers cannot perform their next fenced action.

The production `durable-mongo-queue.ts` now exports
`revokeDurableTaskLease`; `task-stop.ts` calls it for both local
and cross-process Stop when `PROJECT_AGENT_DURABLE_QUEUE !== "0"`.
The focused Vitest regression exercises the **actual queue/fence module**
using an atomic in-memory Mongo fake and two racing logical workers.

The process-level smoke test launches **two real Node child processes**
sharing a real MongoDB instance. It reproduces the production Mongo
claim, expiry and fencing filters using only synthetic DB documents:
it does **not** start Dify, execute the real Agent model, or prove
cross-process Next.js state serialization. It deliberately fast-forwards
lease expiry; do not infer 120-second heartbeat reliability from it.

## Safety and environment

Only run on the isolated QA machine after checking that
`127.0.0.1:27019` is the **disposable QA MongoDB instance**. The
test rejects all other server addresses and requires two explicit flags.
It generates a random, fresh `p7_multiworker_qa_<12 hex>` database,
writes one run marker and only drops **that** database after confirming
the run marker. Other QA databases and ports 3004/3005 are untouched.
The worker forces direct loopback Mongo connectivity. No external
Dify/Entra/API keys, browser profile, production data, or network calls.

```bash
git fetch origin gpt/full-project-agent
git switch gpt/full-project-agent
git pull --ff-only
npm run test:p7:multiworker:unit
npx tsc --noEmit
export P7_ISOLATED_QA=1
export P7_MULTIWORKER_MONGO_QA=1
export P7_MW_MONGO_URI=mongodb://127.0.0.1:27019/
npm run test:p7:multiworker:db
```

The DB smoke requires the host's installed `mongodb` Node driver.
Do **not** install a database, start/stop 3005, or create a production
worker to accommodate this experiment. Save the command output and
host Git SHA with PASS/FAIL evidence; no credentials should appear in
logs. If the DB is not available, mark the process-level test BLOCKED,
never SKIP-as-PASS.

## Exit criteria and remaining limitations

| Proof | Required |
| --- | --- |
| Atomic fake against source queue | Race, Stop revoke, expiry quarantine, cancelled queued task |
| Two actual Mongo/OS workers | Claim one/lose one, action count 1; Stop action count 0; crash replay count 0 |
| Tool lease fencing | Lost or revoked token cannot begin the next action |
| Durable Agent real integration | Two Next.js worker processes + mock loopback Dify and a shared isolated QA database; clean receipts, no action duplication |
| Service lifecycle | Heartbeat while busy, restart, stale worker final writes and repeated concurrent Stop |
| Production release | Entra, external Dify and staging are **out of scope** here |

**Important unresolved concurrency property:** Revoking the lease prevents
future lease-fenced tool calls; it cannot undo an external operation already
dispatched before Stop. A late model result must also be prevented from
overwriting terminal Stop with `done`. Full runtime acceptance needs a
conditional terminal write in the host task repository plus a real two-host
test with a controllable loopback tool. Do not claim production readiness
from the process-level Mongo filter test alone.

No CI and no merges to `main`/`staging`.
