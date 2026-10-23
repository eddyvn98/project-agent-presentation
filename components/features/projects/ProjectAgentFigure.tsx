"use client";

import { useState } from "react";
import { ProjectAgentZoomImage } from "./ProjectAgentZoomImage";

export type ImagePresentation = {
	size?: "inline" | "reference";
	caption?: string;
	source?: { url: string; label: string };
};

export function safeProjectAgentImageUrl(value: string): boolean {
	return !!value && !/[\u0000-\u0020\u007f\\]/.test(value) && !value.startsWith("//") &&
		(!/^[a-z][a-z\d+.-]*:/i.test(value) || /^https?:\/\//i.test(value));
}

export function ProjectAgentFigure({ src, alt = "", presentation = {} }: {
	src: string;
	alt?: string;
	presentation?: ImagePresentation;
}) {
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	const caption = presentation.caption ?? alt;
	const available = safeProjectAgentImageUrl(src) && failedSrc !== src;
	const imageClass = presentation.size === "inline"
		? "h-auto max-h-56 w-auto max-w-[min(100%,22rem)] object-contain"
		: "h-auto max-h-[26rem] w-auto max-w-[min(100%,46rem)] object-contain";
	return <figure className="not-prose my-5 flex w-full max-w-full flex-col items-start gap-2" data-size={presentation.size ?? "reference"}>
		{available ? <ProjectAgentZoomImage src={src} alt={alt} label={`Enlarge ${alt || "illustration"}`} className="block max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
			{/* eslint-disable-next-line @next/next/no-img-element -- authenticated task image URL */}
			<img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={imageClass} onError={() => setFailedSrc(src)} />
		</ProjectAgentZoomImage> : <p role="status" className="text-sm text-slate-500">Illustration unavailable{alt ? `: ${alt}` : "."}</p>}
		{(caption || presentation.source) && <figcaption className="max-w-[46rem] text-xs leading-5 text-slate-500 dark:text-slate-400">
			{caption}
			{presentation.source && safeProjectAgentImageUrl(presentation.source.url) && <>{caption ? " · " : ""}<a href={presentation.source.url} target="_blank" rel="noopener noreferrer">{presentation.source.label || "Source"}</a></>}
		</figcaption>}
	</figure>;
}
