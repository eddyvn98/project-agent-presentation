# G2 — browser ownership, two-process recovery and host QA

**STATUS: G2 OPEN; ownership, takeover, Stop and Mongo recovery
subgates passed in isolated host QA (operator-reported 2026-10-25).
The two-Next.js worker crash -> quarantine -> reviewed browser
recovery E2E has NOT been executed or accepted.**
G1 single-worker/mock model/synthetic DOM remains accepted separately.
The Presentation source-authored environment did not run the private
AI-WEB-CHAT host tests; results below are local-operator evidence.

## Root cause and implemented mitigation

P7 protects the **task** with Mongo queue claims and token-fenced tools.
P8 Watch, human control, browser references and Chromium contexts remain
in OS-process RAM. A process-global map spans route bundles *within one*
Next worker, never two OS processes. Task lease success alone cannot grant
access to another process's live Chromium context.

The new `projectAgentBrowserOwnership` Mongo collection has one
record per task. `g2-lease-core.mjs` is shared by the host runtime and
two-OS-worker QA script: CAS claim with worker ID, lease token, epoch,
revision, 120-second deadline; heartbeat renewal; agent/human state CAS;
Stop revocation; expiry quarantine; explicit reviewed new-epoch claim.

The session runtime binds a claimed token when opening Chromium, validates
it before operations, and closes the local context on heartbeat loss.
**Root-cause fix following host E2E:** `withBrowserOp(session, fn,
countAgentAction, ownershipMode)` uses two independent parameters;
`countAgentAction=false` no longer implies human ownership.
The P7/P8 synthetic setup uses the default `agent` lease without
incrementing the counter. Takeover/manual and personal-auth browser
operations pass `"human"` explicitly. An inferred human lease previously
closed the synthetic Chromium session during setup; host corrected it
before the successful closeout. Source regression
`tests/agent/g2-browser-op-mode.test.ts` checks this behavior.
The manual takeover/handback path changes Mongo state and revision, not
only RAM. Existing P7 Stop now revokes G2 ownership when the feature is
enabled. The G2 owner does not auto-handback after the old RAM timer:
an unacknowledged handback fails closed. G2 is **off by default** and
allowed only with `NODE_ENV=development|test`, `G2_ISOLATED_QA=1`,
`PROJECT_AGENT_RUNTIME=sandbox`, synthetic task ID and owner email.

**Important:** a crashed Chromium page is NOT serializable. Expiry puts
the record in `quarantined`; worker B cannot use old tokens or
automatically replay an interrupted click. QA's explicit
`acknowledgeBrowserRecovery(..., true)` makes a new epoch available
for a **fresh browser** after review; it does not restore the old page,
approve side effects or restart a quarantined durable task.
No production recovery endpoint was enabled by this change.

## Tests in this branch

| Command | Scope | Exit meaning |
| --- | --- | --- |
| `npm run test:g2:unit` | Four Node in-memory atomic-Mongo contract tests: claim race, revision/takeover, remote Stop, crash/quarantine/review | Operator reported 4/4 PASS |
| `npm run test:g2:multiworker:db` | Five scenarios using **two real Node child processes**, same **real** isolated Mongo; action event ledger | Operator reported 5/5 PASS; not Next/Chromium crash E2E |
| `npm run test:host:g2` | Two **separate Next.js QA server processes**, same Project/DB; Chromium ownership, owner-only manual takeover and remote Stop | Operator reported 1/1 PASS; not worker-crash recovery |
| `npm run test:p7:multiworker:unit` | P7 task lease and Stop regression | Task ledger, not browser |
| `npm run test:p8:unit`, `npm run test:g1:unit` | P8/G1 backward compatibility | Not a G2 E2E substitute |

### Integrated QA evidence and limitations

On AI-WEB-CHAT Next.js **14.2.16**, local agent used a private QA
worktree based on host HEAD **`1e2f5c4a`** and Presentation source
**`ba89dfdd`**. This host SHA is a **base commit**, not a reported
G2 integration/push SHA; do not invent one.

- G2 deterministic 4/4 PASS; two Node/Mongo worker 5/5 PASS;
  two Next.js+Chromium worker `test:host:g2` 1/1 PASS after
  fixing inferred ownershipMode.
- Two-Next proof: duplicate owner rejected, nonmember Watch denied,
  Agent click, takeover/manual/handback, remote Stop fenced subsequent
  actions, QA cleanup returned HTTP 200.
- Regression P7 **40/40**, P8 **40/40**, P8 QA **8/8**, G1 **8/8**
  PASS; integrated TypeScript and `git diff --check` PASS.
  Ported file limit <=299 (reported maximum **276**).
- All synthetic Projects/tasks, two Mongo run DBs, PostgreSQL run DB,
  auth storage states and QA env files were cleaned; both Next servers
  stopped, ports 3005/3006 freed.
- No real provider, real external mutation, multi-host SIGKILL/recovery,
  Chromium-tab migration or machine-wide network audit was tested.
  The source changes **after** this local host run need a focused
  regression rerun before any new host acceptance claim.

