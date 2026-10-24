import type { ReactNode } from "react";
const destinations = [
  { href: "/", label: "Project Agent" },
  { href: "/account/agent-control", label: "Control Center" },
  { href: "/account/scheduled-tasks", label: "Scheduled Tasks" },
  { href: "/account/agent-workflows", label: "Workflows" },
  { href: "/account/agent-observability", label: "Observability" },
  { href: "/account/agent-skills", label: "Skill Registry" },
  { href: "/account/agent-harness", label: "Harness Lab" },
  { href: "/account/agent-benchmark", label: "Benchmark Lab" },
  { href: "/account/browser-sessions", label: "Browser Logins" },
] as const;
export type AgentAccountPage = typeof destinations[number]["href"];

/** Shared account-wide Agent navigation; each Next.js page is independently reachable. */
export function AgentAccountNav({ current, children }: { current: AgentAccountPage; children?: ReactNode }) {
  return <nav aria-label="Agent account settings" className="mb-5 flex flex-wrap gap-2">
    {destinations.map(({ href, label }) => <a key={href} href={href}
      aria-current={current === href ? "page" : undefined}
      className={"rounded-full border px-3 py-1.5 text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800 " +
        (current === href ? "border-slate-900 font-semibold dark:border-slate-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300")}>
      {label}
    </a>)}
    {children}
  </nav>;
}
