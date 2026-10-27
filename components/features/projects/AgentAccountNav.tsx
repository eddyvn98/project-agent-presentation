import type { ReactNode } from "react";
import { ChevronDown, Settings2 } from "lucide-react";

const primary = [
  { href: "/", label: "Project Agent" },
  { href: "/account/agent-skills", label: "Skills" },
  { href: "/account/agent-workflows", label: "Workflows" },
  { href: "/account/scheduled-tasks", label: "Schedules" },
  { href: "/account/browser-sessions", label: "Browser" },
  { href: "/account/agent-control", label: "Settings" },
] as const;
const developer = [
  { href: "/account/agent-observability", label: "Observability" },
  { href: "/account/agent-harness", label: "Harness Lab" },
  { href: "/account/agent-benchmark", label: "Benchmark Lab" },
] as const;
export type AgentAccountPage = (typeof primary)[number]["href"] | (typeof developer)[number]["href"];

/** One product navigation; experimental diagnostics remain reachable but secondary. */
export function AgentAccountNav({ current, children }: { current: AgentAccountPage; children?: ReactNode }) {
  const advanced = developer.some(item => item.href === current);
  const navClass = (selected: boolean) =>
    "inline-flex min-h-9 items-center rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
    (selected ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950" :
      "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800");
  return <nav aria-label="Agent account settings"
    className="mb-7 flex flex-wrap items-center gap-1 border-b border-slate-200 pb-3 dark:border-slate-800">
    {primary.map(item => <a key={item.href} href={item.href}
      aria-current={current === item.href ? "page" : undefined}
      className={navClass(current === item.href)}>{item.label}</a>)}
    <details className="group relative" open={undefined} key={advanced ? "advanced-open" : "advanced-closed"}>
      <summary className={navClass(advanced) + " cursor-pointer list-none gap-1 [&::-webkit-details-marker]:hidden"}
        aria-label="Advanced developer tools">
        <Settings2 className="h-4 w-4" aria-hidden="true"/> Advanced
        <ChevronDown className="h-3.5 w-3.5 group-open:rotate-180" aria-hidden="true"/>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-950">
        {developer.map(item => <a key={item.href} href={item.href}
          aria-current={current === item.href ? "page" : undefined}
          className={navClass(current === item.href) + " flex w-full"}>{item.label}</a>)}
      </div>
    </details>
    {children}
  </nav>;
}
