"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, Plus } from "lucide-react";
import ProtectedRoute from "@/components/features/auth/protected-route";
import { ProjectCreateDialog } from "@/components/features/projects/ProjectCreateDialog";
import { useProjectStore } from "@/stores/useProjectStore";

/** Agent Web: the Projects module. A project opens on the home route, so choosing one hands over to it. */
export default function AgentWebPage() {
	const router = useRouter();
	const hydrate = useProjectStore((s) => s.hydrate);
	const projects = useProjectStore((s) => s.projects);
	const setActiveProject = useProjectStore((s) => s.setActiveProject);
	const [createOpen, setCreateOpen] = useState(false);
	useEffect(() => { hydrate(); }, [hydrate]);

	const open = (id: string) => { setActiveProject(id); router.push("/"); };
	const shown = [...projects].filter((item) => !item.archived).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
	return (
		<ProtectedRoute>
			<div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
				<div className="mb-4 flex items-center justify-between">
					<h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Agent Web</h1>
					<button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Plus className="h-4 w-4" />New project</button>
				</div>
				{shown.length === 0 ? <p className="text-sm text-slate-500">No projects yet. Create one to start.</p> : (
					<ul className="flex flex-col gap-1.5">
						{shown.map((project) => (
							<li key={project.id}>
								<button type="button" onClick={() => open(project.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
									<Folder className="h-4 w-4 shrink-0 text-slate-500" />
									<span className="min-w-0 flex-1 truncate">{project.name}</span>
									{project.sharedRole ? <span className="shrink-0 rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">Shared</span> : null}
								</button>
							</li>
						))}
					</ul>
				)}
				<ProjectCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={open} />
			</div>
		</ProtectedRoute>
	);
}
