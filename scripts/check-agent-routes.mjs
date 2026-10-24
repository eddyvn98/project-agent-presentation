import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const routes = [
  "/account/agent-control",
  "/account/agent-workflows",
  "/account/agent-observability",
  "/account/agent-skills",
  "/account/scheduled-tasks",
  "/account/browser-sessions",
];
const navPath = "components/features/projects/AgentAccountNav.tsx";
const nav = fs.readFileSync(path.join(root, navPath), "utf8");
for (const href of routes) {
  const page = path.join(root, "app", href.slice(1), "page.tsx");
  if (!fs.existsSync(page)) throw new Error("Missing Next.js account page: " + href);
  if (!nav.includes('href: "' + href + '"')) throw new Error("Account page absent from Agent navigation: " + href);
  const text = fs.readFileSync(page, "utf8");
  if (!text.includes('<AgentAccountNav current="' + href + '"'))
    throw new Error("Account page lacks matching navigation: " + href);
  if (!text.includes("<ProtectedRoute>"))
    throw new Error("Account page lacks client auth guard: " + href);
}
const mainPage = fs.readFileSync(path.join(root, "app/(tools)/projects/page.tsx"), "utf8");
if (!mainPage.includes('href="/account/agent-control"'))
  throw new Error("Projects UI has no account-wide Agent settings entry.");
const composer = fs.readFileSync(path.join(root, "components/features/projects/ProjectAgentComposer.tsx"), "utf8");
if (!composer.includes('"/account/agent-control"') || !composer.includes('"/account/agent-workflows"'))
  throw new Error("Composer menu must expose Agent Control Center and workflows.");
console.log("Agent account navigation and routes: OK (" + routes.length + " protected pages)");
