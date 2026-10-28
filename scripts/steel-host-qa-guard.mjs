const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function steelQaLiveGate(env = process.env) {
  if (!["development", "test"].includes(env.NODE_ENV))
    throw Error("Steel QA requires explicit development or test NODE_ENV");
  if (env.STEEL_QA_ALLOW_LIVE !== "1" ||
      env.STEEL_QA_DB_ISOLATION_ATTESTED !== "1" ||
      env.G2_QA_DB_ISOLATION_ATTESTED !== "1")
    throw Error("Explicit live Steel opt-in and both isolated QA database attestations required");
  if (env.PROJECT_AGENT_RUNTIME !== "sandbox" ||
      env.PROJECT_AGENT_STEEL_BROWSER !== "1")
    throw Error("Steel QA requires sandbox runtime and shared Steel enabled");
  if (env.PROJECT_AGENT_STEEL_PRIVATE_VIEWER === "1" ||
      env.PROJECT_AGENT_STEEL_LOCAL_VIEWER === "1")
    throw Error("Do not enable a browser player gateway during headless Steel QA");
  if (!env.PROJECT_AGENT_STEEL_API_KEY?.trim())
    throw Error("Server-side Steel credential required (never commit it)");
  const raw = env.PROJECT_AGENT_STEEL_API_URL;
  if (!raw) throw Error("PROJECT_AGENT_STEEL_API_URL is required");
  let url;
  try { url = new URL(raw); } catch { throw Error("Invalid Steel QA API origin"); }
  if (url.username || url.password || url.pathname !== "/" ||
      url.search || url.hash || !["http:", "https:"].includes(url.protocol))
    throw Error("Steel QA API must be a bare origin without credentials");
  const allowed = url.protocol === "https:" && url.hostname === "api.steel.dev" ||
    url.protocol === "http:" && local.has(url.hostname) ||
    url.protocol === "https:" && url.hostname === env.STEEL_QA_TRUSTED_API_HOST &&
      Boolean(env.STEEL_QA_TRUSTED_API_HOST);
  if (!allowed) throw Error("Steel QA API host is not allowlisted");
  const timeout = Number(env.PROJECT_AGENT_STEEL_SESSION_TIMEOUT_MS ?? 900000);
  if (!Number.isSafeInteger(timeout) || timeout < 60000 || timeout > 900000)
    throw Error("Steel QA session timeout must be between 1 and 15 minutes");
  if (!env.P7_PROJECT_ID || env.P7_PROJECT_ID !== env.PROJECT_AGENT_P7_QA_PROJECT_ID ||
      !/^[\w-]{4,128}$/.test(env.P7_PROJECT_ID))
    throw Error("Steel QA requires the exact marked synthetic Project");
  const owner = env.P7_OWNER_EMAIL?.trim().toLowerCase();
  const other = env.P7_OTHER_EMAIL?.trim().toLowerCase();
  if (!owner || !other || owner === other ||
      !owner.includes("@") || !other.includes("@"))
    throw Error("Distinct synthetic owner and nonmember identities required");
  if (env.P7_ISOLATED_QA !== "1" || env.P8_QA_ISOLATED_HOST !== "1")
    throw Error("Steel QA requires dedicated QA Next hosts");
  return { apiOrigin: url.origin, timeout, projectId: env.P7_PROJECT_ID };
}
