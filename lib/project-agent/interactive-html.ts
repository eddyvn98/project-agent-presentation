/** Files the agent names `*.web.html` are interactive pages (presentations, mini sites); every other HTML file stays a static, script-free preview. */
export const INTERACTIVE_HTML_NAME = /\.web\.html?$/i;
export const isInteractiveHtmlName = (name: string) => INTERACTIVE_HTML_NAME.test(name);

const CDNS = "https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com";

/**
 * The framed page gets an opaque origin (sandbox without allow-same-origin), so it cannot read cookies, storage or the app's
 * APIs, and connect-src stays closed so it cannot send anything out. Scripts and styles may come from public library CDNs.
 */
export const INTERACTIVE_HTML_CSP = [
	"sandbox allow-scripts allow-popups allow-presentation allow-modals",
	"default-src 'none'",
	`script-src 'unsafe-inline' 'unsafe-eval' ${CDNS}`,
	`style-src 'unsafe-inline' ${CDNS} https://fonts.googleapis.com`,
	`font-src data: ${CDNS} https://fonts.gstatic.com`,
	"img-src data: blob:",
	"media-src data: blob:",
	"worker-src blob:",
	"connect-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
].join("; ");

export const STATIC_HTML_CSP = "sandbox; default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'";
