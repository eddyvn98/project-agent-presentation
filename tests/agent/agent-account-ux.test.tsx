import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AgentAccountNav } from "../../components/features/projects/AgentAccountNav";
import { PersonalAgentSkillRegistry } from "../../components/features/projects/PersonalAgentSkillRegistry";
import { AgentWorkflowBuilder } from "../../components/features/projects/AgentWorkflowBuilder";

const original = [{
  id: "a1", name: "QA fact checker", description: "Verify sources", instructions: "Check the primary source before reporting.",
  version: 1, enabled: true, updatedAt: "2026-10-27T00:00:00Z",
}, {
  id: "a2", name: "Draft review", description: "Review documents", instructions: "Check typography and deliverable pages.",
  version: 1, enabled: false, updatedAt: "2026-10-27T00:00:00Z",
}];
const library = [{ id: "source-audit", name: "Source verification", category: "Research",
  description: "Cross-check facts and cite sources." }];
const response = (payload: unknown, ok = true) => ({ ok, json: async () => payload });
const setup = () => {
  let skills = original.map(s => ({ ...s }));
  const fetcher = vi.fn(async (url: string, opts?: { method?: string; body?: string }) => {
    if (url === "/api/project-agent/personal-skills") {
      const body = opts?.body ? JSON.parse(opts.body) as Record<string, string | boolean> : {};
      if (opts?.method === "PATCH") skills = skills.map(s => s.id === body.id ? { ...s, enabled: Boolean(body.enabled) } : s);
      if (opts?.method === "DELETE") skills = skills.filter(s => s.id !== body.id);
      if (opts?.method === "POST") {
        const next = { id: String(body.id || "created"), name: String(body.name),
          description: String(body.description), instructions: String(body.instructions),
          version: 1, enabled: false, updatedAt: "2026-10-27T00:00:00Z" };
        skills = [...skills.filter(s => s.id !== next.id), next];
      }
      return response({ skills });
    }
    if (url === "/api/project-agent/skill-catalog") {
      if (opts?.method === "POST") {
        skills = [...skills, { id: "catalog", name: library[0].name, description: library[0].description,
          instructions: "Read source", version: 1, enabled: false, updatedAt: "2026-10-27T00:00:00Z" }];
        return response({ skills });
      }
      return response({ catalog: library });
    }
    return response({}, false);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("commercial-style agent Skills surface", () => {
  it("groups advanced diagnostics without losing navigation routes", () => {
    render(<AgentAccountNav current="/account/agent-skills"/>);
    expect(screen.getByRole("link", { name: "Skills" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Workflows" })).toBeTruthy();
    fireEvent.click(screen.getByText("Advanced"));
    expect(screen.getByRole("link", { name: "Harness Lab" })).toBeTruthy();
  });
  it("searches and filters installed skills, with state reflected by the switch", async () => {
    const fetcher = setup();
    render(<PersonalAgentSkillRegistry/>);
    expect(await screen.findByRole("heading", { name: "QA fact checker" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search skills" }), { target: { value: "Draft" } });
    expect(screen.queryByRole("heading", { name: "QA fact checker" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Draft review" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search skills" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("switch", { name: "Disable QA fact checker" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Enable QA fact checker" })
      .getAttribute("aria-checked")).toBe("false"));
    expect(fetcher).toHaveBeenCalledWith("/api/project-agent/personal-skills",
      expect.objectContaining({ method: "PATCH" }));
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(screen.getByRole("heading", { name: "QA fact checker" })).toBeTruthy();
  });
  it("opens an accessible create dialog rather than showing a permanent form", async () => {
    setup();
    render(<PersonalAgentSkillRegistry/>);
    await screen.findByRole("heading", { name: "QA fact checker" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    const dialog = screen.getByRole("dialog", { name: "Create a skill" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Skill name" }), { target: { value: "Synthetic QA" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Skill instructions" }), {
      target: { value: "Verify test evidence before sending a report." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create skill" }));
    expect(await screen.findByRole("heading", { name: "Synthetic QA" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("switch", { name: "Enable Synthetic QA" })).toBeTruthy();
  });
  it("installs catalog skill only once and brings user back to disabled library entry", async () => {
    const fetcher = setup();
    render(<PersonalAgentSkillRegistry/>);
    await screen.findByRole("heading", { name: "QA fact checker" });
    fireEvent.click(screen.getByRole("tab", { name: "Explore library" }));
    expect(await screen.findByRole("heading", { name: "Source verification" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to my skills" }));
    expect(await screen.findByRole("switch", { name: "Enable Source verification" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Explore library" }));
    expect(screen.getByRole("button", { name: "In your library" }).hasAttribute("disabled")).toBe(true);
    expect(fetcher.mock.calls.filter(([url, opts]) => url === "/api/project-agent/skill-catalog" &&
      (opts as { method?: string } | undefined)?.method === "POST")).toHaveLength(1);
  });
});

it("keeps workflow creation behind a deliberate action", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/project-agent/workflows") return response({ workflows: [], runs: [] });
    return response([]);
  }));
  render(<AgentWorkflowBuilder/>);
  await screen.findByRole("heading", { name: "Workflows" });
  expect(screen.queryByRole("heading", { name: "New workflow" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Create workflow/ }));
  expect(screen.getByRole("heading", { name: "New workflow" })).toBeTruthy();
});
