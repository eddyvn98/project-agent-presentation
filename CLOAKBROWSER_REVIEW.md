# CloakBrowser vs. Project Agent Browser — scoped review (2026-10-25)

## Sources and licensing

- Upstream: https://github.com/CloakHQ/CloakBrowser
- `README.md`, `js/src/playwright.ts`, `js/src/download.ts`,
  `js/src/profile-seed.ts`, `js/tests/*`, `LICENSE`,
  `BINARY-LICENSE.md`; verified through GitHub on 2026-10-25.
- The JavaScript/Python **wrapper source** uses MIT.
- The **compiled patched Chromium** is proprietary under
  `BINARY-LICENSE.md` (v1.3): no redistribution/embedding;
  external customer access to its browser capabilities can require
  separate OEM/SaaS rights. Internal operational use is treated
  differently; subscriptions and version limits still apply.
  Do not equate the GitHub repository's MIT badge with browser
  binary or multi-tenant SaaS redistribution rights.
- The upstream `js/README.md` contains older-sounding blanket
  "free and open source / no subscriptions" marketing text, whereas
  the root README and proprietary binary license describe current
  entitlement/version restrictions. Treat the **binary license**
  and provider's current contract as controlling, not a stale
  language-binding README or badge.
- Upstream's claims of 87 C++ stealth patches, 50+ detection sites
  and specific bot/CAPTCHA test scores are vendor-reported, not
  independently accepted Project Agent benchmarks. Avoid assuming
  universal or long-lived bypass success.

## Compatibility and trade-offs

CloakBrowser is a Playwright/Puppeteer-compatible launcher for its
own Chromium distribution. It offers managed binary download,
version channels, checksum/signature verification, persistent
profiles, proxy features and browser-humanization options.
This is **not** an additional AI model or GUI planner.

Project Agent already provides:

- One Playwright Chromium process with up to three separate
  browser contexts, idle cleanup and G2 ownership/Stop fencing.
- DOM references first, screenshot fallback, P8 maker/checker
  escalation, an owner-only Watch and manual handback.
- Saved site authorization in a scoped encrypted vault, rather
  than sharing a persistent browser profile across users.
- Request network/URL policies, redaction, human confirmation
  for irreversible actions and CAPTCHA/MFA stop-and-handoff.

Replacing the launcher just to change bot detection may regress
route interception, WebSocket controls, session lifecycle,
screenshots, security auditing and task ownership. External
auto-download of a new executable introduces supply-chain and
reproducibility risks; a browser that suppresses detection is not
intrinsically more reliable, authorized or secure. The operator
must still respect websites' access rules.

**Decision:** no CloakBrowser dependency, download, account,
license key, proxy emulation, fingerprint spoofing or CAPTCHA
workaround is added to Project Agent. Do not patch stock Chromium
to impersonate human visitors.

## Landed, low-risk adaptation: executable integrity pin

`lib/project-agent/runtime/browser-binary-integrity.ts` provides
**optional SHA-256 pinning** for the browser already configured by
the host. `browser-launcher.ts` calls the verifier before
`chromium.launch`; it neither fetches nor auto-updates binaries.

With a trusted preinstalled browser, calculate the digest via
`shasum -a 256 /absolute/path/to/chrome` (macOS) or
`sha256sum /absolute/path/to/chrome` (Linux), then configure:

```bash
export PROJECT_AGENT_CHROMIUM_EXECUTABLE=/absolute/path/to/chrome
export PROJECT_AGENT_CHROMIUM_SHA256=<64-hex-sha256-from-trusted-release>
```

`PROJECT_AGENT_CHROMIUM_SHA256` is **optional**. When unset the
existing Playwright launch works unchanged. When set, invalid
format, unreadable/missing executable or mismatched bytes fail
closed instead of silently falling back to an unpinned binary.
Treat the digest as a deployment configuration value, not a
license validation or authenticity guarantee. Source hashes from
a trusted release channel, not from the same compromised
download. This check is not protection against a host-level
attacker replacing executable bytes between hashing and launch,
nor does it verify shared libraries or certificate trust.

## Tests and host gate

```bash
npm run test:browser:binary-integrity
npx tsc --noEmit
npm run check:lines
git diff --check
```

The new focused tests use synthetic files only and cover default
compatibility, exact SHA acceptance, malformed hash, replaced
bytes and missing file. No network, downloaded binary or
CloakBrowser account is required for this test. **Do not claim
host or Chromium E2E PASS until actually run in the host worktree.**

If there is a later separately authorized internal-browser QA,
start with a *disposable isolated host*, developer-owned websites,
no real identity/session cookies, explicit licensing review and a
trusted preinstalled fixed-version binary. Use a dedicated browser
backend adapter and synthetic UI test before considering any
launcher switch. Do not automatically route blocked/CAPTCHA
tasks to a browser intended to evade access controls.

This review does not modify or close existing P8/G1/G2 QA gates:
P8 and G1 synthetic host acceptance remain bounded to their
reported scenarios; **G2 crash/recovery E2E is still OPEN**.
No CI/main/staging merge or production rollout is performed.
