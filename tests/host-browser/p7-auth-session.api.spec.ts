import { test, expect } from "@playwright/test";
import { taskBase } from "./qa-helpers";
test("anonymous/expired session cannot read private task history", async ({ playwright, baseURL }) => {
  const ctx = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const response = await ctx.get(taskBase(), { failOnStatusCode: false, maxRedirects: 0 });
    expect([302, 303, 307, 308, 401, 403, 404].includes(response.status())).toBe(true);
    expect(await response.text()).not.toMatch(/p7-synthetic\.pdf|P7 synthetic artifact/);
  } finally { await ctx.dispose(); }
});
test("Entra provider callback is configured for QA origin, not old port 3002", async ({ playwright, baseURL }) => {
  test.skip(process.env.P7_ENTRA_SSO_CHECK !== "1",
    "Operator must configure real Entra redirect URI and opt into this check");
  const ctx = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const id = process.env.P7_ENTRA_PROVIDER_ID ?? "azure-ad";
    const response = await ctx.get("/api/auth/providers", { failOnStatusCode: false, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const body = await response.json() as Record<string, { callbackUrl?: string }>;
    expect(body).toHaveProperty(id);
    expect(body[id].callbackUrl).toBe(new URL(`/api/auth/callback/${id}`, baseURL!).href);
    expect(body[id].callbackUrl).not.toContain("localhost:3002");
  } finally { await ctx.dispose(); }
});
