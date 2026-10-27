import { parseInteractiveModel, type InteractiveModel } from "./interactive-model";
import { safeProject3DViewerUrl } from "./scene3d-policy";
import { normalizeResponseFences, RESPONSE_BLOCK_TYPES } from "../../shared/project-agent/response-contract";
export { RESPONSE_BLOCK_TYPES };
// The agent can answer with fenced ```ong-ui JSON blocks; the chat renders them as cards, charts and diagrams
// instead of plain text. Parsing is defensive: a malformed block never breaks the answer, it just falls back.

export type RichTone = "neutral" | "info" | "success" | "warning" | "danger";
export type RichSceneColor = "blue" | "orange" | "yellow" | "green" | "red" | "purple" | "slate" | "white" | "black";
export type RichSceneElement =
	| { type: "circle"; x: number; y: number; r: number; fill: RichSceneColor; label?: string }
	| { type: "ellipse"; x: number; y: number; rx: number; ry: number; stroke: RichSceneColor; dashed?: boolean; label?: string }
	| { type: "rect"; x: number; y: number; width: number; height: number; fill: RichSceneColor; label?: string }
	| { type: "line"; x1: number; y1: number; x2: number; y2: number; stroke: RichSceneColor; dashed?: boolean; arrow?: boolean }
	| { type: "text"; x: number; y: number; text: string; fill: RichSceneColor; size: number; anchor: "start" | "middle" | "end" };
export type RichScene = { description: string; elements: RichSceneElement[] };
export type RichUiBlock =
	| { type: "kpis"; items: Array<{ label: string; value: string; hint?: string; tone: RichTone }> }
	| { type: "chart"; kind: "bar" | "line" | "pie" | "stacked"; title?: string; caption?: string; unit?: string; categories: string[]; series: Array<{ name: string; values: number[] }> }
	| { type: "progress"; title: string; value: number; max: number; label?: string; note?: string; tone: RichTone }
	| { type: "stack"; title: string; total?: string; items: Array<{ label: string; value: number; display?: string }> }
	| { type: "options"; items: Array<{ title: string; summary?: string; price?: string; badge?: string; tone: RichTone; points: string[]; recommended: boolean }> }
	| { type: "callout"; tone: RichTone; title?: string; text: string }
	| { type: "steps"; items: Array<{ title: string; text?: string; meta?: string }> }
	| { type: "explorer"; title: string; intro?: string; previousLabel?: string; nextLabel?: string; controlLabel?: string; steps: Array<{ label: string; title: string; text: string; visual?: string; scene?: RichScene }> }
	| { type: "mermaid"; title?: string; caption?: string; code: string }
	| { type: "scene3d"; title: string; caption?: string; viewerUrl: string }
	| { type: "ask"; title?: string; questions: Array<{ question: string; options: string[]; multi: boolean }> }
	| { type: "form"; title?: string; intro?: string; submit?: string; fields: Array<{ label: string; hint?: string; kind: "choice" | "multi" | "text"; options: string[]; placeholder?: string }> }
	| InteractiveModel
	| { type: "quiz"; title?: string; question: string; options: string[]; answerIndex: number; explanation?: string }
	| { type: "followups"; items: Array<{ label: string; prompt: string }> };

const MAX_ITEMS = 12;
const MAX_POINTS = 8;
const TONES: RichTone[] = ["neutral", "info", "success", "warning", "danger"];

const text = (value: unknown, max = 300): string => (typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, max) : "");
const tone = (value: unknown): RichTone => (TONES.includes(value as RichTone) ? (value as RichTone) : "neutral");
const list = (value: unknown, max = MAX_ITEMS): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);
const num = (value: unknown): number | null => {
	const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^\d.+-]/g, "")) : NaN;
	return Number.isFinite(parsed) ? parsed : null;
};
const decimal = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : null;
const sceneColor = (value: unknown): RichSceneColor => ["blue", "orange", "yellow", "green", "red", "purple", "slate", "white", "black"].includes(String(value)) ? value as RichSceneColor : "slate";
const bounded = (value: unknown, min: number, max: number): number | null => {
	const parsed = decimal(value);
	return parsed === null ? null : Math.max(min, Math.min(max, parsed));
};
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

