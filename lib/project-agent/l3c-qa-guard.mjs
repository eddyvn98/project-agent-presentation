/** Non-production synthetic checkpoint QA. Never authorize an employee Project or public origin. */
export function l3cQaAllowed(value) {
  const e = value.env ?? {};
  if (!["development", "test"].includes(e.NODE_ENV) ||
      e.P7_ISOLATED_QA !== "1" || e.G2_QA_DB_ISOLATION_ATTESTED !== "1" ||
      e.PROJECT_AGENT_L3C_QA_CHECKPOINT !== "1" ||
      e.PROJECT_AGENT_CONTEXT_CHECKPOINT_BACKEND !== "mongo" ||
      e.PROJECT_AGENT_RUNTIME !== "sandbox" ||
      !/^[a-f0-9]{12}$/.test(e.G2_QA_RUN_ID ?? "")) return false;
  if (value.projectId !== e.P7_PROJECT_ID ||
      value.projectId !== e.PROJECT_AGENT_P7_QA_PROJECT_ID ||
      value.chatId !== "l3c_" + e.G2_QA_RUN_ID ||
      value.owner?.trim().toLowerCase() !== value.caller?.trim().toLowerCase() ||
      !value.owner?.toLowerCase().endsWith("@project-agent.test") ||
      !value.projectName?.startsWith("P7 QA Synthetic ")) return false;
  if (value.method !== "GET" && value.originHeader !== value.origin) return false;
  try {
    const url = new URL(value.origin);
    return url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      ["3005", "3006"].includes(url.port);
  } catch { return false; }
}
