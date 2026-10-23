"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";

type Share = { id: string; invitedEmail: string; role: "CHAT" | "EDIT" };

export function ProjectSharingTab({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
	const [shares, setShares] = useState<Share[]>([]);
	const [shareLinkEnabled, setShareLinkEnabled] = useState(false);
	const [shareLinkUrl, setShareLinkUrl] = useState("");
	const [linkCopied, setLinkCopied] = useState(false);
	const [linkBusy, setLinkBusy] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Share["role"]>("CHAT");
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const endpoint = `/api/projects/${encodeURIComponent(projectId)}/shares`;
	const shareLinkEndpoint = `/api/projects/${encodeURIComponent(projectId)}/share-link`;

	const loadShares = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const [response, linkResponse] = await Promise.all([fetch(endpoint), isOwner ? fetch(shareLinkEndpoint) : Promise.resolve(null)]);
			const [body, linkBody] = await Promise.all([
				response.json().catch(() => ({})),
				linkResponse?.json().catch(() => ({})) ?? Promise.resolve({}),
			]);
			if (!response.ok) throw new Error(body.error ?? "Could not load collaborators");
			if (linkResponse && !linkResponse.ok) throw new Error(linkBody.error ?? "Could not load invite link status");
			setShares(Array.isArray(body.shares) ? body.shares : []);
			setShareLinkEnabled(isOwner && linkBody.enabled === true);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not load collaborators");
		} finally {
			setLoading(false);
		}
	}, [endpoint, shareLinkEndpoint, isOwner]);

	useEffect(() => { void loadShares(); }, [loadShares]);

	async function changeShare(shareId: string, patch: { role?: Share["role"]; remove?: boolean }) {
		if (!isOwner || linkBusy || busy) return;
		setBusy(true);
		setError("");
		try {
			const response = await fetch(`${endpoint}/${encodeURIComponent(shareId)}`, {
				method: patch.remove ? "DELETE" : "PATCH",
				headers: patch.remove ? undefined : { "Content-Type": "application/json" },
				body: patch.remove ? undefined : JSON.stringify({ role: patch.role }),
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? "Could not update collaborator");
			await loadShares();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not update collaborator");
		} finally {
			setBusy(false);
		}
	}

	async function invite(event: React.FormEvent) {
		event.preventDefault();
		if (!email.trim() || busy || linkBusy) return;
		setBusy(true);
		setError("");
		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim(), role: isOwner ? role : "CHAT" }),
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? "Could not invite collaborator");
			setEmail("");
			await loadShares();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not invite collaborator");
		} finally {
			setBusy(false);
		}
	}

	async function createShareLink() {
		if (!isOwner) return;
		setLinkBusy(true);
		setError("");
		setShareLinkUrl("");
		setLinkCopied(false);
		try {
			const response = await fetch(shareLinkEndpoint, { method: "POST" });
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? "Could not create invite link");
			const url = new URL(body.joinPath, window.location.origin).toString();
			setShareLinkEnabled(true);
			setShareLinkUrl(url);
			try {
				await navigator.clipboard.writeText(url);
				setLinkCopied(true);
			} catch {
				setLinkCopied(false);
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not create invite link");
		} finally {
			setLinkBusy(false);
		}
	}

	async function revokeShareLink() {
		if (!isOwner) return;
		setLinkBusy(true);
		setError("");
		try {
			const response = await fetch(shareLinkEndpoint, { method: "DELETE" });
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? "Could not revoke invite link");
			setShareLinkEnabled(false);
			setShareLinkUrl("");
			setLinkCopied(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not revoke invite link");
		} finally {
			setLinkBusy(false);
		}
	}

	return (
		<div className="space-y-4 py-3">
			<form onSubmit={(event) => void invite(event)} className="space-y-2">
				<label className="block text-xs font-medium text-slate-700 dark:text-slate-200" htmlFor="project-share-email">Invite by email</label>
				<div className="flex gap-2">
					<input id="project-share-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className="min-w-0 flex-1 rounded-md border border-slate-200 bg-transparent px-2.5 py-2 text-sm outline-none focus:border-orange-400 dark:border-slate-700" />
					{isOwner && <select value={role} onChange={(event) => setRole(event.target.value as Share["role"])} aria-label="Collaborator access" className="rounded-md border border-slate-200 bg-transparent px-2 text-xs dark:border-slate-700">
						<option value="CHAT">Can chat</option>
						<option value="EDIT">Can edit</option>
					</select>}
					<button type="submit" disabled={busy || linkBusy} aria-label="Invite collaborator" className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-2.5 text-xs font-medium text-white disabled:opacity-50"><UserPlus className="h-3.5 w-3.5" />Invite</button>
				</div>
			</form>
			{error && <p role="alert" className="text-xs text-red-600">{error}</p>}
			{isOwner && <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
				<div>
					<p className="text-xs font-medium text-slate-700 dark:text-slate-200">Anyone with the link</p>
					<p className="mt-1 text-[11px] leading-relaxed text-slate-400">Anyone who signs in with this link can join with chat access. Revoking the link prevents new joins; existing members keep their access.</p>
				</div>
				<div className="flex gap-2">
					<button type="button" disabled={linkBusy || busy} onClick={() => void createShareLink()} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">{linkBusy ? "Working…" : shareLinkEnabled ? "Regenerate link" : "Create invite link"}</button>
					{shareLinkEnabled && <button type="button" disabled={linkBusy || busy} onClick={() => void revokeShareLink()} className="rounded-md px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30">Revoke</button>}
				</div>
				{shareLinkUrl && <div className="space-y-1">
					<input aria-label="Project invite link" readOnly value={shareLinkUrl} onFocus={(event) => event.currentTarget.select()} className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800" />
					<p role="status" className="text-[10px] text-slate-500">{linkCopied ? "Copied to clipboard. Regenerating invalidates this link." : "Copy this link now. Regenerating invalidates it."}</p>
				</div>}
			</div>}
			<div className="border-t border-slate-100 pt-3 dark:border-slate-800">
				<p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-200">People with access</p>
				{loading ? <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div> : shares.length ? (
					<ul className="space-y-2">{shares.map((share) => <li key={share.id} className="flex items-center gap-2 text-xs">
						<span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{share.invitedEmail}</span>
						{isOwner ? <>
							<select disabled={busy || linkBusy} value={share.role} onChange={(event) => void changeShare(share.id, { role: event.target.value as Share["role"] })} aria-label={`Access for ${share.invitedEmail}`} className="rounded border border-slate-200 bg-transparent px-1.5 py-1 dark:border-slate-700">
								<option value="CHAT">Can chat</option><option value="EDIT">Can edit</option>
							</select>
							<button type="button" disabled={busy || linkBusy} onClick={() => void changeShare(share.id, { remove: true })} aria-label={`Remove ${share.invitedEmail}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>
						</> : <span className="text-[10px] text-slate-400">{share.role === "EDIT" ? "Can edit" : "Can chat"}</span>}
					</li>)}</ul>
				) : <p className="text-xs text-slate-400">This project is private. Invite people to collaborate.</p>}
			</div>
			<p className="text-[11px] leading-relaxed text-slate-400">Can chat allows project conversations and agent tasks. Can edit also allows changing project instructions and sources and inviting collaborators. Only the owner can change roles, remove members, or manage invite links.</p>
		</div>
	);
}
