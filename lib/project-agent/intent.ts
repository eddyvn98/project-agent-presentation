const PROJECT_AGENT_PATTERNS = [
	/\btranslate\b/i, /\bdich\b/i, /dịch/i, /\bdocx?\b/i, /\bword\b/i, // vi-allow: Vietnamese prompt detection
	/\bexcel\b/i, /\bxlsx?\b/i, /\bpptx?\b/i, /\bpowerpoint\b/i, /\bpdf\b/i, /\breport\b/i, /báo cáo/i, // vi-allow: Vietnamese prompt detection
	/tai lieu/i, /tài liệu/i, /giữ nguyên format/i, /giu nguyen format/i, // vi-allow: Vietnamese prompt detection
	/xuất file/i, /xuat file/i, /tạo file/i, /tao file/i, // vi-allow: Vietnamese prompt detection
	/create (a )?(document|file)/i, /\banaly[sz]e\b/i, /\banalysis\b/i,
	/\b(research|investigate|deep dive|web search|look up|find sources)\b/i,
	/nghiên cứu/i, /nghien cuu/i, /tra cứu/i, /tra cuu/i, /tìm hiểu/i, /tim hieu/i, // vi-allow: Vietnamese prompt detection
	/\b(create|build|make|design)\b.{0,40}\b(website|web page|html|dashboard|chart|graph|diagram|visualization|presentation|slides|powerpoint|pptx?)\b/i,
	/(tạo|làm|thiết kế)\s.{0,24}(trang web|website|html|dashboard|biểu đồ|bieu do|sơ đồ|so do|bài thuyết trình|slide)/i, // vi-allow: Vietnamese prompt detection
	/\b(chart|graph|diagram|visualization|infographic|dashboard)\b/i,
	/biểu đồ/i, /bieu do/i, /sơ đồ/i, /so do/i, /trang web/i, // vi-allow: Vietnamese prompt detection
	/phân tích/i, /phan tich/i, /so sánh/i, /so sanh/i, /kiểm tra/i, // vi-allow: Vietnamese prompt detection
	/kiem tra/i, /\bcompliance\b/i,
];

const PROJECT_AGENT_FILE_OUTPUT_PATTERNS = [
	/(?:tạo|tao|xuất|xuat|soạn|soan|viết|viet|làm|lam)\s.{0,40}(?<![.\w])(?:file|docx|xlsx?|pptx?|pdf|html|csv|spreadsheet|presentation)\b/i, // vi-allow: Vietnamese prompt detection
	/\b(?:create|generate|write|export|produce)\b.{0,40}(?<![.\w])(?:file|document|docx?|xlsx?|pptx?|pdf|html|csv|spreadsheet|presentation)\b/i,
];

const PROJECT_AGENT_FILE_OUTPUT_DECLINES = [
	/(?:không|đừng)\s+(?:(?:cần|muốn)\s+)?(?:tạo|xuất|soạn|viết|làm)\s+(?:.{0,40}\b)?(?:file|docx|xlsx?|pptx?|pdf|html|csv|spreadsheet|presentation)\b/i, // vi-allow: Vietnamese prompt detection
	/\b(?:do not|don't|without)\s+(?:create|generate|write|export|produce|make)\s+(?:a\s+)?(?:separate\s+)?(?:file|document|docx?|xlsx?|pptx?|pdf|html|csv|spreadsheet|presentation)\b/i,
];

export function shouldUseProjectAgent(prompt: string): boolean {
	const text = prompt.trim();
	return Boolean(text) && PROJECT_AGENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function requiresProjectAgentFileOutput(rawPrompt: string): boolean {
	// A compacted-chat summary only recaps earlier work; it never requests a file.
	const prompt = rawPrompt.replace(/<chat_summary>[\s\S]*?<\/chat_summary>/g, "");
	const text = prompt.trim();
	if (PROJECT_AGENT_FILE_OUTPUT_DECLINES.some((pattern) => pattern.test(text))) return false;
	return Boolean(text) && PROJECT_AGENT_FILE_OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}
