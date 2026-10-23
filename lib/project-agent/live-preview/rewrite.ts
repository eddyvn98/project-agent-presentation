/** Pages from a sandbox server link to "/style.css"; behind the proxy that must become "<base>/style.css". Only HTML and CSS are rewritten. */
const MAX_REWRITE_BYTES = 5 * 1024 * 1024;

export function canRewrite(contentType: string | null, length: number): boolean {
	return length <= MAX_REWRITE_BYTES && /^(text\/html|text\/css)\b/i.test(contentType ?? "");
}

export function rewriteRootPaths(text: string, base: string): string {
	return text
		.replace(/(\b(?:src|href|action|poster|data-src|data-href)\s*=\s*["'])\/(?!\/)/gi, `$1${base}/`)
		.replace(/(\burl\(\s*["']?)\/(?!\/)/gi, `$1${base}/`)
		.replace(/(@import\s+["'])\/(?!\/)/gi, `$1${base}/`);
}

export function rewriteLocation(location: string, base: string): string {
	return location.startsWith("/") && !location.startsWith("//") ? `${base}${location}` : location;
}
