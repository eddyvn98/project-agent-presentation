import { existsSync, readFileSync } from "node:fs";
import { resolve, pathToFileURL } from "node:url";
import { resolve as pathResolve } from "node:path";
/** Configuration-only audit; no real Azure login is attempted. */
export function auditP7Sso(config, host, provider = "azure-ad") {
  const origin = new URL(host).origin, errors = [], warnings = [];
  for (const name of ["NEXTAUTH_URL", "AUTH_URL"]) {
    const configured = config[name];
    if (!configured) continue;
    let actual;
    try { actual = new URL(configured).origin; }
    catch { errors.push(`${name} is not a valid URL`); continue; }
    if (actual !== origin) errors.push(`${name} targets the wrong host/port`);
  }
  if (!config.NEXTAUTH_URL && !config.AUTH_URL)
    errors.push("Set NEXTAUTH_URL (or AUTH_URL) to the QA host public origin");
  if (!config.NEXTAUTH_SECRET && !config.AUTH_SECRET) warnings.push("NextAuth secret missing");
  for (const key of ["AZURE_AD_CLIENT_ID", "AZURE_AD_CLIENT_SECRET", "AZURE_AD_TENANT_ID"])
    if (!config[key]) warnings.push(`${key} not configured; real Entra sign-in unverified`);
  if (config.NEXTAUTH_URL_INTERNAL) {
    try { new URL(config.NEXTAUTH_URL_INTERNAL); }
    catch { errors.push("NEXTAUTH_URL_INTERNAL invalid"); }
  }
  return { origin, expectedRedirect: `${origin}/api/auth/callback/${provider}`,
    errors, warnings, readyForBrowserProbe: errors.length === 0 };
}
export function readP7Env(file) {
  if (!existsSync(file)) throw new Error("Host env file not found");
  const allowed = new Set(["NEXTAUTH_URL", "NEXTAUTH_URL_INTERNAL", "AUTH_URL", "AUTH_SECRET",
    "NEXTAUTH_SECRET", "AZURE_AD_CLIENT_ID", "AZURE_AD_CLIENT_SECRET", "AZURE_AD_TENANT_ID"]);
  const output = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || !allowed.has(match[1])) continue;
    const value = match[2].trim();
    output[match[1]] = value.replace(/^(['"])(.*)\1$/, "$2");
  }
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(pathResolve(process.argv[1])).href) {
  const origin = process.env.P7_HOST_BASE_URL, file = process.env.P7_HOST_ENV_FILE;
  if (!origin || !file) throw new Error("P7_HOST_BASE_URL and P7_HOST_ENV_FILE required");
  const result = auditP7Sso(readP7Env(pathResolve(file)), origin, process.env.P7_ENTRA_PROVIDER_ID ?? "azure-ad");
  console.log(JSON.stringify(result, null, 2)); // No secrets are printed.
  if (result.errors.length) process.exitCode = 1;
}