Source G1 test correction in this branch: the public task API strips
`task.log`. `tests/host-browser/g1-goal-runtime.api.spec.ts` now
parses the public `G1_VERIFIED_RECEIPT` and asserts numeric
`p8Verified > 0`, without exposing private logs or modifying G1 guards.

## Exact integration manifest

Port only these deltas into the isolated AI-WEB-CHAT host, retaining the
host's own Mongo adapter, auth code and Next.js 14.2.16 configuration:

- New `lib/project-agent/runtime/browser-agent/g2-lease-core.mjs`,
  `g2-lease-core.d.mts`, `g2-ownership.ts`.
- Changed `lib/project-agent/runtime/browser-agent/session.ts`,
  `control.ts`, `manual.ts`, `personal-auth.ts` and
  `lib/project-agent/task-stop.ts`.
- New `tests/node/g2-browser-lease.test.mjs`,
  `scripts/g2-multiworker-browser-worker.mjs`,
  `scripts/g2-multiworker-browser-qa.mjs`.
- New `tests/host-browser/g2-two-next.api.spec.ts`,
  `scripts/g2-host-preflight.mjs`, `scripts/g2-host-origins.mjs`,
  `tests/node/g2-host-origins.test.mjs` and focused ownership-mode test
  `tests/agent/g2-browser-op-mode.test.ts`. QA scripts are opt-in.
- G1 test parity correction in
  `tests/host-browser/g1-goal-runtime.api.spec.ts`.
- This handoff and `P8_STATUS.md`/`P8_ROADMAP.md` are documentation.

The G2 feature flag must be **OFF** in regular/production host
environments. Do not assume the old P8 process-local session registry
is globally shared: the new DB record coordinates *ownership only*,
not pixel frames, user cookies, Playwright references or live tabs.

## New host-level crash/recovery acceptance (NOT RUN)

The missing host failure injection is now implemented separately as
`npm run test:host:g2:crash` (interactive Node orchestrator).
It uses TWO marked independent QA Next checkouts and `.next` dirs,
records owned launcher/runtime process PIDs, performs a verified
synthetic click, SIGKILLs Next owner A, then uses a protected
owner-only QA route on B to expire/quarantine **that exact** task's
lease. Before and after review, B must deny automatic claim; after
a real post-crash operator TTY acknowledgement and review ticket, B
opens a fresh Chromium session in the next epoch.

A QA-only Mongo ledger records synthetic verified-click receipts:
one after A's click, still one after quarantine and B's fresh setup,
two only after a deliberate B click. Refs now use disjoint
lease-epoch numbering, and the stale A ref is passed through the
real browser runtime and rejected without changing DOM.
`test:g2:crash:unit` covers distinct marked checkouts and refs.
No Dify/Entra provider, external website, CI or production behavior
is involved. This source is **UNTESTED on actual two-Next host**.
See [G2_CRASH_RECOVERY_QA.md](G2_CRASH_RECOVERY_QA.md)
for full opt-in variables, operator approval and bounded cleanup.

## Isolated Mongo/Node proof

Requires existing disposable Mongo **only** at `127.0.0.1:27019`
and the host-installed Node `mongodb` driver. The harness refuses all
other Mongo addresses, creates a random fresh
`g2_multiworker_qa_<12 hex>` database and run marker, forks two
real child processes and drops only that verified database in finally.
No real Dify, Entra, browser websites or outside network calls.

```bash
npm run test:g2:unit
node --test tests/node/g2-host-origins.test.mjs
npx vitest run --config vitest.agent.config.ts tests/agent/g2-browser-op-mode.test.ts
npm run test:p7:multiworker:unit
npm run test:p7:terminal
npm run test:p8:unit
npm run test:g1:unit
npx tsc --noEmit
git diff --check

export G2_ISOLATED_QA=1
export G2_MULTIWORKER_MONGO_QA=1
export G2_MW_MONGO_URI=mongodb://127.0.0.1:27019/
npm run test:g2:multiworker:db
```

Expected real Mongo outcomes: one winner/one action; failed remote
claim while owner has human control; Stop blocks old/new action; crash
expiry quarantines without replay, then reviewed fresh epoch permits
one **new** synthetic action. A separate crash **after** a recorded
synthetic effect must remain quarantined with its original action count
of one, with no automatic second action. Confirm actual child PIDs differ and
isolated QA run database is removed.

## Two genuine Next.js workers: host-specific gate

Port G2 source/runtime and tests into **two separate disposable
AI-WEB-CHAT QA checkouts/worktrees** (each with its **own .next/build
directory**), rebasing against current host code instead of overwriting
Mongo/auth adapters. Sharing one checkout/`.next` between concurrent
Next dev servers causes build-cache interference and invalid evidence.
Run independent Next.js 14.2.16 processes at ports 3005/3006 with
one shared dedicated QA Mongo/PostgreSQL/Project and synthetic
NextAuth owner/nonmember. Verify distinct Node OS PIDs in the process
list; `pid` inside fixture is Node's `process.pid`, not Chromium PID.
Do not use production Entra, Dify, real profiles, or a normal dev
host. Host code is NOT independently available to this repository.

