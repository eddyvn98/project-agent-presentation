"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { localStorageProjectAdapter } from "@/stores/adapters/localStorageProjectAdapter";

type ProjectPreview = { id: string; name: string; icon: string };

export function ProjectJoinPage({ token }: { token: string }) {
	const { status } = useSession();
	const [project, setProject] = useState<ProjectPreview | null>(null);
	const [loading, setLoading] = useState(true);
	const [joining, setJoining] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		const controller = new AbortController();
		fetch(`/api/projects/join/${encodeURIComponent(token)}`, { signal: controller.signal })
			.then(async (response) => {
				const body = await response.json().catch(() => ({}));
				if (!response.ok) throw new Error(body.error || "This invite link is unavailable");
				setProject(body.project);
			})
			.catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "This invite link is unavailable"); })
			.finally(() => { if (!controller.signal.aborted) setLoading(false); });
		return () => controller.abort();
	}, [token]);

	async function join() {
		if (joining || !project) return;
		setJoining(true);
		setError("");
		try {
			const response = await fetch(`/api/projects/join/${encodeURIComponent(token)}`, { method: "POST" });
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error || "Could not join this Project");
			localStorageProjectAdapter.saveActiveProjectId(body.projectId);
			window.location.assign("/assistant");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not join this Project");
			setJoining(false);
		}
	}

	return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
		<section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
			<p className="text-xs font-semibold uppercase tracking-widest text-orange-600">360i Projects</p>
			<h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Join a Project</h1>
			{loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : error && !project ? (
				<p role="alert" className="mt-4 text-sm text-red-600">{error}</p>
			) : project && <>
				<div className="mt-5 flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
					<span className="text-2xl" aria-hidden="true">{project.icon}</span>
					<span className="font-medium text-slate-800 dark:text-slate-100">{project.name}</span>
				</div>
				<p className="mt-3 text-sm text-slate-500">This invite grants chat access to the Project and its shared conversations and files.</p>
				{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
				<button type="button" onClick={() => status === "authenticated" ? void join() : void signIn()} disabled={status === "loading" || joining} className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
					{joining && <Loader2 className="h-4 w-4 animate-spin" />}{status === "authenticated" ? "Join Project" : status === "loading" ? "Checking sign-in…" : "Sign in to join"}
				</button>
			</>}
		</section>
	</main>;
}
