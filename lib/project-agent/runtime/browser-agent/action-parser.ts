export type BrowserOp = "open" | "back" | "snapshot" | "click" | "type" | "press" | "select" | "scroll" | "screenshot" | "extract" | "download" | "console" | "network" | "wait" | "close" | "upload" | "drag" | "tabs" | "new_tab" | "switch_tab" | "close_tab" | "visual_observe" | "visual_click" | "visual_type" | "inspect_scene";
export interface BrowserAction { action: "browser"; op: BrowserOp; /** wait: seconds (1-30) to wait for `find` text to appear, or for the network to go quiet when no text is given. */ seconds?: number; url?: string; ref?: string; text?: string; key?: string; value?: string; direction?: "up" | "down"; submit?: boolean; find?: string; offset?: number; tabIndex?: number; targetRef?: string; path?: string; frame?: number; x?: number; y?: number; note?: string }

export function parseBrowserAction(raw: Record<string, unknown>): BrowserAction | { error: string } {
	const op = String(raw.op ?? "") as BrowserOp;
	if (!["open", "back", "snapshot", "click", "type", "press", "select", "scroll", "screenshot", "extract", "download", "console", "network", "wait", "close", "upload", "drag", "tabs", "new_tab", "switch_tab", "close_tab", "visual_observe", "visual_click", "visual_type", "inspect_scene"].includes(op)) return { error: "browser needs a supported op" };
	const action: BrowserAction = {
		action: "browser", op,
		url: typeof raw.url === "string" ? raw.url.trim() : undefined,
		ref: typeof raw.ref === "string" ? raw.ref.trim() : undefined,
		text: typeof raw.text === "string" ? raw.text : undefined,
		key: typeof raw.key === "string" ? raw.key : undefined,
		value: typeof raw.value === "string" ? raw.value : undefined,
		direction: raw.direction === "up" ? "up" : raw.direction === "down" ? "down" : undefined,
		submit: raw.submit === true,
		find: typeof raw.find === "string" ? raw.find.slice(0, 160) : undefined,
		offset: typeof raw.offset === "number" && raw.offset >= 0 ? Math.floor(raw.offset) : undefined,
		tabIndex: typeof raw.tabIndex === "number" && Number.isSafeInteger(raw.tabIndex) && raw.tabIndex >= 0 && raw.tabIndex <= 3 ? raw.tabIndex : undefined,
		targetRef: typeof raw.targetRef === "string" ? raw.targetRef : undefined,
		path: typeof raw.path === "string" ? raw.path.trim() : undefined,
		seconds: typeof raw.seconds === "number" && raw.seconds > 0 ? Math.min(Math.round(raw.seconds), 30) : undefined,
		frame: typeof raw.frame === "number" && Number.isSafeInteger(raw.frame) && raw.frame > 0 ? raw.frame : undefined,
		x: typeof raw.x === "number" && Number.isFinite(raw.x) && raw.x >= 0 && raw.x <= 1 ? raw.x : undefined,
		y: typeof raw.y === "number" && Number.isFinite(raw.y) && raw.y >= 0 && raw.y <= 1 ? raw.y : undefined,
		note: typeof raw.note === "string" ? raw.note.slice(0, 200) : undefined,
	};
	if (op === "visual_click" && (action.frame === undefined || action.x === undefined || action.y === undefined)) return { error: "visual_click needs a current frame and normalized x/y (0..1)" };
	if (op === "visual_type" && (!action.text || action.text.length > 1000 || /[\x00-\x08\x0b-\x1f]/.test(action.text))) return { error: "visual_type needs 1-1000 safe text characters" };
	if (op === "open" && !action.url) return { error: "browser open needs a URL" };
	if (["click", "type", "select", "download"].includes(op) && !action.ref && !(op === "download" && action.url)) return { error: `browser ${op} needs a ref` };
	if (op === "type" && action.text === undefined) return { error: "browser type needs text" };
	if (op === "press" && !action.key) return { error: "browser press needs a key" };
	if (op === "select" && action.value === undefined) return { error: "browser select needs a value" };
	if (op === "upload" && (!action.ref || !action.path || !action.path.startsWith("/work/inputs/"))) return { error: "browser upload needs a current ref and an /work/inputs/ file" };
	if (op === "drag" && (!action.ref || !action.targetRef)) return { error: "browser drag needs source and target refs" };
	if ((op === "switch_tab" || op === "close_tab") && action.tabIndex === undefined) return { error: "browser tab operation needs tabIndex 0-3" };
	return action;
}
