"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Folder, Lightbulb, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProjectStore, type ProjectMemoryMode } from "@/stores/useProjectStore";

const MEMORY_OPTIONS: Array<{ value: ProjectMemoryMode; label: string; description: string }> = [
	{ value: "DEFAULT", label: "Default memory", description: "This project can access memory from outside chats, and vice versa." },
	{ value: "PROJECT_ONLY", label: "Project-only memory", description: "This project can only access its own memory. Its memory is hidden from outside chats." },
];

export function ProjectCreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (projectId: string) => void }) {
	const createProject = useProjectStore((state) => state.createProject);
	const [name, setName] = useState("");
	const [memoryMode, setMemoryMode] = useState<ProjectMemoryMode>("DEFAULT");
	const [menuOpen, setMenuOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => { if (open) { setName(""); setMemoryMode("DEFAULT"); setMenuOpen(false); setError(""); } }, [open]);
	useEffect(() => {
		if (!menuOpen) return;
		const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [menuOpen]);

	const trimmed = name.trim();
	const submit = async () => {
		if (!trimmed || saving) return;
		setSaving(true);
		setError("");
		try {
			const project = await createProject({ name: trimmed, description: "", instructions: "", memoryMode, icon: "📁", color: "#f97316" });
			onClose();
			onCreated(project.id);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not create the project");
		} finally {
			setSaving(false);
		}
	};
	const current = MEMORY_OPTIONS.find((option) => option.value === memoryMode)!;
	return (
		<Dialog open={open} onOpenChange={(value) => !value && onClose()}>
			<DialogContent className="bg-white sm:max-w-[512px] dark:bg-slate-900">
				<DialogHeader><DialogTitle className="text-lg text-slate-900 dark:text-white">Create project</DialogTitle></DialogHeader>
				<form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4">
					<div>
						<label htmlFor="project-create-name" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">Project name</label>
						<div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 dark:border-slate-600">
							<Folder className="h-4 w-4 shrink-0 text-slate-500" />
							<input id="project-create-name" autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Copenhagen Trip" className="min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none outline-none ring-0 placeholder:text-slate-400 focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0" />
						</div>
					</div>
					<div className="flex items-start gap-3 rounded-xl bg-slate-100 px-3.5 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
						<Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
						<p>Projects keep chats, files, and custom instructions in one place. Use them for ongoing work, or just to keep things tidy.</p>
					</div>
					{error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
					<div className="flex items-center justify-between gap-3">
						<div ref={menuRef} className="relative">
							<button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-haspopup="menu" aria-expanded={menuOpen} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">{current.label}<ChevronDown className="h-3.5 w-3.5" /></button>
							{menuOpen ? (
								<div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
									{MEMORY_OPTIONS.map((option) => (
										<button key={option.value} type="button" role="menuitemradio" aria-checked={option.value === memoryMode} onClick={() => { setMemoryMode(option.value); setMenuOpen(false); }} className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
											<span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{option.label}</span><span className="block text-xs leading-5 text-slate-500">{option.description}</span></span>
											{option.value === memoryMode ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
										</button>
									))}
								</div>
							) : null}
						</div>
						<button type="submit" disabled={!trimmed || saving} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-white dark:text-slate-900 dark:disabled:bg-slate-700">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create project</button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
