import { assertPublicHttpUrl } from "../web-security";

export const CAPTCHA_PATTERN = /cloudflare.{0,40}challenge|recaptcha|hcaptcha|verify you are human|xác minh bảo mật/i; // vi-allow
export const IRREVERSIBLE_PATTERN = /buy|pay|order|checkout|book|send|post|publish|upload|attach|delete|sign up|subscribe|purchase|submit|mua|thanh toán|đặt hàng|đặt lịch|tải lên|đính kèm|gửi|đăng|xóa|đăng ký|ký tên|gửi biểu mẫu/i; // vi-allow
export const SENSITIVE_PATTERN = /password|credit.?card|card number|cvv|cvc|bank account|routing number|social security|government id|mật khẩu|thẻ tín dụng|số thẻ|tài khoản ngân hàng|căn cước/i; // vi-allow

export const isCaptchaPage = (text: string): boolean => CAPTCHA_PATTERN.test(text);
export const isSensitiveField = (description: string): boolean => SENSITIVE_PATTERN.test(description);
export const requiresUserConfirmation = (description: string, userPrompt: string, hostname: string): boolean =>
	IRREVERSIBLE_PATTERN.test(description) && !(IRREVERSIBLE_PATTERN.test(userPrompt) && userPrompt.toLowerCase().includes(hostname.toLowerCase()));

export async function assertPublicWebSocketUrl(rawUrl: string): Promise<void> {
	const url = new URL(rawUrl);
	if (url.protocol === "ws:") url.protocol = "http:";
	else if (url.protocol === "wss:") url.protocol = "https:";
	else throw new Error("only websocket URLs are allowed");
	await assertPublicHttpUrl(url.href);
}

export async function resolveSafeRedirect(base: string, location: string): Promise<string> {
	const target = new URL(location, base);
	await assertPublicHttpUrl(target.href);
	return target.href;
}

export function bindAbort(signal: AbortSignal | undefined, close: () => void): void {
	if (!signal) return;
	if (signal.aborted) { close(); return; }
	signal.addEventListener("abort", close, { once: true });
}
