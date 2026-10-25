# G2 crash/recovery closeout — two real Next workers (OPEN)

**Implementation available, acceptance NOT RUN. Do not close G2 until
the local AI-WEB-CHAT host run reports actual PASS.** No real Dify,
Entra, external websites, model calls, production DB or CI.

## Root evidence gap this suite closes

`test:host:g2` proves two Next workers, ownership/takeover/Stop but
never kills a Next worker. `test:g2:multiworker:db` kills an isolated
Node child with Mongo but has `chromium:false`, `nextWorkers:false`.
Neither is evidence of Chromium crash/recovery. This harness adds
`test:host:g2:crash`, a **standalone interactive Node script**, not
a Playwright test, which starts and owns both real Next process groups.

The tester uses a synthetic P8 task through the authenticated host
routes. Its separate, G2-only fixture routes are disabled by default,
require owner rights, exact Project/task marker, localhost Origin,
`NODE_ENV=development|test`, QA-only flags and a 12-hex run ID.
Only a killed-worker lease row in the isolated DB may be forced expired.
The script **waits for a human/operator TTY confirmation after
quarantine** and submits a separate 24-hex review ticket for the
reviewed recovery CAS. The review operation never replays old actions.

G2 snapshot ref IDs now begin in a disjoint million-ref range for
each Mongo lease epoch. An old `e...` ref cannot accidentally match
the fresh Chromium snapshot. A G2-only Mongo action ledger
(`projectAgentG2CrashQaActions`) records verified **synthetic DOM
clicks** by task/run/epoch/counter, never user cookies, screenshots
or browsing history. The action count must remain one during
crash/quarantine/review/new-session setup, then become exactly two
only after an explicit new Agent click.

## Mandatory isolated host setup

Create TWO clean **independent** disposable AI-WEB-CHAT checkouts
(`G2_QA_CHECKOUT_A`/`G2_QA_CHECKOUT_B`), **distinct `.next`
directories**, Next.js 14.2.16 with locally installed dependencies.
Use a shared **fresh synthetic** Mongo/PostgreSQL QA project,
DB and owner/nonmember synthetic NextAuth sessions. Neither checkout
may be the primary checkout or `main`/`staging`. Install/port the
Presentation files at the SHA reported with this document into both
QA checkouts and run focused tests/typecheck **before** acceptance.
Do not start servers manually: the harness owns 3005/3006 and refuses
occupied ports, unexpected directories or shared `.next`.

Assign a unique 12-hex `G2_QA_RUN_ID`, a **separately chosen**
24-hex `G2_QA_REVIEW_TICKET`, plus an existing isolated synthetic
`P7_PROJECT_ID`. Put a file named `.g2-crash-qa.json` in
**each** QA checkout (never commit this marker):

```json
{"purpose":"g2-isolated-crash","runId":"REPLACE_WITH_12_HEX","projectId":"REPLACE_WITH_SYNTHETIC_PROJECT_ID","allowStart":true}
```

These markers authorize the script to start and later kill **only
process groups it itself spawned**. The harness verifies exact marker
content and distinct real checkout/build directories. It cannot inspect
whether arbitrary host-specific DB environment variables point to
real databases; the operator must separately verify fresh run DB names
and destructive cleanup manifest **before opt-in**. No global DB drop
is performed by the harness.

Set the following in the QA terminal, with host DB and auth environment
variables configured ONLY for the isolated test DB. Use `localhost`
consistently because Next 14 may canonicalize `req.nextUrl.origin`:

