import type { Page } from "playwright-core";
/** Only targeted field containers, not whole forms or account page bodies. */
export function sensitiveScreenshotMask(page: Page) {
  return page.locator([
    'input[type="password" i]',
    '[data-private]','[data-sensitive]','[data-secret]',
    '[autocomplete*="cc-"]','[autocomplete*="password"]',
    '[autocomplete*="one-time-code"]','[autocomplete*="email"]',
    '[autocomplete*="tel"]','[autocomplete*="address"]',
    '[aria-label*="credit card" i]','[aria-label*="security code" i]',
    '[aria-label*="password" i]','[aria-label*="one-time" i]',
    '[data-testid*="account-number" i]','[data-testid*="card-number" i]',
    '[data-testid*="api-key" i]','[data-testid*="access-token" i]',
    '[name*="password" i]','[name*="secret" i]','[name*="token" i]',
    '[name*="api-key" i]','[id*="password" i]','[id*="secret" i]',
    '[id*="token" i]','[id*="api-key" i]',
  ].join(","));
}

/** Browser console text is untrusted and can contain keys, tokens or PII. */
export function safeBrowserConsoleEntry(level: string): string {
  return ["error", "warning"].includes(level) ? level + ": [page message redacted]" : "";
}
