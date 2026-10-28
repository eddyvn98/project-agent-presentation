# Steel live QA: two isolated Next.js workers and a real Steel session

**State: opt-in harness authored; actual signed-in host/Steel execution NOT RUN.**

This test uses the real Next Project Browser API, shared QA Mongo, two independently launched
Next processes and one Steel remote browser. It verifies that a blank tab created on worker A
is still present after SIGKILL of worker A, and that worker B can reattach and add another
blank tab only after a deliberate action. It also verifies nonmember denial and explicit
remote-browser cleanup.

It does **not** prove exactly-once external website writes, a production WebRTC viewer
gateway, or recovery of a remote click that completed but whose response was lost.

## Host requirements

Use two disposable AI-WEB-CHAT Next host worktrees with distinct .next directories,
one new isolated MongoDB and PostgreSQL QA database, a dedicated synthetic Project,
and owner/nonmember QA identities. Both host checkouts must contain the same
Presentation revision and locally installed Next.js dependencies. This Presentation
source repo is not itself the private AI-WEB-CHAT Next host.

Reuse the strict G2 crash-host preflight from G2_CRASH_RECOVERY_QA.md:
two .g2-crash-qa.json files with matching run marker, exact synthetic Project,
two isolated worktree paths, G2 QA opt-ins, two authenticated QA storageState
files, two loopback origins (localhost:3005 and localhost:3006), and the
explicit isolated database attestation. The existing G2 process launcher
will refuse unmarked worktrees, occupied ports or shared .next directories.

Add **server-side, local QA-only** variables (do not commit any secrets):

~~~dotenv
PROJECT_AGENT_STEEL_BROWSER=1
PROJECT_AGENT_STEEL_API_URL=https://api.steel.dev
PROJECT_AGENT_STEEL_API_KEY=YOUR_PRIVATE_QA_STEEL_KEY
PROJECT_AGENT_STEEL_SESSION_TIMEOUT_MS=300000
STEEL_QA_ALLOW_LIVE=1
STEEL_QA_DB_ISOLATION_ATTESTED=1
PROJECT_AGENT_STEEL_PRIVATE_VIEWER=0
PROJECT_AGENT_STEEL_LOCAL_VIEWER=0
~~~

A self-hosted Steel API may use a bare http://127.0.0.1:PORT origin.
A separate HTTPS QA host additionally requires STEEL_QA_TRUSTED_API_HOST
matching that exact host. The safety gate rejects production NODE_ENV,
untrusted API hosts, browser player exposure, missing keys and unbounded
remote session timeouts.

## Execute

~~~bash
npm ci
npm run test:steel:guard
npm run test:host:steel:crash
~~~

The live script checks its opt-ins and exact checkout markers before launching
any Next worker. It then verifies auth on both origins, opens the Shared
Project Browser with an authenticated QA owner, confirms shared tabs, takes
human control for blank-tab mutations, kills only the harness-owned worker A
process group, reattaches from B and verifies no automatic duplicate tab.
It closes the shared browser and verifies disconnected state before success.
The external site is never navigated to, and no real user action is sent.

The two-worktree crash harness requires a POSIX host. Do not run it against
production/employee projects or browsers. It does not drop databases or
remove checkouts. It uses the Steel account configured by the operator,
which may incur live session usage.

**Acceptance:** record two distinct launched Next process PIDs, Presentation
and host commit SHAs, observed tab counts before/after crash and after
explicit action, nonmember denial, and confirmed remote cleanup.
Never publish Steel tokens, session URLs, cookies, storage states or DB secrets.

**Blocked:** If real QA hosts, isolated DB or Steel credentials are unavailable,
report BLOCKED / NOT RUN. Passing GitHub CI only proves that the safety
gate and existing mock/integration tests run, not a real Steel host acceptance.

**Cleanup failures:** The harness attempts authenticated browser DELETE
through the surviving Next worker, then shuts down only its owned child
processes. An incomplete cleanup is a FAIL; inspect the isolated Steel
account for an orphaned test session before reusing its QA Project.

## Steel session identity acceptance (post-PR #17)

The owner-only Project Browser status includes an opaque 24-hex `qaSessionProof`
ONLY when the server is nonproduction, Shared Steel is enabled and all three
opt-ins are present: `STEEL_QA_ALLOW_LIVE=1`,
`STEEL_QA_DB_ISOLATION_ATTESTED=1`,
`G2_QA_DB_ISOLATION_ATTESTED=1`. It is a scoped SHA-256 digest of the
Project Browser key, normalized owner and remote Steel session ID; it is **not**
a credential. Raw Steel session IDs, bearer tokens and CDP URLs never appear
in this field. It is absent by default and in production.

The live harness compares this digest from A and B immediately after attach,
after the A-created blank tab, after the SIGKILL/reconnect on B and after B's
fresh deliberate action. A mismatch FAILS acceptance even if tab counts happen
to match. This proves identity continuity on the host API path; it does not
prove the external site's actions are transactionally exactly-once or verify
the unauthenticated Steel WebRTC viewer gateway.
