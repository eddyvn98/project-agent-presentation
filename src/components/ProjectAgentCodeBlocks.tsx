"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Check, Copy } from "lucide-react";

const HighlightedCode = dynamic(() => import("@/lib/markdown/CodeBlock.client"), {
	ssr: false,
	loading: () => <div className="not-prose my-4 h-16 animate-pulse rounded-xl bg-slate-900/90" />,
});

const PLAIN_LANGUAGES = new Set(["", "text", "txt", "plain", "plaintext", "log", "output"]);

function CopyButton({ text, dark }: { text: string; dark?: boolean }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
	};
	return <button type="button" onClick={() => void copy()} aria-label="Copy" className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${dark ? "text-slate-400 hover:bg-white/5" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
		{copied ? <><Check className="h-3.5 w-3.5 text-emerald-500" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy</>}
	</button>;
}

/** Preserve monospaced text diagrams and ASCII/Unicode box alignment; scroll horizontally instead of wrapping. */
function TextBlock({ code, label }: { code: string; label: string }) {
	return <figure className="not-prose my-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
		<figcaption className="flex items-center justify-between border-b border-slate-200 px-3.5 py-1.5 dark:border-slate-700"><span className="font-mono text-[11px] uppercase tracking-wide text-slate-400">{label}</span><CopyButton text={code} /></figcaption>
		<pre className="max-h-96 w-full overflow-auto whitespace-pre px-4 py-3 font-mono text-[12.5px] leading-6 text-slate-700 dark:text-slate-200" style={{ fontVariantLigatures: "none", tabSize: 4 }}>{code}</pre>
	</figure>;
}

export function ProjectAgentCodeBlock({ language, code }: { language: string; code: string }) {
	const text = code.replace(/\n$/, "");
	const lang = language.toLowerCase();
	if (PLAIN_LANGUAGES.has(lang)) return <TextBlock code={text} label={lang && lang !== "plain" && lang !== "plaintext" ? lang : "text"} />;
	return <HighlightedCode language={lang} code={text} />;
}
