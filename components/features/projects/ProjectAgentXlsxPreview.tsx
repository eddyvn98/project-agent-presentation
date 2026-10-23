"use client";

import { useEffect, useMemo, useState } from "react";
import type { TableWorkbookSheet } from "@/app/workspace/types/table";
import { runWorkbookTask } from "@/lib/office/spreadsheet/workerClient";
import { formatTableValue } from "@/app/workspace/utils/tableCellFormat";

/** The cell as Excel would show it: its number format applied (2.2%, 39,284) when the workbook has one. */
const shown = (sheet: TableWorkbookSheet, row: number, col: number, value: unknown) => {
	const pattern = sheet.data.cellFormats?.[row]?.[col]?.fa ?? sheet.data.columnFormats?.[col]?.fa;
	return (typeof value === "number" || typeof value === "string" ? formatTableValue(value, pattern) : undefined) ?? (value as string | number | null | undefined);
};

type ActiveCell = { row: number; col: number };
export function ProjectAgentXlsxPreview({ url, editUrl }: { url: string; editUrl: string }) {
	const [sheets, setSheets] = useState<TableWorkbookSheet[]>([]), [activeId, setActiveId] = useState(""), [cell, setCell] = useState<ActiveCell>({ row: 0, col: 0 });
	const [error, setError] = useState(""), [opening, setOpening] = useState(false);
	useEffect(() => {
		const controller = new AbortController();
		void fetch(url, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error("Could not load workbook"); return response.arrayBuffer(); }).then((buffer) => runWorkbookTask({ type: "import", format: "xlsx", bytes: new Uint8Array(buffer) }, controller.signal)).then((result) => {
			if (result.type !== "import") throw new Error("Invalid workbook preview");
			setSheets(result.value.sheets); setActiveId(result.value.activeSheetId);
		}).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not preview workbook"); });
		return () => controller.abort();
	}, [url]);
	const active = sheets.find((sheet) => sheet.id === activeId) ?? sheets[0];
	const formula = useMemo(() => active?.data.formulas?.[cell.row]?.[cell.col] ?? "", [active, cell]);
	const openEditor = async () => {
		setOpening(true); setError("");
		try {
			const response = await fetch(editUrl, { method: "POST" }); const result = await response.json();
			if (!response.ok) throw new Error(result.error || "Could not open Spreadsheet editor");
			window.location.assign(result.editorUrl);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open Spreadsheet editor"); }
		finally { setOpening(false); }
	};
	return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" aria-label="Workbook preview">
		<div className="flex shrink-0 items-center justify-between gap-2"><div role="tablist" aria-label="Workbook sheets" className="flex min-w-0 gap-1 overflow-x-auto">{sheets.map((sheet) => <button key={sheet.id} role="tab" aria-selected={sheet.id === active?.id} onClick={() => { setActiveId(sheet.id); setCell({ row: 0, col: 0 }); }} className={`shrink-0 rounded px-2 py-1 text-xs ${sheet.id === active?.id ? "bg-slate-200 font-semibold dark:bg-slate-700" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>{sheet.name}</button>)}</div>
			<button type="button" onClick={openEditor} disabled={opening} className="shrink-0 rounded bg-orange-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{opening ? "Opening…" : "Open in Spreadsheet editor"}</button></div>
		{error && <p role="alert" className="text-xs text-red-600">{error}</p>}
		{active ? <>
			<div className="flex shrink-0 items-center gap-2 rounded border bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"><strong className="w-12 text-slate-500">{String.fromCharCode(65 + cell.col)}{cell.row + 1}</strong><span className="text-slate-400">fx</span><span className="min-w-0 flex-1 truncate">{formula || active.data.cells[cell.row]?.[cell.col] || ""}</span></div>
			<div className="min-h-0 flex-1 overflow-auto rounded border bg-white dark:border-slate-700 dark:bg-slate-950"><table className="border-collapse text-xs"><tbody>{active.data.cells.slice(0, 300).map((row, rowIndex) => <tr key={rowIndex}>{row.slice(0, 30).map((value, colIndex) => <td key={colIndex} title={active.data.formulas?.[rowIndex]?.[colIndex] ?? String(value)} onClick={() => setCell({ row: rowIndex, col: colIndex })} className={`min-w-20 max-w-64 border border-slate-200 px-2 py-1 dark:border-slate-800 ${rowIndex === 0 ? "bg-slate-100 font-semibold dark:bg-slate-800" : ""} ${cell.row === rowIndex && cell.col === colIndex ? "outline outline-2 outline-orange-500" : ""} ${typeof value === "number" ? "text-right tabular-nums" : ""}`}>{shown(active, rowIndex, colIndex, value)}</td>)}</tr>)}</tbody></table></div>
		</> : <p role="status" className="m-auto text-sm text-slate-500">Loading workbook preview…</p>}
	</div>;
}
