"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Folder, FolderOpen, Home, LogOut, Pencil, Pin, PinOff, Plus, Settings, SquarePen, Trash2, Upload } from "lucide-react";
import { useSession } from "next-auth/react";
import { useProjectStore, type ProjectListItem } from "@/stores/useProjectStore";
import { ProjectModal } from "@/components/features/projects/ProjectModal";
import { clearProjectAgentView, getProjectAgentViewId } from "@/lib/project-agent/view-session";
import { ProjectCreateDialog } from "./ProjectCreateDialog";
import { ProjectRowMenu, type ProjectRowMenuItem } from "./ProjectRowMenu";
import { ProjectSidebarConversations } from "./ProjectSidebarConversations";
import { startProjectChat } from "./startProjectChat";

type ModalState = { projectId: string; tab: "details" | "sharing" } | null;

export function ProjectSidebarPanel() {
	const router = useRouter();
	const { data: session } = useSession();
	const email = session?.user?.email ?? "";
	const hydrate = useProjectStore((s) => s.hydrate);
	const projects = useProjectStore((s) => s.projects);
	const activeProjectId = useProjectStore((s) => s.activeProjectId);
	const setActiveProject = useProjectStore((s) => s.setActiveProject);
	const deleteProject = useProjectStore((s) => s.deleteProject);
	const leaveSharedProject = useProjectStore((s) => s.leaveSharedProject);
	const updateProject = useProjectStore((s) => s.updateProject);
	const [showArchived, setShowArchived] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [modal, setModal] = useState<ModalState>(null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [error, setError] = useState("");

	useEffect(() => { hydrate(); }, [hydrate]);

	const openProject = (id: string) => {
		setConfirmDeleteId(null);
		// Inside one of this project's chats, a click goes back to the project home instead of collapsing the project.
		const insideChat = activeProjectId === id && Boolean(getProjectAgentViewId(id));
		clearProjectAgentView(id);
		if (insideChat) return;
		setActiveProject(activeProjectId === id ? null : id);
	};
	const goHome = (id: string) => { clearProjectAgentView(id); setActiveProject(id); };
	const newChat = (id: string) => { setActiveProject(id); startProjectChat(id); };
	const run = (action: Promise<unknown>, fallback: string) => { setError(""); void action.catch((cause) => setError(cause instanceof Error ? cause.message : fallback)); };
	const commitRename = (project: ProjectListItem) => {
		const value = renameValue.replace(/\s+/g, " ").trim();
		setRenamingId(null);
		if (value && value !== project.name) run(updateProject(project.id, { name: value }), "Could not rename project");
	};

	const menuItems = (project: ProjectListItem): ProjectRowMenuItem[] => {
		const owned = !project.sharedRole;
		const items: ProjectRowMenuItem[] = [];
		if (owned) items.push({ key: "share", label: "Share project", icon: <Upload className="h-4 w-4" />, onSelect: () => setModal({ projectId: project.id, tab: "sharing" }) });
		if (owned) items.push({ key: "rename", label: "Rename project", icon: <Pencil className="h-4 w-4" />, onSelect: () => { setRenameValue(project.name); setRenamingId(project.id); } });
		if (project.sharedRole !== "CHAT") items.push({ key: "settings", label: "Project settings", icon: <Settings className="h-4 w-4" />, onSelect: () => setModal({ projectId: project.id, tab: "details" }) });
		items.push({ key: "home", label: "Project home", icon: <Home className="h-4 w-4" />, onSelect: () => goHome(project.id) });
		if (owned) {
			items.push({ key: "pin", label: project.pinned ? "Unpin project" : "Pin project", icon: project.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />, separatorBefore: true, onSelect: () => run(updateProject(project.id, { pinned: !project.pinned }), "Could not update project") });
			items.push({ key: "archive", label: "Archive project", icon: <Archive className="h-4 w-4" />, onSelect: () => { run(updateProject(project.id, { archived: true }), "Could not archive project"); if (activeProjectId === project.id) setActiveProject(null); } });
		}
		items.push({ key: "delete", label: owned ? "Delete project" : "Leave project", icon: owned ? <Trash2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />, danger: true, separatorBefore: true, onSelect: () => setConfirmDeleteId(project.id) });
		return items;
	};
	const confirmDelete = (project: ProjectListItem) => {
		setConfirmDeleteId(null);
		const wasActive = activeProjectId === project.id;
		if (wasActive) clearProjectAgentView(project.id);
		void (async () => {
			try {
				await (project.sharedRole ? leaveSharedProject(project.id) : deleteProject(project.id));
				if (wasActive) router.push("/projects");
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : project.sharedRole ? "Could not leave project" : "Could not delete project");
			}
		})();
	};

	const visible = [...projects].filter((item) => !item.archived || item.id === activeProjectId).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
	const archived = projects.filter((item) => item.archived);
	return (
		<div className="px-2 pb-1 pt-3">
			{error ? <p role="alert" className="mb-2 px-1 text-[11px] text-red-600">{error}</p> : null}
			<div className="mb-1 flex items-center justify-between px-2">
				<span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Projects</span>
				<button type="button" onClick={() => setCreateOpen(true)} title="New project" aria-label="New project" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:hover:bg-slate-700"><Plus className="h-4 w-4" /></button>
			</div>
			{projects.length === 0 ? <p className="px-2 text-xs italic text-slate-400">No projects yet</p> : (
				<ul className="flex flex-col gap-0.5">
					{visible.map((project) => {
						const active = project.id === activeProjectId;
						return (
							<li key={project.id}>
								{renamingId === project.id ? (
									<input autoFocus aria-label="Project name" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => commitRename(project)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(project); if (event.key === "Escape") setRenamingId(null); }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-orange-500 dark:border-slate-600 dark:bg-slate-900" />
								) : confirmDeleteId === project.id ? (
									<div className="flex items-center gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs dark:bg-red-950/30"><span className="min-w-0 flex-1 truncate text-red-700 dark:text-red-300">{project.sharedRole ? "Leave" : "Delete"} “{project.name}”?</span><button type="button" onClick={() => confirmDelete(project)} className="font-medium text-red-700 hover:underline dark:text-red-300">{project.sharedRole ? "Leave" : "Delete"}</button><button type="button" onClick={() => setConfirmDeleteId(null)} className="text-slate-500 hover:underline">Cancel</button></div>
								) : (
									<div className={`group flex items-center gap-0.5 rounded-lg pr-1 ${active ? "bg-slate-200/60 dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-800/60"}`}>
										<button type="button" onClick={() => openProject(project.id)} title={project.name} aria-expanded={active} className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-sm text-slate-800 dark:text-slate-100">
											{active ? <FolderOpen className="h-[18px] w-[18px] shrink-0" /> : <Folder className="h-[18px] w-[18px] shrink-0" />}
											<span className="min-w-0 flex-1 truncate">{project.name}</span>
											{project.pinned ? <Pin className="h-3 w-3 shrink-0 text-slate-400" /> : null}
											{project.sharedRole ? <span className="shrink-0 rounded bg-slate-200/70 px-1 py-0.5 text-[9px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">Shared</span> : null}
										</button>
										{project.sharedRole !== "CHAT" ? <button type="button" onClick={() => newChat(project.id)} title="New chat in project" aria-label={`New chat in ${project.name}`} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 opacity-0 hover:bg-slate-200/70 hover:text-slate-800 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-700"><SquarePen className="h-4 w-4" /></button> : null}
										<ProjectRowMenu label={project.name} items={menuItems(project)} />
									</div>
								)}
								{active ? <ProjectSidebarConversations project={project} email={email} /> : null}
							</li>
						);
					})}
				</ul>
			)}
			{archived.length > 0 ? (
				<div className="mt-1">
					<button type="button" onClick={() => setShowArchived((value) => !value)} aria-expanded={showArchived} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-slate-400 hover:text-orange-600">{showArchived ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}Archived ({archived.length})</button>
					{showArchived ? <ul className="flex flex-col gap-0.5">{archived.map((item) => (
						<li key={item.id} className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-slate-500"><span className="min-w-0 flex-1 truncate">{item.name}</span>{!item.sharedRole ? <button type="button" onClick={() => run(updateProject(item.id, { archived: false }), "Could not restore project")} title="Restore project" aria-label={`Restore ${item.name}`} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"><ArchiveRestore className="h-3.5 w-3.5" /></button> : null}</li>
					))}</ul> : null}
				</div>
			) : null}
			<ProjectCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={goHome} />
			<ProjectModal open={Boolean(modal)} projectId={modal?.projectId} initialTab={modal?.tab} onClose={() => setModal(null)} />
		</div>
	);
}
