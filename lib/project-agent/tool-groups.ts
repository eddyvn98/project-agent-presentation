export interface ProjectToolGroup { id: string; label: string; description: string; tools: string }

/** Tool groups the project owner can switch off per project (applied as an instruction to the Agent). */
export const PROJECT_TOOL_GROUPS: ProjectToolGroup[] = [
	{ id: "web", label: "Web research", description: "Search the web and read web pages", tools: "DuckDuckGo search and WebScraper" },
	{ id: "code", label: "Code and data analysis", description: "Run code to calculate and analyse data", tools: "Code Interpreter and the sandbox shell" },
	{ id: "charts", label: "Charts", description: "Draw charts and graphs", tools: "ECharts to Image" },
	{ id: "office", label: "Office and PDF files", description: "Create Word, Excel, PowerPoint, PDF and HTML files", tools: "Markdown Exporter, Excel Tools and DOC" },
];

export function formatDisabledToolGroups(ids: string[] | undefined): string {
	const off = PROJECT_TOOL_GROUPS.filter((group) => ids?.includes(group.id));
	if (off.length === 0) return "";
	return `Tool restrictions for this project (set by the project owner): do NOT use ${off.map((group) => `${group.label} (${group.tools})`).join("; ")}. If the task needs a restricted capability, say so briefly instead of trying it.`;
}
