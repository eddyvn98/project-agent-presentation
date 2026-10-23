"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, File, Folder, Loader2, Search } from "lucide-react";

interface DriveEntry {
	id: string;
	name: string;
	isFolder: boolean;
	sizeBytes: number;
}

interface OneDrivePickerProps {
	canBrowse: boolean;
	disabled: boolean;
	onPick: (itemId: string) => void;
}

const BUTTON = "text-[11px] text-orange-500 font-medium disabled:opacity-40";

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OneDrivePicker({ canBrowse, disabled, onPick }: OneDrivePickerProps) {
	const [open, setOpen] = useState(false);
	const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<DriveEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const folderId = trail.length ? trail[trail.length - 1].id : undefined;

	const load = useCallback(async (signal: AbortSignal) => {
		setLoading(true); setError(null);
		const params = new URLSearchParams();
		if (query.trim()) params.set("q", query.trim());
		else if (folderId) params.set("folderId", folderId);
		try {
			const res = await fetch(`/api/onedrive/files?${params}`, { signal });
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? `Could not list files (${res.status})`);
			setItems(data.items ?? []);
		} catch (cause) {
			if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Could not list files");
		} finally {
			if (!signal.aborted) setLoading(false);
		}
	}, [folderId, query]);

	useEffect(() => {
		if (!open || !canBrowse) return;
		const controller = new AbortController();
		const timer = setTimeout(() => void load(controller.signal), query ? 300 : 0);
		return () => { clearTimeout(timer); controller.abort(); };
	}, [open, canBrowse, load, query]);

	function openEntry(entry: DriveEntry) {
		if (entry.isFolder) { setQuery(""); setTrail((current) => [...current, { id: entry.id, name: entry.name }]); return; }
		onPick(entry.id);
		setOpen(false); setTrail([]); setQuery("");
	}

	if (!open) {
		return <div className="mb-2"><button type="button" onClick={() => setOpen(true)} disabled={disabled} className={BUTTON}>Browse my OneDrive…</button></div>;
	}

	return <div className="mb-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-[11px]">
		<div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
			<span className="truncate text-gray-500 dark:text-gray-400">{query.trim() ? "Search results" : trail.length ? trail.map((crumb) => crumb.name).join(" / ") : "My files"}</span>
			<button type="button" onClick={() => { setOpen(false); setTrail([]); setQuery(""); }} className={BUTTON}>Close</button>
		</div>
		{!canBrowse ? <div className="px-2 py-3 text-gray-500 dark:text-gray-400">To browse your files, reconnect OneDrive and accept the new permission. <button type="button" onClick={() => { window.location.href = "/api/onedrive/connect"; }} className={BUTTON}>Reconnect</button></div> : <>
			<div className="flex items-center gap-1.5 px-2 py-1.5">
				{trail.length > 0 && !query && <button type="button" aria-label="Up one folder" onClick={() => setTrail((current) => current.slice(0, -1))} className="text-gray-400 hover:text-orange-500"><ChevronLeft className="w-3.5 h-3.5" /></button>}
				<Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
				<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search OneDrive…" className="flex-1 min-w-0 bg-transparent outline-none" />
				{loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
			</div>
			{error && <div className="px-2 pb-1.5 text-red-500">{error}</div>}
			<div className="max-h-48 overflow-y-auto">
				{!loading && !error && items.length === 0 && <div className="px-2 py-2 text-gray-400">No files here.</div>}
				{items.map((entry) => <button key={entry.id} type="button" disabled={disabled} onClick={() => openEntry(entry)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40">
					{entry.isFolder ? <Folder className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <File className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
					<span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-300">{entry.name}</span>
					{!entry.isFolder && <span className="text-gray-400 shrink-0">{formatSize(entry.sizeBytes)}</span>}
				</button>)}
			</div>
		</>}
	</div>;
}