function parseScene(value: unknown): RichScene | undefined {
	const raw = record(value);
	const elements: RichSceneElement[] = [];
	for (const source of list(raw.elements, 24).map(record)) {
		const label = text(source.label, 50) || undefined;
		const x = bounded(source.x, 0, 100);
		const y = bounded(source.y, 0, 60);
		if (source.type === "circle" && x !== null && y !== null) {
			const r = bounded(source.r, 0.1, 30);
			if (r !== null) elements.push({ type: "circle", x, y, r, fill: sceneColor(source.fill), label });
		} else if (source.type === "ellipse" && x !== null && y !== null) {
			const rx = bounded(source.rx, 0.1, 50); const ry = bounded(source.ry, 0.1, 30);
			if (rx !== null && ry !== null) elements.push({ type: "ellipse", x, y, rx, ry, stroke: sceneColor(source.stroke), dashed: source.dashed === true, label });
		} else if (source.type === "rect" && x !== null && y !== null) {
			const width = bounded(source.width, 0.1, 100); const height = bounded(source.height, 0.1, 60);
			if (width !== null && height !== null) elements.push({ type: "rect", x, y, width, height, fill: sceneColor(source.fill), label });
		} else if (source.type === "line") {
			const x1 = bounded(source.x1, 0, 100); const y1 = bounded(source.y1, 0, 60); const x2 = bounded(source.x2, 0, 100); const y2 = bounded(source.y2, 0, 60);
			if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) elements.push({ type: "line", x1, y1, x2, y2, stroke: sceneColor(source.stroke), dashed: source.dashed === true, arrow: source.arrow === true });
		} else if (source.type === "text" && x !== null && y !== null) {
			const content = text(source.text, 60); const size = bounded(source.size, 2, 9);
			if (content && size !== null) elements.push({ type: "text", x, y, text: content, fill: sceneColor(source.fill), size, anchor: source.anchor === "start" || source.anchor === "end" ? source.anchor : "middle" });
		}
	}
	const description = text(raw.description, 160);
	return description && elements.length ? { description, elements } : undefined;
}

