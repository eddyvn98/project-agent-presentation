# L3C / L8B real Next.js host QA

**Not a normal Presentation CI test.** This acceptance gate needs two private AI-WEB-CHAT checkouts with distinct .next directories, a single isolated Mongo QA database and synthetic NextAuth storage states.

Port the new Presentation l3c-checkpoint route and memory files into both host checkouts. Prepare the existing G2 crash-environment markers in the two exact checkouts; use the existing G2 run ID, synthetic Project, review ticket, feature flags, authentication states and port 3005/3006 environment. The G2 host harness enforces opt-in, localhost-only ports, independent checkouts and ownership of spawned process groups.

Additionally set PROJECT_AGENT_CONTEXT_CHECKPOINT_BACKEND=mongo, PROJECT_AGENT_L3C_QA_CHECKPOINT=1, and L3C_L8B_QA_CONFIRM=isolated-synthetic-only. Leave PROJECT_AGENT_HINDSIGHT_API_URL unset. Set NODE_ENV to development/test.

Run: npm run test:host:l3c-l8b

The test starts two actual Next.js instances, checks owner/nonmember on both, writes a synthetic checkpoint on A, reads it on B, SIGKILLs only its own host A, continues on B, rejects a running-chat deletion, verifies Stop-then-delete and removes the QA checkpoint. It never makes a real model call.

**Pending external host gate:** The current GitHub installation cannot read the private AI-WEB-CHAT repository; therefore it cannot provision genuine host worktrees in its CI. Presentation CI validates the guard and standalone components but must not claim that this script has run. Full L8B membership revocation during an actual long-running model call needs separately authenticated host QA.