// Synthetic API contract; no identity, browser session, token or real customer data.
export async function mockAgentApi(page, options = {}) {
  const state = {
    skills: [
      { id: "s1", name: "Evidence review", description: "Check primary sources",
        instructions: "Check the original report before making claims.",
        enabled: true, version: 2, updatedAt: "2026-10-27T00:00:00Z" },
      { id: "s2", name: "Document QA", description: "Inspect document layouts",
        instructions: "Render each document and check typography.",
        enabled: false, version: 1, updatedAt: "2026-10-27T00:00:00Z" },
    ],
    catalog: [{ id: "catalog-qa", name: "Source verification", category: "Research",
      description: "Verify primary sources." }],
    workflows: [{
      id: "wf1", title: "Weekly report", description: "Synthetic status report",
      enabled: true, projectId: "p-qa",
      steps: [{ id: "one", title: "Collect metrics", prompt: "Read data", requiresApproval: false }],
    }],
    runs: [],
    schedules: [{
      id: "sch1", title: "Morning brief", prompt: "Summarize new reports",
      projectId: "p-qa", status: "active",
      spec: { kind: "daily", timezone: "Asia/Ho_Chi_Minh", localTime: "08:00" },
      nextRunAt: "2026-10-28T01:00:00Z", runs: [],
    }],
    sites: [{ host: "docs.example.test", mode: "read", automation: false,
      savedAt: "2026-10-01T00:00:00Z", expiresAt: "2027-10-01T00:00:00Z" }],
  };
  const send = (route, body, status = 200) => route.fulfill({
    status, contentType: "application/json",
    headers: { "Cache-Control": "private, no-store" }, body: JSON.stringify(body),
  });
  await page.route("**/api/**", async route => {
    const req = route.request(), endpoint = new URL(req.url()).pathname;
    const method = req.method(), body = req.postDataJSON?.() || {};
    if (options.fail === endpoint) return send(route, { error: "Synthetic service failure" }, 503);
    if (endpoint === "/api/projects") return send(route, [{ id: "p-qa", name: "QA Project" }]);
    if (endpoint === "/api/project-agent/personal-skills") {
      if (method === "POST") state.skills.push({ ...body, id: body.id || "s3",
        enabled: false, version: 1, updatedAt: "2026-10-27T00:00:00Z" });
      if (method === "PATCH") state.skills = state.skills.map(s =>
        s.id === body.id ? { ...s, enabled: body.enabled } : s);
      if (method === "DELETE") state.skills = state.skills.filter(s => s.id !== body.id);
      return send(route, { skills: state.skills });
    }
    if (endpoint === "/api/project-agent/skill-catalog") {
      if (method === "POST") state.skills.push({ id: "catalog", name: "Source verification",
        description: "Verify primary sources.", instructions: "Read evidence first.",
        enabled: false, version: 1, updatedAt: "2026-10-27T00:00:00Z" });
      return send(route, method === "POST" ? { skills: state.skills } : { catalog: state.catalog });
    }
    if (endpoint === "/api/project-agent/workflows") {
      if (method === "POST") state.workflows.push({ ...body, id: body.id || "wf2", enabled: false });
      return send(route, { workflows: state.workflows, runs: state.runs });
    }
    if (endpoint === "/api/project-agent/schedules") {
      if (method === "POST") state.schedules.push({ ...body, id: "sch2",
        status: "active", runs: [], nextRunAt: "2026-10-28T01:00:00Z" });
      return send(route, { schedules: state.schedules });
    }
    if (endpoint === "/api/project-agent/personal-vault") {
      if (method === "DELETE") state.sites = state.sites.filter(s => "https://" + s.host !== body.url);
      if (method === "PATCH") state.sites = state.sites.map(s => "https://" + s.host === body.url
        ? { ...s, mode: body.mode, automation: body.automation } : s);
      return send(route, { sites: state.sites });
    }
    if (endpoint === "/api/project-agent/approvals") return send(route, { approvals: [] });
    if (endpoint === "/api/project-agent/notification-channels")
      return send(route, { available: false, connected: false, username: "" });
    if (endpoint === "/api/project-agent/browser-policies")
      return send(route, { policies: [], audit: [] });
    if (endpoint === "/api/project-agent/personal-memory")
      return send(route, { memory: { enabled: false, facts: [] } });
    if (endpoint === "/api/project-agent/proactive") return send(route, { suggestions: [] });
    return send(route, { error: "Unknown synthetic API: " + endpoint }, 404);
  });
  return state;
}
