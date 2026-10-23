import { Fragment } from "react";

/** The user's message with selected passages ("> text" lines) drawn as quotes. */
export function ProjectAgentUserText({ text }: { text: string }) {
	const blocks: Array<{ quote: boolean; lines: string[] }> = [];
	for (const line of text.split("\n")) {
		const quote = line.startsWith("> ");
		const last = blocks[blocks.length - 1];
		if (last && last.quote === quote) last.lines.push(quote ? line.slice(2) : line);
		else blocks.push({ quote, lines: [quote ? line.slice(2) : line] });
	}
	return <>{blocks.map((block, index) => block.quote
		? <blockquote key={index} className="my-1.5 border-l-[3px] border-slate-300 pl-3 text-[14px] leading-6 text-slate-500 dark:border-slate-600 dark:text-slate-400">{block.lines.join("\n")}</blockquote>
		: <Fragment key={index}><p className="whitespace-pre-wrap">{block.lines.join("\n").replace(/^\n+|\n+$/g, "")}</p></Fragment>)}</>;
}