export function parseRichUiBlock(source: string): RichUiBlock | null {
	if (source.length > 40000) return null;
	let raw: Record<string, unknown>;
	try { raw = record(JSON.parse(source)); } catch { return null; }
	switch (raw.type) {
		case "kpis": {
			const items = list(raw.items).map(record).map((item) => ({ label: text(item.label, 60), value: text(item.value, 40), hint: text(item.hint, 80) || undefined, tone: tone(item.tone) })).filter((item) => item.label && item.value);
			return items.length ? { type: "kpis", items } : null;
		}
		case "chart": {
			const kind = raw.kind === "line" || raw.kind === "pie" || raw.kind === "stacked" ? raw.kind : "bar";
			if (!Array.isArray(raw.categories) || raw.categories.length > 40 || !Array.isArray(raw.series) || raw.series.length > 6) return null;
			const categories = raw.categories.map((item) => text(item, 40));
			const series = raw.series.map(record).map((item) => ({ name: text(item.name, 40) || "Series", values: Array.isArray(item.values) ? item.values.map(decimal) : [] }));
			if (!categories.length || categories.some((item) => !item) || !series.length || series.some((item) => item.values.length !== categories.length || item.values.some((value) => value === null))) return null;
            // Recharts uses the label as the data key: duplicates overwrite observations.
            const keys = series.map((item) => item.name.toLocaleLowerCase());
            if (new Set(keys).size !== keys.length) return null;
            // The renderer draws only the first pie series. Reject rather than silently drop data.
            if (kind === "pie" && (series.length !== 1 ||
                series[0].values.some((value) => value !== null && value < 0) ||
                series[0].values.every((value) => value === 0))) return null;
			const validSeries = series.map((item) => ({ ...item, values: item.values as number[] }));
			return { type: "chart", kind, title: text(raw.title, 120) || undefined, caption: text(raw.caption, 240) || undefined, unit: text(raw.unit, 20) || undefined, categories, series: validSeries };
		}
		case "progress": {
			const value = num(raw.value);
			const max = num(raw.max) ?? 100;
			if (value === null || max <= 0) return null;
			return { type: "progress", title: text(raw.title, 100) || "Progress", value, max, label: text(raw.label, 60) || undefined, note: text(raw.note, 240) || undefined, tone: tone(raw.tone) };
		}
		case "stack": {
			const items = list(raw.items).map(record).map((item) => ({ label: text(item.label, 60), value: num(item.value) ?? 0, display: text(item.display, 40) || undefined })).filter((item) => item.label && item.value > 0);
			return items.length ? { type: "stack", title: text(raw.title, 100) || "Breakdown", total: text(raw.total, 40) || undefined, items } : null;
		}
		case "options": {
			const items = list(raw.items, 4).map(record).map((item) => ({
				title: text(item.title, 80), summary: text(item.summary, 200) || undefined, price: text(item.price, 40) || undefined, badge: text(item.badge, 40) || undefined,
				tone: tone(item.tone), points: list(item.points, MAX_POINTS).map((point) => text(point, 140)).filter(Boolean), recommended: item.recommended === true,
			})).filter((item) => item.title);
			return items.length ? { type: "options", items } : null;
		}
		case "callout": {
			const body = text(raw.text, 600);
			return body ? { type: "callout", tone: tone(raw.tone), title: text(raw.title, 100) || undefined, text: body } : null;
		}
		case "steps": {
			const items = list(raw.items).map(record).map((item) => ({ title: text(item.title, 100), text: text(item.text, 240) || undefined, meta: text(item.meta, 40) || undefined })).filter((item) => item.title);
			return items.length ? { type: "steps", items } : null;
		}
		case "explorer": {
			const steps = list(raw.steps).map(record).map((item) => ({
				label: text(item.label, 60), title: text(item.title, 100), text: text(item.text, 360), visual: text(item.visual, 100) || undefined, scene: parseScene(item.scene),
			})).filter((item) => item.label && item.title && item.text);
			const title = text(raw.title, 120);
			if (!title || steps.length < 2) return null;
			return { type: "explorer", title, intro: text(raw.intro, 240) || undefined, previousLabel: text(raw.previousLabel, 32) || undefined, nextLabel: text(raw.nextLabel, 32) || undefined, controlLabel: text(raw.controlLabel, 60) || undefined, steps };
		}
		case "mermaid": {
			const code = typeof raw.code === "string" ? raw.code.trim().slice(0, 4000) : "";
			return code ? { type: "mermaid", title: text(raw.title, 120) || undefined, caption: text(raw.caption, 240) || undefined, code } : null;
		}
		case "scene3d": {
			const viewerUrl = safeProject3DViewerUrl(raw.viewerUrl);
			const title = text(raw.title, 120);
			return title && viewerUrl ? { type: "scene3d", title,
				caption: text(raw.caption, 240) || undefined, viewerUrl } : null;
		}
		case "ask": {
			const questions = list(raw.questions, 4).map(record).map((item) => ({
				question: text(item.question, 200), multi: item.multi === true,
				options: list(item.options, 6).map((option) => text(option, 100)).filter(Boolean),
			})).filter((item) => item.question);
			return questions.length ? { type: "ask", title: text(raw.title, 100) || undefined, questions } : null;
		}
		case "form": {
			const fields = list(raw.fields, 12).map(record).map((item) => {
				const options = list(item.options, 6).map((option) => text(option, 100)).filter(Boolean);
				const kind = options.length && (item.kind === "multi" || item.kind === "choice") ? item.kind : options.length ? "choice" : "text";
				return { label: text(item.label, 120), hint: text(item.hint, 200) || undefined, kind: kind as "choice" | "multi" | "text", options: kind === "text" ? [] : options, placeholder: text(item.placeholder, 80) || undefined };
			}).filter((item) => item.label);
			return fields.length ? { type: "form", title: text(raw.title, 100) || undefined, intro: text(raw.intro, 300) || undefined, submit: text(raw.submit, 40) || undefined, fields } : null;
		}
		case "interactive":
			return parseInteractiveModel(raw);
		case "quiz": {
			const question = text(raw.question, 250);
			const options = Array.isArray(raw.options) ? raw.options.slice(0, 5).map((option) => text(option, 100)) : [];
			const index = raw.answerIndex;
			if (!question || options.length < 2 || options.some((option) => !option) || typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= options.length) return null;
			return { type: "quiz", title: text(raw.title, 100) || undefined, question, options, answerIndex: index, explanation: text(raw.explanation, 300) || undefined };
		}
		case "followups": {
			const items = list(raw.items, 4).map(record).map((item) => ({ label: text(item.label, 100), prompt: text(item.prompt, 400) || text(item.label, 100) })).filter((item) => item.label);
			return items.length ? { type: "followups", items } : null;
		}
		default:
			return null;
	}
}

