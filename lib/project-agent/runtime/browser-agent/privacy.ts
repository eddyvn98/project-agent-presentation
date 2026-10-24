import type { Page } from "playwright-core";
/** Only targeted field containers, not whole forms or account page bodies. */
export function sensitiveScreenshotMask(page: Page) {
  return page.locator([
    'input','textarea','select','[contenteditable="true"]',
    '[data-private]','[data-sensitive]','[data-secret]',
    '[autocomplete*="cc-"]','[autocomplete*="password"]',
    '[aria-label*="credit card" i]','[aria-label*="security code" i]',
    '[aria-label*="password" i]','[aria-label*="one-time" i]',
    '[data-testid*="account-number" i]','[data-testid*="card-number" i]',
    '[data-testid*="api-key" i]','[data-testid*="access-token" i]',
  ].join(","));
}
