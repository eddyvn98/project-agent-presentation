"use client";

import { OneDrivePicker } from "./OneDrivePicker";
import { AlertCircle, Check, HardDrive, Loader2, Youtube } from "lucide-react";

export interface ProjectSourceImportControlsProps {
	oneDriveConnected: boolean | null;
	oneDriveCanBrowse: boolean;
	onPickOneDriveItem: (itemId: string) => void;
	oneDriveConnecting: boolean;
	oneDriveUrl: string;
	onOneDriveUrlChange: (value: string) => void;
	onOneDriveConnection: () => void;
	onAddOneDrive: () => void;
	addingOneDrive: boolean;
	youtubeUrl: string;
	onYoutubeUrlChange: (value: string) => void;
	onAddYoutube: () => void;
	addingYoutube: boolean;
	busy: boolean;
	error: string | null;
}

export function ProjectSourceImportControls(props: ProjectSourceImportControlsProps) {
	return <>
		<div className="flex items-center justify-between gap-1.5 mb-2 text-[11px] rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-2 py-1.5">
			<div className="flex items-center gap-1.5 min-w-0 text-gray-500 dark:text-gray-400"><HardDrive className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{props.oneDriveConnected === null ? "Checking OneDrive connection…" : props.oneDriveConnected ? "New files will be saved to your OneDrive" : "OneDrive is not connected (files are stored on the server)"}</span></div>
			{props.oneDriveConnected !== null && <button onClick={props.onOneDriveConnection} disabled={props.oneDriveConnecting} className="shrink-0 text-orange-500 font-medium disabled:opacity-40">{props.oneDriveConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : props.oneDriveConnected ? "Disconnect" : "Connect"}</button>}
		</div>
		{props.oneDriveConnected && <OneDrivePicker canBrowse={props.oneDriveCanBrowse} disabled={props.addingOneDrive || props.busy} onPick={props.onPickOneDriveItem} />}
		<div className="flex items-center gap-1.5 mb-2"><HardDrive className="w-3.5 h-3.5 text-gray-400 shrink-0" /><input value={props.oneDriveUrl} onChange={(event) => props.onOneDriveUrlChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") props.onAddOneDrive(); }} placeholder="Paste a OneDrive/SharePoint link…" disabled={props.addingOneDrive || props.busy} className="flex-1 min-w-0 text-[11px] rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-2 py-1.5" /><button onClick={props.onAddOneDrive} disabled={!props.oneDriveUrl.trim() || props.addingOneDrive || props.busy} title="Import from OneDrive" className="p-1.5 rounded-md text-gray-400 hover:text-orange-500 disabled:opacity-40">{props.addingOneDrive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}</button></div>
		<div className="flex items-center gap-1.5 mb-2"><Youtube className="w-3.5 h-3.5 text-gray-400 shrink-0" /><input value={props.youtubeUrl} onChange={(event) => props.onYoutubeUrlChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") props.onAddYoutube(); }} placeholder="Paste a YouTube link…" disabled={props.addingYoutube || props.busy} className="flex-1 min-w-0 text-[11px] rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-2 py-1.5" /><button onClick={props.onAddYoutube} disabled={!props.youtubeUrl.trim() || props.addingYoutube || props.busy} title="Import from YouTube" className="p-1.5 rounded-md text-gray-400 hover:text-orange-500 disabled:opacity-40">{props.addingYoutube ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}</button></div>
		{props.error && <div className="flex items-center gap-1.5 mb-2 text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 px-2 py-1.5 rounded-md"><AlertCircle className="w-3 h-3 shrink-0" />{props.error}</div>}
	</>;
}