/** Models sometimes drop the backticks and write "ong-ui" followed by the JSON line; put the fence back so it renders as a block. */
export function repairOngUiFences(markdown: string): string {
	return normalizeResponseFences(markdown.replace(/(^|\n)[ \t]*(?:ong-ui|ong_ui)[ \t]*\n?[ \t]*(\{[^\n]*\})[ \t]*(?=\n|$)/g, (_match, lead: string, json: string) => `${lead}\`\`\`ong-ui\n${json}\n\`\`\``), "host");
}

export type RichAskBlock = Extract<RichUiBlock, { type: "ask" }>;

export function extractAskBlock(markdown: string): RichAskBlock | null {
	let found: RichAskBlock | null = null;
	for (const [, source] of repairOngUiFences(markdown).matchAll(/```ong-ui[^\n]*\n([\s\S]*?)```/g)) {
		const block = parseRichUiBlock(source);
		if (block?.type === "ask") found = block;
	}
	return found;
}

export const RICH_UI_INSTRUCTIONS = [
	"RICH ANSWER BLOCKS: when a visual explains the answer better than prose, put fenced ```ong-ui blocks (one JSON object each, valid JSON, real values only, never invent numbers) between normal Markdown paragraphs. The chat renders them as cards, charts, safe interactive models, knowledge checks, explorers and diagrams. Types:",
	'kpis: {"type":"kpis","items":[{"label":"Budget","value":"3 billion VND","hint":"incl. contingency","tone":"success"}]} (2 to 4 items)',
	'chart: {"type":"chart","kind":"bar|line|pie|stacked","title":"Cost by option","unit":"billion","categories":["A","B"],"series":[{"name":"Total","values":[2.6,3.0]}],"caption":"..."} (each series must have one real numeric value per category; omit the chart if data is incomplete)',
	'interactive: {"type":"interactive","title":"Explore the estimate","parameters":[{"id":"units","label":"Units","min":1,"max":20,"step":1,"initial":5}],"outputs":[{"label":"Total","expression":{"op":"mul","args":[{"var":"units"},125]}}]} (safe sliders only when changing assumptions teaches something; expressions are bounded math data, never code)',
	'quiz: {"type":"quiz","title":"Check your understanding","question":"What is 2 + 2?","options":["3","4","5"],"answerIndex":1,"explanation":"Two plus two is four."} (optional; use only when the correct answer is known)',
	'stack: {"type":"stack","title":"Budget breakdown","total":"2.96 billion","items":[{"label":"Structure","value":1240,"display":"1,240 million"}]}',
	'progress: {"type":"progress","title":"Budget check","value":2960,"max":3000,"label":"40 million left","note":"...","tone":"warning"}',
	'options: {"type":"options","items":[{"title":"Option B","summary":"...","price":"2.96 billion","badge":"Recommended","recommended":true,"tone":"success","points":["..."]}]} (2 to 4 options)',
	'callout: {"type":"callout","tone":"info|success|warning|danger","title":"Assumption","text":"..."}',
	'steps: {"type":"steps","items":[{"title":"Foundation","text":"...","meta":"Month 1"}]}',
	'explorer: {"type":"explorer","title":"How it changes","intro":"...","previousLabel":"Previous","nextLabel":"Next","controlLabel":"Step","steps":[{"label":"Step 1","title":"Starting state","text":"What happens and why.","scene":{"description":"A simple labeled scene","elements":[{"type":"circle","x":50,"y":30,"r":10,"fill":"blue","label":"Main object"},{"type":"line","x1":15,"y1":30,"x2":35,"y2":30,"stroke":"orange","arrow":true},{"type":"text","x":50,"y":55,"text":"Short note","fill":"slate","size":5,"anchor":"middle"}]}},{"label":"Step 2","title":"Next state","text":"How the state changes and what to notice."}]} (2 to 12 ordered states; the user can move a slider or use Previous/Next, and each selection updates its explanation and optional safe vector scene. Scene elements are data only: circle, ellipse, rectangle, line or text; coordinates use a 100 by 60 canvas. Never put HTML, SVG markup or scripts in scene fields. Use only when exploring states adds understanding; do not repeat a separate table or diagram with the same information.)',
	'mermaid: {"type":"mermaid","title":"Process","code":"flowchart LR\\n A-->B"} (flowcharts, sequence, gantt, org charts)',
	'ask: {"type":"ask","title":"To tailor this","questions":[{"question":"What is the total budget?","options":["Under 2 billion","2 to 3 billion","Over 3 billion"],"multi":false}]} (1 to 4 questions, 2 to 5 short concrete options each; the user taps options and the chat sends the answers)',
	'form: {"type":"form","title":"Shop survey","intro":"Rough numbers are fine","fields":[{"label":"Floor area","hint":"m2, rented or owned","kind":"text","placeholder":"e.g. 40 m2, owned"},{"label":"Biggest problem","kind":"choice","options":["Few customers","Small baskets","Low margin","Too much stock"]},{"label":"Channels","kind":"multi","options":["Zalo","Facebook","Shopee"]}]} (a fillable survey card in the chat for 5 to 10 questions; kind text = free typing, choice = tap one, multi = tap several; every field also has an "Other" box; the user fills what they can and sends once)',
	'followups: {"type":"followups","items":[{"label":"Go deeper: foundation options","prompt":"Compare foundation options in detail"}]} (exactly 3 items)',
	'writing: a fenced ```ong-doc block, first line "title: Weekly minutes", then the finished text as Markdown (headings, lists, tables). Use it when the user asks you to draft something to copy or send: a letter, email, memo, minutes, proposal, policy, speech, post. Put one short sentence before it and nothing inside it except the text itself; if the text contains code fences, open and close the block with four backticks. Do not use it for ordinary answers or explanations.',
	'Presentation: keep prose complete if a visual is absent or fails. Start with a short answer, use sections only when useful, and keep each image next to its explanation. Use concise Markdown image alt text as the caption; set the optional image title to "inline" for a small supporting illustration or "reference" for a larger figure. Avoid image walls, duplicate visuals, invented data, and unsourced attributions. Use $...$ for inline math and $$ on separate lines for display math; escape literal currency dollar signs.',
	"Structure long answers with Markdown headings (## Section) and short paragraphs. Use blocks sparingly: a short answer needs none. For a linear explanation, prefer a readable ordered list; choose an explorer when stepping through states or changing a value teaches something, and avoid wide flowcharts that hide most steps beyond horizontal scrolling. Tables stay as normal Markdown tables.",
	"ASKING BACK: before doing substantial work, ask when the request is broad, ambiguous, missing key numbers or constraints (budget, location, audience, scale, deadline), or high-stakes (money, legal, safety, a large deliverable). Ask in ONE ask block with 1 to 4 questions (or, when you need 5 to 10 facts such as an intake for a business, project or brief, ONE form block with those fields, put the most decisive first and let the user skip any), each with concrete options, after at most two sentences of text; if useful, say what you would assume otherwise. Do not run the full task until the user answers. Do not ask for simple factual requests, when the user says to just do it or 'whatever you prefer', or twice for the same information; then proceed and state your assumptions in a callout.",
	"CLARIFY, EXPAND, DEEPEN: after a substantive answer, finish with one followups block of exactly 3 items: one that goes deeper on the most important point, one that broadens to a related area or alternative, and one that checks or challenges the result (risks, sources, edge cases). Write each label in the user's language as a short action.",
].join("\n");