```bash
export G2_QA_CHECKOUT_A=/absolute/private/g2-qa-a
export G2_QA_CHECKOUT_B=/absolute/private/g2-qa-b
export G2_QA_RUN_ID=YOUR_12_HEX_RUN_ID
export G2_QA_REVIEW_TICKET=YOUR_24_HEX_OPERATOR_TICKET
export G2_QA_DB_ISOLATION_ATTESTED=1
export P7_PROJECT_ID=YOUR_SYNTHETIC_PROJECT_ID
export PROJECT_AGENT_P7_QA_PROJECT_ID=$P7_PROJECT_ID
export P7_HOST_BASE_URL=http://localhost:3005
export G2_QA_OTHER_ORIGIN=http://localhost:3006
export P8_QA_ALLOWED_ORIGIN=http://localhost:3005
export P7_OWNER_STORAGE_STATE=/absolute/private/owner.json
export P7_NONMEMBER_STORAGE_STATE=/absolute/private/nonmember.json
export P7_OWNER_EMAIL=owner@project-agent.test
export P7_OTHER_EMAIL=nonmember@project-agent.test
export P7_ISOLATED_QA=1
export P8_QA_ISOLATED_HOST=1
export P8_QA_ALLOW_CLOSEOUT=1
export P8_QA_EXPECT_REPORT_ONLY=0
export G2_ISOLATED_QA=1
export G2_QA_CRASH_RECOVERY=1
export G2_QA_ALLOW_CRASH=1
export PROJECT_AGENT_RUNTIME=sandbox
export PROJECT_AGENT_DURABLE_QUEUE=0
export PROJECT_AGENT_BROWSER_AGENT=1
export PROJECT_AGENT_P7_QA_FIXTURE=1
export PROJECT_AGENT_P8_QA_SESSION=1
export PROJECT_AGENT_P8_LOOP=1
export PROJECT_AGENT_P8_LOOP_REPORT_ONLY=0
export PROJECT_AGENT_G2_BROWSER_OWNERSHIP=1
```

All secrets, credentials, Mongo/Postgres URIs and review tickets
must remain local. The host server inherits these QA settings,
but receives synthetic placeholder Dify endpoints/tokens, uploads
disabled and telemetry disabled. Fixture page uses in-memory
`about:blank`, CSP and a blocking request route. A
`networkAttempts=0` result measures only the fixture counter, not
machine-wide egress. **No third-party actions are permitted.**

## Commands and acceptance assertions

```bash
npm run test:g2:crash:unit
npm run test:g2:origin
npm run test:g2:mode:unit
npm run test:g2:unit
npx tsc --noEmit
git diff --check
npm run test:host:g2:crash
```

The last command **requires a real interactive TTY**. After host A
has been SIGKILLed and its Mongo lease quarantined, it prints an
exact confirmation such as `REVIEW pat_123456789abc 1 1`.
The operator inspects the synthetic task/receipt evidence and types
that exact string; a blank/wrong answer or non-TTY **fails closed**.
Do not fabricate an approval or run this script in unattended CI.

1. Assert occupied ports absent; launch two marked Next worktrees
   (separate `.next`) and record launcher PIDs, authenticated owner/
   nonmember NextAuth at BOTH origins.
2. Create P8 synthetic task; owner A opens Chromium and performs one
   verified click. Record Node runtime PID (not Chromium PID), epoch 1,
   old DOM ref and one persisted QA receipt. Verify runtime PID belongs
   to the harness-owned process group.
3. Verify B cannot claim while A lives. Kill A's owned process group
   with SIGKILL and verify child exit; B sees old lease, not a browser.
   B still cannot claim.
4. **Only after actual kill**, B's QA-only route CAS-expires the exact
   killed worker's synthetic lease, quarantines it and denies B claim.
   Missing/wrong operator review ticket is rejected.
5. With post-crash operator confirmation, mark `vacant` by reviewed
   CAS; B opens a **fresh** Chromium session under epoch 2.
   The old page was **not restored**. B verifies old DOM ref rejection
   through the real browser action path; counter remains 0 and the
   original QA action receipt count remains exactly 1.
6. An explicit fresh B click increments counter to 1, and QA ledger
   has exactly two verified receipts in epochs 1 and 2, never replay.
7. Cleanup closes B Chromium, deletes only the exact marked task's
   G2 lease/QA receipts and synthetic Project task, checks HTTP 200,
   stops only launched Next groups, and releases ports. Operator
   separately removes **only** manifest-owned run DB(s), synthetic
   Project/auth files, markers and disposable checkouts.

If any preflight, test assertion, operator review or cleanup fails,
report FAIL (or BLOCKED for missing environment), **not PASS**.
Record exact Presentation/host SHAs, the independent Next process
PIDs, two lease epochs, action ledger counts, old-ref rejection,
console PASS/FAIL/SKIP, synthetic DB cleanup and limitations.
Do not infer transactional exactly-once behavior for external sites.

**G2 remains OPEN pending that real host execution. G3/G4 OPEN.**
