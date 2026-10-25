import { test } from "node:test";
import assert from "node:assert/strict";
import { auditP7Sso } from "../../scripts/p7-sso-preflight.mjs";
const conf = { NEXTAUTH_URL: "http://127.0.0.1:3004", NEXTAUTH_SECRET: "placeholder",
  AZURE_AD_CLIENT_ID: "configured", AZURE_AD_CLIENT_SECRET: "configured",
  AZURE_AD_TENANT_ID: "configured" };
test("detects callback port mistakes", () => {
  const report = auditP7Sso({ ...conf, NEXTAUTH_URL: "http://localhost:3002" }, "http://127.0.0.1:3004");
  assert.equal(report.errors.length, 1);
});
test("derives callback without pretending to authenticate to Entra", () => {
  const report = auditP7Sso(conf, "http://127.0.0.1:3004");
  assert.equal(report.expectedRedirect, "http://127.0.0.1:3004/api/auth/callback/azure-ad");
  assert.equal(report.readyForBrowserProbe, true);
});