In both hosts (different `P8_QA_ALLOWED_ORIGIN` for each):

```bash
PROJECT_AGENT_RUNTIME=sandbox
PROJECT_AGENT_BROWSER_AGENT=1
PROJECT_AGENT_DURABLE_QUEUE=0
PROJECT_AGENT_P7_QA_FIXTURE=1
PROJECT_AGENT_P7_QA_PROJECT_ID=YOUR_SYNTHETIC_QA_PROJECT_ID
PROJECT_AGENT_P8_QA_SESSION=1
PROJECT_AGENT_P8_LOOP=1
PROJECT_AGENT_P8_LOOP_REPORT_ONLY=0
P8_QA_ISOLATED_HOST=1
G2_ISOLATED_QA=1
PROJECT_AGENT_G2_BROWSER_OWNERSHIP=1
# Host A: P8_QA_ALLOWED_ORIGIN=http://localhost:3005
# Host B: P8_QA_ALLOWED_ORIGIN=http://localhost:3006
```

In an isolated QA terminal, supply these additional variables plus
the existing P8 owner/nonmember storage-state paths:

```bash
P7_ISOLATED_QA=1
P7_HOST_BASE_URL=http://localhost:3005
G2_QA_OTHER_ORIGIN=http://localhost:3006
P8_QA_ALLOWED_ORIGIN=http://localhost:3005
P8_QA_ISOLATED_HOST=1
P8_QA_ALLOW_CLOSEOUT=1
P8_QA_EXPECT_REPORT_ONLY=0
P7_PROJECT_ID=YOUR_SYNTHETIC_QA_PROJECT_ID
G2_ISOLATED_QA=1
PROJECT_AGENT_G2_BROWSER_OWNERSHIP=1
PROJECT_AGENT_P8_QA_SESSION=1
PROJECT_AGENT_P8_LOOP=1
PROJECT_AGENT_RUNTIME=sandbox
PROJECT_AGENT_BROWSER_AGENT=1
PROJECT_AGENT_DURABLE_QUEUE=0
G2_QA_ALLOW_CLOSEOUT=1
```

**Origin requirement:** Next 14 in the local host canonicalized
`req.nextUrl.origin` to `http://localhost:<port>` even when bound
to `127.0.0.1`. Prefer the exact `localhost` origins above for
the entire QA run (server route origin, HTTP Origin header, NextAuth
state verification, Playwright baseURL and P8_QA_ALLOWED_ORIGIN).
The new preflight also accepts a consistent `127.0.0.1` pair
on 3005/3006; never mix these hostnames or relax Origin/CSRF checks.
`node --test tests/node/g2-host-origins.test.mjs` covers the rule
(4/4 PASS in the source-authoring Node sandbox with matching Git blobs).

Run `npm run test:host:g2`. Preflight validates authentic synthetic
sessions at BOTH origins; test opens the same synthetic task on host A,
proves B cannot claim another browser or hijack human control, executes
A's browser click/manual takeover/handback/resume, and invokes Stop on B.
Host A then must reject further browser mutations. This test does NOT
kill a Next.js process or recover a live tab after crash. Port/adapt
strictly to the host's NextAuth and task API behavior.

### Required **additional** local-agent acceptance (not yet automated)

1. With two genuine Next processes and shared task queue enabled, run
   real task-lease competition and deterministic mock SSE model
   continuation. Exactly one worker may dispatch an action. Stop on B
   must fence a paused A before its next tool dispatch and terminal CAS.
2. Kill the browser-owning Next worker at a controlled point. B must
   deny automatic browser/session reuse and model replay, and the task
   lease must transition to `needs_review` upon expiry. Fast-forward
   expiry **only** for the isolated manifest's Mongo record.
3. With explicit synthetic owner review, establish a **fresh task and
   browser session** on B. Confirm higher epoch, stale A token fenced,
   changed/stale DOM refs rejected, no duplicate action receipts, and
   that the old Chromium window is **not** presented as recovered.
4. Test concurrent owner takeover, owner/nonmember access, remote
   Stop while human-paused, heartbeat loss/Mongo errors, crash cleanup,
   redacted Browser Watch and rollback to P8 with the G2 flag OFF.
   Cover race between lease check and already-dispatched side effects;
   no exactly-once guarantee can be inferred from a pre-action fence.
5. Record host+source SHAs, distinct OS PIDs, Mongo collection/epoch
   transitions, exact PASS/FAIL/SKIP, task status and receipts, network
   scope and cleanup. Delete only synthetic Project/run DB/auth files.

**Prior host pass covers ownership/takeover/Stop only.**
The remaining blocker is a real Next browser-owning worker **SIGKILL**,
lease expiry -> quarantine in shared Mongo, B denied pre-review,
owner-reviewed fresh session on B, stale owner/ref fencing, and zero
duplicate actions across both host processes. Record exact SHA/commands,
cleanup and an independently verified result.

**G2 stays OPEN until these host/runtime and failure-injection
requirements pass.** A two-Node/Mongo CAS smoke by itself or two Next
servers without crash recovery is insufficient. G3/G4 remain OPEN.
No CI, PR/merge, staging or production deploy is authorized.
