"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DesignSpec, DesignFurniture } from "@/lib/project-agent/runtime/design-model";
import { parseDesignSpec } from "@/lib/project-agent/runtime/design-model";
import { createDesignEditorPrompt, moveDesignFurniture, updateDesignFurniture } from "@/lib/project-agent/design-editor";

type Props = {
  sourceUrl: string;
  sourceName: string;
  onEdit: (prompt: string) => void;
  onClose: () => void;
};

const sourcePath = /^\/api\/projects\/[^/]+\/agent\/tasks\/[^/]+\/files\/[^/]+$/;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const editableIndex = (i: number | null, items: DesignFurniture[]) =>
  i !== null && i >= 0 && i < items.length ? i : null;

function FloorOpening({ opening, room }: { opening: DesignSpec["openings"][number]; room: DesignSpec["room"] }) {
  const { width: w, depth: d, wallThickness: t } = room;
  const o = opening.offset, span = opening.width;
  const position = opening.wall === "north" ? { x: o, y: 0, width: span, height: t } :
    opening.wall === "south" ? { x: o, y: d - t, width: span, height: t } :
    opening.wall === "east" ? { x: w - t, y: d - o - span, width: t, height: span } :
    { x: 0, y: d - o - span, width: t, height: span };
  return <rect {...position} fill={opening.kind === "door" ? "#f3efe5" : "#38bdf8"}
    stroke={opening.kind === "door" ? "#b45309" : "#0284c7"} strokeWidth={12} />;
}

