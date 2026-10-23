"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";

interface CodeBlockProps {
	language?: string;
	code: string;
}

const CODE_BG = "#1e2127";
const HEADER_BG = "#181b20";
const BORDER = "#2d3139";

export default function CodeBlock({ language, code }: CodeBlockProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const displayLanguage = language || "text";

	return (
		<div
			className="relative my-4 w-full max-w-full min-w-0 text-sm overflow-hidden rounded-xl"
			style={{ border: `1px solid ${BORDER}` }}
		>
			{/* Header bar */}
			<div
				className="flex items-center justify-between px-3.5 py-2.5"
				style={{ background: HEADER_BG, borderBottom: `1px solid ${BORDER}` }}
			>
				{/* Language label */}
				<span
					className="font-mono text-[11px] tracking-wide select-none"
					style={{ color: "#6b7280" }}
				>
					{displayLanguage.toLowerCase()}
				</span>

				{/* Copy button */}
				<button
					onClick={handleCopy}
					className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-150 select-none hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
						copied
							? "text-emerald-300"
							: "text-gray-500 hover:text-gray-400"
					}`}
					aria-label="Copy code"
				>
					{copied ? (
						<>
							<Check className="w-3.5 h-3.5" />
							<span>Copied!</span>
						</>
					) : (
						<>
							<Copy className="w-3.5 h-3.5" />
							<span>Copy</span>
						</>
					)}
				</button>
			</div>

			<div
				className="overflow-x-auto w-full min-w-0 rounded-b-xl"
				style={{ background: CODE_BG }}
			>
				<SyntaxHighlighter
					language={displayLanguage}
					style={oneDark}
					PreTag="div"
					customStyle={{
						margin: 0,
						padding: "14px 18px",
						fontSize: "12.5px",
						lineHeight: "1.75",
						borderRadius: 0,
						background: CODE_BG,
						fontFamily:
							"var(--font-mono, 'JetBrains Mono', 'Fira Code', Consolas, monospace)",
						overflow: "visible",
						minWidth: "max-content",
					}}
					showLineNumbers
					lineNumberStyle={{
						minWidth: "2.25em",
						paddingRight: "1.25em",
						color: "#3e4451",
						userSelect: "none",
						fontSize: "11px",
						fontFamily: "inherit",
					}}
					wrapLines={false}
					wrapLongLines={false}
				>
					{code}
				</SyntaxHighlighter>
			</div>
		</div>
	);
}
