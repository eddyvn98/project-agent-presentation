"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { ProjectConversation } from "@/stores/useProjectStore";

interface SearchResult extends ProjectConversation {
	title: string;
	snippet: string;
	createdByEmail: string;
}

export function ProjectChatSearch({
	projectId,
	onSelect,
}: {
	projectId: string;
	onSelect: (conversation: SearchResult, title: string) => void;
}) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		const value = query.trim();
		if (value.length < 2) {
			setResults([]);
			setError("");
			setLoading(false);
			return;
		}
		const controller = new AbortController();
		const timer = setTimeout(() => {
			setLoading(true);
			setError("");
			setResults([]);
			fetch(`/api/projects/${encodeURIComponent(projectId)}/chats/search?q=${encodeURIComponent(value)}`, { signal: controller.signal })
				.then(async (response) => {
					const body = await response.json().catch(() => ({}));
					if (!response.ok) throw new Error(body.error || "Could not search Project chats");
					setResults(Array.isArray(body.results) ? body.results : []);
				})
				.catch((cause) => {
					if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not search Project chats");
				})
				.finally(() => { if (!controller.signal.aborted) setLoading(false); });
		}, 450);
		return () => { clearTimeout(timer); controller.abort(); };
	}, [projectId, query]);

	return <div className="px-1 py-1">
		<label className="relative block">
			<Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
			<input
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				placeholder="Search Project chats"
				aria-label="Search Project chats by message content"
				className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-[11px] outline-none focus:border-orange-300 dark:border-slate-700 dark:bg-slate-900"
			/>
			{loading && <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-slate-400" />}
		</label>
		{error && <p role="alert" className="mt-1 px-1 text-[10px] text-red-600">{error}</p>}
		{query.trim().length >= 2 && !loading && !error && results.length === 0 && <p className="mt-1 px-1 text-[10px] text-slate-400">No matching Project chats</p>}
		{results.length > 0 && <div className="mt-1 max-h-44 space-y-0.5 overflow-y-auto">
			{results.slice(0, 8).map((result) => <button
				key={`${result.projectId}:${result.conversationId}`}
				type="button"
				onClick={() => onSelect(result, result.title)}
				className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
			>
				<span className="block truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">{result.title}</span>
				<span className="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-slate-500 dark:text-slate-400">{result.snippet}</span>
			</button>)}
		</div>}
	</div>;
}