export function ProjectAgentDesignEditor({ sourceUrl, sourceName, onEdit, onClose }: Props) {
  const [original, setOriginal] = useState<DesignSpec | null>(null);
  const [draft, setDraft] = useState<DesignSpec | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [problem, setProblem] = useState("");
  const [loading, setLoading] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: number; index: number; deltaX: number; deltaY: number } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const target = new URL(sourceUrl, window.location.href);
        if (target.origin !== window.location.origin || !sourcePath.test(target.pathname))
          throw new Error("The design source must use an authenticated Project task-file URL.");
        const response = await fetch(target.href, { credentials: "same-origin", cache: "no-store", signal: ctrl.signal });
        if (!response.ok) throw new Error("Unable to open the saved design source.");
        if (Number(response.headers.get("content-length") || 0) > 100_000)
          throw new Error("The saved design exceeds the 100 KB edit limit.");
        const raw = await response.text();
        if (raw.length > 100_000) throw new Error("The saved design exceeds the 100 KB edit limit.");
        const parsed = parseDesignSpec(JSON.parse(raw) as unknown);
        if ("error" in parsed) throw new Error(parsed.error);
        if (ctrl.signal.aborted) return;
        setOriginal(parsed.spec);
        setDraft(parsed.spec);
        setSelected(parsed.spec.furniture.length ? 0 : null);
        setProblem("");
      } catch (error) {
        if (!ctrl.signal.aborted) setProblem(error instanceof Error ? error.message : "Cannot load design.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => ctrl.abort();
  }, [sourceUrl]);

  const selectedIndex = draft ? editableIndex(selected, draft.furniture) : null;
  const active = selectedIndex !== null && draft ? draft.furniture[selectedIndex] : null;
  const result = useMemo(() => original && draft ?
    createDesignEditorPrompt(sourceName, original, draft) : null, [sourceName, original, draft]);
  const hasChanges = result !== null && "edits" in result;

  function useResult(next: { spec: DesignSpec } | { error: string }) {
    if ("error" in next) { setProblem(next.error); return; }
    setDraft(next.spec);
    setProblem("");
  }
  function shift(dx: number, dy: number) {
    if (draft && selectedIndex !== null) {
      const item = draft.furniture[selectedIndex];
      useResult(moveDesignFurniture(draft, selectedIndex, item.x + dx, item.y + dy));
    }
  }
  function resize(field: "width" | "depth", delta: number) {
    if (draft && active && selectedIndex !== null)
      useResult(updateDesignFurniture(draft, selectedIndex, { [field]: active[field] + delta }));
  }
  function point(event: ReactPointerEvent<SVGSVGElement | SVGGElement>) {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix || !draft) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: draft.room.depth - p.y };
  }
  function pointerDown(event: ReactPointerEvent<SVGGElement>, index: number) {
    if (!draft || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected(index);
    const p = point(event);
    if (!p) return;
    drag.current = { id: event.pointerId, index, deltaX: draft.furniture[index].x - p.x,
      deltaY: draft.furniture[index].y - p.y };
    svgRef.current?.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!draft || !current || event.pointerId !== current.id) return;
    const p = point(event);
    if (p) useResult(moveDesignFurniture(draft, current.index,
      p.x + current.deltaX, p.y + current.deltaY));
  }
  function pointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag.current || event.pointerId !== drag.current.id) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyMove(event: React.KeyboardEvent<SVGGElement>, index: number) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(index); return; }
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-100, 0], ArrowRight: [100, 0], ArrowUp: [0, 100], ArrowDown: [0, -100],
    };
    if (!offsets[event.key] || !draft) return;
    event.preventDefault();
    setSelected(index);
    const item = draft.furniture[index], [x, y] = offsets[event.key];
    useResult(moveDesignFurniture(draft, index, item.x + x, item.y + y));
  }
  function apply() {
    if (result && "prompt" in result) {
      onEdit(result.prompt);
      onClose();
    } else if (result && "error" in result) setProblem(result.error);
  }

  return <section className="border-t border-slate-200 p-3 dark:border-slate-700"
    aria-label="Editable 2D interior floor plan">
    <div className="mb-3 flex items-center justify-between gap-2">
      <div><h4 className="text-sm font-semibold">Edit 2D floor plan</h4>
        <p className="text-xs text-slate-500">Drag furniture · 25 mm grid · new revision via Agent</p></div>
      <button type="button" onClick={onClose} className="min-h-11 rounded-lg border px-3 text-sm">Close</button>
    </div>
    {loading && <p role="status" className="p-4 text-sm">Loading semantic design…</p>}
    {!loading && !draft && <p role="alert" className="p-4 text-sm text-red-700">{problem}</p>}
    {draft && <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0 overflow-hidden rounded-xl border bg-slate-50">
        <svg ref={svgRef} viewBox={"0 0 " + draft.room.width + " " + draft.room.depth}
          role="img" aria-label="Editable plan canvas; select furniture and drag to move"
          onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
          className="h-[min(55dvh,520px)] min-h-[260px] w-full select-none"
          style={{ touchAction: "none" }}>
          <rect width={draft.room.width} height={draft.room.depth} fill="#f3efe5"/>
          {(() => {
            const { width: w, depth: d, wallThickness: t } = draft.room;
            return <g fill="#64748b"><rect x={0} y={0} width={w} height={t}/>
              <rect x={0} y={d-t} width={w} height={t}/><rect x={0} y={0} width={t} height={d}/>
              <rect x={w-t} y={0} width={t} height={d}/></g>;
          })()}
          {draft.openings.map((o, i) => <FloorOpening key={i} opening={o} room={draft.room}/>)}
          {draft.furniture.map((item, index) => <g key={index} role="button" tabIndex={0}
            aria-label={item.label + " furniture"}
            onPointerDown={(e) => pointerDown(e, index)} onKeyDown={(e) => keyMove(e, index)}
            transform={"translate(" + item.x + " " + (draft.room.depth - item.y) + ") rotate(" + (-item.rotation) + ")"}
            className="cursor-move outline-none">
            <rect x={-item.width/2} y={-item.depth/2} width={item.width} height={item.depth}
              rx={25} fill={index === selectedIndex ? "#0ea5e9" : "#93c5fd"} fillOpacity={0.65}
              stroke={index === selectedIndex ? "#075985" : "#1e40af"} strokeWidth={index === selectedIndex ? 38 : 14}/>
            <text textAnchor="middle" dominantBaseline="central" fill="#0f172a"
              fontSize={Math.max(95, Math.min(230, draft.room.width/45))}
              fontWeight="600" pointerEvents="none">{item.label.slice(0,18)}</text>
          </g>)}
        </svg>
      </div>
      <div className="space-y-3 rounded-xl border p-3 text-sm dark:border-slate-700">
        {active ? <>
          <strong className="block truncate">{active.label}</strong>
          <p className="text-xs text-slate-500">Position: {fmt(active.x)}, {fmt(active.y)} mm</p>
          <div className="grid grid-cols-3 gap-1">
            <span/>
            <button type="button" onClick={() => shift(0,100)} aria-label="Move up" className="min-h-11 rounded-lg border">↑</button>
            <span/>
            <button type="button" onClick={() => shift(-100,0)} aria-label="Move left" className="min-h-11 rounded-lg border">←</button>
            <span className="self-center text-center text-xs">100 mm</span>
            <button type="button" onClick={() => shift(100,0)} aria-label="Move right" className="min-h-11 rounded-lg border">→</button>
            <span/>
            <button type="button" onClick={() => shift(0,-100)} aria-label="Move down" className="min-h-11 rounded-lg border">↓</button>
          </div>
          {(["width", "depth"] as const).map((field) => <div key={field}>
            <p className="mb-1 capitalize">{field}: {fmt(active[field])} mm</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => resize(field,-100)} aria-label={field + " minus 100 mm"}
                className="min-h-11 rounded-lg border">−100</button>
              <button type="button" onClick={() => resize(field,100)} aria-label={field + " plus 100 mm"}
                className="min-h-11 rounded-lg border">+100</button>
            </div>
          </div>)}
        </> : <p className="text-slate-500">No furniture in this design.</p>}
        <p className="text-xs text-slate-500">Walls and openings are locked. Each edit must fit within the room.</p>
      </div>
    </div>}
    {problem && draft && <p role="alert" className="mt-2 text-xs text-amber-700">{problem}</p>}
    {draft && <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={() => { setDraft(original); setProblem(""); }}
        disabled={!hasChanges} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-40">Reset draft</button>
      <button type="button" onClick={apply} disabled={!hasChanges}
        className="min-h-11 flex-1 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">
        Prepare new revision in chat
      </button>
    </div>}
    <p className="mt-2 text-xs text-slate-500">No files change until you review and send the prepared request in chat.</p>
  </section>;
}
